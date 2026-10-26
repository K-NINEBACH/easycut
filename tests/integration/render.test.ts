// 실제 ffmpeg 로 컷 편집 영상 만들기 (PRD M5, 12.3). 시스템 ffmpeg + tests/fixtures 필요.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MediaService } from '../../src/main/services/MediaService';
import { RenderService } from '../../src/main/services/RenderService';
import { fitMusicToVideo, insertMedia, setLook, setSpeed, trimClip, setClipAudio, trimMusic } from '../../src/shared/ops';
import { FILTERS } from '../../src/shared/filters';
import { TRANSITIONS } from '../../src/shared/transitions';
import { newProject } from '../../src/shared/project';
import { layoutTimeline } from '../../src/shared/timeline';
import type { JobDone, JobProgress, Project } from '../../src/shared/types';
import { produce } from 'immer';
import { FIXTURES, probeFormat, probeStream, waitFor } from './helpers';

const root = mkdtempSync(join(tmpdir(), 'easycut-render-'));
// EZ_KEEP=1 이면 결과물을 지우지 않고 경로를 출력 (눈으로 확인용)
afterAll(() => (process.env.EZ_KEEP ? console.log('결과물:', root) : rmSync(root, { recursive: true, force: true })));

const tools = { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' };
const done: JobDone[] = [];
const progress: JobProgress[] = [];
const events = { progress: (e: JobProgress) => progress.push(e), done: (e: JobDone) => done.push(e) };
const cacheRoot = () => join(root, 'cache');
const media = new MediaService(tools, cacheRoot, { progress: () => {}, done: () => {} }, () => {});
const render = new RenderService(tools, cacheRoot, events, join(__dirname, '..', '..', 'resources', 'fonts'));

const finished = async (jobId: string, timeout = 240_000): Promise<JobDone> => {
  await waitFor(() => done.some((d) => d.jobId === jobId), timeout);
  return done.find((d) => d.jobId === jobId)!;
};

describe('영상 만들기 (컷 편집)', () => {
  let project: Project;

  it('샘플을 섞은 프로젝트를 1080p 30fps 로 만든다', async () => {
    const res = await media.import([FIXTURES]);
    media.cancelAll(); // 렌더에는 프록시가 필요 없음
    const id = Object.fromEntries(res.items.map((m) => [m.fileName, m.id]));
    project = produce(newProject('렌더', 'test'), (d) => {
      d.media = res.items;
      insertMedia(d, [
        id['landscape_h264_30.mp4'],
        id['portrait_hevc_60.mov'],
        id['photo_portrait.png'],
        id['vfr.mp4'],
        id['hdr_hlg.mov'],
        id['noaudio.mp4']
      ]);
      const [a, , , vfr, , noaudio] = d.videoTrack;
      trimClip(d, a.id, 1, 4);
      setSpeed(d, vfr.id, 2);
      setClipAudio(d, noaudio.id, { volume: 1.5 });
      d.videoTrack[1].fitMode = 'black';
    });
    const out = join(root, '결과 영상', '여행 영상.mp4');
    const jobId = render.start({ project, outputPath: out, quality: '1080p', fps: 30, subtitleMode: 'burn' });
    const r = await finished(jobId);
    expect(r.error).toBeUndefined();
    expect(r.status).toBe('done');
    expect(existsSync(out)).toBe(true);

    const expected = layoutTimeline(project.videoTrack, []).total;
    const f = probeFormat(out);
    expect(Math.abs(f.duration - expected)).toBeLessThanOrEqual(0.1);
    expect(f.streams.map((s) => s.codec_type).sort()).toEqual(['audio', 'video']);
    const v = probeStream(out);
    expect(v).toMatchObject({ codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '30/1', pix_fmt: 'yuv420p' });
    const a = probeStream(out, 'a:0');
    expect(a.codec_name).toBe('aac');
    // 소리 길이도 영상과 맞아야 함 (싱크)
    const aDur = Number((probeStream(out, 'a:0') as unknown as { duration: string }).duration);
    expect(Math.abs(aDur - expected)).toBeLessThanOrEqual(0.1);

    // 진행률은 0~1 사이로 늘어나고 남은 시간이 나온다
    const mine = progress.filter((p) => p.jobId === jobId);
    expect(mine.length).toBeGreaterThan(3);
    expect(mine.every((p) => p.progress >= 0 && p.progress <= 1)).toBe(true);
    expect(mine.some((p) => p.etaSeconds !== undefined)).toBe(true);
    // 임시 파일은 정리
    expect(readdirSync(join(cacheRoot(), 'render')).filter((n) => n !== 'ffmpeg-render.log')).toEqual([]);
  }, 300_000);

  it('720p 60fps', async () => {
    const short = produce(project, (d) => {
      d.videoTrack = d.videoTrack.slice(0, 2);
    });
    const out = join(root, '720.mp4');
    const r = await finished(render.start({ project: short, outputPath: out, quality: '720p', fps: 60, subtitleMode: 'burn' }));
    expect(r.status).toBe('done');
    expect(probeStream(out)).toMatchObject({ width: 1280, height: 720, r_frame_rate: '60/1' });
    expect(Math.abs(probeFormat(out).duration - layoutTimeline(short.videoTrack, []).total)).toBeLessThanOrEqual(0.1);
  }, 300_000);

  it('취소하면 결과 파일과 임시 파일을 지운다', async () => {
    const out = join(root, '취소.mp4');
    const jobId = render.start({ project, outputPath: out, quality: '1080p', fps: 30, subtitleMode: 'burn' });
    await waitFor(() => progress.some((p) => p.jobId === jobId), 30_000);
    render.cancel(jobId);
    const r = await finished(jobId);
    expect(r.status).toBe('canceled');
    expect(existsSync(out)).toBe(false);
    expect(readdirSync(join(cacheRoot(), 'render')).filter((n) => n !== 'ffmpeg-render.log')).toEqual([]);
  }, 60_000);

  it('필터: 장면마다 다른 필터로 만들 수 있고, 흑백은 실제로 회색', async () => {
    const filtered = produce(project, (d) => {
      d.videoTrack = d.videoTrack.slice(0, 5);
      d.videoTrack.forEach((c, i) => setLook(d, [c.id], { filter: FILTERS[(i % 8) + 1].id }));
      setLook(d, [d.videoTrack[0].id], { filter: 'mono', filterStrength: 1, adjust: { contrast: 10 } });
    });
    const out = join(root, '필터.mp4');
    const r = await finished(render.start({ project: filtered, outputPath: out, quality: '720p', fps: 30, subtitleMode: 'burn' }));
    expect(r.error).toBeUndefined();
    // 첫 장면(흑백) 1초 지점을 4x4 로 줄여 RGB 를 읽는다
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-ss', '1', '-i', out, '-frames:v', '1', '-vf', 'scale=4:4', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
    let maxDiff = 0;
    for (let i = 0; i < raw.length; i += 3) maxDiff = Math.max(maxDiff, Math.abs(raw[i] - raw[i + 1]), Math.abs(raw[i + 1] - raw[i + 2]));
    expect(maxDiff).toBeLessThanOrEqual(4);
  }, 300_000);

  it('전환 10종 + 장면 18개(묶음 처리) + 해상도·fps 가 다른 장면 사이 전환', async () => {
    const types = TRANSITIONS.map((t) => t.id).filter((t) => t !== 'none');
    const many = produce(project, (d) => {
      // 가로·세로·사진·VFR·HDR 를 섞어 1.5초씩 18개
      const src = d.videoTrack.slice(0, 6);
      d.videoTrack = Array.from({ length: 18 }, (_, i) => {
        const c = { ...src[i % 6], id: `clip${i}` };
        if (c.imageDuration !== undefined) return { ...c, imageDuration: 1.5, outPoint: 1.5 };
        return { ...c, inPoint: 0.5, outPoint: 0.5 + 1.5 * c.speed };
      });
      // 앞 9곳은 10종 중 9종, 16번째 뒤(묶음 경계)는 zoomin, 나머지는 컷·fade
      d.transitions = d.videoTrack.slice(0, -1).flatMap((c, i) =>
        i < 9 ? [{ afterClipId: c.id, type: types[i], duration: 0.6 }]
        : i === 15 ? [{ afterClipId: c.id, type: 'zoomin' as const, duration: 1.0 }]
        : i % 2 ? [{ afterClipId: c.id, type: 'fade' as const, duration: 0.3 }] : []
      );
    });
    const out = join(root, '전환.mp4');
    const r = await finished(render.start({ project: many, outputPath: out, quality: '720p', fps: 30, subtitleMode: 'burn' }));
    expect(r.error).toBeUndefined();
    const expected = layoutTimeline(many.videoTrack, many.transitions).total;
    expect(expected).toBeLessThan(18 * 1.5 - 9 * 0.6);
    const f = probeFormat(out);
    expect(Math.abs(f.duration - expected)).toBeLessThanOrEqual(0.1);
    const aDur = Number((probeStream(out, 'a:0') as unknown as { duration: string }).duration);
    expect(Math.abs(aDur - expected)).toBeLessThanOrEqual(0.1);
  }, 400_000);

  it('배경음악: 반복·자르기·페이드, 덕킹은 말소리 구간에서만', async () => {
    const mediaOf = (name: string) => project.media.find((m) => m.fileName === name)!;
    const make = (ducking: boolean, muteVoice = false) =>
      produce(project, (d) => {
        d.videoTrack = [];
        insertMedia(d, [mediaOf('noaudio.mp4').id, mediaOf('landscape_h264_30.mp4').id]); // 0~5초 소리 없음, 5~10초 말소리
        if (muteVoice) setClipAudio(d, d.videoTrack[1].id, { muted: true });
        d.transitions = [];
        d.musicTrack = [];
        insertMedia(d, [mediaOf('music.mp3').id]);
        trimMusic(d, d.musicTrack[0].id, 2, 6); // 4초만 → 길이 맞추기로 반복
        fitMusicToVideo(d);
        d.music = { volume: 0.5, fadeIn: 1, fadeOut: 2, ducking };
      });
    const meanDb = (file: string, from: number, len: number): number => {
      const r = spawnSync('ffmpeg', ['-hide_banner', '-ss', String(from), '-t', String(len), '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], {
        encoding: 'utf8'
      });
      return Number(/mean_volume: (-?[\d.]+) dB/.exec(r.stderr)![1]);
    };
    const renderTo = async (proj: Project, name: string): Promise<string> => {
      const out = join(root, name);
      const r = await finished(render.start({ project: proj, outputPath: out, quality: '720p', fps: 30, subtitleMode: 'burn' }));
      expect(r.error).toBeUndefined();
      return out;
    };
    const on = make(true);
    expect(on.musicTrack.map((m) => m.loop)).toEqual([false, true, true]);
    const duck = await renderTo(on, '덕킹.mp4');
    const nod = await renderTo(make(false), '덕킹없음.mp4');
    const muted = await renderTo(make(true, true), '소리끈장면.mp4');
    expect(Math.abs(probeFormat(duck).duration - 10)).toBeLessThanOrEqual(0.1);

    // 소리 없는 구간(1.5~4.5초): 덕킹 켜도 같음
    expect(Math.abs(meanDb(duck, 1.5, 3) - meanDb(nod, 1.5, 3))).toBeLessThan(0.5);
    // 소리 끈 장면에서는 덕킹이 일어나지 않음: 음악만 남아 덕킹 없는 음악 구간과 같은 크기
    expect(Math.abs(meanDb(muted, 6, 2) - meanDb(nod, 1.5, 3))).toBeLessThan(0.5);
    // 말소리 구간(6~8초): 힘(power) = 말소리 + 음악. 음악만의 힘은 소리 끈 쪽에서 알 수 있으므로
    // 덕킹 후 음악이 얼마나 남았는지 계산한다 → 절반 아래(-3dB 이상 줄어듦)
    const pow = (db: number): number => Math.pow(10, db / 10);
    const music = pow(meanDb(muted, 6, 2));
    const voice = pow(meanDb(nod, 6, 2)) - music;
    const left = (pow(meanDb(duck, 6, 2)) - voice) / music;
    expect(left).toBeLessThan(0.5);
    // 페이드: 처음 0.3초와 마지막 0.3초는 가운데보다 확실히 작다 (음악만 있는 쪽으로 확인)
    expect(meanDb(muted, 0, 0.3)).toBeLessThan(meanDb(muted, 1.5, 1) - 6);
    expect(meanDb(muted, 9.7, 0.3)).toBeLessThan(meanDb(muted, 6, 1) - 6);
  }, 400_000);

  it('자막: 5가지 모양을 영상에 굽고, .srt 도 같이 저장', async () => {
    const styles = ['basic', 'box', 'yellow', 'hand', 'title'] as const;
    const withSubs = produce(project, (d) => {
      d.videoTrack = d.videoTrack.slice(0, 1); // 3초 가로 영상
      d.transitions = [];
      d.musicTrack = [];
      d.subtitles = styles.map((id, i) => ({
        id: `s${i}`,
        text: i === 4 ? '여행 첫날 {제목}' : `${i + 1}번 자막 한글 테스트입니다 띄어쓰기로 줄이 나뉘어요`,
        anchorClipId: d.videoTrack[0].id,
        offset: i * 0.6,
        duration: 0.55,
        styleOverride: { presetId: id, position: id === 'title' ? ('top' as const) : ('bottom' as const) }
      }));
    });
    const out = join(root, '자막.mp4');
    const r = await finished(render.start({ project: withSubs, outputPath: out, quality: '1080p', fps: 30, subtitleMode: 'both' }));
    expect(r.error).toBeUndefined();
    const srt = readFileSync(join(root, '자막.srt'), 'utf8');
    expect(srt.split('\n').slice(0, 4)).toEqual(['1', '00:00:00,000 --> 00:00:00,550', '1번 자막 한글 테스트입니다', '띄어쓰기로 줄이 나뉘어요']);
    expect(srt).toContain('5\n00:00:02,400 --> 00:00:02,950\n여행 첫날 {제목}');
    // 자막이 있는 프레임은 아래쪽(제목은 위쪽)에 글자 픽셀이 생긴다: 자막 없는 쪽과 비교
    const frame = (t: number) =>
      execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', out, '-frames:v', '1', '-vf', 'scale=192:108', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
    const plain = produce(withSubs, (d) => {
      d.subtitles = [];
    });
    const out2 = join(root, '자막없음.mp4');
    await finished(render.start({ project: plain, outputPath: out2, quality: '1080p', fps: 30, subtitleMode: 'burn' }));
    const frame2 = (t: number) =>
      execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', out2, '-frames:v', '1', '-vf', 'scale=192:108', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
    const rowsChanged = (a: Buffer, b: Buffer): number[] => {
      const rows: number[] = [];
      for (let y = 0; y < 108; y++) {
        let d = 0;
        for (let x = 0; x < 192 * 3; x++) d += Math.abs(a[y * 576 + x] - b[y * 576 + x]);
        if (d / 576 > 8) rows.push(y);
      }
      return rows;
    };
    for (let i = 0; i < 5; i++) {
      const rows = rowsChanged(frame(i * 0.6 + 0.25), frame2(i * 0.6 + 0.25));
      expect(rows.length, `${styles[i]} 자막이 보여야 함`).toBeGreaterThan(2);
      if (styles[i] === 'title') expect(Math.max(...rows)).toBeLessThan(54);
      else expect(Math.min(...rows)).toBeGreaterThan(54);
    }
  }, 400_000);

  it('원본이 없으면 쉬운 안내', async () => {
    const broken = produce(project, (d) => {
      d.media[0].path = join(root, '없는파일.mp4');
      d.videoTrack[0].mediaId = d.media[0].id;
    });
    const r = await finished(render.start({ project: broken, outputPath: join(root, 'x.mp4'), quality: '1080p', fps: 30, subtitleMode: 'burn' }));
    expect(r.status).toBe('error');
    expect(r.error).toContain('원본 파일을 찾을 수 없어요');
  });
});

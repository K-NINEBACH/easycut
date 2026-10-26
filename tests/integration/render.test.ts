// 실제 ffmpeg 로 컷 편집 영상 만들기 (PRD M5, 12.3). 시스템 ffmpeg + tests/fixtures 필요.
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MediaService } from '../../src/main/services/MediaService';
import { RenderService } from '../../src/main/services/RenderService';
import { insertMedia, setSpeed, trimClip, setClipAudio } from '../../src/shared/ops';
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
const render = new RenderService(tools, cacheRoot, events);

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

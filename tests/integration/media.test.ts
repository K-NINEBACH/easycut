// 실제 ffmpeg 로 불러오기·프록시 생성 확인 (PRD 12.3). 시스템 ffmpeg + tests/fixtures 필요.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MediaService } from '../../src/main/services/MediaService';
import type { JobDone, MediaItem } from '../../src/shared/types';
import { FIXTURES, probeStream, waitFor } from './helpers';

const root = mkdtempSync(join(tmpdir(), 'easycut-media-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function makeService(done: JobDone[]): MediaService {
  return new MediaService(
    { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' },
    () => root,
    { progress: () => {}, done: (e) => done.push(e) },
    () => {}
  );
}

describe('MediaService (실제 ffmpeg)', () => {
  const done: JobDone[] = [];
  const svc = makeService(done);
  let items: MediaItem[] = [];

  it('샘플 폴더를 통째로 불러온다 — 열 수 없는 파일은 실패 목록으로', async () => {
    const res = await svc.import([FIXTURES]);
    items = res.items;
    expect(res.failed.map((f) => f.fileName)).toEqual(['not_media.mp4']);
    expect(items.map((i) => i.fileName).sort()).toEqual([
      'hdr_hlg.mov',
      'landscape_h264_30.mp4',
      'music.mp3',
      'noaudio.mp4',
      'photo_landscape.jpg',
      'photo_portrait.png',
      'portrait_hevc_60.mov',
      'vfr.mp4'
    ]);
    const byName = Object.fromEntries(items.map((i) => [i.fileName, i]));
    expect(byName['portrait_hevc_60.mov']).toMatchObject({ width: 1080, height: 1920, rotation: 90, fps: 60 });
    expect(byName['hdr_hlg.mov'].isHdr).toBe(true);
    expect(byName['vfr.mp4'].isVfr).toBe(true);
    expect(byName['noaudio.mp4'].hasAudio).toBe(false);
    expect(byName['music.mp3']).toMatchObject({ type: 'audio', hasAudio: true });
    expect(byName['photo_portrait.png']).toMatchObject({ type: 'image', width: 900, height: 1600 });
    expect(items.every((i) => i.proxyStatus === 'pending')).toBe(true);
  });

  it('프록시·썸네일·필름스트립·파형 생성', async () => {
    const proxyDone = (id: string): JobDone | undefined =>
      done.find((d) => d.targetId === id && (d.result as Partial<MediaItem>)?.proxyStatus === 'ready');
    await waitFor(() => items.every((i) => proxyDone(i.id)), 120_000);
    expect(done.filter((d) => d.status === 'error')).toEqual([]);

    for (const item of items) {
      const r = proxyDone(item.id)!.result as Partial<MediaItem>;
      expect(existsSync(r.proxyPath!)).toBe(true);
      if (item.type === 'video') {
        const s = probeStream(r.proxyPath!);
        expect(s.codec_name).toBe('h264');
        expect(s.r_frame_rate).toBe('30/1');
        expect(Math.min(s.width, s.height)).toBe(720);
        // 세로 영상은 회전이 반영되어 세로 프록시가 되어야 함
        if (item.fileName === 'portrait_hevc_60.mov') expect(s.height).toBeGreaterThan(s.width);
        expect(readdirSync(r.filmstripDir!).length).toBeGreaterThanOrEqual(Math.floor(item.duration));
        expect(existsSync(r.thumbnailPath!)).toBe(true);
      }
      if (item.hasAudio) expect(existsSync(r.waveformPath!)).toBe(true);
    }
  }, 130_000);

  it('HDR 프록시는 SDR(bt709)로 변환된다', () => {
    const hdr = items.find((i) => i.fileName === 'hdr_hlg.mov')!;
    const r = done.find((d) => d.targetId === hdr.id && (d.result as Partial<MediaItem>)?.proxyPath)!
      .result as Partial<MediaItem>;
    const s = probeStream(r.proxyPath!);
    expect(s.color_transfer).toBe('bt709');
    expect(s.pix_fmt).toBe('yuv420p');
  });

  it('다시 준비해도 캐시를 재사용 (작업 없이 바로 ready)', async () => {
    const before = done.length;
    const svc2 = makeService(done);
    const again = await svc2.prepare(items.map((i) => ({ ...i, proxyStatus: 'pending' as const })));
    expect(again.every((i) => i.proxyStatus === 'ready')).toBe(true);
    await new Promise((r) => setTimeout(r, 200));
    expect(done.length).toBe(before);
  });

  it('원본 파일이 사라지면 missing 표시', async () => {
    const fake = { ...items[0], path: join(root, '없는파일.mp4') };
    const [r] = await svc.prepare([fake]);
    expect(r.missing).toBe(true);
  });
});

// ffmpeg 가 PATH 에 있는지 미리 확인
execFileSync('ffmpeg', ['-version']);

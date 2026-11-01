import { describe, expect, it } from 'vitest';
import * as ops from '@shared/ops';
import {
  RegionTracker,
  analyzeSize,
  autoLockZoom,
  autoShakeZoom,
  globalMotion,
  lockPath,
  outputToSource,
  shakePath,
  smooth,
  stabilizeCommands,
  stabilizeWindow,
  type TrackPoint
} from '@shared/stabilize';
import { frameSourceTime } from '@shared/timeline';
import type { Project, Stabilize, VideoClip } from '@shared/types';
import { buildAnalyzeFramesCommand, buildClipCommand } from '../../src/main/ffmpeg/commands';

const W = 320;
const H = 180;

/** 무늬 배경 위에 (x,y) 만큼 밀린 화면 */
function scene(dx: number, dy: number, mark?: { x: number; y: number }): Uint8Array {
  const f = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const u = x - dx;
      const v = y - dy;
      f[y * W + x] = 100 + 50 * Math.sin(u * 0.13) * Math.cos(v * 0.11) + 40 * Math.sin((u + v) * 0.31);
    }
  if (mark) {
    for (let y = -15; y < 15; y++)
      for (let x = -15; x < 15; x++) f[Math.round(mark.y + y) * W + Math.round(mark.x + x)] = (x ^ y) & 8 ? 255 : 0;
  }
  return f;
}

const base = { mode: 'lock', from: 1, fps: 30, zoom: 2 } as const;

describe('stabilizeWindow', () => {
  const st: Stabilize = { ...base, path: [0.5, 0.5, 0.6, 0.4] };
  it('표본 사이는 직선으로 잇고 범위 밖은 끝값', () => {
    expect(stabilizeWindow(st, 1).cx).toBeCloseTo(0.5);
    expect(stabilizeWindow(st, 1 + 1 / 60).cx).toBeCloseTo(0.55);
    expect(stabilizeWindow(st, 0).cx).toBeCloseTo(0.5);
    expect(stabilizeWindow(st, 9).cy).toBeCloseTo(0.4);
  });
  it('창은 원본 밖으로 나가지 않는다', () => {
    const w = stabilizeWindow({ ...base, path: [0.05, 0.99] }, 1);
    expect([w.cx, w.cy, w.s]).toEqual([0.25, 0.75, 0.5]);
  });
});

describe('outputToSource', () => {
  it('16:9 는 그대로', () => expect(outputToSource(0.25, 0.75, 1920, 1080, 'blur')).toEqual({ x: 0.25, y: 0.75 }));
  it('세로 영상 흐린 배경: 가운데 띠 안', () => {
    const p = outputToSource(0.5, 0.5, 1080, 1920, 'blur');
    expect(p.x).toBeCloseTo(0.5);
    expect(outputToSource(0.5 + (9 / 16) * (9 / 16) * 0.5, 0, 1080, 1920, 'blur').x).toBeCloseTo(1);
  });
  it('세로 영상 꽉 채우기: 위아래가 잘린다', () => {
    expect(outputToSource(0, 0.5, 1080, 1920, 'fill').x).toBeCloseTo(0);
    expect(outputToSource(0, 0, 1080, 1920, 'fill').y).toBeGreaterThan(0.3);
  });
});

describe('따라가기', () => {
  it('움직이는 영역을 1픽셀 안으로 따라간다', () => {
    const at = (i: number): { x: number; y: number } => ({ x: 100 + 3 * i, y: 80 + 20 * Math.sin(i / 6) });
    const first = scene(0, 0, at(0));
    const tr = new RegionTracker(first, W, H, { x: 83, y: 63, w: 34, h: 34 });
    expect(tr.flat).toBe(false);
    for (let i = 1; i < 40; i++) {
      const p = tr.next(scene(0, 0, at(i)));
      expect(p.lost).toBe(false);
      expect(Math.abs(p.x - at(i).x)).toBeLessThan(1.5);
      expect(Math.abs(p.y - at(i).y)).toBeLessThan(1.5);
    }
  });
  it('무늬 없는 곳은 flat', () => {
    const tr = new RegionTracker(new Uint8Array(W * H).fill(90), W, H, { x: 10, y: 10, w: 40, h: 40 });
    expect(tr.flat).toBe(true);
  });
  it('사라지면 놓쳤다고 알리고 다시 나타나면 찾는다', () => {
    const mark = { x: 100, y: 90 };
    const tr = new RegionTracker(scene(0, 0, mark), W, H, { x: 83, y: 73, w: 34, h: 34 });
    const noise = new Uint8Array(W * H).map((_, i) => (i * 7919) % 251);
    expect(tr.next(noise).lost).toBe(true);
    const back = tr.next(scene(0, 0, mark));
    expect(back.lost).toBe(false);
    expect(Math.abs(back.x - 100)).toBeLessThan(1.5);
  });
  it('화면 전체 움직임', () => {
    const m = globalMotion(scene(0, 0), scene(5, -3), W, H);
    expect(m.dx).toBeCloseTo(5, 0);
    expect(m.dy).toBeCloseTo(-3, 0);
  });
  it('일부만 움직이는 사람에는 끌려가지 않는다', () => {
    const m = globalMotion(scene(0, 0, { x: 100, y: 90 }), scene(0, 0, { x: 110, y: 90 }), W, H);
    expect(Math.abs(m.dx)).toBeLessThan(0.5);
  });
});

describe('경로', () => {
  it('smooth 는 일정한 기울기를 그대로 둔다 (지연 없음)', () => {
    const a = Array.from({ length: 50 }, (_, i) => i * 2);
    expect(smooth(a, 5)).toEqual(a);
  });
  it('흔들림: 떨림만 창이 따라가고 천천히 움직이는 패닝은 남는다', () => {
    const shake = (i: number): number => (i % 2 ? 6 : -6);
    const cum = Array.from({ length: 300 }, (_, i) => i * 0.5 + shake(i));
    const path = shakePath(cum, cum.map(() => 0), W, H);
    const x = path.filter((_, i) => i % 2 === 0);
    expect(Math.abs(x[150] - x[151])).toBeCloseTo((12 / W), 2);
    // 평균은 가운데: 패닝은 창이 따라가지 않는다
    expect(x.slice(60, 240).reduce((a, b) => a + b, 0) / 180).toBeCloseTo(0.5, 2);
  });
  it('놓친 구간은 앞뒤를 직선으로 잇는다', () => {
    const pts: TrackPoint[] = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ x: i < 3 ? 100 : 180, y: 50, lost: i >= 3 && i < 7 }));
    const p = lockPath(pts, 200, 100);
    expect(p[5 * 2]).toBeGreaterThan(0.6);
    expect(p[5 * 2]).toBeLessThan(0.8);
  });
  it('기본 확대는 한도 안', () => {
    expect(autoShakeZoom([0.5, 0.5, 0.5, 0.5])).toBe(1.03);
    expect(autoShakeZoom([0.1, 0.5, 0.9, 0.5])).toBe(1.35);
    expect(autoLockZoom([0.25, 0.5], 0.1, 0.1)).toBe(2);
    expect(autoLockZoom([0.5, 0.5], 0.1, 0.1)).toBe(1.05);
    // 큰 영역은 잘리지 않을 만큼만
    expect(autoLockZoom([0.2, 0.5], 0.6, 0.6)).toBeLessThan(1.5);
  });
});

describe('편집', () => {
  const clip = {
    id: 'a', mediaId: 'm', inPoint: 0, outPoint: 4, speed: 1, muted: false, volume: 1, fitMode: 'blur',
    filter: 'none', filterStrength: 1, adjust: { brightness: 0, contrast: 0, saturation: 0 }
  } as VideoClip;
  const project = (): Project => ({ videoTrack: [structuredClone(clip)], transitions: [], subtitles: [], media: [] }) as unknown as Project;
  const st: Stabilize = { ...base, path: [0.5, 0.5] };
  it('넣기·확대·끄기', () => {
    const p = project();
    ops.setStabilize(p, 'a', st);
    ops.setStabilizeZoom(p, 'a', 9);
    expect(p.videoTrack[0].stabilize?.zoom).toBe(2.5);
    ops.setStabilize(p, 'a', null);
    expect('stabilize' in p.videoTrack[0]).toBe(false);
  });
  it('나누면 양쪽 모두 유지', () => {
    const p = project();
    ops.setStabilize(p, 'a', st);
    ops.splitClip(p, 'a', 2);
    expect(p.videoTrack.map((c) => !!c.stabilize)).toEqual([true, true]);
  });
  it('사진에는 넣지 않는다', () => {
    const p = project();
    p.videoTrack[0].imageDuration = 3;
    ops.setStabilize(p, 'a', st);
    expect(p.videoTrack[0].stabilize).toBeUndefined();
  });
});

describe('렌더 명령', () => {
  const clip = { inPoint: 1, outPoint: 2, speed: 2, imageDuration: undefined, fitMode: 'fill', muted: true, volume: 1 } as unknown as VideoClip;
  it('프레임 시간은 속도를 반영', () => expect(frameSourceTime(clip, 15, 30)).toBeCloseTo(2));
  it('sendcmd 내용', () => {
    const st: Stabilize = { ...base, path: [0.5, 0.5, 0.6, 0.5] };
    const text = stabilizeCommands(st, 2, 30, (k) => 1 + k / 30);
    expect(text).toBe('0.000000 crop x in_w*0.250000, crop y in_h*0.250000;\n0.033333 crop x in_w*0.250000, crop y in_h*0.250000;\n'.replace('0.033333 crop x in_w*0.250000', '0.033333 crop x in_w*0.350000'));
  });
  it('crop 은 크기 줄이기 전에', () => {
    const media = { path: 'a.mp4', hasAudio: false } as never;
    const c = { ...clip, stabilize: { ...base, zoom: 1.5, path: [0.5, 0.5] } } as VideoClip;
    const g = buildClipCommand(c, media, { width: 1920, height: 1080, fps: 30 }, 30, 'o.mov', { stabFile: 'stab.txt' }).join(' ');
    expect(g).toContain('fps=30,sendcmd=f=stab.txt,crop=w=trunc(iw/1.5/2)*2:h=trunc(ih/1.5/2)*2:x=0:y=0:exact=1,scale=');
    expect(buildClipCommand(clip, media, { width: 1920, height: 1080, fps: 30 }, 30, 'o.mov').join(' ')).not.toContain('crop=w=trunc(iw/');
  });
  it('분석 프레임 명령', () => {
    expect(analyzeSize(1920, 1080)).toEqual({ w: 640, h: 360 });
    expect(analyzeSize(1080, 1920)).toEqual({ w: 360, h: 640 });
    expect(buildAnalyzeFramesCommand('p.mp4', 0, 30, 5, 640, 360)).toContain('0.000000');
  });
});

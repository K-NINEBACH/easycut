// 무작위 편집 시험 (화면 없이): 편집 함수를 수천 번 무작위로 부르고 매번
// 시간 계산(timeline.ts)·렌더 프레임 수·자막 파일이 서로 맞는지 검사한다.
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import * as ops from '../../src/shared/ops';
import { newProject } from '../../src/shared/project';
import {
  clipFrameCounts,
  layoutMusic,
  layoutTimeline,
  musicFade,
  toFrame,
  transitionFrameOverlaps
} from '../../src/shared/timeline';
import { buildAss, buildSrt, visibleSubtitles } from '../../src/shared/subtitles';
import { TRANSITIONS } from '../../src/shared/transitions';
import type { MediaItem, Project, Speed } from '../../src/shared/types';
import { MIN_CLIP_LENGTH } from '../../src/shared/types';

const media = (id: string, type: MediaItem['type'], duration: number): MediaItem => ({
  id,
  type,
  path: `/x/${id}`,
  fileName: id,
  fileSize: 1,
  fileMtime: 1,
  duration,
  hasAudio: type !== 'image',
  proxyStatus: 'ready'
});

function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}

function check(p: Project): void {
  const l = layoutTimeline(p.videoTrack, p.transitions);
  const byMedia = new Map(p.media.map((m) => [m.id, m]));
  for (const [i, c] of l.clips.entries()) {
    const v = p.videoTrack[i];
    expect(c.length).toBeGreaterThanOrEqual(MIN_CLIP_LENGTH - 1e-6);
    if (v.imageDuration === undefined) {
      expect(v.inPoint).toBeGreaterThanOrEqual(0);
      expect(v.outPoint).toBeLessThanOrEqual(byMedia.get(v.mediaId)!.duration + 1e-6);
    }
    if (i > 0) expect(c.start).toBeCloseTo(l.clips[i - 1].end - l.clips[i - 1].overlapOut, 9);
    // 전환은 양쪽 장면 길이의 절반을 넘지 않는다
    expect(c.overlapIn + c.overlapOut).toBeLessThanOrEqual(c.length + 1e-6);
  }
  if (l.clips.length) expect(l.total).toBeCloseTo(l.clips[l.clips.length - 1].end, 9);

  // 렌더: 장면별 프레임 수 − 전환으로 겹친 프레임 = 전체 프레임 (누적 오차 없음)
  for (const fps of [30, 60]) {
    const frames = clipFrameCounts(l, fps);
    const overlaps = transitionFrameOverlaps(l, fps);
    const sum = frames.reduce((a, b) => a + b, 0) - overlaps.reduce((a, b) => a + b, 0);
    expect(sum).toBe(l.clips.length ? toFrame(l.total, fps) : 0);
    overlaps.forEach((o, i) => {
      expect(o).toBeLessThan(frames[i]);
      expect(o).toBeLessThan(frames[i + 1]);
    });
  }

  // 자막: 보이는 자막은 타임라인 안, 서로 겹치지 않음, 파일 만들기 오류 없음
  const vis = visibleSubtitles(l, p.subtitles).sort((a, b) => a.start - b.start);
  for (const [i, v] of vis.entries()) {
    expect(v.end).toBeGreaterThan(v.start);
    expect(v.start).toBeGreaterThanOrEqual(-1e-6);
    expect(v.end).toBeLessThanOrEqual(l.total + 1e-6);
    if (i > 0) expect(v.start).toBeGreaterThanOrEqual(vis[i - 1].end - 1e-6);
  }
  expect(() => buildAss(l, p.subtitles, p.defaultSubtitleStyle)).not.toThrow();
  expect(() => buildSrt(l, p.subtitles)).not.toThrow();

  for (const t of p.transitions) expect(p.videoTrack.some((c) => c.id === t.afterClipId)).toBe(true);
  for (const s of p.subtitles) expect(p.videoTrack.some((c) => c.id === s.anchorClipId)).toBe(true);
  for (const m of layoutMusic(p.musicTrack)) expect(m.length).toBeGreaterThan(0);
  const f = musicFade(l.total / 2, l.total, p.music.fadeIn ? 2 : 0, p.music.fadeOut ? 2 : 0);
  expect(f).toBeGreaterThanOrEqual(0);
  expect(f).toBeLessThanOrEqual(1);
}

function run(seed: number, steps: number): void {
  const r = rng(seed);
  const pick = <T>(a: T[]): T => a[Math.floor(r() * a.length)];
  let p = produce(newProject('p', 'fuzz'), (d) => {
    d.media = [media('v10', 'video', 10), media('v3', 'video', 3), media('v1', 'video', 1.2), media('img', 'image', 0), media('mus', 'audio', 30)];
  });
  const clipId = (): string | undefined => p.videoTrack.length ? pick(p.videoTrack).id : undefined;
  const total = (): number => layoutTimeline(p.videoTrack, p.transitions).total;
  const opsList: (() => void)[] = [
    () => (p = produce(p, (d) => void ops.insertMedia(d, [pick(['v10', 'v3', 'v1', 'img', 'mus'])], Math.floor(r() * 5)))),
    () => (p = produce(p, (d) => { const id = clipId(); if (id) ops.splitClip(d, id, r() * total()); })),
    () => (p = produce(p, (d) => {
      const c = d.videoTrack.length ? pick(d.videoTrack) : undefined;
      if (c) ops.trimClip(d, c.id, c.inPoint + (r() - 0.5) * 4, c.outPoint + (r() - 0.5) * 4);
    })),
    () => (p = produce(p, (d) => { const id = clipId(); if (id) ops.setSpeed(d, id, pick<Speed>([0.5, 1, 1.5, 2])); })),
    () => (p = produce(p, (d) => { const id = clipId(); if (id) ops.setImageDuration(d, id, r() * 12); })),
    () => (p = produce(p, (d) => { const id = clipId(); if (id && r() < 0.5) ops.deleteClips(d, [id]); })),
    () => (p = produce(p, (d) => ops.moveClip(d, Math.floor(r() * d.videoTrack.length), Math.floor(r() * d.videoTrack.length)))),
    () => (p = produce(p, (d) => {
      const ids = r() < 0.3 ? d.videoTrack.map((c) => c.id) : [clipId()].filter((x): x is string => !!x);
      ops.setTransition(d, ids, pick(TRANSITIONS).id, pick([0.3, 0.6, 1]));
    })),
    () => (p = produce(p, (d) => void ops.addSubtitleAt(d, r() * total(), 0.3 + r() * 4, pick(['가', '', '긴 자막 '.repeat(8), '{\\b1}'])))),
    () => (p = produce(p, (d) => {
      const s = d.subtitles.length ? pick(d.subtitles) : undefined;
      if (s) ops.setSubtitleSpan(d, s.id, r() * total(), 0.3 + r() * 4);
    })),
    () => (p = produce(p, (d) => { if (d.subtitles.length && r() < 0.4) ops.deleteSubtitles(d, [pick(d.subtitles).id]); })),
    () => (p = produce(p, (d) => { const s = d.subtitles.length ? pick(d.subtitles) : undefined; if (s) ops.mergeWithNextSubtitle(d, s.id); })),
    () => (p = produce(p, (d) => ops.fitMusicToVideo(d))),
    () => (p = produce(p, (d) => {
      const m = d.musicTrack.length ? pick(d.musicTrack) : undefined;
      if (m) ops.trimMusic(d, m.id, m.inPoint + (r() - 0.5) * 10, m.outPoint + (r() - 0.5) * 10);
    })),
    () => (p = produce(p, (d) => { if (d.videoTrack.length) ops.pasteClips(d, [pick(d.videoTrack)], Math.floor(r() * d.videoTrack.length)); }))
  ];
  for (let i = 0; i < steps; i++) {
    const op = Math.floor(r() * opsList.length);
    opsList[op]();
    try {
      check(p);
    } catch (e) {
      throw new Error(`씨앗 ${seed}, ${i}번째 (동작 ${op}) 뒤: ${(e as Error).message}`);
    }
  }
}

describe('무작위 편집 (화면 없이)', () => {
  // FUZZ_SEEDS=300 처럼 주면 더 많이
  const seeds = Number(process.env.FUZZ_SEEDS ?? 40);
  for (let seed = 1; seed <= seeds; seed++) it(`씨앗 ${seed}: 250번`, () => run(seed, 250));
});

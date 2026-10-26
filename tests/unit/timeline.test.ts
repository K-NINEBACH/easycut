import { describe, expect, it } from 'vitest';
import {
  clipIndexAt,
  clipLength,
  layoutMusic,
  layoutTimeline,
  sourceTime,
  subtitleRange,
  transitionAt
} from '../../src/shared/timeline';
import type { Subtitle, Transition, VideoClip } from '../../src/shared/types';

function vclip(id: string, inPoint: number, outPoint: number, speed: VideoClip['speed'] = 1): VideoClip {
  return {
    id,
    mediaId: 'm',
    inPoint,
    outPoint,
    speed,
    muted: false,
    volume: 1,
    fitMode: 'blur',
    filter: 'none',
    filterStrength: 1,
    adjust: { brightness: 0, contrast: 0, saturation: 0 }
  };
}
const photo = (id: string, d: number): VideoClip => ({ ...vclip(id, 0, d), imageDuration: d });
const tr = (afterClipId: string, duration: number, type: Transition['type'] = 'fade'): Transition => ({
  afterClipId,
  type,
  duration
});

describe('clipLength', () => {
  it('속도 반영', () => {
    expect(clipLength(vclip('a', 2, 8))).toBe(6);
    expect(clipLength(vclip('a', 2, 8, 2))).toBe(3);
    expect(clipLength(vclip('a', 0, 3, 0.5))).toBe(6);
    expect(clipLength(vclip('a', 0, 3, 1.5))).toBeCloseTo(2);
  });
  it('사진은 imageDuration', () => {
    expect(clipLength(photo('p', 4))).toBe(4);
  });
});

describe('layoutTimeline', () => {
  it('전환 없음: 이어 붙이기', () => {
    const l = layoutTimeline([vclip('a', 0, 5), vclip('b', 1, 3), photo('c', 3)], []);
    expect(l.clips.map((c) => [c.start, c.end])).toEqual([
      [0, 5],
      [5, 7],
      [7, 10]
    ]);
    expect(l.total).toBe(10);
  });

  it('전환 포함: 겹친 만큼 전체 길이가 줄어든다', () => {
    const l = layoutTimeline([vclip('a', 0, 5), vclip('b', 0, 4), vclip('c', 0, 6)], [tr('a', 1), tr('b', 0.6)]);
    expect(l.clips[1].start).toBeCloseTo(4);
    expect(l.clips[2].start).toBeCloseTo(7.4);
    expect(l.total).toBeCloseTo(13.4); // 15 - 1 - 0.6
    expect(l.clips[1].overlapIn).toBe(1);
    expect(l.clips[1].overlapOut).toBe(0.6);
  });

  it('속도 + 사진 + 전환 혼합', () => {
    const l = layoutTimeline([vclip('a', 0, 8, 2), photo('p', 3), vclip('b', 0, 2, 0.5)], [tr('a', 0.6), tr('p', 0.3)]);
    // len: 4, 3, 4
    expect(l.clips.map((c) => c.start)).toEqual([0, 3.4, expect.closeTo(6.1)]);
    expect(l.total).toBeCloseTo(10.1);
  });

  it('짧은 클립은 전환 길이 자동 축소 (클립 길이의 절반까지)', () => {
    const l = layoutTimeline([vclip('a', 0, 1), vclip('b', 0, 5)], [tr('a', 1)]);
    expect(l.transitions[0]!.duration).toBe(0.5);
    expect(l.total).toBe(5.5);
  });

  it('너무 짧으면 전환 불가 → 컷', () => {
    const l = layoutTimeline([vclip('a', 0, 0.15), vclip('b', 0, 5)], [tr('a', 0.6)]);
    expect(l.transitions[0]!.tooShort).toBe(true);
    expect(l.transitions[0]!.duration).toBe(0);
    expect(l.total).toBeCloseTo(5.15);
  });

  it("'none' 전환과 마지막 클립 뒤 전환은 무시", () => {
    const l = layoutTimeline([vclip('a', 0, 2), vclip('b', 0, 2)], [tr('a', 1, 'none'), tr('b', 1)]);
    expect(l.total).toBe(4);
    expect(l.transitions).toEqual([null, null]);
  });
});

describe('위치 찾기', () => {
  const l = layoutTimeline([vclip('a', 0, 5), vclip('b', 10, 14), vclip('c', 0, 2)], [tr('a', 1)]);
  it('clipIndexAt: 전환 구간은 들어오는 장면', () => {
    expect(clipIndexAt(l, 0)).toBe(0);
    expect(clipIndexAt(l, 3.99)).toBe(0);
    expect(clipIndexAt(l, 4)).toBe(1);
    expect(clipIndexAt(l, 8.5)).toBe(2);
    expect(clipIndexAt(l, 999)).toBe(2);
  });
  it('transitionAt', () => {
    expect(transitionAt(l, 3.9)).toBeNull();
    expect(transitionAt(l, 4.5)).toEqual({ index: 0, progress: 0.5 });
    expect(transitionAt(l, 5.1)).toBeNull();
  });
  it('sourceTime', () => {
    const clip = vclip('b', 10, 14, 2);
    const lb = layoutTimeline([clip], []).clips[0];
    expect(sourceTime(clip, lb, 1)).toBe(12);
  });
});

describe('자막 위치', () => {
  const clips = [vclip('a', 0, 5), vclip('b', 0, 5)];
  const sub = (anchorClipId: string, offset: number, duration: number): Subtitle => ({
    id: 's',
    text: 't',
    anchorClipId,
    offset,
    duration
  });

  it('절대 시간 = start(anchor) + offset', () => {
    const l = layoutTimeline(clips, []);
    expect(subtitleRange(l, sub('b', 1, 2))).toEqual({ start: 6, end: 8, hidden: false });
  });
  it('전환을 넣으면 줄어든 시간만큼 같이 이동', () => {
    const l = layoutTimeline(clips, [tr('a', 1)]);
    expect(subtitleRange(l, sub('b', 1, 2))).toEqual({ start: 5, end: 7, hidden: false });
  });
  it('클립 끝을 넘는 부분은 잘라냄, 완전히 밖이면 숨김', () => {
    const l = layoutTimeline(clips, []);
    expect(subtitleRange(l, sub('a', 4, 3))).toEqual({ start: 4, end: 5, hidden: false });
    expect(subtitleRange(l, sub('a', 6, 1)).hidden).toBe(true);
    expect(subtitleRange(l, sub('a', -0.5, 1))).toEqual({ start: 0, end: 0.5, hidden: false });
    expect(subtitleRange(l, sub('없음', 0, 1)).hidden).toBe(true);
  });
});

describe('layoutMusic', () => {
  it('자석 방식으로 이어서', () => {
    const m = layoutMusic([
      { id: 'a', mediaId: 'x', inPoint: 5, outPoint: 15, loop: false },
      { id: 'b', mediaId: 'x', inPoint: 0, outPoint: 3, loop: true }
    ]);
    expect(m.map((x) => [x.start, x.end])).toEqual([
      [0, 10],
      [10, 13]
    ]);
  });
});

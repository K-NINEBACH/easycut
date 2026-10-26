// 타임라인 시간 계산 — 유일한 구현 (PRD 7.1). 미리보기·렌더·UI 모두 이 파일을 쓴다.
import type { MusicClip, Subtitle, Transition, VideoClip } from './types';
import { IMAGE_DEFAULT_DURATION } from './types';

/** 이보다 짧게 줄어든 전환은 넣을 수 없음 → 컷으로 처리 */
export const MIN_TRANSITION = 0.1;

const EPS = 1e-9;

/** 클립 실제 길이 len(c) = (outPoint - inPoint) / speed (사진은 imageDuration) */
export function clipLength(c: VideoClip): number {
  if (c.imageDuration !== undefined) return c.imageDuration;
  return Math.max(0, c.outPoint - c.inPoint) / c.speed;
}

export function isImageClip(c: VideoClip): boolean {
  return c.imageDuration !== undefined;
}

export interface TransitionInfo {
  afterClipId: string;
  type: Transition['type'];
  /** 사용자가 고른 길이 */
  requested: number;
  /** 실제 적용 길이 (자동 축소, 불가하면 0) */
  duration: number;
  /** 장면이 너무 짧아서 넣을 수 없음 */
  tooShort: boolean;
}

/**
 * clips[i] 와 clips[i+1] 사이 전환의 실제 길이.
 * 클립 길이가 (전환 길이 × 2) 보다 짧으면 자동 축소 (PRD F6) → 양쪽 전환이 겹치지 않는다.
 */
export function effectiveTransition(a: VideoClip, b: VideoClip, t: Transition | undefined): TransitionInfo | null {
  if (!t || t.type === 'none') return null;
  const limit = Math.min(clipLength(a), clipLength(b)) / 2;
  const d = Math.min(t.duration, limit);
  const ok = d >= MIN_TRANSITION - EPS;
  return { afterClipId: a.id, type: t.type, requested: t.duration, duration: ok ? d : 0, tooShort: !ok };
}

export interface ClipLayout {
  id: string;
  index: number;
  /** 타임라인 시작 (초) */
  start: number;
  end: number;
  length: number;
  /** 앞 클립과의 전환 길이 (겹치는 구간) */
  overlapIn: number;
  overlapOut: number;
}

export interface TimelineLayout {
  clips: ClipLayout[];
  byId: Map<string, ClipLayout>;
  /** 실제로 적용되는 전환 (index i = clips[i] 뒤) */
  transitions: (TransitionInfo | null)[];
  total: number;
}

/**
 * start(i) = Σ len(0..i-1) − Σ 전환 길이(0..i-1)
 * 전체 길이 = Σ len − Σ 전환 길이
 */
export function layoutTimeline(clips: VideoClip[], transitions: Transition[]): TimelineLayout {
  const tMap = new Map(transitions.map((t) => [t.afterClipId, t]));
  const out: ClipLayout[] = [];
  const trans: (TransitionInfo | null)[] = [];
  let cursor = 0;
  let prevOverlap = 0;
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const len = clipLength(c);
    const next = clips[i + 1];
    const info = next ? effectiveTransition(c, next, tMap.get(c.id)) : null;
    trans.push(info);
    const overlapOut = info?.duration ?? 0;
    out.push({ id: c.id, index: i, start: cursor, end: cursor + len, length: len, overlapIn: prevOverlap, overlapOut });
    cursor += len - overlapOut;
    prevOverlap = overlapOut;
  }
  const total = out.length ? out[out.length - 1].end : 0;
  return { clips: out, byId: new Map(out.map((c) => [c.id, c])), transitions: trans, total };
}

/**
 * 시간 t 에 보이는 클립 index. 전환 구간에서는 뒤 클립 (들어오는 장면).
 * 타임라인 밖이면 마지막/첫 클립, 비어 있으면 -1.
 */
export function clipIndexAt(layout: TimelineLayout, t: number): number {
  const { clips } = layout;
  if (clips.length === 0) return -1;
  for (let i = clips.length - 1; i >= 0; i--) {
    if (t >= clips[i].start - EPS) return i;
  }
  return 0;
}

/** 시간 t 에서 전환 중이면 { 앞 index, 진행 0~1 } */
export function transitionAt(layout: TimelineLayout, t: number): { index: number; progress: number } | null {
  for (let i = 0; i < layout.clips.length - 1; i++) {
    const d = layout.transitions[i]?.duration ?? 0;
    if (d <= 0) continue;
    const start = layout.clips[i + 1].start;
    if (t >= start - EPS && t < start + d) return { index: i, progress: Math.min(1, Math.max(0, (t - start) / d)) };
  }
  return null;
}

/** 타임라인 시간 → 원본 시간 */
export function sourceTime(clip: VideoClip, layout: ClipLayout, t: number): number {
  if (isImageClip(clip)) return 0;
  const local = Math.min(Math.max(t - layout.start, 0), layout.length);
  return clip.inPoint + local * clip.speed;
}

export interface SubtitleRange {
  start: number;
  end: number;
  /** 클립 밖으로 완전히 밀려나 숨김 (PRD 7.2, 13장 #3) */
  hidden: boolean;
}

/**
 * 자막 절대 시간 = start(anchorClip) + offset.
 * 클립 밖으로 밀린 부분은 잘라내고, 완전히 밖이면 숨김.
 */
export function subtitleRange(layout: TimelineLayout, s: Subtitle): SubtitleRange {
  const c = layout.byId.get(s.anchorClipId);
  if (!c) return { start: 0, end: 0, hidden: true };
  const start = c.start + Math.max(0, s.offset);
  const end = Math.min(c.start + s.offset + s.duration, c.end);
  if (end - start < 0.05) return { start: c.start + s.offset, end: c.start + s.offset + s.duration, hidden: true };
  return { start, end, hidden: false };
}

export interface MusicLayout {
  id: string;
  start: number;
  end: number;
  length: number;
}

/** 음악 트랙: 자석 방식, 0초부터 이어서 */
export function layoutMusic(track: MusicClip[]): MusicLayout[] {
  let cursor = 0;
  return track.map((m) => {
    const length = Math.max(0, m.outPoint - m.inPoint);
    const item = { id: m.id, start: cursor, end: cursor + length, length };
    cursor += length;
    return item;
  });
}

export function musicTotal(track: MusicClip[]): number {
  return track.reduce((a, m) => a + Math.max(0, m.outPoint - m.inPoint), 0);
}

/** 렌더용: 타임라인 시간을 프레임 경계로 맞춘다 (누적 오차 방지) */
export function toFrame(t: number, fps: number): number {
  return Math.round(t * fps + 1e-6);
}

/**
 * 렌더용 장면별 출력 프레임 수. 장면마다 따로 반올림하지 않고 시작·끝 경계를 프레임으로 맞춰서
 * 장면이 많아도 전체 길이 오차가 1프레임을 넘지 않는다.
 */
export function clipFrameCounts(layout: TimelineLayout, fps: number): number[] {
  return layout.clips.map((c) => Math.max(1, toFrame(c.end, fps) - toFrame(c.start, fps)));
}

/** 렌더용: clips[i] 와 clips[i+1] 이 전환으로 겹치는 프레임 수 (컷이면 0). 길이 = 장면 수 - 1 */
export function transitionFrameOverlaps(layout: TimelineLayout, fps: number): number[] {
  return layout.clips.slice(0, -1).map((c, i) => {
    if (!(layout.transitions[i]?.duration ?? 0)) return 0;
    return Math.max(0, toFrame(c.end, fps) - toFrame(layout.clips[i + 1].start, fps));
  });
}

export { IMAGE_DEFAULT_DURATION };

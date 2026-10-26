// 프로젝트 편집 동작 (순수 함수, Immer draft 에 직접 적용). 렌더러 store 와 테스트에서 사용.
// 클립을 옮기거나 지우거나 자를 때 전환·자막이 같이 따라가도록 여기서 한 번에 처리한다.
import type { ColorAdjust, FilterId, FitMode, MediaItem, MusicClip, MusicSettings, Project, Speed, Subtitle, TransitionId, VideoClip } from './types';
import { IMAGE_DEFAULT_DURATION, MIN_CLIP_LENGTH } from './types';
import { clipLength, isImageClip, layoutMusic, layoutTimeline } from './timeline';

export const newId = (): string => globalThis.crypto.randomUUID();

export function makeVideoClip(media: MediaItem): VideoClip {
  const base = {
    id: newId(),
    mediaId: media.id,
    speed: 1 as Speed,
    muted: false,
    volume: 1,
    fitMode: 'blur' as const,
    filter: 'none' as const,
    filterStrength: 1,
    adjust: { brightness: 0, contrast: 0, saturation: 0 }
  };
  if (media.type === 'image') {
    return { ...base, inPoint: 0, outPoint: IMAGE_DEFAULT_DURATION, imageDuration: IMAGE_DEFAULT_DURATION };
  }
  return { ...base, inPoint: 0, outPoint: media.duration };
}

export function makeMusicClip(media: MediaItem): MusicClip {
  return { id: newId(), mediaId: media.id, inPoint: 0, outPoint: media.duration, loop: false };
}

/**
 * 미디어를 타임라인에 넣는다. 영상·사진은 영상 트랙 index 위치에, 음악은 음악 트랙 끝에.
 * 반환: 새로 만든 영상 클립 id 목록
 */
export function insertMedia(p: Project, mediaIds: string[], index?: number): string[] {
  const byId = new Map(p.media.map((m) => [m.id, m]));
  const clips: VideoClip[] = [];
  for (const id of mediaIds) {
    const m = byId.get(id);
    if (!m || m.missing) continue;
    if (m.type === 'audio') p.musicTrack.push(makeMusicClip(m));
    else clips.push(makeVideoClip(m));
  }
  const at = index === undefined ? p.videoTrack.length : Math.max(0, Math.min(index, p.videoTrack.length));
  p.videoTrack.splice(at, 0, ...clips);
  return clips.map((c) => c.id);
}

/** 순서 변경. 전환(afterClipId)과 자막(anchorClipId)은 클립 id 에 붙어 있어 자동으로 따라간다 */
export function moveClip(p: Project, from: number, to: number): void {
  if (from === to || from < 0 || from >= p.videoTrack.length) return;
  const [c] = p.videoTrack.splice(from, 1);
  p.videoTrack.splice(Math.max(0, Math.min(to, p.videoTrack.length)), 0, c);
}

/** 여러 클립을 한꺼번에 to 위치(옮기기 전 기준 index)로 옮긴다 */
export function moveClipsTo(p: Project, ids: string[], to: number): void {
  const set = new Set(ids);
  const moving = p.videoTrack.filter((c) => set.has(c.id));
  const before = p.videoTrack.slice(0, to).filter((c) => !set.has(c.id)).length;
  const rest = p.videoTrack.filter((c) => !set.has(c.id));
  rest.splice(before, 0, ...moving);
  p.videoTrack = rest;
}

/** 클립 삭제: 뒤 클립이 당겨지고, 붙어 있던 전환·자막도 지운다 (Undo 로 복구) */
export function deleteClips(p: Project, ids: string[]): void {
  const set = new Set(ids);
  p.videoTrack = p.videoTrack.filter((c) => !set.has(c.id));
  p.transitions = p.transitions.filter((t) => !set.has(t.afterClipId));
  p.subtitles = p.subtitles.filter((s) => !set.has(s.anchorClipId));
}

function clampTrim(c: VideoClip, media: MediaItem | undefined, inPoint: number, outPoint: number): [number, number] {
  const max = media?.duration ?? outPoint;
  let a = Math.max(0, inPoint);
  let b = Math.min(max, outPoint);
  const minSrc = MIN_CLIP_LENGTH * c.speed;
  if (b - a < minSrc) {
    // 움직인 쪽을 되돌려 최소 길이 확보
    if (a !== c.inPoint) a = b - minSrc;
    else b = a + minSrc;
  }
  return [Math.max(0, a), Math.min(max, b)];
}

/** 앞뒤 자르기 (원본 기준). 앞을 자르면 자막이 내용과 함께 앞으로 당겨진다 */
export function trimClip(p: Project, clipId: string, inPoint: number, outPoint: number): void {
  const c = p.videoTrack.find((x) => x.id === clipId);
  if (!c || isImageClip(c)) return;
  const media = p.media.find((m) => m.id === c.mediaId);
  const [a, b] = clampTrim(c, media, inPoint, outPoint);
  const shift = (a - c.inPoint) / c.speed;
  c.inPoint = a;
  c.outPoint = b;
  if (shift !== 0) {
    for (const s of p.subtitles) if (s.anchorClipId === clipId) s.offset -= shift;
  }
}

export function setImageDuration(p: Project, clipId: string, seconds: number): void {
  const c = p.videoTrack.find((x) => x.id === clipId);
  if (!c || !isImageClip(c)) return;
  const d = Math.min(10, Math.max(1, Math.round(seconds * 10) / 10));
  c.imageDuration = d;
  c.outPoint = d;
}

/** 속도 변경: 붙은 자막 시간도 같은 비율로 */
export function setSpeed(p: Project, clipId: string, speed: Speed): void {
  const c = p.videoTrack.find((x) => x.id === clipId);
  if (!c || isImageClip(c) || c.speed === speed) return;
  const ratio = c.speed / speed;
  for (const s of p.subtitles) {
    if (s.anchorClipId !== clipId) continue;
    s.offset *= ratio;
    s.duration *= ratio;
  }
  c.speed = speed;
}

/** 소리 켜기/끄기, 볼륨 0~2 (PRD F3) */
export function setClipAudio(p: Project, clipId: string, audio: { muted?: boolean; volume?: number }): void {
  const c = p.videoTrack.find((x) => x.id === clipId);
  if (!c) return;
  if (audio.muted !== undefined) c.muted = audio.muted;
  if (audio.volume !== undefined) c.volume = Math.min(2, Math.max(0, Math.round(audio.volume * 100) / 100));
}

/** 필터·강도·기본 보정 (PRD F7). ids 여러 개면 [모든 장면에 적용] */
export function setLook(
  p: Project,
  ids: string[],
  look: { filter?: FilterId; filterStrength?: number; adjust?: Partial<ColorAdjust> }
): void {
  const set = new Set(ids);
  const clampAdj = (v: number): number => Math.min(50, Math.max(-50, Math.round(v)));
  for (const c of p.videoTrack) {
    if (!set.has(c.id)) continue;
    if (look.filter !== undefined) c.filter = look.filter;
    if (look.filterStrength !== undefined) c.filterStrength = Math.min(1, Math.max(0, Math.round(look.filterStrength * 100) / 100));
    if (look.adjust) {
      for (const k of ['brightness', 'contrast', 'saturation'] as const) {
        const v = look.adjust[k];
        if (v !== undefined) c.adjust[k] = clampAdj(v);
      }
    }
  }
}

/**
 * 장면 전환 (PRD F6). afterClipIds 의 각 장면 뒤에 같은 전환을 넣는다 ([모든 장면에 적용]은 마지막 장면 빼고 전부).
 * 'none' 이면 지운다. 반환: 장면이 너무 짧아 넣지 못한 곳의 수
 */
export function setTransition(p: Project, afterClipIds: string[], type: TransitionId, duration: number): number {
  const last = p.videoTrack[p.videoTrack.length - 1]?.id;
  const ids = new Set(afterClipIds.filter((id) => id !== last && p.videoTrack.some((c) => c.id === id)));
  p.transitions = p.transitions.filter((t) => !ids.has(t.afterClipId));
  if (type === 'none') return 0;
  for (const id of ids) p.transitions.push({ afterClipId: id, type, duration });
  const layout = layoutTimeline(p.videoTrack, p.transitions);
  return layout.transitions.filter((t) => t && ids.has(t.afterClipId) && t.tooShort).length;
}

/** 화면 맞춤: 흐린 배경 / 검은 배경 / 꽉 채우기 (PRD F2) */
export function setFitMode(p: Project, clipId: string, mode: FitMode): void {
  const c = p.videoTrack.find((x) => x.id === clipId);
  if (c) c.fitMode = mode;
}

/**
 * 나누기: 타임라인 시간 t 에서 클립을 둘로. 성공하면 새 클립 id.
 * 뒤쪽 자막은 새 클립으로 옮기고, 원래 클립 뒤에 있던 전환은 새 클립 뒤로 옮긴다.
 */
export function splitClip(p: Project, clipId: string, t: number): string | null {
  const layout = layoutTimeline(p.videoTrack, p.transitions);
  const cl = layout.byId.get(clipId);
  const idx = p.videoTrack.findIndex((c) => c.id === clipId);
  if (!cl || idx < 0) return null;
  const c = p.videoTrack[idx];
  const local = t - cl.start;
  if (local < MIN_CLIP_LENGTH - 1e-6 || cl.length - local < MIN_CLIP_LENGTH - 1e-6) return null;

  const second: VideoClip = { ...structuredCloneSafe(c), id: newId() };
  if (isImageClip(c)) {
    c.imageDuration = local;
    c.outPoint = local;
    second.imageDuration = cl.length - local;
    second.outPoint = cl.length - local;
  } else {
    const cut = c.inPoint + local * c.speed;
    c.outPoint = cut;
    second.inPoint = cut;
  }
  p.videoTrack.splice(idx + 1, 0, second);

  for (const tr of p.transitions) if (tr.afterClipId === clipId) tr.afterClipId = second.id;
  for (const s of p.subtitles) {
    if (s.anchorClipId === clipId && s.offset >= local - 1e-6) {
      s.anchorClipId = second.id;
      s.offset -= local;
    }
  }
  return second.id;
}

/** 복사한 클립을 index 위치에 붙여넣기 (Ctrl+V) */
export function pasteClips(p: Project, clips: VideoClip[], index: number): string[] {
  const copies = clips.map((c) => ({ ...structuredCloneSafe(c), id: newId() }));
  p.videoTrack.splice(Math.max(0, Math.min(index, p.videoTrack.length)), 0, ...copies);
  return copies.map((c) => c.id);
}

// --- 음악 ---

export function deleteMusic(p: Project, ids: string[]): void {
  const set = new Set(ids);
  p.musicTrack = p.musicTrack.filter((m) => !set.has(m.id));
}

export function moveMusic(p: Project, from: number, to: number): void {
  if (from === to || from < 0 || from >= p.musicTrack.length) return;
  const [m] = p.musicTrack.splice(from, 1);
  p.musicTrack.splice(Math.max(0, Math.min(to, p.musicTrack.length)), 0, m);
}

export function trimMusic(p: Project, id: string, inPoint: number, outPoint: number): void {
  const m = p.musicTrack.find((x) => x.id === id);
  if (!m) return;
  const media = p.media.find((x) => x.id === m.mediaId);
  const max = media?.duration ?? outPoint;
  let a = Math.max(0, inPoint);
  let b = Math.min(max, outPoint);
  if (b - a < MIN_CLIP_LENGTH) {
    if (a !== m.inPoint) a = b - MIN_CLIP_LENGTH;
    else b = a + MIN_CLIP_LENGTH;
  }
  m.inPoint = Math.max(0, a);
  m.outPoint = Math.min(max, b);
}

/**
 * [영상 길이에 맞추기] (PRD F5): 길면 끝을 자르고, 짧으면 처음부터 반복해 채운다.
 * 반복으로 생긴 클립은 loop=true. 이전에 반복으로 만든 클립은 지우고 다시 계산.
 */
export function fitMusicToVideo(p: Project): void {
  const total = layoutTimeline(p.videoTrack, p.transitions).total;
  const base = p.musicTrack.filter((m) => !m.loop);
  if (base.length === 0 || total <= 0) return;
  const out: MusicClip[] = [];
  let cursor = 0;
  let i = 0;
  let guard = 0;
  while (cursor < total - 1e-3 && guard++ < 1000) {
    const src = base[i % base.length];
    const len = src.outPoint - src.inPoint;
    if (len <= 0) break;
    const take = Math.min(len, total - cursor);
    const clip: MusicClip =
      i < base.length ? { ...src } : { ...src, id: newId(), loop: true };
    clip.outPoint = clip.inPoint + take;
    // 너무 짧은 꼬리 조각은 버린다
    if (take >= MIN_CLIP_LENGTH || out.length === 0) out.push(clip);
    cursor += take;
    i++;
  }
  p.musicTrack = out;
}

/** 배경음악 설정: 볼륨 0~1, 페이드 초 (0 이면 끔), 덕킹 (PRD F5) */
export function setMusicSettings(p: Project, m: Partial<MusicSettings>): void {
  if (m.volume !== undefined) p.music.volume = Math.min(1, Math.max(0, Math.round(m.volume * 100) / 100));
  if (m.fadeIn !== undefined) p.music.fadeIn = Math.max(0, m.fadeIn);
  if (m.fadeOut !== undefined) p.music.fadeOut = Math.max(0, m.fadeOut);
  if (m.ducking !== undefined) p.music.ducking = m.ducking;
}

export function musicEnd(p: Project): number {
  const l = layoutMusic(p.musicTrack);
  return l.length ? l[l.length - 1].end : 0;
}

// --- 자막 ---

/** 자막 겹침 방지: 같은 시간대 다른 자막과 겹치지 않게 시작·길이를 조정한 값을 돌려준다 */
export function clampSubtitleSpan(
  ranges: { id: string; start: number; end: number }[],
  selfId: string,
  start: number,
  duration: number,
  total: number
): { start: number; duration: number } | null {
  const others = ranges.filter((r) => r.id !== selfId).sort((a, b) => a.start - b.start);
  let s = Math.max(0, Math.min(start, total - 0.3));
  // 다른 자막 안에서 시작하면 그 뒤로
  for (const o of others) if (s >= o.start - 1e-6 && s < o.end - 1e-6) s = o.end;
  const next = others.find((o) => o.start >= s - 1e-6);
  const limit = Math.min(next ? next.start : Infinity, total);
  const d = Math.min(duration, limit - s);
  if (d < 0.3) return null;
  return { start: s, duration: d };
}

/** 타임라인 절대 시간 → 자막 anchor (그 시간 아래 클립) */
export function anchorFor(p: Project, absStart: number): { anchorClipId: string; offset: number } | null {
  const layout = layoutTimeline(p.videoTrack, p.transitions);
  if (layout.clips.length === 0) return null;
  let cl = layout.clips[0];
  for (const c of layout.clips) if (absStart >= c.start - 1e-6) cl = c;
  return { anchorClipId: cl.id, offset: absStart - cl.start };
}

export function addSubtitle(p: Project, absStart: number, duration: number, text = ''): Subtitle | null {
  const a = anchorFor(p, absStart);
  if (!a) return null;
  const s: Subtitle = { id: newId(), text, ...a, duration };
  p.subtitles.push(s);
  return s;
}

/** 자막을 다른 위치로 옮기면 anchor 재계산 (PRD 7.2) */
export function moveSubtitle(p: Project, id: string, absStart: number, duration?: number): void {
  const s = p.subtitles.find((x) => x.id === id);
  const a = anchorFor(p, absStart);
  if (!s || !a) return;
  s.anchorClipId = a.anchorClipId;
  s.offset = a.offset;
  if (duration !== undefined) s.duration = duration;
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export { clipLength };

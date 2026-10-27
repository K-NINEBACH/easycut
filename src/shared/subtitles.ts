// 자막 모양·줄바꿈·파일 만들기 (PRD F4). 미리보기(SubtitleOverlay)와 렌더(ASS)가 같은 값을 쓴다.
// 모든 크기는 1080p 화면 기준 픽셀 (ASS PlayResY = 1080).
import type { Subtitle, SubtitleStyle, SubtitleStyleId } from './types';
import { subtitleRange, type TimelineLayout } from './timeline';

export const PLAY_RES = { width: 1920, height: 1080 };

export interface FontDef {
  /** 글꼴 파일 안의 이름 (libass 가 이 이름으로 찾는다) */
  family: string;
  file: string;
  bold: boolean;
  /**
   * CSS font-size = ASS 크기 × ratio.
   * libass 는 (winAscent + winDescent) 를 글자 크기로 맞추고 CSS 는 em 을 쓰므로 unitsPerEm / (winAscent + winDescent)
   */
  ratio: number;
}

export const FONTS: Record<'sans' | 'pen' | 'title', FontDef> = {
  sans: { family: 'Pretendard', file: 'Pretendard-Bold.otf', bold: true, ratio: 2048 / (1949 + 494) },
  pen: { family: 'Nanum Pen', file: 'NanumPenScript-Regular.ttf', bold: false, ratio: 1000 / (809 + 202) },
  title: { family: 'Black Han Sans', file: 'BlackHanSans-Regular.ttf', bold: false, ratio: 1000 / (810 + 210) }
};

export interface PresetDef {
  id: SubtitleStyleId;
  label: string;
  font: FontDef;
  /** 글자색 #RRGGBB */
  color: string;
  outlineColor: string;
  /** 테두리 굵기 (px). box 면 상자 여백 */
  outline: number;
  /** 반투명 상자 (rgba 의 알파 0~1) */
  boxAlpha?: number;
  /** 크기 배율 */
  scale: number;
  /** 이 모양을 고르면 기본으로 쓰는 위치 */
  defaultPosition: SubtitleStyle['position'];
}

export const SUBTITLE_PRESETS: PresetDef[] = [
  { id: 'basic', label: '기본', font: FONTS.sans, color: '#FFFFFF', outlineColor: '#000000', outline: 4, scale: 1, defaultPosition: 'bottom' },
  { id: 'box', label: '반투명 박스', font: FONTS.sans, color: '#FFFFFF', outlineColor: '#000000', outline: 14, boxAlpha: 0.6, scale: 1, defaultPosition: 'bottom' },
  { id: 'yellow', label: '노랑 강조', font: FONTS.sans, color: '#FFE14D', outlineColor: '#000000', outline: 4, scale: 1, defaultPosition: 'bottom' },
  { id: 'hand', label: '손글씨', font: FONTS.pen, color: '#FFFFFF', outlineColor: '#000000', outline: 3, scale: 1.25, defaultPosition: 'bottom' },
  { id: 'title', label: '상단 제목', font: FONTS.title, color: '#FFFFFF', outlineColor: '#000000', outline: 5, scale: 1.5, defaultPosition: 'top' }
];

export const PRESET_BY_ID = Object.fromEntries(SUBTITLE_PRESETS.map((p) => [p.id, p])) as Record<SubtitleStyleId, PresetDef>;

/** 글자 크기 (ASS 크기, 1080p 기준) */
export const SIZE_PX: Record<SubtitleStyle['size'], number> = { S: 48, M: 60, L: 76 };
/** 화면 위·아래 여백 */
export const MARGIN_V = 64;
export const MARGIN_H = 80;
/** 한 줄 최대 글자 수 (PRD 4-2) */
export const MAX_LINE_CHARS = 20;

export const SIZE_LABELS: { id: SubtitleStyle['size']; label: string }[] = [
  { id: 'S', label: '작게' },
  { id: 'M', label: '보통' },
  { id: 'L', label: '크게' }
];
export const POSITION_LABELS: { id: SubtitleStyle['position']; label: string }[] = [
  { id: 'top', label: '위' },
  { id: 'middle', label: '가운데' },
  { id: 'bottom', label: '아래' }
];

export function effectiveStyle(def: SubtitleStyle, s?: Pick<Subtitle, 'styleOverride'>): SubtitleStyle {
  return { ...def, ...(s?.styleOverride ?? {}) };
}

export interface ResolvedStyle {
  preset: PresetDef;
  /** ASS 크기 (= 한 줄 높이) */
  size: number;
  position: SubtitleStyle['position'];
}

export function resolveStyle(st: SubtitleStyle): ResolvedStyle {
  const preset = PRESET_BY_ID[st.presetId] ?? PRESET_BY_ID.basic;
  return { preset, size: Math.round(SIZE_PX[st.size] * preset.scale), position: st.position };
}

/**
 * 줄바꿈: 사용자가 넣은 줄바꿈은 그대로, 20자를 넘는 줄은 20자 안의 마지막 띄어쓰기에서 (없으면 20자에서) 나눈다.
 * 미리보기와 렌더가 같은 줄을 쓰도록 자동 줄바꿈은 끈다.
 */
export function wrapSubtitle(text: string, max = MAX_LINE_CHARS): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    let line = raw.trim();
    if (!line) continue;
    while ([...line].length > max) {
      const chars = [...line];
      const head = chars.slice(0, max + 1).join('');
      const sp = head.lastIndexOf(' ');
      const cut = sp > 0 ? sp : chars.slice(0, max).join('').length;
      out.push(line.slice(0, cut).trim());
      line = line.slice(cut).trim();
    }
    if (line) out.push(line);
  }
  return out;
}

/**
 * 자막 하나를 화면에 보일 범위와 함께 (숨김 제외, 시간순).
 * 서로 다른 장면의 자막이 전환 구간에서 겹치면 앞 자막을 뒤 자막 시작에서 끊는다 (한 번에 하나만 보이게).
 */
export function visibleSubtitles(layout: TimelineLayout, subs: Subtitle[]): { sub: Subtitle; start: number; end: number }[] {
  const items = subs
    .map((sub) => ({ sub, ...subtitleRange(layout, sub) }))
    .filter((x) => !x.hidden && x.sub.text.trim() !== '')
    .sort((a, b) => a.start - b.start)
    .map(({ sub, start, end }) => ({ sub, start, end }));
  for (let i = 0; i < items.length - 1; i++) items[i].end = Math.min(items[i].end, items[i + 1].start);
  return items.filter((x) => x.end - x.start >= 0.05);
}

// --- 말소리로 자막 만들기 (PRD 4-2) ---

/** 음성 인식 결과 한 구간 (이어 붙인 소리 기준 초) */
export interface SpeechSegment {
  start: number;
  end: number;
  text: string;
}

/** 이어 붙인 소리에서 각 장면이 차지하는 구간 */
export interface ClipSpan {
  clipId: string;
  /** 이어 붙인 소리에서의 시작 (초) */
  start: number;
  /** 장면 길이 (타임라인 초, 속도 반영) */
  length: number;
}

/** 한 자막 블록 최대 줄 수 */
export const MAX_LINES = 2;

/**
 * 인식 결과 → 자막 (id 없이). 구간이 시작하는 장면에 붙이고 그 장면 끝을 넘지 않게 자른다.
 * 두 줄을 넘는 구간은 두 줄씩 나누고 시간은 글자 수 비율로 나눈다.
 */
export function segmentsToSubtitles(
  segments: SpeechSegment[],
  spans: ClipSpan[]
): { anchorClipId: string; offset: number; duration: number; text: string }[] {
  const out: { anchorClipId: string; offset: number; duration: number; text: string }[] = [];
  for (const seg of segments) {
    const text = seg.text.trim().replace(/^-\s*/, '');
    if (!text || seg.end - seg.start < 0.05) continue;
    const span = spans.find((s) => seg.start >= s.start - 1e-6 && seg.start < s.start + s.length - 1e-6);
    if (!span) continue;
    const start = seg.start - span.start;
    const end = Math.min(seg.end - span.start, span.length);
    const lines = wrapSubtitle(text);
    const blocks: string[] = [];
    for (let i = 0; i < lines.length; i += MAX_LINES) blocks.push(lines.slice(i, i + MAX_LINES).join('\n'));
    const weights = blocks.map((b) => [...b.replace(/\s/g, '')].length || 1);
    const total = weights.reduce((a, b) => a + b, 0);
    let t = start;
    blocks.forEach((b, i) => {
      const d = ((end - start) * weights[i]) / total;
      out.push({ anchorClipId: span.clipId, offset: t, duration: d, text: b });
      t += d;
    });
  }
  return out;
}

// --- ASS (렌더 굽기) ---

/** #RRGGBB + 투명도(0 불투명~1 투명) → ASS &HAABBGGRR */
function assColor(hex: string, transparency = 0): string {
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  const a = Math.round(transparency * 255)
    .toString(16)
    .padStart(2, '0');
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

function assTime(t: number): string {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

/** ASS 에서 특별한 뜻이 있는 글자는 비슷한 전각 글자로 바꾼다 ({ } 는 효과 코드, \ 는 줄바꿈 등) */
export function escapeAssText(s: string): string {
  return s.replace(/\\/g, '＼').replace(/\{/g, '｛').replace(/\}/g, '｝');
}

const ALIGN = { bottom: 2, middle: 5, top: 8 } as const;

export function buildAss(layout: TimelineLayout, subs: Subtitle[], def: SubtitleStyle): string {
  const items = visibleSubtitles(layout, subs);
  const styles = new Map<string, ResolvedStyle>();
  const events: string[] = [];
  for (const { sub, start, end } of items) {
    const r = resolveStyle(effectiveStyle(def, sub));
    const name = `${r.preset.id}_${r.size}_${r.position}`;
    styles.set(name, r);
    const text = wrapSubtitle(sub.text).map(escapeAssText).join('\\N');
    events.push(`Dialogue: 0,${assTime(start)},${assTime(end)},${name},,0,0,0,,${text}`);
  }
  const styleLines = [...styles].map(([name, r]) => {
    const p = r.preset;
    const box = p.boxAlpha !== undefined;
    return [
      `Style: ${name}`,
      p.font.family,
      r.size,
      assColor(p.color),
      assColor(p.color),
      // BorderStyle 3(상자)는 OutlineColour 로 상자를 칠한다
      box ? assColor('#000000', 1 - p.boxAlpha!) : assColor(p.outlineColor),
      assColor('#000000', 1),
      p.font.bold ? -1 : 0,
      0, 0, 0, 100, 100, 0, 0,
      box ? 3 : 1,
      p.outline,
      0,
      ALIGN[r.position],
      MARGIN_H,
      MARGIN_H,
      MARGIN_V,
      1
    ].join(',');
  });
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${PLAY_RES.width}`,
    `PlayResY: ${PLAY_RES.height}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.709',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    ...styleLines,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    ''
  ].join('\n');
}

// --- SRT (유튜브 자막 올리기용) ---

function srtTime(t: number): string {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}

export function buildSrt(layout: TimelineLayout, subs: Subtitle[]): string {
  return visibleSubtitles(layout, subs)
    .map(({ sub, start, end }, i) => `${i + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${wrapSubtitle(sub.text).join('\n')}\n`)
    .join('\n');
}

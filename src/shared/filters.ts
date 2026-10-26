// 필터·기본 보정 (PRD F7). 색 변환을 이 파일 한 곳에서 정의하고 3D LUT 로 구워서
// 미리보기(WebGL 3D 텍스처)와 최종 렌더(FFmpeg lut3d)가 같은 표를 쓴다 → 색이 같다.
import type { ColorAdjust, FilterId, VideoClip } from './types';

export const FILTERS: { id: FilterId; name: string }[] = [
  { id: 'none', name: '원본' },
  { id: 'vivid', name: '선명하게' },
  { id: 'warm', name: '따뜻하게' },
  { id: 'cool', name: '시원하게' },
  { id: 'film', name: '필름' },
  { id: 'mono', name: '흑백' },
  { id: 'bright', name: '밝게' },
  { id: 'mood', name: '감성' },
  { id: 'forest', name: '초록 숲' }
];

export const LUT_SIZE = 33;

type RGB = [number, number, number];

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const luma = (c: RGB): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** FFmpeg eq 와 같은 방식: 밝기(Y)에 대비·밝기·감마, 색 성분(채도)은 비율로 */
function eq(c: RGB, o: { contrast?: number; brightness?: number; saturation?: number; gamma?: number }): RGB {
  const y = luma(c);
  let y2 = (y - 0.5) * (o.contrast ?? 1) + 0.5 + (o.brightness ?? 0);
  if (o.gamma && o.gamma !== 1) y2 = Math.pow(clamp01(y2), 1 / o.gamma);
  const s = o.saturation ?? 1;
  return [y2 + (c[0] - y) * s, y2 + (c[1] - y) * s, y2 + (c[2] - y) * s];
}

/** colorbalance 와 비슷하게: 어두운 곳/중간/밝은 곳에 다른 세기로 색을 민다 */
function balance(c: RGB, shadows: RGB, mids: RGB, highs: RGB): RGB {
  const l = luma(c);
  const ws = clamp01(1 - l * 3);
  const wh = clamp01(l * 3 - 2);
  const wm = 1 - Math.abs(l * 2 - 1);
  return [0, 1, 2].map((i) => c[i] + shadows[i] * ws + mids[i] * wm + highs[i] * wh) as RGB;
}

/** 채널별 배율 (밝은 원색에도 색감이 보이도록) */
const gain = (c: RGB, k: RGB): RGB => [c[0] * k[0], c[1] * k[1], c[2] * k[2]];

/** 점들을 부드럽게 잇는 곡선 (단조 3차 보간, curves 필터 대용) */
function curve(points: [number, number][]): (x: number) => number {
  const n = points.length;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const d = xs.slice(1).map((x, i) => (ys[i + 1] - ys[i]) / (x - xs[i]));
  const m = xs.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1]
    );
  };
}

// FFmpeg curves=preset=vintage 와 같은 점
const VINTAGE = [
  curve([[0, 0.11], [0.42, 0.51], [1, 0.95]]),
  curve([[0, 0], [0.5, 0.48], [1, 1]]),
  curve([[0, 0.22], [0.49, 0.44], [1, 0.8]])
];

const PRESETS: Record<FilterId, (c: RGB) => RGB> = {
  none: (c) => c,
  vivid: (c) => eq(c, { contrast: 1.1, saturation: 1.25 }),
  warm: (c) =>
    eq(gain(balance(c, [0.04, 0.01, -0.05], [0.09, 0.03, -0.09], [0.05, 0.03, -0.04]), [1.05, 1, 0.88]), { saturation: 1.05 }),
  cool: (c) => gain(balance(c, [-0.04, 0, 0.07], [-0.07, 0.01, 0.09], [-0.03, 0.01, 0.05]), [0.9, 0.99, 1.06]),
  film: (c) => [VINTAGE[0](c[0]), VINTAGE[1](c[1]), VINTAGE[2](c[2])],
  mono: (c) => eq(c, { saturation: 0, contrast: 1.1 }),
  bright: (c) => eq(c, { brightness: 0.06, gamma: 1.1 }),
  // 낮은 채도 + 들뜬 검정 + 살짝 따뜻한 밝은 곳
  mood: (c) => {
    const e = eq(c, { saturation: 0.72, contrast: 0.88 });
    return balance(e.map((v) => 0.06 + v * 0.9) as RGB, [0.01, 0.01, 0.03], [0.02, 0.01, 0], [0.03, 0.02, -0.01]);
  },
  forest: (c) => eq(balance(c, [-0.02, 0.03, -0.01], [-0.03, 0.06, -0.02], [0, 0.02, -0.01]), { saturation: 1.12, contrast: 1.05 })
};

export interface Look {
  filter: FilterId;
  filterStrength: number;
  adjust: ColorAdjust;
}

/** 필터 강도 0 이고 보정도 없으면 원본 그대로 (LUT 를 아예 쓰지 않음 → 정확히 원본과 같음) */
export function isIdentityLook(l: Look): boolean {
  const a = l.adjust;
  return (l.filter === 'none' || l.filterStrength <= 0) && !a.brightness && !a.contrast && !a.saturation;
}

/** 색 함수: 필터 결과를 강도만큼 원본과 섞고, 기본 보정(밝기·대비·채도 -50~50)을 적용 */
export function lookFunction(l: Look): (c: RGB) => RGB {
  const preset = PRESETS[l.filter] ?? PRESETS.none;
  const k = clamp01(l.filterStrength);
  const a = l.adjust;
  const adj = {
    brightness: (a.brightness / 50) * 0.15,
    contrast: 1 + (a.contrast / 50) * 0.4,
    saturation: 1 + a.saturation / 50
  };
  const hasAdj = !!(a.brightness || a.contrast || a.saturation);
  return (c) => {
    const f = preset(c);
    let out: RGB = [c[0] + (f[0] - c[0]) * k, c[1] + (f[1] - c[1]) * k, c[2] + (f[2] - c[2]) * k];
    if (hasAdj) out = eq(out, adj);
    return [clamp01(out[0]), clamp01(out[1]), clamp01(out[2])];
  };
}

/** LUT 값 (size³ × RGB, 0~1). 순서는 .cube 와 같이 R 이 가장 빨리 변한다 */
export function bakeLut(l: Look, size = LUT_SIZE): Float32Array {
  const fn = lookFunction(l);
  const out = new Float32Array(size * size * size * 3);
  let i = 0;
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++) {
        const c = fn([r / (size - 1), g / (size - 1), b / (size - 1)]);
        out[i++] = c[0];
        out[i++] = c[1];
        out[i++] = c[2];
      }
  return out;
}

/** FFmpeg lut3d 용 .cube 파일 내용 */
export function lutToCube(lut: Float32Array, size = LUT_SIZE): string {
  const lines = [`LUT_3D_SIZE ${size}`];
  for (let i = 0; i < lut.length; i += 3) lines.push(`${lut[i].toFixed(6)} ${lut[i + 1].toFixed(6)} ${lut[i + 2].toFixed(6)}`);
  return lines.join('\n') + '\n';
}

/** WebGL 용 8비트 */
export function lutToBytes(lut: Float32Array): Uint8Array {
  const out = new Uint8Array(lut.length);
  for (let i = 0; i < lut.length; i++) out[i] = Math.round(lut[i] * 255);
  return out;
}

export function lookKey(l: Look): string {
  const a = l.adjust;
  return `${l.filter}:${l.filterStrength}:${a.brightness}:${a.contrast}:${a.saturation}`;
}

export function lookOf(c: VideoClip): Look {
  return { filter: c.filter, filterStrength: c.filterStrength, adjust: c.adjust };
}

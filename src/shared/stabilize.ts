// 흔들림 줄이기·영역 고정 (PRD 13장 #16). 두 기능 모두 결과는 "프레임마다 잘라 낼 창의 가운데" 경로 하나다.
// 미리보기(셰이더)와 렌더(crop + sendcmd)가 같은 stabilizeWindow 를 써서 결과가 같다.
// 프레임 분석은 회색 작은 프레임에서 템플릿 매칭(NCC)으로 한다. 평행 이동만 다루고 회전·크기 변화는 다루지 않는다.
import type { FitMode, Stabilize } from './types';

/** 경로 표본 간격: 프록시와 같은 초당 30개 */
export const STAB_FPS = 30;
/** 분석 프레임 긴 변 */
export const ANALYZE_LONG_SIDE = 640;
export const STAB_MAX_ZOOM = 2.5;
export const SHAKE_MAX_ZOOM = 1.35;
export const LOCK_MAX_AUTO_ZOOM = 2;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CropWindow {
  /** 창 가운데 (원본 비율 0~1) */
  cx: number;
  cy: number;
  /** 창 크기 (원본 비율, 1/zoom) */
  s: number;
}

export function analyzeSize(width: number, height: number): { w: number; h: number } {
  const k = Math.min(1, ANALYZE_LONG_SIDE / Math.max(width, height));
  const even = (n: number): number => Math.max(2, Math.round((n * k) / 2) * 2);
  return { w: even(width), h: even(height) };
}

/** 원본 시간 t 에 잘라 낼 창. 분석 범위 밖이면 가장자리 값, 창은 항상 원본 안 */
export function stabilizeWindow(st: Stabilize, t: number): CropWindow {
  const n = st.path.length / 2;
  const s = 1 / st.zoom;
  const f = Math.min(n - 1, Math.max(0, (t - st.from) * st.fps));
  const i = Math.floor(f);
  const j = Math.min(n - 1, i + 1);
  const k = f - i;
  const lerp = (o: number): number => st.path[i * 2 + o] * (1 - k) + st.path[j * 2 + o] * k;
  const fit = (v: number): number => Math.min(1 - s / 2, Math.max(s / 2, v));
  return { cx: fit(lerp(0)), cy: fit(lerp(1)), s };
}

/** 미리보기 화면 위 위치(0~1) → 원본 위치(0~1). 화면 맞춤 수식은 셰이더 fitSample 과 같다 */
export function outputToSource(u: number, v: number, srcW: number, srcH: number, fit: FitMode): { x: number; y: number } {
  const sx = 16 / srcW;
  const sy = 9 / srcH;
  const s = fit === 'fill' ? Math.max(sx, sy) : Math.min(sx, sy);
  return { x: (u * 16 - (16 - srcW * s) / 2) / (srcW * s), y: (v * 9 - (9 - srcH * s) / 2) / (srcH * s) };
}

// --- 템플릿 매칭 ---

interface Template {
  /** 왼쪽 위 기준 표본 좌표 */
  xs: Int32Array;
  ys: Int32Array;
  /** 평균을 뺀 밝기 */
  vals: Float32Array;
  /** 밝기 제곱합의 제곱근 */
  norm: number;
  w: number;
  h: number;
}

function makeTemplate(frame: Uint8Array, W: number, box: Box, maxSide: number): Template {
  const stepX = Math.max(1, Math.floor(box.w / maxSide));
  const stepY = Math.max(1, Math.floor(box.h / maxSide));
  const xs: number[] = [];
  const ys: number[] = [];
  const raw: number[] = [];
  for (let y = 0; y < box.h; y += stepY)
    for (let x = 0; x < box.w; x += stepX) {
      xs.push(x);
      ys.push(y);
      raw.push(frame[(box.y + y) * W + box.x + x]);
    }
  return finishTemplate(Int32Array.from(xs), Int32Array.from(ys), Float32Array.from(raw), box.w, box.h);
}

function finishTemplate(xs: Int32Array, ys: Int32Array, vals: Float32Array, w: number, h: number): Template {
  let mean = 0;
  for (const v of vals) mean += v;
  mean /= vals.length;
  let sq = 0;
  for (let i = 0; i < vals.length; i++) {
    vals[i] -= mean;
    sq += vals[i] * vals[i];
  }
  return { xs, ys, vals, norm: Math.sqrt(sq), w, h };
}

/** 정규화 상호 상관 (-1~1). (ox,oy) 는 왼쪽 위 */
function ncc(t: Template, f: Uint8Array, W: number, ox: number, oy: number): number {
  let sum = 0;
  let sq = 0;
  let cross = 0;
  const n = t.vals.length;
  for (let i = 0; i < n; i++) {
    const v = f[(oy + t.ys[i]) * W + ox + t.xs[i]];
    sum += v;
    sq += v * v;
    cross += v * t.vals[i];
  }
  const d = sq - (sum * sum) / n;
  return d <= 1e-6 ? 0 : cross / (t.norm * Math.sqrt(d));
}

interface Match {
  x: number;
  y: number;
  score: number;
}

/** (cx,cy) 둘레 R 안에서 가장 닮은 왼쪽 위 위치. 2칸씩 찾은 뒤 다듬고 소수점 위치까지 */
function search(t: Template, f: Uint8Array, W: number, H: number, cx: number, cy: number, R: number): Match {
  const maxX = W - t.w;
  const maxY = H - t.h;
  const x0 = Math.max(0, Math.round(cx - R));
  const x1 = Math.min(maxX, Math.round(cx + R));
  const y0 = Math.max(0, Math.round(cy - R));
  const y1 = Math.min(maxY, Math.round(cy + R));
  let bx = Math.min(maxX, Math.max(0, Math.round(cx)));
  let by = Math.min(maxY, Math.max(0, Math.round(cy)));
  let best = ncc(t, f, W, bx, by);
  for (let y = y0; y <= y1; y += 2)
    for (let x = x0; x <= x1; x += 2) {
      const s = ncc(t, f, W, x, y);
      if (s > best) [best, bx, by] = [s, x, y];
    }
  const px = bx;
  const py = by;
  for (let y = Math.max(0, py - 1); y <= Math.min(maxY, py + 1); y++)
    for (let x = Math.max(0, px - 1); x <= Math.min(maxX, px + 1); x++) {
      const s = ncc(t, f, W, x, y);
      if (s > best) [best, bx, by] = [s, x, y];
    }
  // 포물선 맞춤
  const peak = (a: number, b: number, c: number): number => {
    const d = a - 2 * b + c;
    return d < -1e-9 ? Math.max(-0.5, Math.min(0.5, (a - c) / (2 * d))) : 0;
  };
  const dx = bx > 0 && bx < maxX ? peak(ncc(t, f, W, bx - 1, by), best, ncc(t, f, W, bx + 1, by)) : 0;
  const dy = by > 0 && by < maxY ? peak(ncc(t, f, W, bx, by - 1), best, ncc(t, f, W, bx, by + 1)) : 0;
  return { x: bx + dx, y: by + dy, score: best };
}

/** 이 밑으로 닮으면 놓친 것으로 본다 */
const LOST_SCORE = 0.5;
/** 찾는 범위: 분석 프레임 가로의 비율 */
const SEARCH_RATIO = 0.05;
/** 무늬가 거의 없는 영역 (표본 평균 표준편차, 0~255) */
const FLAT_STD = 4;

export interface TrackPoint {
  /** 영역 가운데 (분석 프레임 픽셀) */
  x: number;
  y: number;
  lost: boolean;
}

/** 고른 영역을 프레임마다 따라간다. 모양이 조금씩 변해도 따라가도록 템플릿을 천천히 갱신 */
export class RegionTracker {
  private t: Template;
  private x: number;
  private y: number;
  private vx = 0;
  private vy = 0;

  constructor(
    frame: Uint8Array,
    private readonly W: number,
    private readonly H: number,
    box: Box
  ) {
    this.t = makeTemplate(frame, W, box, 40);
    this.x = box.x;
    this.y = box.y;
  }

  /** 무늬가 없어 따라갈 수 없는 영역 */
  get flat(): boolean {
    return this.t.norm / Math.sqrt(this.t.vals.length) < FLAT_STD;
  }

  next(frame: Uint8Array): TrackPoint {
    const { t, W, H } = this;
    const R = Math.max(8, Math.round(W * SEARCH_RATIO));
    const m = search(t, frame, W, H, this.x + this.vx, this.y + this.vy, R);
    const cx = (x: number): number => x + t.w / 2;
    const cy = (y: number): number => y + t.h / 2;
    if (m.score < LOST_SCORE) {
      // 놓치면 넓게 다시 찾는다
      const wide = search(t, frame, W, H, this.x, this.y, R * 4);
      if (wide.score < LOST_SCORE + 0.1) {
        this.vx = this.vy = 0;
        return { x: cx(this.x), y: cy(this.y), lost: true };
      }
      this.x = wide.x;
      this.y = wide.y;
      this.vx = this.vy = 0;
      return { x: cx(wide.x), y: cy(wide.y), lost: false };
    }
    this.vx = 0.7 * (m.x - this.x);
    this.vy = 0.7 * (m.y - this.y);
    this.x = m.x;
    this.y = m.y;
    if (m.score > 0.75) this.adapt(frame, Math.round(m.x), Math.round(m.y));
    return { x: cx(m.x), y: cy(m.y), lost: false };
  }

  private adapt(f: Uint8Array, ox: number, oy: number): void {
    const { t, W } = this;
    const n = t.vals.length;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += f[(oy + t.ys[i]) * W + ox + t.xs[i]];
    mean /= n;
    const vals = new Float32Array(n);
    for (let i = 0; i < n; i++) vals[i] = 0.95 * t.vals[i] + 0.05 * (f[(oy + t.ys[i]) * W + ox + t.xs[i]] - mean);
    this.t = finishTemplate(t.xs, t.ys, vals, t.w, t.h);
  }
}

/** 프레임 사이 화면 전체의 움직임: 격자 칸마다 찾은 뒤 중앙값 (움직이는 사람에 끌려가지 않게) */
export function globalMotion(prev: Uint8Array, cur: Uint8Array, W: number, H: number): { dx: number; dy: number } {
  const cols = 6;
  const rows = 4;
  const size = Math.floor(Math.min(W / (cols + 1), H / (rows + 1)));
  const R = Math.max(6, Math.round(W * SEARCH_RATIO * 0.7));
  const dxs: number[] = [];
  const dys: number[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = Math.round(((c + 0.5) * W) / cols - size / 2);
      const y = Math.round(((r + 0.5) * H) / rows - size / 2);
      const t = makeTemplate(prev, W, { x, y, w: size, h: size }, 16);
      if (t.norm / Math.sqrt(t.vals.length) < FLAT_STD) continue;
      const m = search(t, cur, W, H, x, y, R);
      if (m.score < 0.6) continue;
      dxs.push(m.x - x);
      dys.push(m.y - y);
    }
  return dxs.length < 3 ? { dx: 0, dy: 0 } : { dx: median(dxs), dy: median(dys) };
}

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 양쪽 대칭 이동 평균 (끝에서는 창을 줄여 대칭 유지 → 지연 없음) */
export function smooth(a: number[], radius: number): number[] {
  const sum = new Float64Array(a.length + 1);
  a.forEach((v, i) => (sum[i + 1] = sum[i] + v));
  return a.map((_, i) => {
    const r = Math.min(radius, i, a.length - 1 - i);
    return (sum[i + r + 1] - sum[i - r]) / (2 * r + 1);
  });
}

/** 흔들림 줄이기: 쌓인 움직임(cum, 분석 프레임 픽셀) → 창 가운데 경로. 부드러운 움직임은 남기고 떨림만 뺀다 */
export function shakePath(cumX: number[], cumY: number[], W: number, H: number): number[] {
  const radius = STAB_FPS; // 앞뒤 1초
  const sx = smooth(smooth(cumX, radius), radius >> 1);
  const sy = smooth(smooth(cumY, radius), radius >> 1);
  const path: number[] = [];
  for (let i = 0; i < cumX.length; i++) path.push(round5(0.5 + (cumX[i] - sx[i]) / W), round5(0.5 + (cumY[i] - sy[i]) / H));
  return path;
}

/** 영역 고정: 따라간 위치 → 창 가운데 경로. 놓친 구간은 앞뒤를 직선으로 잇는다 */
export function lockPath(points: TrackPoint[], W: number, H: number): number[] {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  let i = 0;
  while (i < points.length) {
    if (!points[i].lost) {
      i++;
      continue;
    }
    let j = i;
    while (j < points.length && points[j].lost) j++;
    const a = i - 1;
    if (a >= 0 && j < points.length) {
      for (let k = i; k < j; k++) {
        const f = (k - a) / (j - a);
        xs[k] = xs[a] + (xs[j] - xs[a]) * f;
        ys[k] = ys[a] + (ys[j] - ys[a]) * f;
      }
    }
    i = j;
  }
  const sx = smooth(xs, 1);
  const sy = smooth(ys, 1);
  const path: number[] = [];
  for (let k = 0; k < xs.length; k++) path.push(round5(sx[k] / W), round5(sy[k] / H));
  return path;
}

function round5(v: number): number {
  return Math.round(v * 1e5) / 1e5;
}

function percentile(a: number[], q: number): number {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0;
}

/** 흔들림 줄이기 기본 확대: 떨림 대부분이 빈틈 없이 들어갈 만큼 */
export function autoShakeZoom(path: number[]): number {
  const amp: number[] = [];
  for (let i = 0; i < path.length; i += 2) amp.push(Math.max(Math.abs(path[i] - 0.5), Math.abs(path[i + 1] - 0.5)));
  const a = percentile(amp, 0.98);
  return round2(Math.min(SHAKE_MAX_ZOOM, Math.max(1.03, 1 / Math.max(0.2, 1 - 2 * a))));
}

/** 영역 고정 기본 확대: 영역이 대부분 시간 가운데 오도록. 고른 영역이 잘리지는 않게 한도를 둔다 */
export function autoLockZoom(path: number[], boxW: number, boxH: number): number {
  const margin: number[] = [];
  for (let i = 0; i < path.length; i += 2) margin.push(Math.min(path[i], 1 - path[i], path[i + 1], 1 - path[i + 1]));
  const need = 1 / Math.max(0.01, 2 * percentile(margin, 0.05));
  const limit = Math.min(LOCK_MAX_AUTO_ZOOM, 1 / Math.max(0.1, Math.max(boxW, boxH) * 1.15));
  return round2(Math.max(1.05, Math.min(limit, need)));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** 렌더: 출력 프레임마다 crop 위치를 바꾸는 sendcmd 파일 내용. time(k) = k 번째 출력 프레임의 원본 시간 */
export function stabilizeCommands(st: Stabilize, frames: number, fps: number, time: (k: number) => number): string {
  const lines: string[] = [];
  for (let k = 0; k < frames; k++) {
    const w = stabilizeWindow(st, time(k));
    const x = (w.cx - w.s / 2).toFixed(6);
    const y = (w.cy - w.s / 2).toFixed(6);
    lines.push(`${(k / fps).toFixed(6)} crop x in_w*${x}, crop y in_h*${y};`);
  }
  return lines.join('\n') + '\n';
}

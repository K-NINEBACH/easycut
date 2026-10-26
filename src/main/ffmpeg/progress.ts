/**
 * FFmpeg `-progress pipe:1` 출력 파서.
 * 줄 단위로 key=value 가 오며, out_time_us(또는 이름과 달리 마이크로초인 out_time_ms)가 현재 위치.
 */
export function parseProgressLine(line: string): { outTimeSec?: number; end?: boolean } {
  const eq = line.indexOf('=');
  if (eq < 0) return {};
  const key = line.slice(0, eq).trim();
  const value = line.slice(eq + 1).trim();
  if (key === 'out_time_us' || key === 'out_time_ms') {
    const us = Number(value);
    if (Number.isFinite(us) && us >= 0) return { outTimeSec: us / 1_000_000 };
  }
  if (key === 'progress' && value === 'end') return { end: true };
  return {};
}

/** 진행률 0~1 */
export function progressFraction(outTimeSec: number, totalSec: number): number {
  if (!(totalSec > 0)) return 0;
  return Math.min(1, Math.max(0, outTimeSec / totalSec));
}

/** 여러 단계 가중치 합산 (PRD 9.3: 1단계 60%, 2단계 20%, 3단계 20%) */
export function weightedProgress(weights: number[], stage: number, stageFraction: number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  const done = weights.slice(0, stage).reduce((a, b) => a + b, 0);
  return Math.min(1, (done + weights[stage] * stageFraction) / total);
}

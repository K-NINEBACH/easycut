export const TRACK = { ruler: 24, video: 76, subtitle: 34, music: 40, gap: 6 };

/** 클립 순서를 바꿀 위치: x 보다 가운데가 왼쪽에 있는 클립 개수 */
export function insertIndexAt(items: { start: number; end: number }[], t: number): number {
  let n = 0;
  for (const it of items) if ((it.start + it.end) / 2 < t) n++;
  return n;
}

/** 초 → "mm:ss" (1시간 이상이면 "h:mm:ss") */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec + 1e-6));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
}

/** 초 → "mm:ss.d" (자막 목록 등 정밀 표시) */
export function formatTimePrecise(sec: number): string {
  const tenths = Math.floor((Math.max(0, sec) % 1) * 10 + 1e-6);
  return `${formatTime(sec)}.${tenths}`;
}

/** 이름 목록을 "a, b 외 3개" 로 */
export function summarizeNames(names: string[], max = 2): string {
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} 외 ${names.length - max}개`;
}

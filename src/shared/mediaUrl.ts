// 미리보기용 로컬 파일 접근 URL (PRD 8.1: ezcut-media:// 커스텀 프로토콜)
export const MEDIA_SCHEME = 'ezcut-media';

/** 절대 경로 파일 → ezcut-media://local/<인코딩된 경로> */
export function mediaUrl(path: string): string {
  return `${MEDIA_SCHEME}://local/${encodeURIComponent(path)}`;
}

/** 앱 resources 폴더 안의 파일 (폰트 등) → ezcut-media://res/<상대 경로> */
export function resourceUrl(relative: string): string {
  return `${MEDIA_SCHEME}://res/${relative.split('/').map(encodeURIComponent).join('/')}`;
}

export function parseMediaUrl(url: string): { kind: 'local' | 'res'; path: string } | null {
  const m = /^ezcut-media:\/\/(local|res)\/(.*)$/.exec(url.split(/[?#]/)[0]);
  if (!m) return null;
  try {
    return { kind: m[1] as 'local' | 'res', path: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

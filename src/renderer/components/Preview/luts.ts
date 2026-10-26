import type { VideoClip } from '@shared/types';

/** 필터 LUT (M6 에서 구현). 지금은 필터 없음 */
export function lutForClip(_clip: VideoClip): { key: string; data: Uint8Array; size: number } | null {
  return null;
}

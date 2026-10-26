import type { VideoClip } from '@shared/types';
import { bakeLut, isIdentityLook, lookKey, lookOf, lutToBytes, LUT_SIZE } from '@shared/filters';

// 같은 필터·보정 조합은 한 번만 굽는다
const cache = new Map<string, Uint8Array>();

/** 클립의 필터 LUT (shared/filters.ts 와 렌더가 같은 표). 원본 그대로면 null */
export function lutForClip(clip: VideoClip): { key: string; data: Uint8Array; size: number } | null {
  const look = lookOf(clip);
  if (isIdentityLook(look)) return null;
  const key = lookKey(look);
  let data = cache.get(key);
  if (!data) {
    data = lutToBytes(bakeLut(look));
    if (cache.size > 64) cache.clear();
    cache.set(key, data);
  }
  return { key, data, size: LUT_SIZE };
}

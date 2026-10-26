import type { MusicLayout } from '@shared/timeline';
import type { MediaItem, MusicClip } from '@shared/types';

/** 음악 앞뒤 자르기 손잡이 (M8 에서 구현) */
export default function MusicTrimHandles(_props: {
  clip: MusicClip;
  layout: MusicLayout;
  media?: MediaItem;
  pps: number;
}): JSX.Element | null {
  return null;
}

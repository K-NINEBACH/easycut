import type { ClipLayout } from '@shared/timeline';
import type { MediaItem, VideoClip } from '@shared/types';

/** 앞뒤 자르기 손잡이 (M4 에서 구현) */
export default function TrimHandles(_props: {
  clip: VideoClip;
  layout: ClipLayout;
  media?: MediaItem;
  pps: number;
}): JSX.Element | null {
  return null;
}

import type { TimelineLayout } from '@shared/timeline';

/** 클립 사이 ◆ 장면 전환 아이콘 (M7 에서 구현) */
export default function TransitionMarker(_props: {
  clipId: string;
  layout: TimelineLayout;
  index: number;
  pps: number;
}): JSX.Element | null {
  return null;
}

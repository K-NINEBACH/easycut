import { isImageClip, type ClipLayout } from '@shared/timeline';
import type { MediaItem, VideoClip } from '@shared/types';
import { startTrimDrag, type TrimSide } from './trimDrag';

/** 선택한 장면 양 끝의 앞뒤 자르기 손잡이 (PRD F3). 사진은 오른쪽 손잡이로 길이 조절 */
export default function TrimHandles({
  clip,
  pps
}: {
  clip: VideoClip;
  layout: ClipLayout;
  media?: MediaItem;
  pps: number;
}): JSX.Element {
  const image = isImageClip(clip);
  // 화면 1px = 타임라인 1/pps 초 = 원본 speed/pps 초
  const srcPerPx = image ? 1 / pps : clip.speed / pps;
  const handle = (side: TrimSide): JSX.Element => (
    <div
      className={`absolute top-0 z-20 flex h-full w-2.5 cursor-ew-resize items-center justify-center bg-primary hover:bg-brand-400 ${
        side === 'in' ? 'left-0' : 'right-0'
      }`}
      onPointerDown={(e) => startTrimDrag(e, clip, side, srcPerPx)}
      onClick={(e) => e.stopPropagation()}
      title={side === 'in' ? '끌어서 앞부분 자르기' : image ? '끌어서 사진 길이 바꾸기' : '끌어서 뒷부분 자르기'}
      data-testid={side === 'in' ? 'trim-in' : 'trim-out'}
    >
      <div className="h-5 w-0.5 rounded bg-white/90" />
    </div>
  );
  return (
    <>
      {!image && handle('in')}
      {handle('out')}
    </>
  );
}

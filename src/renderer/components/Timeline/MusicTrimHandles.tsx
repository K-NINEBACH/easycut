import type { MusicLayout } from '@shared/timeline';
import type { MediaItem, MusicClip } from '@shared/types';
import { startMusicTrimDrag, type TrimSide } from './trimDrag';

/** 선택한 음악 양 끝의 앞뒤 자르기 손잡이 (PRD F5) */
export default function MusicTrimHandles({
  clip,
  pps
}: {
  clip: MusicClip;
  layout: MusicLayout;
  media?: MediaItem;
  pps: number;
}): JSX.Element {
  const handle = (side: TrimSide): JSX.Element => (
    <div
      className={`absolute top-0 z-20 flex h-full w-2.5 cursor-ew-resize items-center justify-center bg-primary hover:bg-brand-400 ${
        side === 'in' ? 'left-0' : 'right-0'
      }`}
      onPointerDown={(e) => startMusicTrimDrag(e, clip, side, pps)}
      onClick={(e) => e.stopPropagation()}
      title={side === 'in' ? '끌어서 음악 앞부분 자르기' : '끌어서 음악 뒷부분 자르기'}
      data-testid={side === 'in' ? 'music-trim-in' : 'music-trim-out'}
    >
      <div className="h-4 w-0.5 rounded bg-white/90" />
    </div>
  );
  return (
    <>
      {handle('in')}
      {handle('out')}
    </>
  );
}

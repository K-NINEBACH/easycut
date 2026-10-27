import type { TimelineLayout } from '@shared/timeline';
import { TRANSITION_BY_ID } from '@shared/transitions';
import { useUiStore } from '../../store/ui';
import { TRACK } from './constants';

/** 클립 사이 ◆ 장면 전환 아이콘 (PRD F6). 전환이 있으면 겹치는 구간도 표시 */
export default function TransitionMarker({
  clipId,
  layout,
  index,
  pps
}: {
  clipId: string;
  layout: TimelineLayout;
  index: number;
  pps: number;
}): JSX.Element | null {
  const selected = useUiStore((s) => s.selection?.kind === 'transition' && s.selection.id === clipId);
  const next = layout.clips[index + 1];
  if (!next) return null;
  const info = layout.transitions[index];
  const on = !!info && info.duration > 0;
  const overlap = on ? info.duration : 0;
  // 겹침이 있으면 겹친 구간 가운데, 없으면 장면 경계
  const center = next.start + overlap / 2;

  const open = (e: React.MouseEvent): void => {
    e.stopPropagation();
    const ui = useUiStore.getState();
    ui.select({ kind: 'transition', id: clipId });
    ui.setPanelTab('transition');
  };

  return (
    <>
      {on && (
        <div
          className="pointer-events-none absolute top-0 z-20 rounded-md bg-white/35 ring-1 ring-white/80"
          style={{ left: next.start * pps, width: overlap * pps, height: TRACK.video }}
          data-testid="transition-overlap"
        />
      )}
      <button
        className={`absolute z-30 flex h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 items-center justify-center rounded-[2px] border-2 shadow-sm transition-transform hover:scale-125 ${
          selected
            ? 'scale-125 border-white bg-clip-fade-on ring-2 ring-clip-fade-on'
            : info?.tooShort
              ? 'border-white bg-[#d5dce5]'
              : on
                ? 'border-white bg-clip-fade'
                : 'border-[#d5dce5] bg-white'
        }`}
        // 아래쪽에 둔다: 가운데는 자르기 손잡이를 잡는 자리
        style={{ left: center * pps, top: TRACK.video - 12 }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={open}
        title={
          info?.tooShort
            ? '장면이 너무 짧아서 전환을 넣을 수 없어요'
            : on
              ? `장면 전환: ${TRANSITION_BY_ID[info.type].label}`
              : '장면 전환 넣기'
        }
        data-testid="transition-marker"
        data-clip-id={clipId}
        aria-label="장면 전환"
      />
    </>
  );
}

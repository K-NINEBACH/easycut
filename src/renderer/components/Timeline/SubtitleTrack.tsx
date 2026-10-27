import type { TimelineLayout } from '@shared/timeline';
import { subtitleRange } from '@shared/timeline';
import * as ops from '@shared/ops';
import type { Subtitle } from '@shared/types';
import { liveEdit, useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';

/** 자막 줄 (PRD 4-1): 자유 배치, 끌어서 옮기기, 양 끝으로 길이 조절, 겹치지 않게 */
export default function SubtitleTrack({ layout, pps }: { layout: TimelineLayout; pps: number }): JSX.Element {
  const subtitles = useProjectStore((s) => s.project?.subtitles) ?? [];
  const selection = useUiStore((s) => s.selection);
  return (
    <div
      className="relative h-full rounded-md bg-white ring-1 ring-line"
      data-testid="subtitle-track"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) useUiStore.getState().select(null);
      }}
    >
      {subtitles.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center px-3 text-xs text-gray-400">
          꾸미기 › 자막 에서 자막을 넣을 수 있어요
        </div>
      )}
      {subtitles.map((s) => {
        const r = subtitleRange(layout, s);
        if (r.hidden) return null;
        const sel = selection?.kind === 'subtitle' && selection.id === s.id;
        return <SubtitleBlock key={s.id} sub={s} start={r.start} end={r.end} pps={pps} selected={sel} />;
      })}
    </div>
  );
}

type DragMode = 'move' | 'start' | 'end';

function SubtitleBlock(props: { sub: Subtitle; start: number; end: number; pps: number; selected: boolean }): JSX.Element {
  const { sub, start, end, pps, selected } = props;

  const begin = (mode: DragMode) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const ui = useUiStore.getState();
    ui.select({ kind: 'subtitle', id: sub.id });
    ui.setPanelTab('subtitle');
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const orig = { start, end };
    let live: ReturnType<typeof liveEdit> | null = null;
    const move = (ev: PointerEvent): void => {
      const d = (ev.clientX - x0) / pps;
      if (!live && Math.abs(ev.clientX - x0) < 4) return; // 클릭은 그냥 선택
      live ??= liveEdit(mode === 'move' ? '자막 옮기기' : '자막 길이 바꾸기');
      let a = orig.start;
      let b = orig.end;
      if (mode === 'move') {
        a += d;
        b += d;
      } else if (mode === 'start') a = Math.min(orig.end - 0.3, orig.start + d);
      else b = Math.max(orig.start + 0.3, orig.end + d);
      live.update((p) => ops.setSubtitleSpan(p, sub.id, Math.max(0, a), b - Math.max(0, a)));
    };
    // 끄는 도중 블록이 다시 그려지거나 사라져도 끝을 놓치지 않게 창 전체에서 받는다
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      live?.end();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  return (
    <div
      className={`absolute top-1 bottom-1 cursor-grab touch-none overflow-hidden rounded-[5px] border-2 px-2 text-[11px] leading-5 font-medium text-clip-sub-text select-none ${
        selected ? 'z-10 border-primary bg-clip-sub-on' : 'border-clip-sub bg-clip-sub hover:brightness-105'
      }`}
      style={{ left: start * pps, width: Math.max(4, (end - start) * pps) }}
      onPointerDown={begin('move')}
      onDoubleClick={() => document.querySelector<HTMLTextAreaElement>('[data-testid=subtitle-text]')?.focus()}
      title={sub.text}
      data-testid="subtitle-block"
      data-subtitle-id={sub.id}
    >
      <span className="pointer-events-none truncate">{sub.text || '(빈 자막)'}</span>
      {selected && (
        <>
          <div
            className="absolute top-0 left-0 h-full w-2 cursor-ew-resize bg-primary"
            onPointerDown={begin('start')}
            data-testid="subtitle-handle-start"
          />
          <div
            className="absolute top-0 right-0 h-full w-2 cursor-ew-resize bg-primary"
            onPointerDown={begin('end')}
            data-testid="subtitle-handle-end"
          />
        </>
      )}
    </div>
  );
}

// 영역 고정: 미리보기 위에서 고정할 부분을 끌어 네모로 고른다 (PRD 13장 #16)
import { useEffect, useRef, useState } from 'react';
import { outputToSource } from '@shared/stabilize';
import { layoutTimeline, sourceTime } from '@shared/timeline';
import { getProject } from '../../store/project';
import { toast, useUiStore } from '../../store/ui';

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 이보다 작은 네모는 실수로 누른 것으로 본다 (화면 비율) */
const MIN_SIZE = 0.03;

export default function RegionPicker(): JSX.Element | null {
  const clipId = useUiStore((s) => s.pickRegion);
  const ref = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!clipId) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setRect(null);
      useUiStore.getState().setPickRegion(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [clipId]);

  // 고르는 중에 다른 장면을 누르거나 재생하면 그만둔다 (네모가 다른 장면 화면에 그려지지 않게)
  const selected = useUiStore((s) => (s.selection?.kind === 'clip' ? s.selection.id : null));
  const playing = useUiStore((s) => s.playing);
  useEffect(() => {
    if (clipId && (selected !== clipId || playing)) {
      setRect(null);
      useUiStore.getState().setPickRegion(null);
    }
  }, [clipId, selected, playing]);

  if (!clipId) return null;

  const pos = (e: { clientX: number; clientY: number }): { u: number; v: number } => {
    const b = ref.current!.getBoundingClientRect();
    return {
      u: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)),
      v: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height))
    };
  };

  const finish = (r: Rect): void => {
    const ui = useUiStore.getState();
    const p = getProject();
    const clip = p?.videoTrack.find((c) => c.id === clipId);
    const media = p?.media.find((m) => m.id === clip?.mediaId);
    setRect(null);
    ui.setPickRegion(null);
    if (!p || !clip || !media) return;
    const left = Math.min(r.x0, r.x1);
    const top = Math.min(r.y0, r.y1);
    const right = Math.max(r.x0, r.x1);
    const bottom = Math.max(r.y0, r.y1);
    if (right - left < MIN_SIZE || bottom - top < MIN_SIZE) return toast('고정할 부분을 끌어서 네모로 그려 주세요');
    const w = media.width ?? 1280;
    const h = media.height ?? 720;
    const a = outputToSource(left, top, w, h, clip.fitMode);
    const b = outputToSource(right, bottom, w, h, clip.fitMode);
    const clamp = (v: number): number => Math.min(1, Math.max(0, v));
    const box = { x: clamp(a.x), y: clamp(a.y), w: clamp(b.x) - clamp(a.x), h: clamp(b.y) - clamp(a.y) };
    if (box.w < 0.01 || box.h < 0.01) return toast('영상 화면 안에서 골라 주세요');
    const cl = layoutTimeline(p.videoTrack, p.transitions).byId.get(clipId);
    if (!cl) return;
    ui.setStabilizeJob({ clipId, mode: 'lock', box, refTime: sourceTime(clip, cl, ui.playhead) });
  };

  return (
    <div
      ref={ref}
      className="absolute inset-0 z-20 cursor-crosshair touch-none bg-black/20"
      data-testid="region-picker"
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const { u, v } = pos(e);
        setRect({ x0: u, y0: v, x1: u, y1: v });
      }}
      onPointerMove={(e) => {
        if (!rect) return;
        const { u, v } = pos(e);
        setRect({ ...rect, x1: u, y1: v });
      }}
      onPointerUp={() => rect && finish(rect)}
    >
      {rect ? (
        <div
          className="absolute rounded-sm border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.5)]"
          style={{
            left: `${Math.min(rect.x0, rect.x1) * 100}%`,
            top: `${Math.min(rect.y0, rect.y1) * 100}%`,
            width: `${Math.abs(rect.x1 - rect.x0) * 100}%`,
            height: `${Math.abs(rect.y1 - rect.y0) * 100}%`
          }}
        />
      ) : (
        <span className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-md bg-black/70 px-3 py-1.5 text-xs text-white">
          고정할 부분을 끌어서 네모로 그려 주세요 (취소: Esc)
        </span>
      )}
    </div>
  );
}

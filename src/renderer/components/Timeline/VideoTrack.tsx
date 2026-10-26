import { useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent
} from '@dnd-kit/core';
import type { TimelineLayout } from '@shared/timeline';
import { mediaUrl } from '@shared/mediaUrl';
import { useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { addMediaToTimeline, moveClip } from '../../store/editActions';
import { importPaths } from '../../store/mediaActions';
import { useMediaMap } from '../../hooks/useTimelineLayout';
import { MEDIA_DRAG_TYPE } from '../MediaBin/MediaCard';
import ClipBlock from './ClipBlock';
import TransitionMarker from './TransitionMarker';
import { insertIndexAt } from './constants';

interface Props {
  layout: TimelineLayout;
  pps: number;
}

/** 영상 트랙: 자석 방식 (빈 공간 없음), 드래그로 순서 변경 (dnd-kit) */
export default function VideoTrack({ layout, pps }: Props): JSX.Element {
  const clips = useProjectStore((s) => s.project?.videoTrack) ?? [];
  const mediaMap = useMediaMap();
  const select = useUiStore((s) => s.select);
  const setPlayhead = useUiStore((s) => s.setPlayhead);
  const ref = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  /** 끼워 넣을 위치 표시 (초) */
  const [indicator, setIndicator] = useState<number | null>(null);
  const dropIndex = useRef(0);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const timeAtClientX = (clientX: number): number => {
    const rect = ref.current!.getBoundingClientRect();
    return (clientX - rect.left) / pps;
  };

  const markerTime = (idx: number, items: { start: number; end: number }[]): number =>
    idx < items.length ? items[idx].start : items.length ? items[items.length - 1].end : 0;

  // --- 타임라인 안에서 순서 바꾸기 ---
  const onDragStart = (e: DragStartEvent): void => {
    setDragId(String(e.active.id));
    select({ kind: 'clip', id: String(e.active.id) });
  };
  const onDragMove = (e: DragMoveEvent): void => {
    const start = e.activatorEvent as PointerEvent;
    const t = timeAtClientX(start.clientX + e.delta.x);
    // 끌고 있는 클립을 뺀 나머지 기준으로 위치 계산
    const others = layout.clips.filter((c) => c.id !== e.active.id);
    const idx = insertIndexAt(others, t);
    dropIndex.current = idx;
    setIndicator(markerTime(idx, others));
  };
  const onDragEnd = (e: DragEndEvent): void => {
    const from = clips.findIndex((c) => c.id === e.active.id);
    if (from >= 0 && indicator !== null) moveClip(from, dropIndex.current);
    setDragId(null);
    setIndicator(null);
  };

  // --- 보관함/탐색기에서 끌어다 놓기 ---
  const onNativeDragOver = (e: React.DragEvent): void => {
    const types = Array.from(e.dataTransfer.types);
    if (!types.includes(MEDIA_DRAG_TYPE) && !types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const idx = insertIndexAt(layout.clips, timeAtClientX(e.clientX));
    dropIndex.current = idx;
    setIndicator(markerTime(idx, layout.clips));
  };
  const onNativeDrop = async (e: React.DragEvent): Promise<void> => {
    setIndicator(null);
    const index = dropIndex.current;
    const raw = e.dataTransfer.getData(MEDIA_DRAG_TYPE);
    if (raw) {
      e.preventDefault();
      addMediaToTimeline(JSON.parse(raw) as string[], index);
      return;
    }
    if (e.dataTransfer.files.length > 0) {
      e.preventDefault();
      (e.nativeEvent as DragEvent & { ezcutHandled?: boolean }).ezcutHandled = true;
      const paths = Array.from(e.dataTransfer.files).map((f) => window.api.media.pathForFile(f));
      const items = await importPaths(paths);
      addMediaToTimeline(
        items.map((m) => m.id),
        index
      );
    }
  };

  const dragged = dragId ? clips.find((c) => c.id === dragId) : null;
  const draggedMedia = dragged ? mediaMap.get(dragged.mediaId) : undefined;

  return (
    <div
      ref={ref}
      className="relative h-full rounded-md bg-gray-50"
      onDragOver={onNativeDragOver}
      onDragLeave={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node)) setIndicator(null);
      }}
      onDrop={(e) => void onNativeDrop(e)}
      onPointerDown={(e) => {
        // 빈 곳 클릭: 선택 해제 + 재생 위치 이동
        if (e.target === e.currentTarget) {
          select(null);
          setPlayhead(Math.min(timeAtClientX(e.clientX), layout.total));
        }
      }}
      data-testid="video-track"
    >
      {clips.length === 0 && indicator === null && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md border-2 border-dashed border-gray-200 text-sm text-gray-400">
          여기로 영상을 끌어다 놓으세요
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd}>
        {clips.map((c, i) => {
          const cl = layout.clips[i];
          if (!cl) return null;
          return (
            <ClipBlock key={c.id} clip={c} layout={cl} media={mediaMap.get(c.mediaId)} pps={pps} dimmed={dragId === c.id} />
          );
        })}
        <DragOverlay dropAnimation={null}>
          {dragged ? (
            <div className="h-16 w-28 overflow-hidden rounded-md border-2 border-brand-500 bg-gray-800 shadow-xl">
              {draggedMedia?.thumbnailPath && (
                <img src={mediaUrl(draggedMedia.thumbnailPath)} className="h-full w-full object-cover" alt="" />
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {clips.slice(0, -1).map((c, i) => (
        <TransitionMarker key={c.id} clipId={c.id} layout={layout} index={i} pps={pps} />
      ))}

      {indicator !== null && (
        <div
          className="pointer-events-none absolute -top-1 -bottom-1 z-30 w-1 -translate-x-1/2 rounded bg-brand-500"
          style={{ left: indicator * pps }}
          data-testid="drop-indicator"
        />
      )}
    </div>
  );
}

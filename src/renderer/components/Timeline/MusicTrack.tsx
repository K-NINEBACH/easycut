import { useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent
} from '@dnd-kit/core';
import type { MusicLayout } from '@shared/timeline';
import type { MediaItem, MusicClip } from '@shared/types';
import { useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { addMediaToTimeline, moveMusic } from '../../store/editActions';
import { useMediaMap } from '../../hooks/useTimelineLayout';
import { MEDIA_DRAG_TYPE } from '../MediaBin/MediaCard';
import Waveform from './Waveform';
import MusicTrimHandles from './MusicTrimHandles';
import { insertIndexAt, TRACK } from './constants';

/** 음악 트랙: 여러 곡을 순서대로 (자석 방식) */
export default function MusicTrack({ layout, pps }: { layout: MusicLayout[]; pps: number }): JSX.Element {
  const track = useProjectStore((s) => s.project?.musicTrack) ?? [];
  const mediaMap = useMediaMap();
  const ref = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<number | null>(null);
  const dropIndex = useRef(0);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const timeAt = (clientX: number): number => (clientX - ref.current!.getBoundingClientRect().left) / pps;
  const marker = (idx: number, items: MusicLayout[]): number =>
    idx < items.length ? items[idx].start : items.length ? items[items.length - 1].end : 0;

  const onDragMove = (e: DragMoveEvent): void => {
    const t = timeAt((e.activatorEvent as PointerEvent).clientX + e.delta.x);
    const others = layout.filter((m) => m.id !== e.active.id);
    dropIndex.current = insertIndexAt(others, t);
    setIndicator(marker(dropIndex.current, others));
  };
  const onDragEnd = (e: DragEndEvent): void => {
    const from = track.findIndex((m) => m.id === e.active.id);
    if (from >= 0 && indicator !== null) moveMusic(from, dropIndex.current);
    setIndicator(null);
  };

  return (
    <div
      ref={ref}
      className="relative h-full rounded-md bg-white ring-1 ring-line"
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer.types).includes(MEDIA_DRAG_TYPE)) return;
        e.preventDefault();
        setIndicator(layout.length ? layout[layout.length - 1].end : 0);
      }}
      onDragLeave={() => setIndicator(null)}
      onDrop={(e) => {
        setIndicator(null);
        const raw = e.dataTransfer.getData(MEDIA_DRAG_TYPE);
        if (!raw) return;
        e.preventDefault();
        // 음악 트랙에는 음악 파일만 (영상·사진은 addMediaToTimeline 이 영상 트랙으로 보냄)
        addMediaToTimeline(JSON.parse(raw) as string[]);
      }}
      data-testid="music-track"
    >
      {track.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center px-3 text-xs text-gray-400">
          배경음악을 여기로 끌어다 놓으세요
        </div>
      )}
      <DndContext sensors={sensors} onDragMove={onDragMove} onDragEnd={onDragEnd}>
        {track.map((m, i) =>
          layout[i] ? <MusicBlock key={m.id} clip={m} layout={layout[i]} media={mediaMap.get(m.mediaId)} pps={pps} /> : null
        )}
      </DndContext>
      {indicator !== null && (
        <div
          className="pointer-events-none absolute -top-1 -bottom-1 z-30 w-1 -translate-x-1/2 rounded bg-brand-500"
          style={{ left: indicator * pps }}
        />
      )}
    </div>
  );
}

function MusicBlock({ clip, layout, media, pps }: { clip: MusicClip; layout: MusicLayout; media?: MediaItem; pps: number }): JSX.Element {
  const selected = useUiStore((s) => s.selection?.kind === 'music' && s.selection.id === clip.id);
  const select = useUiStore((s) => s.select);
  const setPanelTab = useUiStore((s) => s.setPanelTab);
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: clip.id });
  const width = Math.max(2, layout.length * pps);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`absolute top-0 cursor-grab overflow-hidden rounded-[5px] border-2 ${
        selected ? 'z-10 border-primary' : 'border-clip-music hover:brightness-105'
      } ${selected ? 'bg-clip-music-on' : 'bg-clip-music'}`}
      style={{
        left: layout.start * pps,
        width,
        height: TRACK.music,
        transform: transform ? `translateX(${transform.x}px)` : undefined,
        opacity: transform ? 0.7 : 1
      }}
      onClick={(e) => {
        e.stopPropagation();
        select({ kind: 'music', id: clip.id });
        setPanelTab('music');
      }}
      data-testid="music-clip"
    >
      <div className="pointer-events-none absolute inset-0 top-3">
        <Waveform path={media?.waveformPath} from={clip.inPoint} to={clip.outPoint} width={width} height={TRACK.music - 16} color="rgba(23,106,83,0.55)" />
      </div>
      <span className="pointer-events-none absolute top-0 left-1.5 truncate text-[10px] font-semibold text-clip-music-text">
        ♪ {media?.fileName}
        {clip.loop ? ' (반복)' : ''}
      </span>
      {selected && <MusicTrimHandles clip={clip} layout={layout} media={media} pps={pps} />}
    </div>
  );
}

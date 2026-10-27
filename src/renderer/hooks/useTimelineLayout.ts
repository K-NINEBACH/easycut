import { useMemo } from 'react';
import { layoutMusic, layoutTimeline, type MusicLayout, type TimelineLayout } from '@shared/timeline';
import type { MediaItem } from '@shared/types';
import { useProjectStore } from '../store/project';

const EMPTY: never[] = [];

export function useTimelineLayout(): TimelineLayout {
  const clips = useProjectStore((s) => s.project?.videoTrack) ?? EMPTY;
  const transitions = useProjectStore((s) => s.project?.transitions) ?? EMPTY;
  return useMemo(() => layoutTimeline(clips, transitions), [clips, transitions]);
}

export function useMusicLayout(): MusicLayout[] {
  const track = useProjectStore((s) => s.project?.musicTrack) ?? EMPTY;
  return useMemo(() => layoutMusic(track), [track]);
}

export function useMediaMap(): Map<string, MediaItem> {
  const media = useProjectStore((s) => s.project?.media) ?? EMPTY;
  return useMemo(() => new Map(media.map((m) => [m.id, m])), [media]);
}

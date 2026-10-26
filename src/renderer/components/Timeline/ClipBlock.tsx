import { memo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { ClipLayout } from '@shared/timeline';
import type { MediaItem, VideoClip } from '@shared/types';
import { mediaUrl } from '@shared/mediaUrl';
import { useUiStore } from '../../store/ui';
import { TRACK } from './constants';
import Waveform from './Waveform';
import TrimHandles from './TrimHandles';

interface Props {
  clip: VideoClip;
  layout: ClipLayout;
  media?: MediaItem;
  pps: number;
  dimmed: boolean;
}

const STRIP_H = 64;

function ClipBlock({ clip, layout, media, pps, dimmed }: Props): JSX.Element {
  const selected = useUiStore((s) => s.selection?.kind === 'clip' && s.selection.id === clip.id);
  const select = useUiStore((s) => s.select);
  const setPanelTab = useUiStore((s) => s.setPanelTab);
  const { attributes, listeners, setNodeRef } = useDraggable({ id: clip.id });

  const width = Math.max(2, layout.length * pps);
  const aspect = media?.width && media?.height ? media.width / media.height : 16 / 9;
  const tileW = Math.max(24, STRIP_H * aspect);
  const tiles = Math.min(400, Math.ceil(width / tileW));
  const maxFrame = Math.max(1, Math.floor(media?.duration ?? 1));
  const isImage = clip.imageDuration !== undefined;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`absolute top-0 h-full cursor-grab overflow-hidden rounded-md border-2 bg-gray-700 active:cursor-grabbing ${
        selected ? 'z-10 border-yellow-400' : 'border-white/70'
      } ${dimmed ? 'opacity-40' : ''}`}
      style={{ left: layout.start * pps, width, height: TRACK.video }}
      onClick={(e) => {
        e.stopPropagation();
        select({ kind: 'clip', id: clip.id });
        // 장면을 꾸미는 탭(자르기·필터)이나 자막 탭(선택한 장면만 자막 만들기)에 있으면 그대로, 아니면 자르기 탭으로
        const tab = useUiStore.getState().panelTab;
        if (tab !== 'trim' && tab !== 'filter' && tab !== 'subtitle') setPanelTab('trim');
      }}
      data-testid="clip"
      data-clip-id={clip.id}
      title={media?.fileName}
    >
      <div className="pointer-events-none flex h-full">
        {media?.filmstripDir && !isImage
          ? Array.from({ length: tiles }, (_, k) => {
              const src = clip.inPoint + ((k * tileW) / pps) * clip.speed;
              const frame = Math.min(maxFrame, Math.floor(src) + 1);
              return (
                <img
                  key={k}
                  src={mediaUrl(`${media.filmstripDir}/${String(frame).padStart(5, '0')}.jpg`)}
                  style={{ width: tileW, height: TRACK.video }}
                  className="shrink-0 object-cover"
                  loading="lazy"
                  alt=""
                  onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')}
                />
              );
            })
          : media?.thumbnailPath &&
            Array.from({ length: Math.min(tiles, 50) }, (_, k) => (
              <img
                key={k}
                src={mediaUrl(media.thumbnailPath!)}
                style={{ width: tileW, height: TRACK.video }}
                className="shrink-0 object-cover"
                alt=""
              />
            ))}
      </div>

      {media?.hasAudio && !clip.muted && media.waveformPath && (
        <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-4 bg-black/30">
          <Waveform path={media.waveformPath} from={clip.inPoint} to={clip.outPoint} width={width} height={16} />
        </div>
      )}

      <div className="pointer-events-none absolute top-0.5 left-1 flex gap-1 text-[10px] font-semibold text-white">
        {width > 50 && (
          <span className="max-w-full truncate rounded bg-black/55 px-1">{media?.fileName ?? '없는 파일'}</span>
        )}
        {clip.speed !== 1 && <span className="rounded bg-brand-600 px-1">{clip.speed}배</span>}
        {clip.muted && <span className="rounded bg-black/55 px-1">소리 끔</span>}
      </div>
      {media && media.proxyStatus !== 'ready' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50 text-[11px] text-white">
          준비 중
        </div>
      )}
      {selected && <TrimHandles clip={clip} layout={layout} media={media} pps={pps} />}
    </div>
  );
}

export default memo(ClipBlock);

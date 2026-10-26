import type { MediaItem } from '@shared/types';
import { formatTime } from '@shared/format';
import { mediaUrl } from '@shared/mediaUrl';

export const MEDIA_DRAG_TYPE = 'application/x-ezcut-media';

interface Props {
  item: MediaItem;
  selected: boolean;
  selectedIds: string[];
  onSelect: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
}

export default function MediaCard({ item, selected, selectedIds, onSelect, onDoubleClick }: Props): JSX.Element {
  const ready = item.proxyStatus === 'ready';
  const pct = Math.round((item.proxyProgress ?? 0) * 100);

  return (
    <div
      className={`group relative cursor-pointer overflow-hidden rounded-md border-2 ${
        selected ? 'border-brand-500' : 'border-transparent hover:border-gray-300'
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(e);
      }}
      onDoubleClick={onDoubleClick}
      draggable={!item.missing}
      onDragStart={(e) => {
        // 선택된 카드를 끌면 선택한 것 전부, 아니면 이 카드만
        const ids = selected && selectedIds.length > 1 ? selectedIds : [item.id];
        e.dataTransfer.setData(MEDIA_DRAG_TYPE, JSON.stringify(ids));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      title={item.fileName}
      data-testid="media-card"
      data-media-id={item.id}
    >
      <div className="relative aspect-video bg-gray-800">
        {item.type === 'audio' ? (
          <div className="flex h-full items-center justify-center text-3xl text-white/80">♪</div>
        ) : item.thumbnailPath ? (
          <img
            src={mediaUrl(item.thumbnailPath)}
            className="h-full w-full object-contain"
            draggable={false}
            alt=""
          />
        ) : null}

        {item.missing ? (
          <Overlay tone="error">파일을 찾을 수 없어요</Overlay>
        ) : item.proxyStatus === 'error' ? (
          <Overlay tone="error">준비하지 못했어요</Overlay>
        ) : !ready ? (
          <Overlay>준비 중 {pct}%</Overlay>
        ) : null}

        {item.duration > 0 && (
          <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-[10px] text-white tabular-nums">
            {formatTime(item.duration)}
          </span>
        )}
        {item.type === 'image' && (
          <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-[10px] text-white">사진</span>
        )}
      </div>
      <p className="truncate px-1 py-0.5 text-[11px] text-gray-600">{item.fileName}</p>
    </div>
  );
}

function Overlay({ children, tone }: { children: React.ReactNode; tone?: 'error' }): JSX.Element {
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center text-xs font-semibold text-white ${
        tone === 'error' ? 'bg-red-700/70' : 'bg-black/55'
      }`}
    >
      {children}
    </div>
  );
}

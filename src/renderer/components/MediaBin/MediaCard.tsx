import { Check, Music, Plus } from 'lucide-react';
import type { MediaItem } from '@shared/types';
import { formatTime } from '@shared/format';
import { mediaUrl } from '@shared/mediaUrl';

export const MEDIA_DRAG_TYPE = 'application/x-ezcut-media';

interface Props {
  item: MediaItem;
  selected: boolean;
  selectedIds: string[];
  /** 타임라인에 이미 들어가 있는지 */
  used: boolean;
  onSelect: (e: React.MouseEvent) => void;
  /** 타임라인에 넣기 (두 번 누르기와 같음) */
  onAdd?: () => void;
}

export default function MediaCard({ item, selected, selectedIds, used, onSelect, onAdd }: Props): JSX.Element {
  const ready = item.proxyStatus === 'ready';
  const pct = Math.round((item.proxyProgress ?? 0) * 100);

  return (
    <div
      className={`group relative cursor-pointer rounded-[10px] bg-white p-1 transition-colors active:bg-brand-50 ${
        selected ? 'ring-2 ring-primary' : 'ring-1 ring-line hover:shadow-sm hover:ring-brand-300'
      } ${item.missing ? 'opacity-45' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(e);
      }}
      onDoubleClick={onAdd}
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
      <div className="relative aspect-video overflow-hidden rounded-lg bg-gray-900">
        {item.type === 'audio' ? (
          <div className="flex h-full items-center justify-center bg-clip-music text-clip-music-text">
            <Music size={24} />
          </div>
        ) : item.thumbnailPath ? (
          <img src={mediaUrl(item.thumbnailPath)} className="h-full w-full object-contain" draggable={false} alt="" />
        ) : null}

        {item.missing ? (
          <Overlay tone="error">파일 없음</Overlay>
        ) : item.proxyStatus === 'error' ? (
          <Overlay tone="error">준비 실패</Overlay>
        ) : !ready ? (
          <Overlay>준비 중 {pct}%</Overlay>
        ) : null}

        {selected && (
          <span className="absolute top-1 left-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-primary text-white shadow-sm">
            <Check size={12} strokeWidth={3} />
          </span>
        )}
        {used && !selected && (
          <span className="absolute top-1 left-1 rounded-md bg-black/60 px-1.5 py-px text-[10px] font-medium text-white">사용 중</span>
        )}
        {/* 마우스를 올리면 [+] 로 바로 타임라인에 넣기 */}
        {onAdd && !item.missing && (
          <button
            className="absolute top-1 right-1 hidden h-6 w-6 items-center justify-center rounded-md bg-primary text-white shadow-sm group-hover:flex hover:bg-brand-600"
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            title={item.type === 'audio' ? '배경음악으로 넣기' : '타임라인에 넣기'}
            aria-label="타임라인에 넣기"
            data-testid="media-add"
          >
            <Plus size={16} strokeWidth={2.5} />
          </button>
        )}

        {item.duration > 0 && (
          <span className="absolute right-1 bottom-1 rounded-md bg-black/65 px-1.5 py-px text-[10px] font-medium text-white tabular-nums">
            {formatTime(item.duration)}
          </span>
        )}
        {item.type === 'image' && (
          <span className="absolute right-1 bottom-1 rounded-md bg-black/65 px-1.5 py-px text-[10px] font-medium text-white">사진</span>
        )}
      </div>
      <p className="truncate px-0.5 pt-1 text-[11px] text-body">{item.fileName}</p>
    </div>
  );
}

function Overlay({ children, tone }: { children: React.ReactNode; tone?: 'error' }): JSX.Element {
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center text-xs font-semibold text-white ${
        tone === 'error' ? 'bg-danger/75' : 'bg-gray-900/55'
      }`}
    >
      {children}
    </div>
  );
}

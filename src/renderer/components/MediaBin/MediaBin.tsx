import { useMemo, useRef } from 'react';
import { ImagePlus, Plus } from 'lucide-react';
import { useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { pickAndImport, sortMedia } from '../../store/mediaActions';
import MediaCard from './MediaCard';
import { addMediaToTimeline } from '../../store/editActions';

export default function MediaBin(): JSX.Element {
  const media = useProjectStore((s) => s.project?.media) ?? [];
  const sort = useUiStore((s) => s.mediaSort);
  const setSort = useUiStore((s) => s.setMediaSort);
  const selected = useUiStore((s) => s.selectedMediaIds);
  const setSelected = useUiStore((s) => s.setSelectedMedia);
  const anchor = useRef<string | null>(null);

  const sorted = useMemo(() => sortMedia(media, sort), [media, sort]);
  const videoTrack = useProjectStore((s) => s.project?.videoTrack);
  const musicTrack = useProjectStore((s) => s.project?.musicTrack);
  // 타임라인에 이미 넣은 파일은 "사용 중" 표시
  const used = useMemo(
    () => new Set([...(videoTrack ?? []), ...(musicTrack ?? [])].map((c) => c.mediaId)),
    [videoTrack, musicTrack]
  );

  const onSelect = (id: string, e: React.MouseEvent): void => {
    if (e.shiftKey && anchor.current) {
      const a = sorted.findIndex((m) => m.id === anchor.current);
      const b = sorted.findIndex((m) => m.id === id);
      const [from, to] = a < b ? [a, b] : [b, a];
      setSelected(sorted.slice(from, to + 1).map((m) => m.id));
      return;
    }
    anchor.current = id;
    if (e.ctrlKey || e.metaKey) {
      setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    } else {
      setSelected([id]);
    }
  };

  return (
    <section
      className="ez-panel flex w-60 shrink-0 flex-col overflow-hidden"
      data-tour="import"
      onClick={(e) => {
        if (e.target === e.currentTarget) setSelected([]);
      }}
    >
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <h2 className="ez-title">내 영상/사진</h2>
        {media.length > 0 && (
          <select
            className="rounded-lg border border-line bg-white px-1.5 py-1 text-xs text-body focus:border-primary focus:outline-none"
            value={sort}
            onChange={(e) => setSort(e.target.value as 'date' | 'name')}
            aria-label="정렬"
          >
            <option value="date">찍은 순서</option>
            <option value="name">이름순</option>
          </select>
        )}
      </div>

      {media.length === 0 ? (
        <div className="m-3 flex flex-1 flex-col items-center justify-center gap-2 rounded-[10px] border-2 border-dashed border-brand-200 bg-inner p-4 text-center text-sm text-body">
          <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-white text-primary shadow-sm">
            <ImagePlus size={22} />
          </span>
          <p className="font-semibold text-ink">아직 불러온 파일이 없어요</p>
          <p className="text-xs text-faint">영상·사진·음악 파일이나 폴더를 창에 끌어다 놓아도 돼요</p>
        </div>
      ) : (
        <div
          className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto px-4 py-1"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelected([]);
          }}
        >
          {sorted.map((m) => (
            <MediaCard
              key={m.id}
              item={m}
              selected={selected.includes(m.id)}
              selectedIds={selected}
              onSelect={(e) => onSelect(m.id, e)}
              used={used.has(m.id)}
              onAdd={() => addMediaToTimeline([m.id])}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-line p-4">
        <BinActions />
        <button className="ez-btn-soft h-10 w-full text-sm" onClick={() => void pickAndImport()}>
          <Plus size={18} />
          불러오기
        </button>
      </div>
    </section>
  );
}

/** 여러 개 선택 시 [타임라인에 모두 넣기] — 선택한 순서대로 (PRD F2) */
function BinActions(): JSX.Element | null {
  const selected = useUiStore((s) => s.selectedMediaIds);
  const setSelected = useUiStore((s) => s.setSelectedMedia);
  if (selected.length < 2) return null;
  return (
    <button
      className="ez-btn-primary h-10 w-full text-sm"
      onClick={() => {
        addMediaToTimeline(selected);
        setSelected([]);
      }}
    >
      타임라인에 모두 넣기 ({selected.length}개)
    </button>
  );
}

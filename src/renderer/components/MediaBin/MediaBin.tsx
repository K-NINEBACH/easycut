import { useMemo, useRef } from 'react';
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
      className="flex w-64 shrink-0 flex-col rounded-lg border border-gray-200 bg-white"
      data-tour="import"
      onClick={(e) => {
        if (e.target === e.currentTarget) setSelected([]);
      }}
    >
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        <h2 className="text-sm font-semibold">내 영상/사진</h2>
        {media.length > 0 && (
          <select
            className="rounded border border-gray-200 px-1 py-0.5 text-xs text-gray-600"
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
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center text-sm text-gray-400">
          <p>아직 불러온 파일이 없어요</p>
          <p className="text-xs">영상·사진·음악 파일이나 폴더를 창에 끌어다 놓아도 돼요</p>
        </div>
      ) : (
        <div
          className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-2"
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
              onDoubleClick={() => addMediaToTimeline([m.id])}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 p-3">
        <BinActions />
        <button
          className="w-full rounded-lg bg-brand-50 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-100"
          onClick={() => void pickAndImport()}
        >
          + 불러오기
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
      className="w-full rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700"
      onClick={() => {
        addMediaToTimeline(selected);
        setSelected([]);
      }}
    >
      타임라인에 모두 넣기 ({selected.length}개)
    </button>
  );
}

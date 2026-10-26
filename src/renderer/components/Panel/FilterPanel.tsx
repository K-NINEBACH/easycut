// 꾸미기 패널 > 필터 탭 (PRD F7)
import { useEffect, useState } from 'react';
import * as ops from '@shared/ops';
import { FILTERS, lookFunction } from '@shared/filters';
import { mediaUrl } from '@shared/mediaUrl';
import type { FilterId, MediaItem, VideoClip } from '@shared/types';
import { edit, useProjectStore } from '../../store/project';
import { useUiStore, toast } from '../../store/ui';
import LiveSlider from './LiveSlider';
import { Empty } from './DecoratePanel';

export default function FilterPanel(): JSX.Element {
  const selId = useUiStore((s) => (s.selection?.kind === 'clip' ? s.selection.id : null));
  const clip = useProjectStore((s) => (selId ? s.project?.videoTrack.find((c) => c.id === selId) : undefined));
  const media = useProjectStore((s) => (clip ? s.project?.media.find((m) => m.id === clip.mediaId) : undefined));
  if (!clip) return <Empty />;
  return <ClipFilter key={clip.id} clip={clip} media={media} />;
}

function ClipFilter({ clip, media }: { clip: VideoClip; media?: MediaItem }): JSX.Element {
  const [more, setMore] = useState(false);
  const previews = useFilterPreviews(media?.thumbnailPath ?? (media?.type === 'image' ? media.proxyPath : undefined));
  const pick = (id: FilterId): void =>
    edit('필터 바꾸기', (p) => ops.setLook(p, [clip.id], { filter: id, filterStrength: id === clip.filter ? clip.filterStrength : 1 }));

  const applyAll = (): void => {
    edit('모든 장면에 필터 적용', (p) =>
      ops.setLook(
        p,
        p.videoTrack.map((c) => c.id),
        { filter: clip.filter, filterStrength: clip.filterStrength, adjust: clip.adjust }
      )
    );
    toast('모든 장면에 같은 필터를 적용했어요');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 text-sm [&>*]:shrink-0" data-testid="filter-panel">
      <div className="grid grid-cols-3 gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`overflow-hidden rounded-md border-2 text-xs ${
              clip.filter === f.id ? 'border-brand-600 font-semibold text-brand-700' : 'border-transparent hover:border-gray-300'
            }`}
            onClick={() => pick(f.id)}
            aria-pressed={clip.filter === f.id}
            data-testid={`filter-${f.id}`}
          >
            <div className="aspect-video w-full bg-gray-800">
              {previews[f.id] && <img src={previews[f.id]} className="h-full w-full object-cover" alt="" />}
            </div>
            <div className="py-1">{f.name}</div>
          </button>
        ))}
      </div>

      {clip.filter !== 'none' && (
        <LiveSlider
          label="필터 강도"
          value={Math.round(clip.filterStrength * 100)}
          min={0}
          max={100}
          step={5}
          format={(v) => `${v}%`}
          editLabel="필터 강도 바꾸기"
          apply={(p, v) => ops.setLook(p, [clip.id], { filterStrength: v / 100 })}
          testId="filter-strength"
        />
      )}

      <button className="self-start text-xs text-gray-500 hover:text-gray-800" onClick={() => setMore((v) => !v)}>
        {more ? '▾ 접기' : '▸ 더 조절하기'}
      </button>
      {more && (
        <div className="flex flex-col gap-3">
          {(
            [
              ['brightness', '밝기'],
              ['contrast', '대비'],
              ['saturation', '채도']
            ] as const
          ).map(([k, label]) => (
            <LiveSlider
              key={k}
              label={label}
              value={clip.adjust[k]}
              min={-50}
              max={50}
              step={1}
              format={(v) => (v > 0 ? `+${v}` : String(v))}
              editLabel={`${label} 바꾸기`}
              apply={(p, v) => ops.setLook(p, [clip.id], { adjust: { [k]: v } })}
              testId={`adjust-${k}`}
            />
          ))}
        </div>
      )}

      <button
        className="rounded-md border border-gray-200 py-2 hover:bg-gray-50"
        onClick={applyAll}
        data-testid="filter-apply-all"
      >
        모든 장면에 적용
      </button>
    </div>
  );
}

/** 장면 썸네일에 각 필터를 입힌 작은 미리보기 (렌더와 같은 색 함수) */
function useFilterPreviews(path?: string): Partial<Record<FilterId, string>> {
  const [out, setOut] = useState<Partial<Record<FilterId, string>>>({});
  useEffect(() => {
    if (!path) return;
    let alive = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!alive) return;
      const w = 160;
      const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext('2d')!;
      g.drawImage(img, 0, 0, w, h);
      const src = g.getImageData(0, 0, w, h);
      const result: Partial<Record<FilterId, string>> = {};
      for (const f of FILTERS) {
        const fn = lookFunction({ filter: f.id, filterStrength: 1, adjust: { brightness: 0, contrast: 0, saturation: 0 } });
        const dst = g.createImageData(w, h);
        for (let i = 0; i < src.data.length; i += 4) {
          const c = fn([src.data[i] / 255, src.data[i + 1] / 255, src.data[i + 2] / 255]);
          dst.data[i] = c[0] * 255;
          dst.data[i + 1] = c[1] * 255;
          dst.data[i + 2] = c[2] * 255;
          dst.data[i + 3] = 255;
        }
        g.putImageData(dst, 0, 0);
        result[f.id] = canvas.toDataURL('image/jpeg', 0.8);
      }
      setOut(result);
    };
    img.src = mediaUrl(path);
    return () => {
      alive = false;
    };
  }, [path]);
  return out;
}

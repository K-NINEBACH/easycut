import type { TimelineLayout } from '@shared/timeline';
import { subtitleRange } from '@shared/timeline';
import { useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';

/** 자막 트랙 (자유 배치). 편집 기능은 M9 */
export default function SubtitleTrack({ layout, pps }: { layout: TimelineLayout; pps: number }): JSX.Element {
  const subtitles = useProjectStore((s) => s.project?.subtitles) ?? [];
  const selection = useUiStore((s) => s.selection);
  const select = useUiStore((s) => s.select);
  return (
    <div className="relative h-full rounded-md bg-gray-50" data-testid="subtitle-track">
      {subtitles.map((s) => {
        const r = subtitleRange(layout, s);
        if (r.hidden) return null;
        const sel = selection?.kind === 'subtitle' && selection.id === s.id;
        return (
          <div
            key={s.id}
            className={`absolute top-1 bottom-1 cursor-pointer truncate rounded border px-1 text-[11px] leading-6 ${
              sel ? 'border-yellow-500 bg-yellow-200' : 'border-amber-300 bg-amber-100'
            }`}
            style={{ left: r.start * pps, width: Math.max(4, (r.end - r.start) * pps) }}
            onClick={() => select({ kind: 'subtitle', id: s.id })}
          >
            {s.text || '(빈 자막)'}
          </div>
        );
      })}
    </div>
  );
}

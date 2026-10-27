import { MousePointerClick } from 'lucide-react';
import { useUiStore, type PanelTab } from '../../store/ui';
import TrimPanel from './TrimPanel';
import FilterPanel from './FilterPanel';
import TransitionPanel from './TransitionPanel';
import MusicPanel from './MusicPanel';
import SubtitlePanel from './SubtitlePanel';

const TABS: { id: PanelTab; label: string }[] = [
  { id: 'trim', label: '자르기' },
  { id: 'subtitle', label: '자막' },
  { id: 'music', label: '음악' },
  { id: 'transition', label: '전환' },
  { id: 'filter', label: '필터' }
];

export default function DecoratePanel(): JSX.Element {
  const tab = useUiStore((s) => s.panelTab);
  const setTab = useUiStore((s) => s.setPanelTab);

  return (
    <section className="ez-panel flex w-[300px] shrink-0 flex-col overflow-hidden" data-testid="decorate-panel" data-tour="decorate">
      <h2 className="ez-title px-4 pt-3.5">꾸미기</h2>
      {/* 탭: 높이 40px, 선택은 주색 글자 + 아래 2px 선 */}
      <div className="flex border-b border-line px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`relative h-10 flex-1 text-sm transition-colors active:bg-brand-50 ${
              tab === t.id
                ? 'font-semibold text-primary after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary'
                : 'text-faint hover:font-semibold hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'trim' ? (
        <TrimPanel />
      ) : tab === 'filter' ? (
        <FilterPanel />
      ) : tab === 'transition' ? (
        <TransitionPanel />
      ) : tab === 'music' ? (
        <MusicPanel />
      ) : tab === 'subtitle' ? (
        <SubtitlePanel />
      ) : (
        <Empty />
      )}
    </section>
  );
}

export function Empty(): JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-faint">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-primary">
        <MousePointerClick size={22} />
      </span>
      타임라인에서 장면을 누르면
      <br />
      여기서 꾸밀 수 있어요
    </div>
  );
}

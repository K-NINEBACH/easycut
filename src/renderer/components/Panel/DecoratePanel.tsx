import { useUiStore, type PanelTab } from '../../store/ui';
import TrimPanel from './TrimPanel';
import FilterPanel from './FilterPanel';
import TransitionPanel from './TransitionPanel';

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
    <section className="flex w-80 shrink-0 flex-col rounded-lg border border-gray-200 bg-white" data-testid="decorate-panel">
      <h2 className="px-3 pt-2 text-sm font-semibold">꾸미기</h2>
      <div className="flex gap-1 border-b border-gray-100 px-2 py-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-md py-1.5 text-sm ${
              tab === t.id ? 'bg-brand-600 font-semibold text-white' : 'text-gray-600 hover:bg-gray-100'
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
      ) : (
        <Empty />
      )}
    </section>
  );
}

export function Empty(): JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-gray-400">
      장면을 선택하면 여기서 꾸밀 수 있어요
    </div>
  );
}

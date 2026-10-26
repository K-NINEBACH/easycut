import { useState } from 'react';

const TABS = ['자르기', '자막', '음악', '전환', '필터'] as const;
type Tab = (typeof TABS)[number];

export default function DecoratePanel(): JSX.Element {
  const [tab, setTab] = useState<Tab>('자르기');

  return (
    <section className="flex w-80 shrink-0 flex-col rounded-lg border border-gray-200 bg-white">
      <h2 className="px-3 pt-2 text-sm font-semibold">꾸미기</h2>
      <div className="flex gap-1 border-b border-gray-100 px-2 py-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md py-1.5 text-sm ${
              tab === t ? 'bg-brand-600 font-semibold text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-gray-400">
        장면을 선택하면 여기서 꾸밀 수 있어요
      </div>
    </section>
  );
}

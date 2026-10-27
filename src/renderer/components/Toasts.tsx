import { CircleAlert, CircleCheck } from 'lucide-react';
import { useUiStore } from '../store/ui';

// 토스트: 반경 10px, 안내는 초록 아이콘, 오류는 빨강 아이콘 (누르면 닫힘)
export default function Toasts(): JSX.Element {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-72 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto flex max-w-xl items-center gap-2 rounded-[10px] border px-4 py-3 text-left text-sm font-medium text-ink shadow-md ${
            t.tone === 'error' ? 'border-[#f6caca] bg-[#fdeeee]' : 'border-[#c9ecd9] bg-mint-50'
          }`}
          data-testid="toast"
        >
          {t.tone === 'error' ? (
            <CircleAlert size={18} className="shrink-0 text-danger" />
          ) : (
            <CircleCheck size={18} className="shrink-0 text-success" />
          )}
          {t.text}
        </button>
      ))}
    </div>
  );
}

import { useUiStore } from '../store/ui';

export default function Toasts(): JSX.Element {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-60 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto max-w-xl rounded-lg px-4 py-2.5 text-sm shadow-lg ${
            t.tone === 'error' ? 'bg-red-600 text-white' : 'bg-gray-900 text-white'
          }`}
          data-testid="toast"
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}

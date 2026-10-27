// 메뉴 › 도움말 › 단축키 보기 (PRD F11)
import { useEffect } from 'react';
import { useUiStore } from '../../store/ui';

export const SHORTCUTS: [string, string][] = [
  ['Space', '재생 / 정지'],
  ['S', '나누기'],
  ['Delete', '선택한 것 지우기'],
  ['Ctrl + Z / Ctrl + Y', '되돌리기 / 다시 하기'],
  ['Ctrl + C / Ctrl + V', '장면 복사 / 붙여넣기'],
  ['← / →', '1프레임 이동'],
  ['Shift + ← / →', '1초 이동'],
  ['Home / End', '처음 / 끝으로'],
  ['Ctrl + 마우스 휠', '타임라인 확대 / 축소'],
  ['Ctrl + E', '영상 만들기']
];

export default function ShortcutsDialog(): JSX.Element | null {
  const open = useUiStore((s) => s.helpOpen === 'shortcuts');
  const close = (): void => useUiStore.getState().setHelpOpen(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-[2px]" onClick={close}>
      <div
        className="w-[440px] rounded-2xl border border-line bg-white p-6 shadow-lg"
        role="dialog"
        aria-label="단축키"
        onClick={(e) => e.stopPropagation()}
        data-testid="shortcuts-dialog"
      >
        <h3 className="text-xl font-semibold text-ink">단축키</h3>
        <table className="mt-4 w-full text-sm">
          <tbody>
            {SHORTCUTS.map(([k, v]) => (
              <tr key={k} className="border-b border-gray-100 last:border-0">
                <td className="py-1.5 pr-4">
                  <kbd className="rounded-md border border-line border-b-2 bg-gray-50 px-1.5 py-0.5 font-mono text-xs text-ink">{k}</kbd>
                </td>
                <td className="py-1.5 text-gray-700">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-5 flex justify-end">
          <button className="ez-btn-primary px-5 py-2.5 text-sm" onClick={close}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

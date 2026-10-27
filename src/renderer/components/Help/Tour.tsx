// 첫 실행 안내 (PRD 5.4): 불러오기 → 타임라인에 놓기 → 꾸미기 → 영상 만들기, "다시 보지 않기"
import { useEffect, useLayoutEffect, useState } from 'react';
import { useUiStore } from '../../store/ui';

const STEPS = [
  { target: 'import', title: '1. 불러오기', text: '[+ 불러오기]를 누르거나 영상·사진을 여기로 끌어다 놓으세요.' },
  { target: 'timeline', title: '2. 타임라인에 놓기', text: '불러온 영상을 두 번 누르거나 아래 타임라인으로 끌어다 놓으면 순서대로 이어져요.' },
  { target: 'decorate', title: '3. 꾸미기', text: '장면을 누르고 여기서 자르기, 자막, 음악, 전환, 필터를 넣어 보세요.' },
  { target: 'export', title: '4. 영상 만들기', text: '다 됐으면 [영상 만들기]를 누르세요. 유튜브에 올릴 수 있는 파일이 만들어져요.' }
];

/** 편집 화면이 처음 열릴 때: 안내를 아직 안 봤으면 띄운다 */
export function useFirstRunTour(): void {
  useEffect(() => {
    if (window.api.isTest && !window.api.testTour) return;
    void window.api.settings.get().then((s) => {
      if (!s.tourDone) useUiStore.getState().setTourOpen(true);
    });
  }, []);
}

export default function Tour(): JSX.Element | null {
  const open = useUiStore((s) => s.tourOpen);
  const [i, setI] = useState(0);
  const [never, setNever] = useState(true);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = STEPS[i];

  useLayoutEffect(() => {
    if (!open) return;
    const update = (): void => setRect(document.querySelector(`[data-tour=${step.target}]`)?.getBoundingClientRect() ?? null);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [open, step.target]);

  if (!open) return null;
  const finish = (): void => {
    if (never) void window.api.settings.set({ tourDone: true });
    setI(0);
    useUiStore.getState().setTourOpen(false);
  };

  // 말풍선 위치: 대상의 오른쪽, 자리가 없으면 왼쪽, 위아래는 화면 안으로
  const W = 320;
  let left = 0;
  let top = 0;
  if (rect) {
    left = rect.right + 16 + W < window.innerWidth ? rect.right + 16 : Math.max(16, rect.left - W - 16);
    if (rect.width > window.innerWidth * 0.6) left = Math.min(window.innerWidth - W - 16, rect.left + 40);
    top = rect.height > window.innerHeight * 0.5 ? rect.top + 40 : rect.top + rect.height / 2 - 80;
    if (rect.top > window.innerHeight * 0.55) top = rect.top - 190;
    top = Math.min(Math.max(16, top), window.innerHeight - 220);
  }

  return (
    <div className="fixed inset-0 z-[60]" data-testid="tour">
      
      {rect && (
        <div
          className="pointer-events-none absolute rounded-xl ring-4 ring-mint-400 shadow-[0_0_0_9999px_rgba(17,24,39,0.35)]"
          style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }}
        />
      )}
      <div className="absolute rounded-2xl border border-line bg-white p-5 shadow-lg" style={{ left, top, width: W }} role="dialog" aria-label="사용 안내">
        <p className="text-xs text-gray-400">
          {i + 1} / {STEPS.length}
        </p>
        <h3 className="mt-1 text-base font-semibold" data-testid="tour-title">
          {step.title}
        </h3>
        <p className="mt-2 text-sm text-gray-600">{step.text}</p>
        <label className="mt-4 flex items-center gap-2 text-xs text-gray-500">
          <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} data-testid="tour-never" />
          다시 보지 않기
        </label>
        <div className="mt-3 flex items-center justify-between">
          <button className="text-xs text-gray-400 hover:text-gray-700" onClick={finish} data-testid="tour-skip">
            건너뛰기
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <button className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100" onClick={() => setI(i - 1)}>
                이전
              </button>
            )}
            <button
              className="ez-btn-primary px-4 py-2 text-sm"
              onClick={() => (i < STEPS.length - 1 ? setI(i + 1) : finish())}
              data-testid="tour-next"
            >
              {i < STEPS.length - 1 ? '다음' : '시작하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

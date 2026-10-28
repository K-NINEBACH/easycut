import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import type { UpdateReady } from '@shared/ipc';
import { useProjectStore } from '../store/project';

// 새 버전을 다 받으면 오른쪽 아래에 안내. [나중에] 를 눌러도 앱을 끌 때 설치된다 (PRD 13장 #11)
export default function UpdateBanner(): JSX.Element | null {
  const [ready, setReady] = useState<UpdateReady | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.api.update.getReady().then((r) => r && setReady(r));
    return window.api.update.onReady(setReady);
  }, []);

  if (!ready || hidden) return null;

  const restart = async (): Promise<void> => {
    setBusy(true);
    // 자동 저장(2초)을 기다리지 않고 지금 저장한 뒤 다시 시작
    const project = useProjectStore.getState().project;
    try {
      if (project) await window.api.project.save(project);
      await window.api.update.install();
    } catch (e) {
      console.error('업데이트 시작 실패', e);
      setBusy(false);
    }
  };

  return (
    <div
      className="ez-panel fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-3 p-4 shadow-lg"
      role="status"
      data-testid="update-banner"
    >
      <div className="flex items-start gap-2">
        <RefreshCw size={18} className="mt-0.5 shrink-0 text-primary" />
        <div className="flex-1 text-sm">
          <div className="font-semibold text-ink">새 버전({ready.version})이 준비됐어요</div>
          <div className="mt-1 text-body">다시 시작하면 바로 적용돼요. 지금 만들던 영상은 저장하고 다시 열어요.</div>
        </div>
        <button className="ez-icon-btn" onClick={() => setHidden(true)} aria-label="닫기">
          <X size={16} />
        </button>
      </div>
      <div className="flex justify-end gap-2">
        <button className="ez-btn-secondary h-9 px-4 text-sm" onClick={() => setHidden(true)}>
          나중에
        </button>
        <button className="ez-btn-primary h-9 px-4 text-sm" onClick={restart} disabled={busy} data-testid="update-restart">
          {busy ? '다시 시작하는 중…' : '지금 다시 시작'}
        </button>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { summarizeNames } from '@shared/format';
import { silent, useProjectStore } from '../store/project';
import { toast } from '../store/ui';

/** 원본 파일 경로가 바뀌어 못 찾을 때 (PRD F10): [폴더에서 찾기] → 같은 파일명으로 자동 재연결 */
export default function MissingMediaDialog(): JSX.Element | null {
  const media = useProjectStore((s) => s.project?.media);
  const missing = useMemo(() => media?.filter((m) => m.missing) ?? [], [media]);
  const projectId = useProjectStore((s) => s.project?.id);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (missing.length === 0 || dismissedFor === projectId) return null;

  const findInFolder = async (): Promise<void> => {
    const folder = await window.api.media.pickFolder('영상이 있는 폴더를 고르세요');
    if (!folder) return;
    setBusy(true);
    try {
      const relinked = await window.api.media.relinkFolder(folder, missing);
      const byId = new Map(relinked.map((m) => [m.id, m]));
      silent((d) => {
        d.media = d.media.map((m) => byId.get(m.id) ?? m);
      });
      const left = missing.length - relinked.length;
      if (relinked.length === 0) toast('그 폴더에서 같은 이름의 파일을 찾지 못했어요', 'error');
      else if (left > 0) toast(`${relinked.length}개를 다시 연결했어요. ${left}개는 아직 못 찾았어요`);
      else toast('모두 다시 연결했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[440px] rounded-xl bg-white p-6 shadow-2xl" role="dialog">
        <h3 className="text-lg font-semibold">영상 파일을 찾을 수 없어요</h3>
        <p className="mt-2 text-sm text-gray-600">
          파일을 다른 곳으로 옮겼거나 이름을 바꾼 것 같아요. 파일이 있는 폴더를 알려주시면 같은 이름의 파일을 찾아서
          다시 연결할게요.
        </p>
        <p className="mt-3 rounded-md bg-gray-50 p-2 text-xs text-gray-500">
          {summarizeNames(
            missing.map((m) => m.fileName),
            4
          )}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100" onClick={() => setDismissedFor(projectId ?? null)}>
            나중에
          </button>
          <button
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            disabled={busy}
            onClick={() => void findInFolder()}
          >
            {busy ? '찾는 중…' : '폴더에서 찾기'}
          </button>
        </div>
      </div>
    </div>
  );
}

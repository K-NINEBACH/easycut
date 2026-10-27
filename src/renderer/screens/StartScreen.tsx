// 시작 화면 (PRD 5.2): [새 영상 만들기] / [이어서 만들기] + 최근 프로젝트 8개
import { useEffect, useState } from 'react';
import { defaultProjectName } from '@shared/project';
import { mediaUrl } from '@shared/mediaUrl';
import type { Project, RecentProject } from '@shared/types';

export default function StartScreen({ onOpen }: { onOpen: (p: Project, isNew: boolean) => void }): JSX.Element {
  const [recent, setRecent] = useState<RecentProject[] | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState(defaultProjectName());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.api.project.listRecent().then(setRecent);
  }, []);

  const run = async (f: () => Promise<Project>, isNew: boolean): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      onOpen(await f(), isNew);
    } catch {
      setError('프로젝트를 열지 못했어요. 파일이 옮겨졌거나 망가졌을 수 있어요.');
      setBusy(false);
    }
  };
  const create = (): void => {
    const n = name.trim() || defaultProjectName();
    void run(() => window.api.project.create(n), true);
  };

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto bg-gray-50 px-8 py-12" data-testid="start-screen">
      <h1 className="text-3xl font-bold">쉬운편집</h1>
      <p className="mt-2 text-gray-500">휴대폰으로 찍은 영상을 쉽게 한 편으로 만들어요</p>

      {naming ? (
        <div className="mt-10 w-[520px] rounded-xl bg-white p-6 shadow" data-testid="new-project">
          <label className="text-sm font-semibold" htmlFor="project-name">
            영상 이름
          </label>
          <input
            id="project-name"
            className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-brand-500 focus:outline-none"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create();
              if (e.key === 'Escape') setNaming(false);
            }}
            data-testid="project-name"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100" onClick={() => setNaming(false)}>
              뒤로
            </button>
            <button
              className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={busy}
              onClick={create}
              data-testid="project-create"
            >
              만들기
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-10 flex gap-6">
          <button
            className="flex h-40 w-64 flex-col items-center justify-center gap-2 rounded-2xl bg-brand-600 text-white shadow-lg hover:bg-brand-700"
            onClick={() => setNaming(true)}
            data-testid="start-new"
          >
            <span className="text-4xl">＋</span>
            <span className="text-lg font-semibold">새 영상 만들기</span>
          </button>
          <button
            className="flex h-40 w-64 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-gray-200 bg-white shadow hover:bg-gray-50 disabled:opacity-40"
            disabled={!recent?.length || busy}
            onClick={() => recent?.[0] && void run(() => window.api.project.open(recent[0].path), false)}
            data-testid="start-continue"
          >
            <span className="text-4xl">▶</span>
            <span className="text-lg font-semibold">이어서 만들기</span>
            {recent?.[0] && <span className="max-w-[90%] truncate text-xs text-gray-500">{recent[0].name}</span>}
          </button>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {!naming && !!recent?.length && (
        <div className="mt-12 w-full max-w-4xl">
          <h2 className="mb-3 text-sm font-semibold text-gray-600">최근 프로젝트</h2>
          <div className="grid grid-cols-4 gap-4">
            {recent.slice(0, 8).map((r) => (
              <button
                key={r.path}
                className="overflow-hidden rounded-lg border border-gray-200 bg-white text-left shadow-sm hover:border-brand-500"
                onClick={() => void run(() => window.api.project.open(r.path), false)}
                disabled={busy}
                data-testid="recent-project"
              >
                <div className="aspect-video bg-gray-800">
                  {r.thumbnailPath && <img src={mediaUrl(r.thumbnailPath)} className="h-full w-full object-cover" alt="" />}
                </div>
                <div className="p-2">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  <p className="text-xs text-gray-400">{new Date(r.updatedAt).toLocaleDateString('ko-KR')}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

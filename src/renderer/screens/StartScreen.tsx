// 시작 화면 (PRD 5.2): [새 영상 만들기] / [이어서 만들기] + 최근 프로젝트 8개
import { useEffect, useState } from 'react';
import { Clapperboard, Film, Play, Plus } from 'lucide-react';
import { defaultProjectName } from '@shared/project';
import { mediaUrl } from '@shared/mediaUrl';
import type { Project, RecentProject } from '@shared/types';
import Logo from '../components/Logo';

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
  const last = recent?.[0];

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-canvas" data-testid="start-screen">
      <header className="flex h-14 shrink-0 items-center gap-2.5 px-8">
        <Logo size={28} />
        <span className="text-base font-bold text-ink">쉬운편집</span>
      </header>

      <main className="mx-auto flex w-full max-w-[1040px] flex-col gap-12 px-8 pt-4 pb-12">
        {/* 메인 카드: 제목·설명·큰 버튼 두 개 */}
        <section className="relative overflow-hidden rounded-[20px] border border-line bg-white px-12 py-12 shadow-md">
          <Decoration />
          <div className="relative max-w-[520px]">
            <h1 className="text-[32px] leading-tight font-bold text-ink">
              소중한 순간을
              <br />
              영상으로 만들어 보세요
            </h1>
            <p className="mt-3 text-base text-body">여행 사진과 영상을 쉽고 빠르게 편집해 보세요.</p>

            {naming ? (
              <div className="mt-8" data-testid="new-project">
                <label className="text-sm font-semibold text-ink" htmlFor="project-name">
                  영상 이름
                </label>
                <input
                  id="project-name"
                  className="ez-input mt-2 h-12 w-full text-base"
                  value={name}
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') create();
                    if (e.key === 'Escape') setNaming(false);
                  }}
                  data-testid="project-name"
                />
                <div className="mt-4 flex gap-3">
                  <button className="ez-btn-primary h-12 px-8 text-base" disabled={busy} onClick={create} data-testid="project-create">
                    만들기
                  </button>
                  <button className="ez-btn-secondary h-12 px-6 text-base" onClick={() => setNaming(false)}>
                    뒤로
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-8 flex gap-3">
                <button className="ez-btn-primary h-12 px-7 text-base" onClick={() => setNaming(true)} data-testid="start-new">
                  <Plus size={20} strokeWidth={2.5} />
                  새 영상 만들기
                </button>
                <button
                  className="ez-btn-secondary h-12 max-w-[280px] px-6 text-base"
                  disabled={!recent?.length || busy}
                  onClick={() => last && void run(() => window.api.project.open(last.path), false)}
                  title={last ? `${last.name} 이어서 만들기` : '아직 만든 영상이 없어요'}
                  data-testid="start-continue"
                >
                  <Play size={18} fill="currentColor" className="shrink-0" />
                  <span className="shrink-0">이어서 만들기</span>
                  {last && <span className="truncate text-sm font-normal text-faint">· {last.name}</span>}
                </button>
              </div>
            )}
            {error && <p className="mt-4 text-sm text-danger">{error}</p>}
          </div>
        </section>

        {/* 최근 프로젝트 3열 */}
        {!naming && recent && (
          <section>
            <h2 className="mb-3 text-xl font-semibold text-ink">최근 프로젝트</h2>
            {recent.length === 0 ? (
              <div className="flex items-center gap-4 rounded-xl border border-dashed border-gray-300 bg-white px-6 py-6">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-primary">
                  <Clapperboard size={22} />
                </span>
                <div className="flex-1">
                  <p className="font-semibold text-ink">첫 영상을 만들어 볼까요?</p>
                  <p className="mt-0.5 text-sm text-body">[새 영상 만들기]를 누르고 휴대폰에서 옮긴 사진·영상을 불러오세요.</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {recent.slice(0, 8).map((r) => (
                  <button
                    key={r.path}
                    className="group overflow-hidden rounded-[10px] border border-line bg-white text-left transition-shadow hover:border-brand-300 hover:shadow-md disabled:opacity-60"
                    onClick={() => void run(() => window.api.project.open(r.path), false)}
                    disabled={busy}
                    data-testid="recent-project"
                  >
                    <div className="relative aspect-video bg-inner">
                      {r.thumbnailPath ? (
                        <img src={mediaUrl(r.thumbnailPath)} className="h-full w-full object-cover" alt="" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-gray-300">
                          <Film size={32} />
                        </div>
                      )}
                      <span className="absolute inset-0 hidden items-center justify-center bg-gray-900/25 group-hover:flex">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-primary shadow-md">
                          <Play size={20} fill="currentColor" className="ml-0.5" />
                        </span>
                      </span>
                    </div>
                    <div className="px-3.5 py-3">
                      <p className="truncate text-sm font-semibold text-ink">{r.name}</p>
                      <p className="mt-0.5 text-xs text-faint">{new Date(r.updatedAt).toLocaleDateString('ko-KR')}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

/** 메인 카드 오른쪽의 장식: 겹친 사진 카드와 재생 표시 (글자 없음) */
function Decoration(): JSX.Element {
  return (
    <div className="pointer-events-none absolute top-0 right-0 bottom-0 w-[420px]" aria-hidden="true">
      <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-brand-50" />
      <div className="absolute -right-10 -bottom-28 h-64 w-64 rounded-full bg-mint-50" />
      <div className="absolute top-14 right-44 h-28 w-44 -rotate-6 rounded-[10px] bg-gradient-to-br from-[#8bc5ff] to-[#3478f6] shadow-md ring-4 ring-white" />
      <div className="absolute top-28 right-16 h-32 w-52 rotate-3 rounded-[10px] bg-gradient-to-br from-[#a8e8d1] to-[#26b98a] shadow-lg ring-4 ring-white" />
      <div className="absolute top-[150px] right-[120px] flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-md">
        <Play size={20} fill="#3478f6" className="ml-0.5 text-primary" />
      </div>
    </div>
  );
}

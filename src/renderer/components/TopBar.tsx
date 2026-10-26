import { useEffect, useState } from 'react';
import { useAppInfo } from '../hooks/useAppInfo';
import { silent, useProjectStore } from '../store/project';
import { useUiStore } from '../store/ui';

export default function TopBar(): JSX.Element {
  const projectName = useProjectStore((s) => s.project?.name ?? '');
  const saveState = useProjectStore((s) => s.saveState);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const [name, setName] = useState(projectName);
  const [menuOpen, setMenuOpen] = useState(false);
  const info = useAppInfo();
  const toolsReady = !!info?.ffmpeg.version && !!info?.ffprobe.version;
  const hasClips = useProjectStore((s) => (s.project?.videoTrack.length ?? 0) > 0);
  const openExport = useUiStore((s) => s.setExportOpen);

  useEffect(() => setName(projectName), [projectName]);

  const commitName = (): void => {
    const v = name.trim();
    if (!v) return setName(projectName);
    if (v !== projectName) {
      silent((d) => {
        d.name = v;
      });
    }
  };

  return (
    <header className="relative flex h-12 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-3">
      <button className="rounded-md px-3 py-1.5 text-sm hover:bg-gray-100" onClick={() => setMenuOpen((v) => !v)}>
        ≡ 메뉴
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute top-11 left-3 z-20 w-80 rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-lg">
            <p className="mb-2 font-semibold">프로그램 정보</p>
            <p className="text-gray-600">쉬운편집 {info?.appVersion ?? ''}</p>
            <p className="mt-2 break-all text-xs text-gray-500">
              {info?.ffmpeg.version ?? info?.ffmpeg.error ?? '확인 중…'}
            </p>
            <p className="mt-1 break-all text-xs text-gray-500">
              {info?.ffprobe.version ?? info?.ffprobe.error ?? '확인 중…'}
            </p>
          </div>
        </>
      )}

      <input
        className="w-72 rounded-md border border-transparent px-2 py-1 font-semibold hover:border-gray-200 focus:border-brand-500 focus:outline-none"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setName(projectName);
            (e.target as HTMLInputElement).blur();
          }
        }}
        aria-label="프로젝트 이름"
      />
      <span className="text-xs text-gray-400" data-testid="save-state">
        {saveState === 'saving' || saveState === 'dirty'
          ? '저장 중…'
          : saveState === 'error'
            ? '저장하지 못했어요'
            : '저장됨 ✓'}
      </span>

      <div className="flex-1" />

      {info && !toolsReady && (
        <span className="text-xs text-red-600" title={info.ffmpeg.error}>
          영상 도구를 찾을 수 없어요
        </span>
      )}

      <div className="flex gap-1">
        <button
          className="rounded-md px-2 py-1.5 text-lg hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-transparent"
          title="되돌리기 (Ctrl+Z)"
          disabled={!canUndo}
          onClick={undo}
        >
          ↶
        </button>
        <button
          className="rounded-md px-2 py-1.5 text-lg hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-transparent"
          title="다시 하기 (Ctrl+Y)"
          disabled={!canRedo}
          onClick={redo}
        >
          ↷
        </button>
      </div>

      <button
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        disabled={!hasClips || !toolsReady}
        onClick={() => openExport(true)}
        title={hasClips ? '영상 만들기 (Ctrl+E)' : '타임라인에 장면을 넣으면 만들 수 있어요'}
        data-testid="export-button"
      >
        ▶ 영상 만들기
      </button>
    </header>
  );
}

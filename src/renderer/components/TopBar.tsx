import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, LoaderCircle, Menu, Play, Redo2, Undo2 } from 'lucide-react';
import Logo from './Logo';
import { useAppInfo } from '../hooks/useAppInfo';
import { getProject, silent, useProjectStore } from '../store/project';
import { player } from './Preview/player';
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

  const goStart = async (): Promise<void> => {
    setMenuOpen(false);
    player.pause();
    const p = getProject();
    // 남은 변경을 저장하고 닫는다
    if (p) await window.api.project.save(p);
    await window.api.project.close();
    useUiStore.getState().select(null);
    useProjectStore.getState().load(null);
  };
  const MenuItem = (props: { onClick: () => void; testId: string; children: React.ReactNode }): JSX.Element => (
    <button
      className="block w-full rounded-lg px-3 py-2 text-left text-ink hover:bg-gray-100"
      onClick={() => {
        setMenuOpen(false);
        props.onClick();
      }}
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );

  return (
    <header className="relative flex h-14 shrink-0 items-center gap-3 border-b border-line bg-white px-4">
      <button
        className="ez-icon-btn gap-1.5 px-2.5 py-2 text-sm font-medium"
        onClick={() => setMenuOpen((v) => !v)}
        data-testid="menu-button"
      >
        <Menu size={18} />
        메뉴
      </button>
      <Logo size={28} />
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute top-13 left-4 z-20 w-80 rounded-xl border border-line bg-white p-2 text-sm shadow-lg" data-testid="menu">
            <MenuItem onClick={() => void goStart()} testId="menu-start">
              처음 화면으로
            </MenuItem>
            <p className="mt-2 px-2 text-xs font-semibold text-gray-400">도움말</p>
            <MenuItem onClick={() => useUiStore.getState().setHelpOpen('shortcuts')} testId="menu-shortcuts">
              단축키 보기
            </MenuItem>
            <MenuItem onClick={() => useUiStore.getState().setTourOpen(true)} testId="menu-tour">
              사용 안내 다시 보기
            </MenuItem>
            <div className="my-2 border-t border-gray-100" />
            <div className="px-2 pb-1">
            <p className="mb-2 font-semibold">프로그램 정보</p>
            <p className="text-gray-600">쉬운편집 {info?.appVersion ?? ''}</p>
            <p className="mt-2 break-all text-xs text-gray-500">
              {info?.ffmpeg.version ?? info?.ffmpeg.error ?? '확인 중…'}
            </p>
            <p className="mt-1 break-all text-xs text-gray-500">
              {info?.ffprobe.version ?? info?.ffprobe.error ?? '확인 중…'}
            </p>
            </div>
          </div>
        </>
      )}

      <input
        className="w-72 rounded-lg border border-transparent px-2 py-1.5 text-base font-semibold text-ink hover:border-line focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
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
      <span className="flex items-center gap-1 text-xs text-gray-400" data-testid="save-state">
        {saveState === 'saving' || saveState === 'dirty' ? (
          <>
            <LoaderCircle size={14} className="animate-spin" />
            저장 중…
          </>
        ) : saveState === 'error' ? (
          <>
            <CircleAlert size={14} className="text-danger" />
            저장하지 못했어요
          </>
        ) : (
          <>
            <CircleCheck size={14} className="text-success" />
            저장됨
          </>
        )}
      </span>

      <div className="flex-1" />

      {info && !toolsReady && (
        <span className="text-xs text-danger" title={info.ffmpeg.error}>
          영상 도구를 찾을 수 없어요
        </span>
      )}

      <div className="flex gap-1">
        <button className="ez-icon-btn h-9 w-9" title="되돌리기 (Ctrl+Z)" aria-label="되돌리기" disabled={!canUndo} onClick={undo}>
          <Undo2 size={18} />
        </button>
        <button className="ez-icon-btn h-9 w-9" title="다시 하기 (Ctrl+Y)" aria-label="다시 하기" disabled={!canRedo} onClick={redo}>
          <Redo2 size={18} />
        </button>
      </div>

      <button
        className="ez-btn-primary h-10 px-5 text-sm"
        disabled={!hasClips || !toolsReady}
        onClick={() => openExport(true)}
        title={hasClips ? '영상 만들기 (Ctrl+E)' : '타임라인에 장면을 넣으면 만들 수 있어요'}
        data-testid="export-button"
        data-tour="export"
      >
        <Play size={16} fill="currentColor" />
        영상 만들기
      </button>
    </header>
  );
}

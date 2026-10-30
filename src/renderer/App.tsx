import { useEffect, useState } from 'react';
import EditorScreen from './screens/EditorScreen';
import StartScreen from './screens/StartScreen';
import ErrorBoundary from './components/ErrorBoundary';
import type { Project } from '@shared/types';
import Toasts from './components/Toasts';
import UpdateBanner from './components/UpdateBanner';
import { useProjectStore } from './store/project';
import { useUiStore } from './store/ui';
import { importPaths, pickAndImport, prepareAllMedia, subscribeMediaJobs } from './store/mediaActions';
import { useAutosave } from './hooks/useAutosave';
import * as previewModule from './components/Preview/PreviewArea';
import { FONT_IDS } from '@shared/subtitles';

// 테스트(Playwright)에서 상태를 들여다볼 수 있게
if (import.meta.env.DEV || window.api.isTest) {
  (window as unknown as Record<string, unknown>).__ezcut = {
    useProjectStore,
    useUiStore,
    importPaths,
    /** 미리보기 엔진 (음악 소리 크기 등 확인용) */
    preview: () => previewModule.previewEngine,
    /** 자막 글꼴 목록 (글꼴별 비교 시험용) */
    fontIds: FONT_IDS
  };
}

export default function App(): JSX.Element {
  const project = useProjectStore((s) => s.project);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useAutosave();

  useEffect(() => subscribeMediaJobs(), []);

  useEffect(() => {
    // 프로젝트를 연 채로 꺼졌으면 바로 복구, 아니면 시작 화면 (PRD 5.2, F10)
    (async () => {
      try {
        const p = await window.api.project.startup();
        if (p) {
          useProjectStore.getState().load(p);
          await prepareAllMedia();
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const open = (p: Project, isNew: boolean): void => {
    useUiStore.getState().select(null);
    useUiStore.getState().setPlayhead(0);
    useProjectStore.getState().load(p);
    void prepareAllMedia();
    // 새 영상이면 바로 파일 고르기 창
    if (isNew) void pickAndImport();
  };

  if (error) return <div className="p-8 text-red-600">프로젝트를 열지 못했어요: {error}</div>;
  if (!ready) return <div className="flex h-full items-center justify-center text-gray-400">여는 중…</div>;
  if (!project)
    return (
      <>
        <StartScreen onOpen={open} />
        <Toasts />
        <UpdateBanner />
      </>
    );

  return (
    <>
      <ErrorBoundary>
        <EditorScreen />
      </ErrorBoundary>
      <Toasts />
      <UpdateBanner />
    </>
  );
}

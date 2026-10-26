import { useEffect, useState } from 'react';
import { defaultProjectName } from '@shared/project';
import EditorScreen from './screens/EditorScreen';
import Toasts from './components/Toasts';
import { useProjectStore } from './store/project';
import { useUiStore } from './store/ui';
import { importPaths, prepareAllMedia, subscribeMediaJobs } from './store/mediaActions';
import { useAutosave } from './hooks/useAutosave';
import * as previewModule from './components/Preview/PreviewArea';

// 테스트(Playwright)에서 상태를 들여다볼 수 있게
if (import.meta.env.DEV || window.api.isTest) {
  (window as unknown as Record<string, unknown>).__ezcut = {
    useProjectStore,
    useUiStore,
    importPaths,
    /** 미리보기 엔진 (음악 소리 크기 등 확인용) */
    preview: () => previewModule.previewEngine
  };
}

export default function App(): JSX.Element {
  const project = useProjectStore((s) => s.project);
  const [error, setError] = useState<string | null>(null);
  useAutosave();

  useEffect(() => subscribeMediaJobs(), []);

  useEffect(() => {
    // 시작 화면은 M10. 그 전까지는 마지막 프로젝트를 이어서 열고, 없으면 새로 만든다.
    (async () => {
      try {
        const p = (await window.api.project.openLast()) ?? (await window.api.project.create(defaultProjectName()));
        useProjectStore.getState().load(p);
        await prepareAllMedia();
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  if (error) return <div className="p-8 text-red-600">프로젝트를 열지 못했어요: {error}</div>;
  if (!project) return <div className="flex h-full items-center justify-center text-gray-400">여는 중…</div>;

  return (
    <>
      <EditorScreen />
      <Toasts />
    </>
  );
}

import { useEffect } from 'react';
import { useProjectStore } from '../store/project';

const DEBOUNCE_MS = 2000; // PRD F10: 변경 후 2초 디바운스

/** 프로젝트가 바뀌면 2초 뒤 자동 저장. 창을 닫을 때 남은 변경은 바로 저장. */
export function useAutosave(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSaved = useProjectStore.getState().project;
    let saving = false;
    let again = false;

    const save = async (): Promise<void> => {
      timer = null;
      const { project, setSaveState } = useProjectStore.getState();
      if (!project || project === lastSaved) return;
      if (saving) {
        again = true;
        return;
      }
      saving = true;
      setSaveState('saving');
      try {
        await window.api.project.save(project);
        lastSaved = project;
        setSaveState(useProjectStore.getState().project === project ? 'saved' : 'dirty');
      } catch (e) {
        console.error('자동 저장 실패', e);
        setSaveState('error');
      } finally {
        saving = false;
        if (again) {
          again = false;
          void save();
        }
      }
    };

    const unsub = useProjectStore.subscribe((state, prev) => {
      if (state.project === prev.project) return;
      // 다른 프로젝트를 연 경우: 기준만 바꾼다
      if (!state.project || !prev.project || state.project.id !== prev.project.id) {
        lastSaved = state.project;
        return;
      }
      if (state.saveState !== 'saving') state.setSaveState('dirty');
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, DEBOUNCE_MS);
    });

    const flush = (): void => {
      if (timer) {
        clearTimeout(timer);
        void save();
      }
    };
    window.addEventListener('beforeunload', flush);

    return () => {
      unsub();
      window.removeEventListener('beforeunload', flush);
      if (timer) clearTimeout(timer);
    };
  }, []);
}

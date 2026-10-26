import { create } from 'zustand';
import { applyPatches, enablePatches, produce, produceWithPatches, type Draft, type Patch } from 'immer';
import type { Project } from '@shared/types';

enablePatches();

const MAX_HISTORY = 100; // PRD F10: 최대 100단계

interface HistoryEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
}

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

interface ProjectStore {
  project: Project | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  saveState: SaveState;
  /** 프로젝트를 새로 열 때 (기록 초기화) */
  load: (project: Project | null) => void;
  /** 되돌릴 수 있는 편집 (F2~F7) */
  edit: (label: string, recipe: (draft: Draft<Project>) => void) => void;
  /** 기록에 남기지 않는 변경 (미디어 준비 상태 등) */
  silent: (recipe: (draft: Draft<Project>) => void) => void;
  undo: () => void;
  redo: () => void;
  setSaveState: (s: SaveState) => void;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: null,
  past: [],
  future: [],
  saveState: 'saved',

  load: (project) => set({ project, past: [], future: [], saveState: 'saved' }),

  edit: (label, recipe) => {
    const { project, past } = get();
    if (!project) return;
    const [next, patches, inverse] = produceWithPatches(project, recipe);
    if (patches.length === 0) return;
    const entry: HistoryEntry = { label, patches, inverse };
    set({ project: next, past: [...past, entry].slice(-MAX_HISTORY), future: [] });
  },

  silent: (recipe) => {
    const { project } = get();
    if (!project) return;
    const next = produce(project, recipe);
    if (next !== project) set({ project: next });
  },

  undo: () => {
    const { project, past, future } = get();
    const entry = past[past.length - 1];
    if (!project || !entry) return;
    set({
      project: applyPatches(project, entry.inverse),
      past: past.slice(0, -1),
      future: [entry, ...future]
    });
  },

  redo: () => {
    const { project, past, future } = get();
    const [entry, ...rest] = future;
    if (!project || !entry) return;
    set({ project: applyPatches(project, entry.patches), past: [...past, entry], future: rest });
  },

  setSaveState: (saveState) => set({ saveState })
}));

/** 컴포넌트 밖에서 쓰는 단축 함수 */
export const getProject = (): Project | null => useProjectStore.getState().project;
export const edit = (label: string, recipe: (draft: Draft<Project>) => void): void =>
  useProjectStore.getState().edit(label, recipe);
export const silent = (recipe: (draft: Draft<Project>) => void): void =>
  useProjectStore.getState().silent(recipe);

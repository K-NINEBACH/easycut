import { create } from 'zustand';

export type PanelTab = 'trim' | 'subtitle' | 'music' | 'transition' | 'filter';

export type Selection =
  | { kind: 'clip'; id: string }
  | { kind: 'subtitle'; id: string }
  | { kind: 'music'; id: string }
  /** id = 전환 앞 클립 id (Transition.afterClipId) */
  | { kind: 'transition'; id: string }
  | null;

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

export type SortMode = 'date' | 'name';

interface UiStore {
  selection: Selection;
  /** 보관함에서 선택한 미디어 (선택 순서 유지) */
  selectedMediaIds: string[];
  mediaSort: SortMode;
  panelTab: PanelTab;
  /** 재생 위치 (타임라인 초) */
  playhead: number;
  playing: boolean;
  /** 타임라인 확대: 1초당 픽셀 */
  pxPerSec: number;
  previewQuality: 'smooth' | 'sharp';
  toasts: Toast[];
  /** 렌더 중 편집 잠금 (PRD F9) */
  locked: boolean;
  /** 자르기 손잡이를 끄는 동안 미리보기에 보여줄 프레임 (PRD F3) */
  scrub: { clipId: string; sourceTime: number } | null;
  /** 영상 만들기 창 (PRD F9) */
  exportOpen: boolean;
  /** 메뉴 › 도움말 창 */
  helpOpen: 'shortcuts' | null;
  /** 첫 실행 안내 (PRD 5.4) */
  tourOpen: boolean;

  select: (s: Selection) => void;
  setSelectedMedia: (ids: string[]) => void;
  setMediaSort: (m: SortMode) => void;
  setPanelTab: (t: PanelTab) => void;
  setPlayhead: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setPxPerSec: (v: number) => void;
  setPreviewQuality: (q: 'smooth' | 'sharp') => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
  setLocked: (l: boolean) => void;
  setScrub: (s: { clipId: string; sourceTime: number } | null) => void;
  setExportOpen: (o: boolean) => void;
  setHelpOpen: (h: 'shortcuts' | null) => void;
  setTourOpen: (o: boolean) => void;
}

export const MIN_PX_PER_SEC = 4;
export const MAX_PX_PER_SEC = 300;

let toastSeq = 1;

export const useUiStore = create<UiStore>((set) => ({
  selection: null,
  selectedMediaIds: [],
  mediaSort: 'date',
  panelTab: 'trim',
  playhead: 0,
  playing: false,
  pxPerSec: 40,
  previewQuality: 'smooth',
  toasts: [],
  locked: false,
  scrub: null,
  exportOpen: false,
  helpOpen: null,
  tourOpen: false,

  select: (selection) => set({ selection }),
  setSelectedMedia: (selectedMediaIds) => set({ selectedMediaIds }),
  setMediaSort: (mediaSort) => set({ mediaSort }),
  setPanelTab: (panelTab) => set({ panelTab }),
  setPlayhead: (t) => set({ playhead: Math.max(0, t) }),
  setPlaying: (playing) => set({ playing }),
  setPxPerSec: (v) => set({ pxPerSec: Math.min(MAX_PX_PER_SEC, Math.max(MIN_PX_PER_SEC, v)) }),
  setPreviewQuality: (previewQuality) => set({ previewQuality }),
  toast: (text, tone = 'info') => {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), tone === 'error' ? 6000 : 3500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setLocked: (locked) => set({ locked }),
  setScrub: (scrub) => set({ scrub }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setTourOpen: (tourOpen) => set({ tourOpen })
}));

export const toast = (text: string, tone?: Toast['tone']): void => useUiStore.getState().toast(text, tone);

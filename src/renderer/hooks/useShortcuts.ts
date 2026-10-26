import { useEffect, useRef } from 'react';
import { useProjectStore } from '../store/project';
import { useUiStore } from '../store/ui';
import { copySelection, deleteSelection, pasteClipboard, splitAtPlayhead } from '../store/editActions';
import { player } from '../components/Preview/player';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || el.isContentEditable) return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['range', 'checkbox', 'radio', 'button'].includes(type);
  }
  return false;
}

export interface ShortcutHandlers {
  onExport?: () => void;
}

/** 단축키 (PRD F11) */
export function useShortcuts(handlers: ShortcutHandlers = {}): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isTyping(e.target)) return;
      const ui = useUiStore.getState();
      // 렌더 중이거나 영상 만들기 창이 떠 있으면 편집 단축키를 막는다
      if (ui.locked || ui.exportOpen) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (ctrl && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useProjectStore.getState().undo();
      } else if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        useProjectStore.getState().redo();
      } else if (ctrl && key === 'c') {
        copySelection();
      } else if (ctrl && key === 'v') {
        e.preventDefault();
        pasteClipboard();
      } else if (ctrl && key === 'e') {
        e.preventDefault();
        ref.current.onExport?.();
      } else if (ctrl) {
        return;
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
      } else if (key === 's') {
        e.preventDefault();
        splitAtPlayhead();
      } else if (e.key === ' ') {
        e.preventDefault();
        player.toggle();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        // 슬라이더에 초점이 있으면 슬라이더 값만 바꾼다
        if ((e.target as HTMLInputElement | null)?.type === 'range') return;
        e.preventDefault();
        const dir = e.key === 'ArrowLeft' ? -1 : 1;
        const fps = useProjectStore.getState().project?.output.fps ?? 30;
        player.seekBy(e.shiftKey ? dir : dir / fps);
      } else if (e.key === 'Home') {
        e.preventDefault();
        player.seek(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        player.seekEnd();
      } else if (e.key === 'Escape') {
        ui.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

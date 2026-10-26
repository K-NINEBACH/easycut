// 사용자 편집 동작 → 되돌리기 가능한 edit() 로 감싼다
import * as ops from '@shared/ops';
import { layoutTimeline, clipIndexAt } from '@shared/timeline';
import type { VideoClip } from '@shared/types';
import { edit, getProject } from './project';
import { useUiStore, toast } from './ui';

export function addMediaToTimeline(mediaIds: string[], index?: number): void {
  const p = getProject();
  if (!p) return;
  const usable = mediaIds.filter((id) => {
    const m = p.media.find((x) => x.id === id);
    return m && !m.missing;
  });
  if (usable.length === 0) return;
  let created: string[] = [];
  edit('타임라인에 넣기', (d) => {
    created = ops.insertMedia(d, usable, index);
  });
  if (created.length === 1) useUiStore.getState().select({ kind: 'clip', id: created[0] });
}

export function moveClip(from: number, to: number): void {
  edit('장면 순서 바꾸기', (d) => ops.moveClip(d, from, to));
}

export function moveMusic(from: number, to: number): void {
  edit('음악 순서 바꾸기', (d) => ops.moveMusic(d, from, to));
}

/** Delete 키: 선택한 장면/음악/자막 삭제 */
export function deleteSelection(): void {
  const { selection, select } = useUiStore.getState();
  if (!selection) return;
  if (selection.kind === 'clip') edit('장면 삭제', (d) => ops.deleteClips(d, [selection.id]));
  else if (selection.kind === 'music') edit('음악 삭제', (d) => ops.deleteMusic(d, [selection.id]));
  else if (selection.kind === 'subtitle')
    edit('자막 삭제', (d) => {
      d.subtitles = d.subtitles.filter((s) => s.id !== selection.id);
    });
  else if (selection.kind === 'transition')
    edit('장면 전환 없애기', (d) => {
      d.transitions = d.transitions.filter((t) => t.afterClipId !== selection.id);
    });
  select(null);
}

/** 선택된 클립, 없으면 재생 위치 아래 클립 */
export function targetClipId(): string | null {
  const p = getProject();
  if (!p || p.videoTrack.length === 0) return null;
  const { selection, playhead } = useUiStore.getState();
  if (selection?.kind === 'clip' && p.videoTrack.some((c) => c.id === selection.id)) return selection.id;
  const layout = layoutTimeline(p.videoTrack, p.transitions);
  const i = clipIndexAt(layout, playhead);
  return i >= 0 ? p.videoTrack[i].id : null;
}

/** S 키 / [✂ 나누기]: 재생 위치에서 나누기 (PRD F3) */
export function splitAtPlayhead(): void {
  const p = getProject();
  const id = targetClipId();
  if (!p || !id) return;
  const { playhead } = useUiStore.getState();
  const cl = layoutTimeline(p.videoTrack, p.transitions).byId.get(id);
  if (!cl || playhead <= cl.start || playhead >= cl.end) {
    toast('재생 위치를 나눌 장면 위로 옮겨 주세요');
    return;
  }
  let ok = false;
  edit('나누기', (d) => {
    ok = ops.splitClip(d, id, playhead) !== null;
  });
  if (!ok) toast('장면 끝에 너무 가까워서 나눌 수 없어요');
}

// --- 장면 복사/붙여넣기 (Ctrl+C / Ctrl+V) ---
let clipboard: VideoClip[] = [];

export function copySelection(): void {
  const p = getProject();
  const sel = useUiStore.getState().selection;
  if (!p || sel?.kind !== 'clip') return;
  const c = p.videoTrack.find((x) => x.id === sel.id);
  if (c) {
    clipboard = [c];
    toast('장면을 복사했어요');
  }
}

export function pasteClipboard(): void {
  const p = getProject();
  if (!p || clipboard.length === 0) return;
  const sel = useUiStore.getState().selection;
  const idx = sel?.kind === 'clip' ? p.videoTrack.findIndex((c) => c.id === sel.id) + 1 : p.videoTrack.length;
  let ids: string[] = [];
  edit('장면 붙여넣기', (d) => {
    ids = ops.pasteClips(d, clipboard, idx);
  });
  if (ids[0]) useUiStore.getState().select({ kind: 'clip', id: ids[0] });
}

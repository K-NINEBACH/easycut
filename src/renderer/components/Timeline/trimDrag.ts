// 앞뒤 자르기 드래그 (타임라인 손잡이·꾸미기 패널 바 공용, PRD F3)
import * as ops from '@shared/ops';
import { isImageClip } from '@shared/timeline';
import type { MusicClip, VideoClip } from '@shared/types';
import { getProject, liveEdit } from '../../store/project';
import { useUiStore } from '../../store/ui';

export type TrimSide = 'in' | 'out';

/**
 * 손잡이를 누른 순간 호출. 이후 포인터 이동을 따라 inPoint/outPoint 를 바꾸고,
 * 그동안 미리보기에는 손잡이 위치의 프레임을 보여준다. 손을 떼면 되돌리기 1단계.
 * srcPerPx: 마우스 1px 당 원본 몇 초인지 (사진은 길이 몇 초인지)
 */
export function startTrimDrag(e: React.PointerEvent, clip: VideoClip, side: TrimSide, srcPerPx: number): void {
  e.stopPropagation();
  e.preventDefault();
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture(e.pointerId);
  const x0 = e.clientX;
  const image = isImageClip(clip);
  const orig = { inPoint: clip.inPoint, outPoint: clip.outPoint, imageDuration: clip.imageDuration ?? 0 };
  const live = liveEdit(image ? '사진 길이 바꾸기' : '앞뒤 자르기');
  const { setScrub } = useUiStore.getState();

  const move = (ev: PointerEvent): void => {
    const d = (ev.clientX - x0) * srcPerPx;
    if (image) {
      live.update((p) => ops.setImageDuration(p, clip.id, orig.imageDuration + d));
      return;
    }
    const a = side === 'in' ? orig.inPoint + d : orig.inPoint;
    const b = side === 'out' ? orig.outPoint + d : orig.outPoint;
    live.update((p) => ops.trimClip(p, clip.id, a, b));
    const c = getProject()?.videoTrack.find((x) => x.id === clip.id);
    // 끝 손잡이는 마지막으로 보이는 프레임 (끝 시각 바로 앞)
    if (c) setScrub({ clipId: clip.id, sourceTime: side === 'in' ? c.inPoint : Math.max(c.inPoint, c.outPoint - 1 / 30) });
  };
  const up = (): void => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    setScrub(null);
    live.end();
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

/** 음악 앞뒤 자르기 드래그 (1px = 1/pps 초, 속도 없음) */
export function startMusicTrimDrag(e: React.PointerEvent, clip: MusicClip, side: TrimSide, pps: number): void {
  e.stopPropagation();
  e.preventDefault();
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture(e.pointerId);
  const x0 = e.clientX;
  const orig = { inPoint: clip.inPoint, outPoint: clip.outPoint };
  const live = liveEdit('음악 자르기');
  const move = (ev: PointerEvent): void => {
    const d = (ev.clientX - x0) / pps;
    const a = side === 'in' ? orig.inPoint + d : orig.inPoint;
    const b = side === 'out' ? orig.outPoint + d : orig.outPoint;
    live.update((p) => ops.trimMusic(p, clip.id, a, b));
  };
  const up = (): void => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    live.end();
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

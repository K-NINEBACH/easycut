// 재생 시계: 타임라인 시간(playhead)을 requestAnimationFrame 으로 진행시킨다.
// 미리보기의 <video> 들은 이 시계를 따라간다 (PreviewCanvas 참고).
import { layoutTimeline } from '@shared/timeline';
import { getProject } from '../../store/project';
import { useUiStore } from '../../store/ui';

function total(): number {
  const p = getProject();
  return p ? layoutTimeline(p.videoTrack, p.transitions).total : 0;
}

let raf = 0;
let lastNow = 0;
/** 재생 범위 끝 ([이 장면만 재생] 용). null 이면 타임라인 끝까지 */
let stopAt: number | null = null;

function tick(now: number): void {
  const ui = useUiStore.getState();
  if (!ui.playing) return;
  const dt = Math.min(0.1, (now - lastNow) / 1000);
  lastNow = now;
  const end = stopAt ?? total();
  const next = ui.playhead + dt;
  if (next >= end) {
    ui.setPlayhead(end);
    pause();
    return;
  }
  ui.setPlayhead(next);
  raf = requestAnimationFrame(tick);
}

function pause(): void {
  cancelAnimationFrame(raf);
  stopAt = null;
  useUiStore.getState().setPlaying(false);
}

function play(range?: { from: number; to: number }): void {
  const ui = useUiStore.getState();
  const end = total();
  if (end <= 0) return;
  if (range) {
    ui.setPlayhead(range.from);
    stopAt = range.to;
  } else {
    stopAt = null;
    if (ui.playhead >= end - 0.05) ui.setPlayhead(0);
  }
  cancelAnimationFrame(raf);
  lastNow = performance.now();
  ui.setPlaying(true);
  raf = requestAnimationFrame(tick);
}

export const player = {
  play,
  pause,
  toggle(): void {
    if (useUiStore.getState().playing) pause();
    else play();
  },
  seek(t: number): void {
    const ui = useUiStore.getState();
    ui.setPlayhead(Math.min(Math.max(0, t), total()));
    if (ui.playing) lastNow = performance.now();
  },
  seekBy(dt: number): void {
    player.seek(useUiStore.getState().playhead + dt);
  },
  seekEnd(): void {
    pause();
    player.seek(total());
  }
};

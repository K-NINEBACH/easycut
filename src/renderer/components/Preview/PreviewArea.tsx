import { useEffect, useRef, useState } from 'react';
import { formatTime } from '@shared/format';
import { useUiStore } from '../../store/ui';
import { useTimelineLayout } from '../../hooks/useTimelineLayout';
import { PreviewEngine, type PreviewStatus } from './engine';
import { player } from './player';
import { lutForClip } from './luts';
import SubtitleOverlay from './SubtitleOverlay';

export let previewEngine: PreviewEngine | null = null;

export default function PreviewArea(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<PreviewStatus>('empty');
  const [approx, setApprox] = useState(false);
  const [glError, setGlError] = useState<string | null>(null);
  const playing = useUiStore((s) => s.playing);
  const playhead = useUiStore((s) => s.playhead);
  const quality = useUiStore((s) => s.previewQuality);
  const setQuality = useUiStore((s) => s.setPreviewQuality);
  const layout = useTimelineLayout();

  useEffect(() => {
    try {
      const engine = new PreviewEngine(canvasRef.current!, hostRef.current!);
      engine.onStatus = setStatus;
      engine.onApprox = setApprox;
      engine.lutProvider = lutForClip;
      engine.setQuality(useUiStore.getState().previewQuality);
      engine.start();
      previewEngine = engine;
      return () => {
        engine.destroy();
        previewEngine = null;
      };
    } catch (e) {
      console.error("[preview] 초기화 실패", e);
      setGlError(String(e));
      return undefined;
    }
  }, []);

  useEffect(() => previewEngine?.setQuality(quality), [quality]);

  const fullscreen = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frameRef.current?.requestFullscreen();
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col rounded-lg border border-gray-200 bg-white" data-tour="preview">
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        <div
          ref={frameRef}
          className="relative aspect-video max-h-full w-full bg-black [container-type:inline-size]"
          onDoubleClick={fullscreen}
        >
          <canvas ref={canvasRef} className="h-full w-full" data-testid="preview-canvas" />
          <div ref={hostRef} />
          <SubtitleOverlay />
          {glError ? (
            <Overlay>미리보기를 표시할 수 없어요 (그래픽 기능 오류)</Overlay>
          ) : status === 'empty' ? (
            <Overlay>타임라인에 영상을 넣으면 여기서 볼 수 있어요</Overlay>
          ) : status === 'preparing' ? (
            <Overlay>영상을 준비하고 있어요…</Overlay>
          ) : status === 'missing' ? (
            <Overlay>영상 파일을 찾을 수 없어요</Overlay>
          ) : null}
          {approx && (
            <span className="absolute top-2 right-2 rounded bg-black/60 px-2 py-0.5 text-[11px] text-white">
              실제 결과와 조금 달라요
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 border-t border-gray-100 px-3 py-2 text-sm">
        <div className="flex flex-1 items-center gap-1">
          <button
            className={`rounded px-2 py-0.5 text-xs ${quality === 'smooth' ? 'bg-gray-200 font-semibold' : 'text-gray-500'}`}
            onClick={() => setQuality('smooth')}
          >
            부드럽게
          </button>
          <button
            className={`rounded px-2 py-0.5 text-xs ${quality === 'sharp' ? 'bg-gray-200 font-semibold' : 'text-gray-500'}`}
            onClick={() => setQuality('sharp')}
          >
            선명하게
          </button>
        </div>
        <button className="rounded px-2 py-1 hover:bg-gray-100" title="처음으로 (Home)" onClick={() => player.seek(0)}>
          ◀◀
        </button>
        <button
          className="w-12 rounded-full bg-gray-900 py-1.5 text-white hover:bg-gray-700"
          title={playing ? '멈춤 (Space)' : '재생 (Space)'}
          onClick={() => player.toggle()}
          data-testid="play-button"
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button className="rounded px-2 py-1 hover:bg-gray-100" title="끝으로 (End)" onClick={() => player.seekEnd()}>
          ▶▶
        </button>
        <span className="font-mono text-gray-500 tabular-nums" data-testid="time-display">
          {formatTime(playhead)} / {formatTime(layout.total)}
        </span>
        <div className="flex flex-1 justify-end">
          <button className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100" title="전체 화면" onClick={fullscreen}>
            ⛶
          </button>
        </div>
      </div>
    </section>
  );
}

function Overlay({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/70">
      {children}
    </div>
  );
}

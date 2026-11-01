import { useEffect, useRef, useState } from 'react';
import { Maximize, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { formatTime } from '@shared/format';
import { useUiStore } from '../../store/ui';
import { useTimelineLayout } from '../../hooks/useTimelineLayout';
import { PreviewEngine, type PreviewStatus } from './engine';
import { player } from './player';
import { lutForClip } from './luts';
import SubtitleOverlay from './SubtitleOverlay';
import RegionPicker from './RegionPicker';

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
    <section className="ez-panel flex min-w-0 flex-1 flex-col overflow-hidden" data-tour="preview">
      <h2 className="ez-title px-4 pt-3.5">미리보기</h2>
      {/* 남은 칸 안에서 가로·세로 어느 쪽이 좁아도 16:9 를 지킨다 */}
      <div className="mx-4 my-3 flex min-h-0 flex-1 items-center justify-center [container-type:size]">
        <div
          ref={frameRef}
          className="relative aspect-video overflow-hidden rounded-[10px] bg-gray-900 [container-type:inline-size]"
          style={{ width: 'min(100cqw, 100cqh * 16 / 9)' }}
          onDoubleClick={fullscreen}
        >
          <canvas ref={canvasRef} className="h-full w-full" data-testid="preview-canvas" />
          <div ref={hostRef} />
          <SubtitleOverlay />
          <RegionPicker />
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
            <span className="absolute top-2 right-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] text-white">
              실제 결과와 조금 달라요
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 px-4 pb-3 text-sm">
        <div className="flex flex-1 items-center">
          <div className="flex rounded-lg bg-gray-100 p-0.5" title="미리보기 화질 (결과 영상에는 영향 없어요)">
            {(
              [
                ['smooth', '부드럽게'],
                ['sharp', '선명하게']
              ] as const
            ).map(([q, label]) => (
              <button
                key={q}
                className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                  quality === q ? 'bg-white font-semibold text-ink shadow-sm' : 'text-gray-500 hover:text-ink'
                }`}
                onClick={() => setQuality(q)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <button className="ez-icon-btn h-9 w-9" title="처음으로 (Home)" aria-label="처음으로" onClick={() => player.seek(0)}>
          <SkipBack size={18} fill="currentColor" />
        </button>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white shadow-sm transition-colors hover:bg-brand-600 active:bg-brand-700"
          title={playing ? '멈춤 (Space)' : '재생 (Space)'}
          aria-label={playing ? '멈춤' : '재생'}
          onClick={() => player.toggle()}
          data-testid="play-button"
        >
          {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
        </button>
        <button className="ez-icon-btn h-9 w-9" title="끝으로 (End)" aria-label="끝으로" onClick={() => player.seekEnd()}>
          <SkipForward size={18} fill="currentColor" />
        </button>
        <span className="text-xs text-faint tabular-nums" data-testid="time-display">
          <span className="font-semibold text-ink">{formatTime(playhead)}</span> / {formatTime(layout.total)}
        </span>
        <div className="flex flex-1 justify-end">
          <button className="ez-icon-btn h-9 w-9" title="전체 화면" aria-label="전체 화면" onClick={fullscreen}>
            <Maximize size={18} />
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

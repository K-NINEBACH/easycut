import { useCallback, useEffect, useRef } from 'react';
import { MAX_PX_PER_SEC, MIN_PX_PER_SEC, useUiStore } from '../../store/ui';
import { useMusicLayout, useTimelineLayout } from '../../hooks/useTimelineLayout';
import { splitAtPlayhead } from '../../store/editActions';
import Ruler from './Ruler';
import VideoTrack from './VideoTrack';
import MusicTrack from './MusicTrack';
import SubtitleTrack from './SubtitleTrack';

import { TRACK } from './constants';

/** 줌 슬라이더는 로그 단위 (0~100) */
const toSlider = (pps: number): number =>
  (Math.log(pps / MIN_PX_PER_SEC) / Math.log(MAX_PX_PER_SEC / MIN_PX_PER_SEC)) * 100;
const fromSlider = (v: number): number => MIN_PX_PER_SEC * Math.pow(MAX_PX_PER_SEC / MIN_PX_PER_SEC, v / 100);

// 트랙은 고정 3줄: 영상 / 자막 / 음악 (PRD 5.1)
export default function Timeline(): JSX.Element {
  const pps = useUiStore((s) => s.pxPerSec);
  const setPps = useUiStore((s) => s.setPxPerSec);
  const playhead = useUiStore((s) => s.playhead);
  const playing = useUiStore((s) => s.playing);
  const layout = useTimelineLayout();
  const music = useMusicLayout();
  const scrollRef = useRef<HTMLDivElement>(null);

  const musicEnd = music.length ? music[music.length - 1].end : 0;
  const contentSec = Math.max(layout.total, musicEnd, 10);
  const contentWidth = contentSec * pps + 300;

  // Ctrl+휠: 마우스 위치를 기준으로 확대/축소 (PRD F2)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const { pxPerSec, setPxPerSec } = useUiStore.getState();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const tAtMouse = (el.scrollLeft + mouseX) / pxPerSec;
      setPxPerSec(pxPerSec * Math.pow(1.0015, -e.deltaY));
      const next = useUiStore.getState().pxPerSec;
      el.scrollLeft = tAtMouse * next - mouseX;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // 재생 중 재생 위치가 화면 밖으로 나가면 따라간다
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const x = playhead * pps;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40) {
      if (playing) el.scrollLeft = x - 40;
      else if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth) el.scrollLeft = Math.max(0, x - el.clientWidth / 3);
    }
  }, [playhead, pps, playing]);

  const zoomToFit = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setPps((el.clientWidth - 60) / Math.max(layout.total, musicEnd, 1));
    el.scrollLeft = 0;
  }, [layout.total, musicEnd, setPps]);

  return (
    <section className="flex shrink-0 flex-col border-t border-gray-200 bg-white" data-tour="timeline">
      <div className="flex items-center gap-3 px-3 py-1.5">
        <h2 className="text-sm font-semibold">타임라인</h2>
        <button
          className="rounded-md border border-gray-200 px-2 py-0.5 text-xs hover:bg-gray-50"
          onClick={splitAtPlayhead}
          title="재생 위치에서 장면을 둘로 나눠요 (S)"
        >
          ✂ 나누기
        </button>
        <div className="flex-1" />
        <button className="text-xs text-gray-500 hover:text-gray-800" onClick={zoomToFit}>
          전체 보기
        </button>
        <label className="flex items-center gap-2 text-xs text-gray-500">
          <button onClick={() => setPps(pps / 1.4)} aria-label="축소">
            －
          </button>
          <input
            type="range"
            min={0}
            max={100}
            step={0.5}
            value={toSlider(pps)}
            onChange={(e) => setPps(fromSlider(Number(e.target.value)))}
            aria-label="확대/축소"
          />
          <button onClick={() => setPps(pps * 1.4)} aria-label="확대">
            ＋
          </button>
        </label>
      </div>

      <div className="flex pb-2">
        <div className="w-14 shrink-0 text-xs font-medium text-gray-500">
          <div style={{ height: TRACK.ruler }} />
          <TrackLabel h={TRACK.video}>영상</TrackLabel>
          <TrackLabel h={TRACK.subtitle}>자막</TrackLabel>
          <TrackLabel h={TRACK.music}>음악</TrackLabel>
        </div>
        <div ref={scrollRef} className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden" data-testid="timeline-scroll">
          <div className="relative" style={{ width: contentWidth }}>
            <Ruler seconds={contentSec} pps={pps} />
            <div style={{ height: TRACK.video, marginBottom: TRACK.gap }}>
              <VideoTrack layout={layout} pps={pps} />
            </div>
            <div style={{ height: TRACK.subtitle, marginBottom: TRACK.gap }}>
              <SubtitleTrack layout={layout} pps={pps} />
            </div>
            <div style={{ height: TRACK.music }}>
              <MusicTrack layout={music} pps={pps} />
            </div>
            <Playhead x={playhead * pps} />
          </div>
        </div>
      </div>
    </section>
  );
}

function TrackLabel({ h, children }: { h: number; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center pl-3" style={{ height: h, marginBottom: TRACK.gap }}>
      {children}
    </div>
  );
}

function Playhead({ x }: { x: number }): JSX.Element {
  return (
    <div className="pointer-events-none absolute top-0 bottom-0 z-20" style={{ left: x }} data-testid="playhead">
      <div className="absolute -left-[6px] top-0 h-3 w-3 rotate-45 rounded-sm bg-red-500" />
      <div className="absolute left-0 top-0 bottom-0 w-0.5 -translate-x-1/4 bg-red-500" />
    </div>
  );
}

import { useCallback, useEffect, useRef } from 'react';
import { Film, Music, Scissors, Type, ZoomIn, ZoomOut } from 'lucide-react';
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

  // 휠: 좌우 이동 (PRD 13장 #15), Ctrl+휠: 마우스 위치를 기준으로 확대/축소 (PRD F2)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) {
        // 터치패드의 가로 쓸기는 브라우저 기본 동작 그대로 둔다
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        e.preventDefault();
        el.scrollLeft += e.deltaY;
        return;
      }
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
    <section className="flex shrink-0 flex-col border-t border-line bg-inner" data-tour="timeline">
      <div className="flex items-center gap-3 px-4 pt-2.5 pb-1.5">
        <h2 className="ez-title">타임라인</h2>
        <button
          className="ez-btn-secondary h-8 rounded-lg px-3 text-xs"
          onClick={splitAtPlayhead}
          title="재생 위치에서 장면을 둘로 나눠요 (S)"
        >
          <Scissors size={14} />
          나누기
        </button>
        <div className="flex-1" />
        <button className="ez-icon-btn h-8 px-2.5 text-xs font-medium" onClick={zoomToFit}>
          전체 보기
        </button>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <button className="ez-icon-btn h-8 w-8" onClick={() => setPps(pps / 1.4)} aria-label="축소">
            <ZoomOut size={16} />
          </button>
          <input
            type="range"
            className="w-32"
            min={0}
            max={100}
            step={0.5}
            value={toSlider(pps)}
            style={{ '--fill': `${toSlider(pps)}%` } as React.CSSProperties}
            onChange={(e) => setPps(fromSlider(Number(e.target.value)))}
            aria-label="확대/축소"
          />
          <button className="ez-icon-btn h-8 w-8" onClick={() => setPps(pps * 1.4)} aria-label="확대">
            <ZoomIn size={16} />
          </button>
        </div>
      </div>

      <div className="flex pb-3">
        <div className="w-14 shrink-0 text-xs font-medium text-body">
          <div style={{ height: TRACK.ruler }} />
          <TrackLabel h={TRACK.video} icon={<Film size={15} className="text-clip-video-on" />}>
            영상
          </TrackLabel>
          <TrackLabel h={TRACK.subtitle} icon={<Type size={15} className="text-clip-sub-on" />}>
            자막
          </TrackLabel>
          <TrackLabel h={TRACK.music} icon={<Music size={15} className="text-clip-music-on" />}>
            음악
          </TrackLabel>
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

function TrackLabel({ h, icon, children }: { h: number; icon: React.ReactNode; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center gap-1 pl-3" style={{ height: h, marginBottom: TRACK.gap }}>
      {icon}
      {children}
    </div>
  );
}

function Playhead({ x }: { x: number }): JSX.Element {
  return (
    <div className="pointer-events-none absolute top-0 bottom-0 z-20" style={{ left: x }} data-testid="playhead">
      {/* 재생 위치 선 2px + 위쪽 작은 삼각형 */}
      <div className="absolute top-0 -left-[6px] h-0 w-0 border-x-[7px] border-t-[9px] border-x-transparent border-t-playhead" />
      <div className="absolute top-0 bottom-0 left-0 w-0.5 -translate-x-1/4 bg-playhead" />
    </div>
  );
}

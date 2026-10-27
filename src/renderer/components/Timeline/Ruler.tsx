import { useRef } from 'react';
import { formatTime } from '@shared/format';
import { useUiStore } from '../../store/ui';
import { TRACK } from './constants';

const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

/** 눈금자. 클릭·드래그로 재생 위치 이동 (PRD F2) */
export default function Ruler({ seconds, pps }: { seconds: number; pps: number }): JSX.Element {
  const setPlayhead = useUiStore((s) => s.setPlayhead);
  const setPlaying = useUiStore((s) => s.setPlaying);
  const ref = useRef<HTMLDivElement>(null);
  const step = STEPS.find((s) => s * pps >= 70) ?? 600;
  const ticks: number[] = [];
  for (let t = 0; t <= seconds; t += step) ticks.push(t);

  const seek = (clientX: number): void => {
    const rect = ref.current!.getBoundingClientRect();
    setPlayhead((clientX - rect.left) / pps);
  };

  return (
    <div
      ref={ref}
      className="relative cursor-pointer border-b border-line select-none"
      style={{ height: TRACK.ruler }}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setPlaying(false);
        seek(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.buttons & 1) seek(e.clientX);
      }}
      data-testid="ruler"
    >
      {ticks.map((t) => (
        <div key={t} className="absolute bottom-0 h-2 border-l border-tick" style={{ left: t * pps }}>
          <span className="absolute -top-3.5 left-1 text-[11px] font-medium text-faint tabular-nums">{formatTime(t)}</span>
        </div>
      ))}
    </div>
  );
}

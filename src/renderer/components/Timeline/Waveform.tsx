import { useEffect, useRef, useState } from 'react';
import type { WaveformData } from '@shared/ipc';

const cache = new Map<string, Promise<WaveformData | null>>();

function loadWaveform(path: string): Promise<WaveformData | null> {
  let p = cache.get(path);
  if (!p) {
    p = window.api.media.readWaveform(path);
    cache.set(path, p);
  }
  return p;
}

interface Props {
  path?: string;
  /** 원본 기준 구간 (초) */
  from: number;
  to: number;
  width: number;
  height: number;
  color?: string;
}

/** 오디오 파형 (타임라인 표시용) */
export default function Waveform({ path, from, to, width, height, color = 'rgba(255,255,255,0.75)' }: Props): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<WaveformData | null>(null);

  useEffect(() => {
    let alive = true;
    if (path) void loadWaveform(path).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [path]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !data) return;
    const w = Math.max(1, Math.min(8000, Math.round(width)));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, height);
    ctx.fillStyle = color;
    const { peaks, peaksPerSec } = data;
    const mid = height / 2;
    for (let x = 0; x < w; x++) {
      const a = Math.floor((from + ((to - from) * x) / w) * peaksPerSec);
      const b = Math.max(a + 1, Math.floor((from + ((to - from) * (x + 1)) / w) * peaksPerSec));
      let max = 0;
      for (let i = a; i < b && i < peaks.length; i++) if (peaks[i] > max) max = peaks[i];
      const h = Math.max(1, max * height * 0.95);
      ctx.fillRect(x, mid - h / 2, 1, h);
    }
  }, [data, from, to, width, height, color]);

  return <canvas ref={ref} style={{ width: Math.min(8000, width), height }} className="pointer-events-none" />;
}

// 흔들림 줄이기·영역 고정 분석 (PRD 13장 #16): 프록시를 회색 작은 프레임으로 조금씩 읽어 경로를 만든다
import { existsSync } from 'node:fs';
import type { StabilizeRequest } from '@shared/ipc';
import {
  RegionTracker,
  STAB_FPS,
  analyzeSize,
  autoLockZoom,
  autoShakeZoom,
  globalMotion,
  lockPath,
  shakePath,
  type TrackPoint
} from '@shared/stabilize';
import type { Stabilize } from '@shared/types';
import { buildAnalyzeFramesCommand } from '../ffmpeg/commands';
import { runProcess } from '../ffmpeg/run';
import { JobQueue, type JobContext, type JobEvents } from './JobQueue';
import { RenderError } from './RenderService';

/** 한 번에 읽는 프레임 수: 메모리에 이만큼만 둔다 */
const CHUNK = 60;

export class StabilizeService {
  private queue: JobQueue;

  constructor(
    private readonly ffmpeg: string,
    events: JobEvents
  ) {
    this.queue = new JobQueue(1, events);
  }

  analyze(req: StabilizeRequest): string {
    return this.queue.add({ kind: 'stabilize', targetId: req.clip.id, run: (ctx) => this.run(req, ctx) });
  }

  cancel(jobId: string): boolean {
    if (!this.queue.has(jobId)) return false;
    this.queue.cancel(jobId);
    return true;
  }

  private async run(req: StabilizeRequest, ctx: JobContext): Promise<Stabilize> {
    const { media, clip } = req;
    const path = media.proxyPath;
    if (!path || !existsSync(path)) throw new RenderError('영상을 아직 준비하고 있어요. 조금 뒤에 다시 해 주세요');
    const size = analyzeSize(media.width ?? 1280, media.height ?? 720);
    const first = Math.ceil(clip.inPoint * STAB_FPS - 1e-6);
    const count = Math.max(2, Math.floor((clip.outPoint - first / STAB_FPS) * STAB_FPS));
    const base = { from: first / STAB_FPS, fps: STAB_FPS };
    if (req.mode === 'shake') return { ...base, mode: 'shake', ...(await this.shake(path, size, first, count, ctx)) };
    if (!req.box || req.refTime === undefined) throw new RenderError('고정할 영역을 먼저 골라 주세요');
    return { ...base, mode: 'lock', ...(await this.lock(path, size, first, count, req.box, req.refTime, ctx)) };
  }

  private async shake(path: string, { w, h }: Size, first: number, count: number, ctx: JobContext): Promise<Pick<Stabilize, 'path' | 'zoom'>> {
    const cumX = [0];
    const cumY = [0];
    let prev: Uint8Array | null = null;
    for (let i = 0; i < count; i += CHUNK) {
      const frames = await this.read(path, w, h, first + i, Math.min(CHUNK, count - i), ctx);
      if (frames.length === 0) break;
      for (const f of frames) {
        if (prev) {
          const m = globalMotion(prev, f, w, h);
          cumX.push(cumX[cumX.length - 1] + m.dx);
          cumY.push(cumY[cumY.length - 1] + m.dy);
        }
        prev = f;
      }
      await tick();
      ctx.progress(Math.min(1, (i + frames.length) / count));
    }
    const p = shakePath(cumX, cumY, w, h);
    return { path: p, zoom: autoShakeZoom(p) };
  }

  private async lock(
    path: string,
    { w, h }: Size,
    first: number,
    count: number,
    b: NonNullable<StabilizeRequest['box']>,
    refTime: number,
    ctx: JobContext
  ): Promise<Pick<Stabilize, 'path' | 'zoom' | 'lost'>> {
    const box = {
      x: Math.round(b.x * w),
      y: Math.round(b.y * h),
      w: Math.max(8, Math.round(b.w * w)),
      h: Math.max(8, Math.round(b.h * h))
    };
    box.x = Math.min(w - box.w, Math.max(0, box.x));
    box.y = Math.min(h - box.h, Math.max(0, box.y));
    const ref = Math.min(count - 1, Math.max(0, Math.round(refTime * STAB_FPS) - first));
    const [refFrame] = await this.read(path, w, h, first + ref, 1, ctx);
    if (!refFrame) throw new RenderError('이 영상의 화면을 읽지 못했어요');
    if (new RegionTracker(refFrame, w, h, box).flat) throw new RenderError('무늬가 거의 없는 곳이에요. 무늬나 윤곽이 뚜렷한 곳을 골라 주세요');

    const start: TrackPoint = { x: box.x + box.w / 2, y: box.y + box.h / 2, lost: false };
    const points: TrackPoint[] = new Array(count);
    points[ref] = start;
    let done = 1;
    const report = (): void => ctx.progress(Math.min(1, done / count));

    // 고른 프레임에서 뒤로
    let tracker = new RegionTracker(refFrame, w, h, box);
    let i = ref + 1;
    while (i < count) {
      const frames = await this.read(path, w, h, first + i, Math.min(CHUNK, count - i), ctx);
      if (frames.length === 0) break;
      for (const f of frames) points[i++] = tracker.next(f);
      done += frames.length;
      await tick();
      report();
    }
    const end = i; // 프록시가 조금 짧으면 여기까지
    // 고른 프레임에서 앞으로: 조각을 거꾸로 처리
    tracker = new RegionTracker(refFrame, w, h, box);
    let j = ref;
    while (j > 0) {
      const from = Math.max(0, j - CHUNK);
      const frames = await this.read(path, w, h, first + from, j - from, ctx);
      for (let k = j - from - 1; k >= 0; k--) points[from + k] = frames[k] ? tracker.next(frames[k]) : { ...start, lost: true };
      done += j - from;
      j = from;
      await tick();
      report();
    }
    const track = points.slice(0, end);
    const lost = track.filter((p) => p.lost).length / track.length;
    const p = lockPath(track, w, h);
    return { path: p, zoom: autoLockZoom(p, box.w / w, box.h / h), lost: Math.round(lost * 1000) / 1000 };
  }

  private async read(path: string, w: number, h: number, frame: number, count: number, ctx: JobContext): Promise<Uint8Array[]> {
    const chunks: Buffer[] = [];
    await runProcess(this.ffmpeg, buildAnalyzeFramesCommand(path, frame, STAB_FPS, count, w, h), {
      signal: ctx.signal,
      onStdout: (c) => chunks.push(c)
    });
    const all = Buffer.concat(chunks);
    const size = w * h;
    const out: Uint8Array[] = [];
    for (let i = 0; i + size <= all.length; i += size) out.push(all.subarray(i, i + size));
    return out;
  }
}

type Size = { w: number; h: number };

/** 계산이 길어도 메인 프로세스(창·진행률)가 멈추지 않게 */
const tick = (): Promise<void> => new Promise((r) => setImmediate(r));

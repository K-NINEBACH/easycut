// 영상 만들기 (PRD F9, 9장). M5: 전환·필터·자막·음악 없이 컷 편집만.
// 1단계 장면별 중간 파일 → 2·3단계 이어 붙여 최종 인코딩.
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import type { MediaItem, RenderOptions } from '@shared/types';
import { bakeLut, isIdentityLook, lookOf, lutToCube } from '@shared/filters';
import { clipFrameCounts, layoutTimeline } from '@shared/timeline';
import { weightedProgress } from '../ffmpeg/progress';
import { runFfmpeg } from '../ffmpeg/run';
import {
  RENDER_SIZES,
  buildClipCommand,
  buildConcatList,
  buildFinalCommand,
  type RenderFormat
} from '../ffmpeg/commands';
import { JobQueue, type JobContext, type JobEvents } from './JobQueue';
import { mapLimit, type Tools } from './MediaService';

/** 단계별 진행률 가중치: 장면 처리 / 이어 붙여 인코딩 (PRD 9.3 의 2·3단계를 M5 에서는 한 번에) */
const WEIGHTS = [60, 40];
/** 장면 동시 처리 개수 (PRD 9.1) */
const CLIP_CONCURRENCY = 2;

/** 사용자에게 그대로 보여줄 수 있는 실패 이유 */
export class RenderError extends Error {}

export class RenderService {
  private queue: JobQueue;

  constructor(
    private readonly tools: Tools,
    private readonly getCacheRoot: () => string | null,
    events: JobEvents
  ) {
    this.queue = new JobQueue(1, events);
  }

  get logPath(): string | null {
    const root = this.getCacheRoot();
    return root ? join(root, 'render', 'ffmpeg-render.log') : null;
  }

  start(opts: RenderOptions): string {
    const logPath = this.logPath ?? undefined;
    return this.queue.add({ kind: 'render', logPath, run: (ctx) => this.run(opts, ctx, logPath) });
  }

  cancel(jobId: string): boolean {
    if (!this.queue.has(jobId)) return false;
    this.queue.cancel(jobId);
    return true;
  }

  private async run(opts: RenderOptions, ctx: JobContext, logPath?: string): Promise<{ outputPath: string }> {
    const { project, outputPath } = opts;
    const root = this.getCacheRoot();
    if (!root) throw new RenderError('프로젝트가 열려 있지 않아요');
    if (project.videoTrack.length === 0) throw new RenderError('타임라인에 장면이 없어요');
    const mediaById = new Map(project.media.map((m) => [m.id, m]));
    const sources: MediaItem[] = project.videoTrack.map((c) => {
      const m = mediaById.get(c.mediaId);
      if (!m || !existsSync(m.path)) throw new RenderError(`원본 파일을 찾을 수 없어요: ${m?.fileName ?? '알 수 없는 파일'}`);
      return m;
    });

    const fmt: RenderFormat = { ...RENDER_SIZES[opts.quality], fps: opts.fps };
    // M7 전에는 전환 없이 이어 붙인다
    const layout = layoutTimeline(project.videoTrack, []);
    const frames = clipFrameCounts(layout, fmt.fps);
    const totalFrames = frames.reduce((a, b) => a + b, 0);
    const totalSec = totalFrames / fmt.fps;

    const work = join(root, 'render', ctx.jobId);
    await mkdir(work, { recursive: true });
    await mkdir(dirname(outputPath), { recursive: true });
    if (logPath) await writeFile(logPath, `영상 만들기 ${new Date().toISOString()} → ${outputPath}\n`);

    const started = Date.now();
    const report = (stage: number, fraction: number, clipIndex?: number): void => {
      const progress = weightedProgress(WEIGHTS, stage, fraction);
      const elapsed = (Date.now() - started) / 1000;
      const etaSeconds = progress > 0.03 ? Math.round((elapsed / progress) * (1 - progress)) : undefined;
      ctx.progress(progress, { etaSeconds, clipIndex, message: stage === 0 ? '장면 준비 중' : '영상으로 묶는 중' });
    };

    try {
      // 1단계: 장면별 중간 파일
      const clipDone = new Array<number>(frames.length).fill(0);
      let current = 0;
      const stage1 = (): number => clipDone.reduce((a, f, i) => a + f * frames[i], 0) / totalFrames;
      const parts = await mapLimit(project.videoTrack, CLIP_CONCURRENCY, async (clip) => {
        const i = project.videoTrack.indexOf(clip);
        const media = sources[i];
        const out = join(work, `clip_${String(i).padStart(4, '0')}.mov`);
        current = Math.max(current, i);
        report(0, stage1(), current);
        const imagePath =
          clip.imageDuration !== undefined && extname(media.path).toLowerCase() === '.heic' ? media.proxyPath : undefined;
        let lutFile: string | undefined;
        if (!isIdentityLook(lookOf(clip))) {
          lutFile = `lut_${String(i).padStart(4, '0')}.cube`;
          await writeFile(join(work, lutFile), lutToCube(bakeLut(lookOf(clip))));
        }
        await runFfmpeg(this.tools.ffmpeg, buildClipCommand(clip, media, fmt, frames[i], out, { imagePath, lutFile }), {
          cwd: work,
          signal: ctx.signal,
          logPath,
          durationSec: frames[i] / fmt.fps,
          onProgress: (f) => {
            clipDone[i] = f;
            report(0, stage1(), current);
          }
        });
        clipDone[i] = 1;
        return out;
      });

      // 2·3단계: 이어 붙여 최종 인코딩
      const listPath = join(work, 'list.txt');
      await writeFile(listPath, buildConcatList(parts));
      report(1, 0);
      await runFfmpeg(this.tools.ffmpeg, buildFinalCommand(listPath, outputPath, fmt), {
        signal: ctx.signal,
        logPath,
        durationSec: totalSec,
        onProgress: (f) => report(1, f)
      });
      report(1, 1);
      return { outputPath };
    } catch (err) {
      // 취소·실패 시 만들다 만 결과 파일은 지운다
      await rm(outputPath, { force: true }).catch(() => {});
      throw err;
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => {});
    }
  }
}

// 영상 만들기 (PRD F9, 9장).
// 1단계 장면별 중간 파일 → 2단계 컷·전환으로 잇기 → 3단계 자막 굽기·배경음악 섞어 최종 인코딩.
import { existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { copyFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { buildAss, buildSrt, usedFontFiles, visibleSubtitles } from '@shared/subtitles';
import type { MediaItem, RenderOptions } from '@shared/types';
import { bakeLut, isIdentityLook, lookOf, lutToCube } from '@shared/filters';
import { stabilizeCommands } from '@shared/stabilize';
import { clipFrameCounts, frameSourceTime, layoutTimeline, transitionFrameOverlaps } from '@shared/timeline';
import { TRANSITION_BY_ID } from '@shared/transitions';
import { weightedProgress } from '../ffmpeg/progress';
import { runFfmpeg } from '../ffmpeg/run';
import {
  RENDER_SIZES,
  buildChainCommand,
  buildClipCommand,
  buildConcatCopyCommand,
  buildConcatList,
  buildFinalCommand,
  chainFrames,
  type ChainInput,
  type ChainJoin,
  type FinalInput,
  type RenderFormat
} from '../ffmpeg/commands';
import { JobQueue, type JobContext, type JobEvents } from './JobQueue';
import { mapLimit, type Tools } from './MediaService';

/** 단계별 진행률 가중치 (PRD 9.3): 장면 처리 / 잇기 / 최종 인코딩 (잇기는 대개 최종 인코딩 안에서 함) */
const WEIGHTS = [55, 10, 35];
/** 한 번에 잇는 장면 수. 넘으면 묶음별로 먼저 잇고 묶음끼리 다시 잇는다 (PRD 9.2) */
export const CHAIN_GROUP = 16;
/** 장면 동시 처리 개수 (PRD 9.1: 기본 2개, CPU 코어 수 기준 조정 → 코어 3개당 1개, 2~4개) */
const CLIP_CONCURRENCY = Math.min(4, Math.max(2, Math.floor(cpus().length / 3)));

/** 사용자에게 그대로 보여줄 수 있는 실패 이유 */
export class RenderError extends Error {}

export class RenderService {
  private queue: JobQueue;

  constructor(
    private readonly tools: Tools,
    private readonly getCacheRoot: () => string | null,
    events: JobEvents,
    /** 동봉 글꼴 폴더 (resources/fonts) */
    private readonly fontsDir: string
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

  private async run(opts: RenderOptions, ctx: JobContext, logPath?: string): Promise<{ outputPath: string; srtPath?: string }> {
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
    const music = project.musicTrack.map((c) => {
      const m = mediaById.get(c.mediaId);
      if (!m || !existsSync(m.path)) throw new RenderError(`음악 파일을 찾을 수 없어요: ${m?.fileName ?? '알 수 없는 파일'}`);
      return { path: m.path, inPoint: c.inPoint, outPoint: c.outPoint };
    });
    // 원본은 읽기만 (PRD 0장): 저장 위치가 불러온 파일과 같으면 시작하지 않는다
    const same = (a: string, b: string): boolean => resolve(a).toLowerCase() === resolve(b).toLowerCase();
    if (project.media.some((m) => same(m.path, outputPath)))
      throw new RenderError('불러온 원본 파일에는 저장할 수 없어요. 다른 이름이나 다른 곳을 골라 주세요.');

    const fmt: RenderFormat = { ...RENDER_SIZES[opts.quality], fps: opts.fps };
    const layout = layoutTimeline(project.videoTrack, project.transitions);
    const frames = clipFrameCounts(layout, fmt.fps);
    const totalFrames = frames.reduce((a, b) => a + b, 0);
    const joins: ChainJoin[] = transitionFrameOverlaps(layout, fmt.fps).map((o, i) => {
      const t = layout.transitions[i];
      return { xfade: t && o > 0 ? TRANSITION_BY_ID[t.type].xfade : null, overlapFrames: o };
    });

    const work = join(root, 'render', ctx.jobId);
    // 같은 폴더의 임시 이름으로 만들고 다 되면 바꾼다: 실패·취소해도 원래 있던 같은 이름 파일은 그대로
    const partPath = join(dirname(outputPath), `~${basename(outputPath, extname(outputPath))}.만드는 중.mp4`);
    await mkdir(work, { recursive: true });
    await mkdir(dirname(outputPath), { recursive: true });
    if (logPath) await writeFile(logPath, `영상 만들기 ${new Date().toISOString()} → ${outputPath}\n`);

    const started = Date.now();
    const report = (stage: number, fraction: number, clipIndex?: number): void => {
      const progress = weightedProgress(WEIGHTS, stage, fraction);
      const elapsed = (Date.now() - started) / 1000;
      const etaSeconds = progress > 0.03 ? Math.round((elapsed / progress) * (1 - progress)) : undefined;
      ctx.progress(progress, { etaSeconds, clipIndex, message: ['장면 준비 중', '장면 잇는 중', '마무리 중'][stage] });
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
        let stabFile: string | undefined;
        if (clip.stabilize) {
          stabFile = `stab_${String(i).padStart(4, '0')}.txt`;
          await writeFile(
            join(work, stabFile),
            stabilizeCommands(clip.stabilize, frames[i], fmt.fps, (k) => frameSourceTime(clip, k, fmt.fps))
          );
        }
        await runFfmpeg(this.tools.ffmpeg, buildClipCommand(clip, media, fmt, frames[i], out, { imagePath, lutFile, stabFile }), {
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

      // 2단계: 잇기
      report(1, 0);
      const joined = join(work, 'joined.mov');
      const inputs: ChainInput[] = parts.map((path, i) => ({ path, frames: frames[i] }));
      const { input: finalInput, frames: joinedFrames } = await this.chain(inputs, joins, fmt, joined, work, ctx, logPath, (f) =>
        report(1, f)
      );

      // 3단계: 최종 인코딩
      report(2, 0);
      const mix = music.length ? { clips: music, settings: project.music, totalSec: joinedFrames / fmt.fps } : undefined;
      // 자막: 영상에 굽기 (PRD F4) — 글꼴은 작업 폴더에 복사해 상대 경로로
      const hasSubs = visibleSubtitles(layout, project.subtitles).length > 0;
      let burn: { assFile: string; fontsDir: string } | undefined;
      if (hasSubs && opts.subtitleMode !== 'srt') {
        await mkdir(join(work, 'fonts'), { recursive: true });
        // 쓰는 글꼴만 (글꼴이 많아 전부 복사하면 60MB 넘음)
        for (const file of usedFontFiles(layout, project.subtitles, project.defaultSubtitleStyle))
          await copyFile(join(this.fontsDir, file), join(work, 'fonts', file));
        await writeFile(join(work, 'subs.ass'), buildAss(layout, project.subtitles, project.defaultSubtitleStyle));
        burn = { assFile: 'subs.ass', fontsDir: 'fonts' };
      }
      await runFfmpeg(this.tools.ffmpeg, buildFinalCommand(finalInput, partPath, fmt, mix, burn), {
        cwd: work,
        signal: ctx.signal,
        logPath,
        durationSec: joinedFrames / fmt.fps,
        onProgress: (f) => report(2, f)
      });
      await rename(partPath, outputPath);
      report(2, 1);
      // 자막 파일 따로 저장: 영상과 같은 이름 .srt
      let srtPath: string | undefined;
      if (hasSubs && opts.subtitleMode !== 'burn') {
        srtPath = outputPath.replace(/\.mp4$/i, '') + '.srt';
        await writeFile(srtPath, buildSrt(layout, project.subtitles));
      }
      return { outputPath, srtPath };
    } catch (err) {
      // 취소·실패 시 만들다 만 임시 파일만 지운다
      await rm(partPath, { force: true }).catch(() => {});
      throw err;
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * 중간 파일들을 이을 준비. 전환이 없으면 다시 인코딩 없이 이어 붙인 파일 하나,
   * 전환이 있으면 최종 인코딩 안에서 바로 이을 조각들(장면이 많으면 묶음별로 먼저 이은 파일들).
   * 반환: 최종 인코딩 입력과 결과 프레임 수
   */
  private async chain(
    inputs: ChainInput[],
    joins: ChainJoin[],
    fmt: RenderFormat,
    output: string,
    work: string,
    ctx: JobContext,
    logPath: string | undefined,
    onProgress: (f: number) => void
  ): Promise<{ input: FinalInput; frames: number }> {
    const total = chainFrames(inputs, joins);
    const run = (args: string[], frames: number, done: number): Promise<void> =>
      runFfmpeg(this.tools.ffmpeg, args, {
        signal: ctx.signal,
        logPath,
        durationSec: frames / fmt.fps,
        onProgress: (f) => onProgress(Math.min(1, (done + f * frames) / total))
      });

    if (joins.every((j) => !j.xfade)) {
      const listPath = join(work, 'list.txt');
      await writeFile(listPath, buildConcatList(inputs.map((x) => x.path)));
      await run(buildConcatCopyCommand(listPath, output), total, 0);
      return { input: output, frames: total };
    }
    // 잇기는 최종 인코딩 안에서: 영상을 한 번 덜 인코딩한다
    if (inputs.length <= CHAIN_GROUP) return { input: { inputs, joins }, frames: total };
    // 묶음별로 먼저 잇고, 묶음끼리는 최종 인코딩에서 묶음 경계의 전환으로 잇는다
    const groups: ChainInput[] = [];
    const groupJoins: ChainJoin[] = [];
    let done = 0;
    for (let g = 0; g * CHAIN_GROUP < inputs.length; g++) {
      const from = g * CHAIN_GROUP;
      const part = inputs.slice(from, from + CHAIN_GROUP);
      const partJoins = joins.slice(from, from + part.length - 1);
      const frames = chainFrames(part, partJoins);
      const path = join(work, `group_${String(g).padStart(3, '0')}.mov`);
      await run(buildChainCommand(part, partJoins, fmt, path), frames, done);
      done += frames;
      groups.push({ path, frames });
      if (from + CHAIN_GROUP < inputs.length) groupJoins.push(joins[from + CHAIN_GROUP - 1]);
    }
    if (groups.length <= CHAIN_GROUP) return { input: { inputs: groups, joins: groupJoins }, frames: total };
    // 장면이 아주 많으면(256개 초과) 묶음끼리도 먼저 잇는다
    await run(buildChainCommand(groups, groupJoins, fmt, output), total, 0);
    return { input: output, frames: total };
  }
}

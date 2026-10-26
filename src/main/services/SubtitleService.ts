// 말소리로 자막 만들기 (PRD 4-2, 4.2): 장면 소리 → 16kHz WAV → whisper.cpp → 장면에 붙은 자막
import { existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Project, Subtitle } from '@shared/types';
import { clipLength, isImageClip } from '@shared/timeline';
import { segmentsToSubtitles, type ClipSpan, type SpeechSegment } from '@shared/subtitles';
import { newId } from '@shared/ops';
import { buildSpeechAudioCommand, buildWhisperArgs, parseWhisperProgress, type SpeechClip } from '../ffmpeg/commands';
import { runFfmpeg, runProcess } from '../ffmpeg/run';
import { JobQueue, type JobContext, type JobEvents } from './JobQueue';
import { RenderError } from './RenderService';

export interface SubtitleTools {
  ffmpeg: string;
  whisper: string;
  /** 모델 파일 (resources/models/ggml-small.bin) */
  model: string;
}

/** 소리 뽑기 / 말소리 듣기 진행률 비중 */
const EXTRACT_WEIGHT = 0.1;

export interface GenerateArgs {
  project: Project;
  /** 비우면 전체 영상 */
  clipIds?: string[];
}

export class SubtitleService {
  private queue: JobQueue;

  constructor(
    private readonly tools: SubtitleTools,
    private readonly getCacheRoot: () => string | null,
    events: JobEvents
  ) {
    this.queue = new JobQueue(1, events);
  }

  generate(args: GenerateArgs): string {
    return this.queue.add({ kind: 'subtitle', run: (ctx) => this.run(args, ctx) });
  }

  cancel(jobId: string): boolean {
    if (!this.queue.has(jobId)) return false;
    this.queue.cancel(jobId);
    return true;
  }

  private async run({ project, clipIds }: GenerateArgs, ctx: JobContext): Promise<Subtitle[]> {
    const root = this.getCacheRoot();
    if (!root) throw new RenderError('프로젝트가 열려 있지 않아요');
    if (!existsSync(this.tools.whisper) || !existsSync(this.tools.model)) {
      throw new RenderError('음성 인식 프로그램이나 모델 파일이 없어요 (resources/models)');
    }
    const media = new Map(project.media.map((m) => [m.id, m]));
    const want = clipIds?.length ? new Set(clipIds) : null;
    // 소리가 나는 장면만 (사진·소리 없는 영상·소리 끈 장면은 뺀다)
    const targets = project.videoTrack.filter((c) => {
      const m = media.get(c.mediaId);
      return (!want || want.has(c.id)) && !isImageClip(c) && !c.muted && !!m?.hasAudio && existsSync(m.path);
    });
    if (targets.length === 0) throw new RenderError('말소리가 들어 있는 장면이 없어요');

    const spans: ClipSpan[] = [];
    const clips: SpeechClip[] = [];
    let cursor = 0;
    for (const c of targets) {
      const length = clipLength(c);
      spans.push({ clipId: c.id, start: cursor, length });
      clips.push({ path: media.get(c.mediaId)!.path, inPoint: c.inPoint, outPoint: c.outPoint, speed: c.speed, length });
      cursor += length;
    }

    const work = join(root, 'speech', ctx.jobId);
    await mkdir(work, { recursive: true });
    try {
      const wav = join(work, 'speech.wav');
      ctx.progress(0, { message: '소리를 꺼내는 중' });
      await runFfmpeg(this.tools.ffmpeg, buildSpeechAudioCommand(clips, wav), {
        signal: ctx.signal,
        durationSec: cursor,
        onProgress: (f) => ctx.progress(f * EXTRACT_WEIGHT, { message: '소리를 꺼내는 중' })
      });

      const outPrefix = join(work, 'result');
      const threads = Math.max(1, Math.min(8, cpus().length - 1));
      ctx.progress(EXTRACT_WEIGHT, { message: '말소리를 듣고 있어요' });
      await runProcess(this.tools.whisper, buildWhisperArgs(this.tools.model, wav, outPrefix, threads), {
        signal: ctx.signal,
        onStderrLine: (line) => {
          const f = parseWhisperProgress(line);
          if (f !== null) ctx.progress(EXTRACT_WEIGHT + f * (1 - EXTRACT_WEIGHT), { message: '말소리를 듣고 있어요' });
        }
      });

      const json = JSON.parse(await readFile(`${outPrefix}.json`, 'utf8')) as {
        transcription: { offsets: { from: number; to: number }; text: string }[];
      };
      const segments: SpeechSegment[] = json.transcription.map((t) => ({
        start: t.offsets.from / 1000,
        end: t.offsets.to / 1000,
        text: t.text
      }));
      return segmentsToSubtitles(segments, spans).map((s) => ({ id: newId(), ...s }));
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => {});
    }
  }
}

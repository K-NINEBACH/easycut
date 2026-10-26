import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { MediaItem } from '@shared/types';
import type { ImportResult, WaveformData } from '@shared/ipc';
import { fileNameOf, mediaTypeFromPath } from '@shared/mediaFormats';
import {
  buildAudioProxyCommand,
  buildFilmstripCommand,
  buildImageProxyCommand,
  buildThumbnailCommand,
  buildVideoProxyCommand,
  buildWaveformCommand,
  WAVEFORM_PEAKS_PER_SEC,
  WAVEFORM_SAMPLE_RATE
} from '../ffmpeg/commands';
import { parseProbe, runProbe } from '../ffmpeg/probe';
import { runFfmpeg, runProcess } from '../ffmpeg/run';
import { JobQueue, type JobEvents } from './JobQueue';

export interface Tools {
  ffmpeg: string;
  ffprobe: string;
}

const CACHE_VERSION = 1;

interface CacheMeta {
  v: number;
  done: boolean;
}

/** 원본 이름+크기+수정 시각으로 캐시 키를 만든다 → 폴더를 옮겨도 캐시 재사용 (PRD F1) */
export function cacheKey(fileName: string, size: number, mtimeMs: number): string {
  return createHash('sha1').update(`${fileName}|${size}|${Math.floor(mtimeMs)}`).digest('hex').slice(0, 20);
}

export class MediaService {
  /** 썸네일·사진 처리 (가벼움) */
  private light: JobQueue;
  /** 프록시 생성 (무거움, 동시 2개 — PRD F1) */
  private heavy: JobQueue;

  constructor(
    private readonly tools: Tools,
    private readonly getCacheRoot: () => string | null,
    events: JobEvents,
    private readonly allowPath: (path: string) => void
  ) {
    this.light = new JobQueue(3, events);
    this.heavy = new JobQueue(2, events);
  }

  cancel(jobId: string): boolean {
    for (const q of [this.light, this.heavy]) {
      if (q.has(jobId)) {
        q.cancel(jobId);
        return true;
      }
    }
    return false;
  }

  cancelAll(): void {
    this.light.cancelAll();
    this.heavy.cancelAll();
  }

  /** 파일·폴더 경로를 받아 지원하는 파일 목록으로 펼친다 (폴더는 하위까지) */
  async expandPaths(paths: string[]): Promise<{ files: string[]; unsupported: string[] }> {
    const files: string[] = [];
    const unsupported: string[] = [];
    const walk = async (p: string, explicit: boolean): Promise<void> => {
      let st;
      try {
        st = await stat(p);
      } catch {
        if (explicit) unsupported.push(p);
        return;
      }
      if (st.isDirectory()) {
        const entries = await readdir(p);
        entries.sort((a, b) => a.localeCompare(b));
        for (const e of entries) await walk(join(p, e), false);
      } else if (mediaTypeFromPath(p)) {
        files.push(p);
      } else if (explicit) {
        unsupported.push(p);
      }
    };
    for (const p of paths) await walk(p, true);
    return { files, unsupported };
  }

  /** 메타데이터만 즉시 읽고, 프록시 등은 작업 큐로 (PRD 8.2 media.import) */
  async import(paths: string[], knownPaths: string[] = []): Promise<ImportResult> {
    const expanded = await this.expandPaths(paths);
    const failed = expanded.unsupported.map((p) => ({ path: p, fileName: fileNameOf(p) }));
    // 이미 불러온 파일, 같은 파일 중복 지정은 건너뛴다 (경로 표기 정리, Windows 는 대소문자 무시)
    const norm = (p: string): string => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p));
    const seen = new Set(knownPaths.map(norm));
    const duplicates: string[] = [];
    const files: string[] = [];
    for (const f of expanded.files) {
      if (seen.has(norm(f))) duplicates.push(f);
      else {
        seen.add(norm(f));
        files.push(f);
      }
    }
    const items: MediaItem[] = [];

    // ffprobe 는 가볍지만 100개 동시 실행은 피한다
    const results = await mapLimit(files, 6, (p) => this.probeOne(p));
    results.forEach((item, i) => {
      if (item) items.push(item);
      else failed.push({ path: files[i], fileName: fileNameOf(files[i]) });
    });

    return { items: await this.prepare(items), failed, duplicates };
  }

  private async probeOne(path: string): Promise<MediaItem | null> {
    const type = mediaTypeFromPath(path);
    if (!type) return null;
    try {
      const st = await stat(path);
      const json = await runProbe(this.tools.ffprobe, path);
      const fields = parseProbe(json, type, new Date(st.mtimeMs).toISOString());
      if (!fields) return null;
      return {
        id: randomUUID(),
        type,
        path,
        fileName: fileNameOf(path),
        fileSize: st.size,
        fileMtime: Math.floor(st.mtimeMs),
        ...fields,
        proxyStatus: 'pending'
      };
    } catch {
      return null;
    }
  }

  /** 다시 연결: 새 경로로 메타데이터를 다시 읽는다 (id 는 유지) */
  async relink(item: MediaItem, newPath: string): Promise<MediaItem | null> {
    const probed = await this.probeOne(newPath);
    if (!probed || probed.type !== item.type) return null;
    const [prepared] = await this.prepare([{ ...probed, id: item.id }]);
    return prepared;
  }

  /** 같은 이름의 파일을 폴더(하위 포함)에서 찾는다 */
  async findByNames(folder: string, names: Set<string>): Promise<Map<string, string>> {
    const found = new Map<string, string>();
    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 6 || found.size === names.size) return;
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const p = join(dir, e.name);
        if (e.isDirectory()) await walk(p, depth + 1);
        else if (names.has(e.name) && !found.has(e.name)) found.set(e.name, p);
      }
    };
    await walk(folder, 0);
    return found;
  }

  /**
   * 캐시가 유효하면 바로 ready 로, 아니면 작업을 큐에 넣는다.
   * 앱을 다시 켰을 때도 호출 → 캐시 재사용 (PRD F1 완료 조건)
   */
  async prepare(items: MediaItem[]): Promise<MediaItem[]> {
    const root = this.getCacheRoot();
    if (!root) throw new Error('열린 프로젝트가 없어요');
    const out: MediaItem[] = [];
    for (const item of items) {
      if (!existsSync(item.path)) {
        out.push({ ...item, missing: true });
        continue;
      }
      this.allowPath(item.path);
      const dir = join(root, 'media', cacheKey(item.fileName, item.fileSize, item.fileMtime));
      const paths = cachePaths(item, dir);
      const meta = await readMeta(dir);
      if (meta?.done && meta.v === CACHE_VERSION && existsSync(paths.proxyPath ?? '')) {
        out.push({ ...item, missing: false, ...paths, proxyStatus: 'ready', proxyProgress: 1 });
        continue;
      }
      // 이 미디어의 이전 작업이 있다면 취소하고 다시
      this.light.cancelTarget(item.id);
      this.heavy.cancelTarget(item.id);
      await mkdir(dir, { recursive: true });
      const queued: MediaItem = {
        ...item,
        missing: false,
        proxyStatus: 'pending',
        proxyProgress: 0,
        proxyPath: undefined,
        thumbnailPath: existsSync(paths.thumbnailPath ?? '') ? paths.thumbnailPath : undefined
      };
      this.enqueue(queued, dir);
      out.push(queued);
    }
    return out;
  }

  private enqueue(item: MediaItem, dir: string): void {
    const p = cachePaths(item, dir);
    const { ffmpeg } = this.tools;

    if (item.type === 'image') {
      // 사진은 가벼우므로 한 번에: 프록시 JPG + 썸네일
      this.light.add({
        kind: 'media',
        targetId: item.id,
        logPath: join(dir, 'ffmpeg.log'),
        run: async (ctx) => {
          ctx.progress(0.1);
          await atomic(p.proxyPath!, (tmp) =>
            runFfmpeg(ffmpeg, buildImageProxyCommand(item, tmp), { signal: ctx.signal, logPath: join(dir, 'ffmpeg.log') })
          );
          await atomic(p.thumbnailPath!, (tmp) =>
            runFfmpeg(ffmpeg, buildThumbnailCommand(p.proxyPath!, 0, tmp), { signal: ctx.signal })
          );
          await writeMeta(dir);
          return { proxyPath: p.proxyPath, thumbnailPath: p.thumbnailPath, proxyStatus: 'ready', proxyProgress: 1 };
        }
      });
      return;
    }

    if (item.type === 'video' && !existsSync(p.thumbnailPath!)) {
      // 썸네일은 프록시보다 먼저 보이도록 가벼운 큐에서
      this.light.add({
        kind: 'media',
        targetId: item.id,
        run: async (ctx) => {
          try {
            await atomic(p.thumbnailPath!, (tmp) =>
              runFfmpeg(ffmpeg, buildThumbnailCommand(item.path, item.duration, tmp), { signal: ctx.signal })
            );
            return { thumbnailPath: p.thumbnailPath };
          } catch {
            return {}; // 썸네일 실패는 프록시 작업이 다시 판단
          }
        }
      });
    }

    const logPath = join(dir, 'ffmpeg.log');
    this.heavy.add({
      kind: 'media',
      targetId: item.id,
      logPath,
      run: async (ctx) => {
        const opts = { signal: ctx.signal, logPath };
        if (item.type === 'video') {
          ctx.progress(0);
          await atomic(p.proxyPath!, (tmp) =>
            runFfmpeg(ffmpeg, buildVideoProxyCommand(item, tmp), {
              ...opts,
              durationSec: item.duration,
              onProgress: (f) => ctx.progress(f * 0.85)
            })
          );
          if (!existsSync(p.thumbnailPath!)) {
            await atomic(p.thumbnailPath!, (tmp) =>
              runFfmpeg(ffmpeg, buildThumbnailCommand(p.proxyPath!, item.duration, tmp), opts)
            );
          }
          await rm(p.filmstripDir!, { recursive: true, force: true });
          await mkdir(p.filmstripDir!, { recursive: true });
          await runFfmpeg(ffmpeg, buildFilmstripCommand(p.proxyPath!, p.filmstripDir!), {
            ...opts,
            durationSec: item.duration,
            onProgress: (f) => ctx.progress(0.85 + f * 0.1)
          });
        } else {
          await atomic(p.proxyPath!, (tmp) =>
            runFfmpeg(ffmpeg, buildAudioProxyCommand(item, tmp), {
              ...opts,
              durationSec: item.duration,
              onProgress: (f) => ctx.progress(f * 0.8)
            })
          );
        }
        if (item.hasAudio && p.waveformPath) {
          const wf = await extractWaveform(ffmpeg, item.path, ctx.signal);
          await writeFile(p.waveformPath, JSON.stringify(wf));
        }
        ctx.progress(1);
        await writeMeta(dir);
        const result: Partial<MediaItem> = {
          proxyPath: p.proxyPath,
          thumbnailPath: existsSync(p.thumbnailPath ?? '') ? p.thumbnailPath : undefined,
          filmstripDir: p.filmstripDir,
          waveformPath: p.waveformPath,
          proxyStatus: 'ready',
          proxyProgress: 1
        };
        return result;
      }
    });
  }
}

function cachePaths(item: MediaItem, dir: string): Partial<MediaItem> {
  if (item.type === 'image') {
    return { proxyPath: join(dir, 'proxy.jpg'), thumbnailPath: join(dir, 'thumb.jpg') };
  }
  if (item.type === 'audio') {
    return { proxyPath: join(dir, 'proxy.m4a'), waveformPath: join(dir, 'waveform.json') };
  }
  return {
    proxyPath: join(dir, 'proxy.mp4'),
    thumbnailPath: join(dir, 'thumb.jpg'),
    filmstripDir: join(dir, 'filmstrip'),
    waveformPath: item.hasAudio ? join(dir, 'waveform.json') : undefined
  };
}

async function readMeta(dir: string): Promise<CacheMeta | null> {
  try {
    return JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')) as CacheMeta;
  } catch {
    return null;
  }
}

async function writeMeta(dir: string): Promise<void> {
  const meta: CacheMeta = { v: CACHE_VERSION, done: true };
  await writeFile(join(dir, 'meta.json'), JSON.stringify(meta));
}

/** 임시 파일에 만든 뒤 이름을 바꿔서, 중간에 끊겨도 반쯤 만든 파일을 쓰지 않게 한다 */
async function atomic(target: string, make: (tmp: string) => Promise<void>): Promise<void> {
  const dot = target.lastIndexOf('.');
  const tmp = `${target.slice(0, dot)}.tmp${target.slice(dot)}`;
  try {
    await make(tmp);
    await rename(tmp, target);
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
}

/** 오디오 파형: 1/20초마다 최대 진폭 (0~1) */
export async function extractWaveform(ffmpeg: string, input: string, signal?: AbortSignal): Promise<WaveformData> {
  const perPeak = WAVEFORM_SAMPLE_RATE / WAVEFORM_PEAKS_PER_SEC;
  const peaks: number[] = [];
  let count = 0;
  let max = 0;
  let carry: Buffer | null = null;
  await runProcess(ffmpeg, ['-hide_banner', '-nostdin', '-v', 'error', ...buildWaveformCommand(input)], {
    signal,
    onStdout: (chunk) => {
      const buf = carry ? Buffer.concat([carry, chunk]) : chunk;
      const n = buf.length >> 1;
      for (let i = 0; i < n; i++) {
        const v = Math.abs(buf.readInt16LE(i * 2));
        if (v > max) max = v;
        if (++count === perPeak) {
          peaks.push(Math.round((max / 32768) * 1000) / 1000);
          count = 0;
          max = 0;
        }
      }
      carry = buf.length & 1 ? buf.subarray(buf.length - 1) : null;
    }
  });
  if (count > 0) peaks.push(Math.round((max / 32768) * 1000) / 1000);
  return { peaksPerSec: WAVEFORM_PEAKS_PER_SEC, peaks };
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

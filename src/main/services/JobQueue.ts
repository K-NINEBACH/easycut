import { randomUUID } from 'node:crypto';
import type { JobDone, JobKind, JobProgress } from '@shared/types';
import { CanceledError, ProcessError } from '../ffmpeg/run';

export interface JobContext {
  jobId: string;
  signal: AbortSignal;
  progress: (fraction: number, extra?: Partial<Omit<JobProgress, 'jobId' | 'kind' | 'progress'>>) => void;
}

export interface JobSpec<T> {
  kind: JobKind;
  targetId?: string;
  run: (ctx: JobContext) => Promise<T>;
  /** 실패 시 남길 로그 경로 (JobDone.logPath 로 전달) */
  logPath?: string;
}

export interface JobEvents {
  progress: (e: JobProgress) => void;
  done: (e: JobDone) => void;
}

interface Entry {
  id: string;
  spec: JobSpec<unknown>;
  controller: AbortController;
  running: boolean;
}

/** 동시 실행 개수 제한 + 진행률 + 취소 (PRD 8.1) */
export class JobQueue {
  private waiting: Entry[] = [];
  private active = new Map<string, Entry>();

  constructor(
    private readonly concurrency: number,
    private readonly events: JobEvents
  ) {}

  add<T>(spec: JobSpec<T>): string {
    const entry: Entry = {
      id: randomUUID(),
      spec: spec as JobSpec<unknown>,
      controller: new AbortController(),
      running: false
    };
    this.waiting.push(entry);
    queueMicrotask(() => this.pump());
    return entry.id;
  }

  has(jobId: string): boolean {
    return this.active.has(jobId) || this.waiting.some((e) => e.id === jobId);
  }

  cancel(jobId: string): void {
    const idx = this.waiting.findIndex((e) => e.id === jobId);
    if (idx >= 0) {
      const [entry] = this.waiting.splice(idx, 1);
      this.finish(entry, { status: 'canceled' });
      return;
    }
    this.active.get(jobId)?.controller.abort();
  }

  /** targetId 로 대기/실행 중인 작업 취소 (예: 같은 미디어 다시 준비) */
  cancelTarget(targetId: string): void {
    for (const e of [...this.waiting, ...this.active.values()]) {
      if (e.spec.targetId === targetId) this.cancel(e.id);
    }
  }

  cancelAll(): void {
    for (const e of [...this.waiting]) this.cancel(e.id);
    for (const e of this.active.values()) e.controller.abort();
  }

  get size(): number {
    return this.waiting.length + this.active.size;
  }

  private pump(): void {
    while (this.active.size < this.concurrency && this.waiting.length > 0) {
      const entry = this.waiting.shift()!;
      this.active.set(entry.id, entry);
      entry.running = true;
      void this.runEntry(entry);
    }
  }

  private async runEntry(entry: Entry): Promise<void> {
    const { spec } = entry;
    const ctx: JobContext = {
      jobId: entry.id,
      signal: entry.controller.signal,
      progress: (fraction, extra) =>
        this.events.progress({
          jobId: entry.id,
          kind: spec.kind,
          targetId: spec.targetId,
          progress: fraction,
          ...extra
        })
    };
    try {
      const result = await spec.run(ctx);
      if (entry.controller.signal.aborted) this.finish(entry, { status: 'canceled' });
      else this.finish(entry, { status: 'done', result });
    } catch (err) {
      if (err instanceof CanceledError || entry.controller.signal.aborted) {
        this.finish(entry, { status: 'canceled' });
      } else {
        const detail = err instanceof ProcessError ? `${err.message}\n${err.stderrTail}` : String(err);
        this.finish(entry, { status: 'error', error: detail, logPath: spec.logPath });
      }
    } finally {
      this.active.delete(entry.id);
      this.pump();
    }
  }

  private finish(entry: Entry, e: Pick<JobDone, 'status' | 'result' | 'error' | 'logPath'>): void {
    this.events.done({ jobId: entry.id, kind: entry.spec.kind, targetId: entry.spec.targetId, ...e });
  }
}

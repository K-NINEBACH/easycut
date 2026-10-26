import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { parseProgressLine, progressFraction } from './progress';

export class CanceledError extends Error {
  constructor() {
    super('취소됨');
    this.name = 'CanceledError';
  }
}

export class ProcessError extends Error {
  constructor(
    message: string,
    public readonly stderrTail: string
  ) {
    super(message);
    this.name = 'ProcessError';
  }
}

export interface RunOptions {
  cwd?: string;
  signal?: AbortSignal;
  /** stdout 원본 바이트 (파형 추출 등) */
  onStdout?: (chunk: Buffer) => void;
  /** stdout 줄 단위 (stderr 진행 출력 등에 사용하지 않는 경우) */
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
  /** 명령과 stderr 를 덧붙여 기록할 로그 파일 */
  logPath?: string;
}

const STDERR_TAIL_LINES = 60;

/** 인자 배열로 프로세스를 실행한다 (셸 사용 안 함, PRD 9.4) */
export function runProcess(bin: string, args: string[], opts: RunOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new CanceledError());
    if (opts.logPath) safeAppend(opts.logPath, `\n$ ${bin} ${args.map(quoteForLog).join(' ')}\n`);

    const child = spawn(bin, args, { cwd: opts.cwd, windowsHide: true });
    const tail: string[] = [];
    let canceled = false;

    const onAbort = (): void => {
      canceled = true;
      child.kill();
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    let outBuf = '';
    child.stdout.on('data', (chunk: Buffer) => {
      opts.onStdout?.(chunk);
      if (!opts.onStdoutLine) return;
      outBuf += chunk.toString('utf8');
      let nl: number;
      while ((nl = outBuf.indexOf('\n')) >= 0) {
        opts.onStdoutLine(outBuf.slice(0, nl).replace(/\r$/, ''));
        outBuf = outBuf.slice(nl + 1);
      }
    });

    let errBuf = '';
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (opts.logPath) safeAppend(opts.logPath, text);
      errBuf += text;
      let nl: number;
      while ((nl = errBuf.search(/[\r\n]/)) >= 0) {
        const line = errBuf.slice(0, nl);
        errBuf = errBuf.slice(nl + 1);
        if (!line) continue;
        opts.onStderrLine?.(line);
        tail.push(line);
        if (tail.length > STDERR_TAIL_LINES) tail.shift();
      }
    });

    child.on('error', (err) => {
      opts.signal?.removeEventListener('abort', onAbort);
      reject(new ProcessError(`${bin} 실행 실패: ${err.message}`, ''));
    });
    child.on('close', (code) => {
      opts.signal?.removeEventListener('abort', onAbort);
      if (canceled) return reject(new CanceledError());
      if (code === 0) return resolve();
      if (errBuf) tail.push(errBuf);
      reject(new ProcessError(`${bin} 종료 코드 ${code}`, tail.join('\n')));
    });
  });
}

export interface FfmpegRunOptions extends Omit<RunOptions, 'onStdoutLine'> {
  /** 진행률 계산용 출력 길이 (초) */
  durationSec?: number;
  onProgress?: (fraction: number) => void;
}

/** ffmpeg 를 -progress pipe:1 과 함께 실행하고 진행률을 알린다 */
export function runFfmpeg(ffmpeg: string, args: string[], opts: FfmpegRunOptions = {}): Promise<void> {
  const fullArgs = ['-hide_banner', '-nostdin', '-y', '-progress', 'pipe:1', '-nostats', ...args];
  return runProcess(ffmpeg, fullArgs, {
    ...opts,
    onStdoutLine: (line) => {
      if (!opts.onProgress) return;
      const p = parseProgressLine(line);
      if (p.outTimeSec !== undefined && opts.durationSec) {
        opts.onProgress(progressFraction(p.outTimeSec, opts.durationSec));
      } else if (p.end) {
        opts.onProgress(1);
      }
    }
  });
}

function quoteForLog(a: string): string {
  return /[\s"']/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a;
}

function safeAppend(path: string, text: string): void {
  try {
    appendFileSync(path, text);
  } catch {
    // 로그 실패는 무시
  }
}

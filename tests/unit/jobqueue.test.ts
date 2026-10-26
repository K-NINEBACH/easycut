import { describe, expect, it } from 'vitest';
import { JobQueue } from '../../src/main/services/JobQueue';
import { CanceledError } from '../../src/main/ffmpeg/run';
import type { JobDone } from '../../src/shared/types';

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('JobQueue', () => {
  it('동시 실행 개수를 넘지 않는다 (100개 → 동시 2개)', async () => {
    let running = 0;
    let maxRunning = 0;
    const done: JobDone[] = [];
    const q = new JobQueue(2, { progress: () => {}, done: (e) => done.push(e) });
    for (let i = 0; i < 100; i++) {
      q.add({
        kind: 'media',
        run: async () => {
          running++;
          maxRunning = Math.max(maxRunning, running);
          await wait(1);
          running--;
          return i;
        }
      });
    }
    while (done.length < 100) await wait(5);
    expect(maxRunning).toBe(2);
    expect(done.every((d) => d.status === 'done')).toBe(true);
  });

  it('대기 중·실행 중 작업 취소', async () => {
    const done: JobDone[] = [];
    const q = new JobQueue(1, { progress: () => {}, done: (e) => done.push(e) });
    const runJob = (): Promise<void> =>
      new Promise((_resolve, reject) => {
        setTimeout(() => reject(new CanceledError()), 1000);
      });
    const a = q.add({
      kind: 'render',
      run: (ctx) =>
        new Promise((_res, rej) => ctx.signal.addEventListener('abort', () => rej(new CanceledError())))
    });
    const b = q.add({ kind: 'render', run: runJob });
    await wait(5);
    q.cancel(b);
    q.cancel(a);
    await wait(5);
    expect(done.map((d) => [d.jobId, d.status])).toEqual(
      expect.arrayContaining([
        [a, 'canceled'],
        [b, 'canceled']
      ])
    );
  });

  it('오류는 error 상태로 전달', async () => {
    const done: JobDone[] = [];
    const q = new JobQueue(1, { progress: () => {}, done: (e) => done.push(e) });
    q.add({
      kind: 'media',
      targetId: 'm1',
      run: async () => {
        throw new Error('망가짐');
      }
    });
    while (done.length < 1) await wait(2);
    expect(done[0]).toMatchObject({ status: 'error', targetId: 'm1' });
    expect(done[0].error).toContain('망가짐');
  });
});

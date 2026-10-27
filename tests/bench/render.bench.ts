// 영상 만들기 단계별 시간 재기 (최적화 비교용, 일반 테스트에는 포함 안 됨)
// 실행: npx vitest run --config vitest.bench.config.mts   (BENCH_CLIPS=12 BENCH_TRANS=fade|none)
import { mkdtempSync, rmSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';
import { produce } from 'immer';
import { it } from 'vitest';
import { MediaService } from '../../src/main/services/MediaService';
import { RenderService } from '../../src/main/services/RenderService';
import { insertMedia, setTransition } from '../../src/shared/ops';
import { newProject } from '../../src/shared/project';
import type { JobDone, JobProgress } from '../../src/shared/types';

const N = Number(process.env.BENCH_CLIPS ?? 12);
const TRANS = (process.env.BENCH_TRANS ?? 'fade') as 'fade' | 'none';
const FIXTURES = join(__dirname, '..', 'fixtures');

it(`장면 ${N}개 (전환 ${TRANS}) 영상 만들기 시간`, async () => {
  const root = mkdtempSync(join(tmpdir(), 'ez-bench-'));
  const tools = { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' };
  const progress: JobProgress[] = [];
  const done = new Map<string, JobDone>();
  const events = { progress: (e: JobProgress) => progress.push(e), done: (e: JobDone) => void done.set(e.jobId, e) };
  const cache = (): string => join(root, 'cache');
  const media = new MediaService(tools, cache, { progress: () => {}, done: () => {} }, () => {});
  const res = await media.import([FIXTURES]);
  media.cancelAll();
  const pick = ['landscape_h264_30.mp4', 'portrait_hevc_60.mov', 'photo_landscape.jpg', 'vfr.mp4', 'hdr_hlg.mov'].map(
    (n) => res.items.find((m) => m.fileName === n)!.id
  );
  const project = produce(newProject('b', 'bench'), (d) => {
    d.media = res.items;
    insertMedia(d, Array.from({ length: N }, (_, i) => pick[i % pick.length]));
    if (TRANS !== 'none') setTransition(d, d.videoTrack.map((c) => c.id), TRANS, 0.6);
  });
  const render = new RenderService(tools, cache, events, join(__dirname, '..', '..', 'resources', 'fonts'));
  const t0 = Date.now();
  const jobId = render.start({ project, outputPath: join(root, 'out.mp4'), quality: '1080p', fps: 30, subtitleMode: 'burn' });
  const stageAt: [string, number][] = [];
  while (!done.has(jobId)) {
    for (const p of progress.splice(0)) if (p.message && !stageAt.some(([m]) => m === p.message)) stageAt.push([p.message, Date.now() - t0]);
    await new Promise((r) => setTimeout(r, 50));
  }
  const total = Date.now() - t0;
  console.log(`장면 ${N}개, 전환 ${TRANS}, CPU ${cpus().length}개 → ${done.get(jobId)!.status} ${(total / 1000).toFixed(1)}초`);
  stageAt.forEach(([k, at], i) => console.log(`  ${k}: ${(((stageAt[i + 1]?.[1] ?? total) - at) / 1000).toFixed(1)}초`));
  rmSync(root, { recursive: true, force: true });
}, 1_800_000);

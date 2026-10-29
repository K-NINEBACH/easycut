// M1: 불러오기 → 프록시 → Chromium 재생 → 재시작 시 캐시 재사용
import { join } from 'node:path';
import { launch, state, waitReady, check, FIXTURES, tempDataDir } from './launch.mjs';

const dataDir = tempDataDir('easycut-e2e-');
const shotDir = process.argv[2] ?? dataDir;

let { app, win } = await launch(dataDir);
await win.evaluate((dir) => window.__ezcut.importPaths([dir]), FIXTURES);
await win.waitForTimeout(800);
await win.screenshot({ path: join(shotDir, 'm1-importing.png') });
const toasts = await win.locator('[data-testid=toast]').allInnerTexts();
check(toasts.some((t) => t.includes('열 수 없어요') && t.includes('not_media.mp4')), `열 수 없는 파일 안내: ${toasts}`);

await waitReady(win);
let p = await state(win);
check(p.media.length === 8, `8개 불러옴 (${p.media.length})`);
check(p.media.every((m) => m.proxyStatus === 'ready'), '모두 준비 완료');
await win.screenshot({ path: join(shotDir, 'm1-ready.png') });

// 중복 불러오기
await win.evaluate((dir) => window.__ezcut.importPaths([dir + '/vfr.mp4']), FIXTURES);
await win.waitForTimeout(300);
const t2 = await win.locator('[data-testid=toast]').allInnerTexts();
check(t2.some((t) => t.includes('이미 불러온 파일이에요')), '중복 안내');
check((await state(win)).media.length === 8, '중복은 추가되지 않음');

// 세로 HEVC 프록시가 Chromium 에서 재생·탐색되는지
const portrait = p.media.find((m) => m.fileName === 'portrait_hevc_60.mov');
const play = await win.evaluate(async (path) => {
  const v = document.createElement('video');
  v.muted = true;
  v.src = 'ezcut-media://local/' + encodeURIComponent(path);
  document.body.appendChild(v);
  await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('video error ' + v.error?.code)); });
  await v.play();
  // CPU 가 바쁘면 시작이 늦을 수 있어 최대 3초까지 진행을 기다린다
  for (let i = 0; i < 30 && v.currentTime <= 0.3; i++) await new Promise((r) => setTimeout(r, 100));
  const t1 = v.currentTime;
  v.currentTime = 3.2;
  await new Promise((r) => (v.onseeked = r));
  const r = { w: v.videoWidth, h: v.videoHeight, t1, seeked: v.currentTime };
  v.remove();
  return r;
}, portrait.proxyPath);
check(play.h > play.w, `세로 영상 회전 반영 (${play.w}x${play.h})`);
check(play.t1 > 0.3, `재생 진행 (${play.t1.toFixed(2)}s)`);
check(Math.abs(play.seeked - 3.2) < 0.1, `탐색 동작 (${play.seeked.toFixed(2)}s)`);

// 허용되지 않은 경로는 막힘
const forbidden = await win.evaluate(async () => (await fetch('ezcut-media://local/' + encodeURIComponent('/etc/passwd'))).status);
check(forbidden === 403, `허용 안 된 파일 차단 (${forbidden})`);

// 자동 저장 기다린 뒤 재시작
await win.waitForFunction(() => window.__ezcut.useProjectStore.getState().saveState === 'saved', null, { timeout: 10000 });
await app.close();

({ app, win } = await launch(dataDir));
const jobEvents = [];
await win.exposeFunction('__onJob', (e) => jobEvents.push(e));
await win.evaluate(() => window.api.jobs.onProgress((e) => window.__onJob(e)));
await win.waitForTimeout(1500);
p = await state(win);
check(p.media.length === 8 && p.media.every((m) => m.proxyStatus === 'ready'), '재시작 후 바로 준비 완료');
check(jobEvents.length === 0, `프록시를 다시 만들지 않음 (작업 ${jobEvents.length}개)`);
await app.close();

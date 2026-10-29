// 대량 시험: 장면 40개 + 전환 모두 + 자막 20개 → 화면 반응·자동 저장·영상 만들기(16개씩 묶음 처리)
// PRD 규모(15분·장면 40개)를 흉내낸다. 실행: node tests/e2e/x-stress.mjs [장면 수=40]
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, state, waitReady, check, FIXTURES, ROOT, tempDataDir } from './launch.mjs';

const N = Number(process.argv[2] ?? 40);
const ffprobe = existsSync(join(ROOT, 'resources', 'bin', 'ffprobe.exe')) ? join(ROOT, 'resources', 'bin', 'ffprobe.exe') : 'ffprobe';
const dataDir = tempDataDir('easycut-stress-');
const { app, win } = await launch(dataDir);
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));

await win.evaluate((dir) => window.__ezcut.importPaths([dir]), FIXTURES);
await waitReady(win);
const names = ['landscape_h264_30.mp4', 'portrait_hevc_60.mov', 'photo_landscape.jpg', 'vfr.mp4', 'hdr_hlg.mov', 'photo_portrait.png', 'noaudio.mp4'];
let t0 = Date.now();
for (let i = 0; i < N; i++) await win.locator(`[data-testid=media-card][title="${names[i % names.length]}"]`).dblclick();
const addMs = Date.now() - t0;
let p = await state(win);
check(p.videoTrack.length === N, `장면 ${N}개 넣기 (${addMs}ms, 1개당 ${(addMs / N).toFixed(0)}ms)`);

// 전환 모두
await win.locator('[data-testid=transition-marker]').first().click();
await win.locator('[data-testid=transition-fade]').click();
t0 = Date.now();
await win.locator('[data-testid=transition-apply-all]').click();
await win.waitForTimeout(100);
p = await state(win);
check(p.transitions.length >= N - 1 - 10, `전환 ${p.transitions.length}곳 (${Date.now() - t0}ms)`);

// 자막 20개 (서로 다른 장면에)
await win.getByRole('button', { name: '자막', exact: true }).click();
for (let i = 0; i < 20; i++) {
  await win.locator('[data-testid=clip]').nth(i * 2).click();
  await win.locator('[data-testid=subtitle-add]').click();
  await win.locator('[data-testid=subtitle-text]').fill(`자막 ${i + 1}번`);
  await win.locator('[data-testid=subtitle-text]').blur();
}
p = await state(win);
check(p.subtitles.length === 20, `자막 20개 (${p.subtitles.length})`);

// 화면 반응: 재생 중 프레임 간격, 타임라인 확대/스크롤 중 프레임 간격
const frameStats = (ms) =>
  win.evaluate(
    (ms) =>
      new Promise((res) => {
        const gaps = [];
        let last = performance.now();
        const end = last + ms;
        const tick = (t) => {
          gaps.push(t - last);
          last = t;
          if (t < end) requestAnimationFrame(tick);
          else {
            gaps.sort((a, b) => a - b);
            res({ avg: gaps.reduce((a, b) => a + b, 0) / gaps.length, p95: gaps[Math.floor(gaps.length * 0.95)], max: gaps[gaps.length - 1] });
          }
        };
        requestAnimationFrame(tick);
      }),
    ms
  );
await win.keyboard.press('Escape');
await win.keyboard.press(' ');
const play = await frameStats(3000);
await win.keyboard.press(' ');
console.log(`  재생 중 프레임 간격: 평균 ${play.avg.toFixed(1)}ms, 95% ${play.p95.toFixed(1)}ms, 최대 ${play.max.toFixed(0)}ms`);
check(play.p95 < 50, '재생 중 화면이 끊기지 않음 (95% 프레임 50ms 미만)');

const zoomP = frameStats(2500);
for (let i = 0; i < 20; i++) {
  await win.locator('[data-testid=timeline-scroll]').hover();
  await win.keyboard.down('Control');
  await win.mouse.wheel(0, i % 2 ? 300 : -300);
  await win.keyboard.up('Control');
  await win.mouse.wheel(400, 0);
}
const zoom = await zoomP;
console.log(`  확대/스크롤 중 프레임 간격: 평균 ${zoom.avg.toFixed(1)}ms, 95% ${zoom.p95.toFixed(1)}ms, 최대 ${zoom.max.toFixed(0)}ms`);
check(zoom.p95 < 50, '타임라인 확대/스크롤이 끊기지 않음');

// 되돌리기 반응
t0 = Date.now();
for (let i = 0; i < 20; i++) await win.keyboard.press('Control+z');
for (let i = 0; i < 20; i++) await win.keyboard.press('Control+y');
check(Date.now() - t0 < 5000, `되돌리기/다시 하기 40번 ${Date.now() - t0}ms`);

// 자동 저장
await win.waitForFunction(() => window.__ezcut.useProjectStore.getState().saveState === 'saved', null, { timeout: 15000 });
check(true, '장면 40개 프로젝트 자동 저장');

// 메모리
const mem1 = await win.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
for (let i = 0; i < 5; i++) {
  await win.keyboard.press(' ');
  await win.waitForTimeout(600);
  await win.keyboard.press(' ');
  await win.keyboard.press('End');
  await win.keyboard.press('Home');
}
const mem2 = await win.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
console.log(`  화면 메모리: ${(mem1 / 1e6).toFixed(0)}MB → ${(mem2 / 1e6).toFixed(0)}MB`);

// 영상 만들기 (16개 넘으면 묶음별 처리)
p = await state(win);
const timeline = await win.evaluate(() => document.querySelector('[data-testid=time-display]').innerText.split('/')[1].trim());
await win.locator('[data-testid=export-button]').click();
await win.locator('[data-testid=export-start]').click();
t0 = Date.now();
await Promise.race([
  win.locator('[data-testid=export-result]').waitFor({ timeout: 1500000 }),
  win.locator('[data-testid=export-error]').waitFor({ timeout: 1500000 })
]);
const renderMs = Date.now() - t0;
const failed = await win.locator('[data-testid=export-error]').count();
if (failed) console.log('  오류:', (await win.locator('[data-testid=export-error]').innerText()).slice(0, 800));
check(!failed, `장면 ${N}개 영상 만들기 성공 (${(renderMs / 1000).toFixed(0)}초)`);
const out = failed ? null : (await win.locator('[data-testid=export-result]').innerText()).match(/[A-Z]:\\[^\n]+\.mp4/)?.[0];
if (out) {
  const dur = Number(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString());
  const [mm, ss] = timeline.split(':').map(Number);
  console.log(`  결과 ${dur.toFixed(2)}초 / 타임라인 ${timeline}`);
  check(Math.abs(dur - (mm * 60 + ss)) < 1.1, '결과 길이 ≈ 타임라인 길이');
}
await app.close();
check(errors.length === 0, `화면 오류 없음 ${errors.slice(0, 3).join(' / ')}`);

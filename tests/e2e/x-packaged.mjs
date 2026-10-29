// 배포판 시험: electron-builder 로 만든 dist/win-unpacked/쉬운편집.exe 를 띄워서
// 동봉 파일(ffmpeg·글꼴·whisper·모델)을 실제로 찾는지 — 불러오기 → 필터·전환·자막 → 영상 만들기 → 말소리 자막.
// 먼저: npx electron-vite build && npx electron-builder --win --dir
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { check, FIXTURES, ROOT, tempDataDir } from './launch.mjs';

const { _electron } = createRequire(import.meta.url)('playwright');
const dir = join(ROOT, 'dist', 'win-unpacked');
const exe = readdirSync(dir).find((f) => f.endsWith('.exe') && !/uninstall/i.test(f));
const dataDir = tempDataDir('easycut-packaged-');
const app = await _electron.launch({
  executablePath: join(dir, exe),
  env: { ...process.env, PATH: 'C:\\Windows\\System32', EASYCUT_DATA_DIR: dataDir, EASYCUT_TEST: '1' }
});
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
win.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await win.setViewportSize({ width: 1440, height: 900 });
await app.evaluate(({ dialog }) => {
  dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
});

const info = await win.evaluate(() => window.api.app.getInfo());
console.log(`  ffmpeg: ${info.ffmpeg.path}\n          ${info.ffmpeg.version ?? info.ffmpeg.error}`);
check(!!info.ffmpeg.version && info.ffmpeg.path.includes('resources'), '동봉 ffmpeg 를 씀 (시스템 PATH 없이)');
check(!!info.ffprobe.version, '동봉 ffprobe 실행됨');

await win.locator('[data-testid=start-new]').click();
await win.locator('[data-testid=project-create]').click();
await win.waitForFunction(() => window.__ezcut?.useProjectStore.getState().project);
await win.evaluate((d) => window.__ezcut.importPaths([d + '\\landscape_h264_30.mp4', d + '\\portrait_hevc_60.mov', d + '\\music.mp3']), FIXTURES);
await win.waitForFunction(
  () => {
    const p = window.__ezcut.useProjectStore.getState().project;
    return p.media.length === 3 && p.media.every((m) => m.proxyStatus === 'ready' || m.proxyStatus === 'error');
  },
  null,
  { timeout: 120000 }
);
let p = await win.evaluate(() => window.__ezcut.useProjectStore.getState().project);
check(p.media.every((m) => m.proxyStatus === 'ready'), '프록시 만들기 (HEVC 세로 포함)');
for (const n of ['landscape_h264_30.mp4', 'portrait_hevc_60.mov', 'music.mp3']) await win.locator(`[data-testid=media-card][title="${n}"]`).dblclick();
await win.locator('[data-testid=clip]').first().click();
await win.getByRole('button', { name: '필터', exact: true }).click();
await win.locator('[data-testid=filter-film]').click();
await win.locator('[data-testid=transition-marker]').first().click();
await win.locator('[data-testid=transition-circleopen]').click();
await win.locator('[data-testid=clip]').first().click();
await win.getByRole('button', { name: '자막', exact: true }).click();
await win.locator('[data-testid=subtitle-add]').click();
await win.locator('[data-testid=subtitle-text]').fill('배포판 자막 시험');
await win.locator('[data-testid=subtitle-text]').blur();
await win.locator('[data-testid="subtitle-style-hand"]').click().catch(() => {});

// 자막 글꼴이 미리보기에서 실제로 읽히는지
const fonts = await win.evaluate(async () => {
  await document.fonts.ready;
  return [...document.fonts].filter((f) => f.family.includes('EzSub')).map((f) => `${f.family}:${f.status}`);
});
console.log('  자막 글꼴:', fonts.join(', '));
check(fonts.length > 0 && fonts.every((f) => !f.endsWith('error')), '동봉 자막 글꼴 읽기');

await win.locator('[data-testid=export-button]').click();
await win.locator('[data-testid=export-start]').click();
await Promise.race([
  win.locator('[data-testid=export-result]').waitFor({ timeout: 300000 }),
  win.locator('[data-testid=export-error]').waitFor({ timeout: 300000 })
]);
const failed = await win.locator('[data-testid=export-error]').count();
if (failed) console.log('  오류:', (await win.locator('[data-testid=export-error]').innerText()).slice(0, 600));
check(!failed, '배포판에서 영상 만들기 (필터·전환·자막 굽기·음악)');
const out = failed ? null : (await win.locator('[data-testid=export-result]').innerText()).match(/[A-Z]:\\[^\n]+\.mp4/)?.[0];
if (out && existsSync(out)) {
  const ffprobe = join(dir, 'resources', 'bin', 'ffprobe.exe');
  const d = Number(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString());
  console.log(`  결과 ${out} (${d.toFixed(2)}초)`);
  check(d > 5, '결과 파일 길이 정상');
}
await win.keyboard.press('Escape');

// 말소리 자막 (동봉 whisper + small 모델)
const speech = join(ROOT, 'tests', 'speech');
if (existsSync(speech)) {
  const wav = readdirSync(speech).find((f) => /\.(mp4|wav|m4a)$/.test(f));
  await win.evaluate((f) => window.__ezcut.importPaths([f]), join(speech, wav));
  await win.waitForFunction(
    (n) => window.__ezcut.useProjectStore.getState().project.media.find((m) => m.fileName === n)?.proxyStatus === 'ready',
    wav,
    { timeout: 120000 }
  );
  await win.locator(`[data-testid=media-card][title="${wav}"]`).dblclick();
  await win.locator('[data-testid=clip]').last().click();
  await win.getByRole('button', { name: '자막', exact: true }).click();
  await win.locator('[data-testid=speech-open]').click();
  await win.locator('[data-testid=speech-range-selected]').click();
  await win.locator('[data-testid=speech-start]').click();
  await win.locator('[data-testid=speech-overwrite]').click({ timeout: 2000 }).catch(() => {});
  const ok = await Promise.race([
    win.locator('[data-testid=speech-dialog]').waitFor({ state: 'detached', timeout: 180000 }).then(() => true),
    win.locator('[data-testid=speech-error]').waitFor({ timeout: 180000 }).then(() => false)
  ]);
  if (!ok) console.log('  오류:', await win.locator('[data-testid=speech-error]').innerText());
  p = await win.evaluate(() => window.__ezcut.useProjectStore.getState().project);
  console.log('  만든 자막:', p.subtitles.slice(1, 4).map((s) => s.text).join(' / '));
  check(ok && p.subtitles.length > 1, '배포판에서 말소리로 자막 만들기 (whisper)');
} else console.log('  (tests/speech 없음: 말소리 시험 건너뜀)');

await app.close();
if (errors.length) console.log('  오류 기록:', [...new Set(errors)].slice(0, 10).join('\n   '));
check(errors.length === 0, '화면 오류 없음');

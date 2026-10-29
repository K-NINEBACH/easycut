// M7: 장면 전환 — ◆ 누르기 → 전환 탭, 고르기·길이·모든 장면에 적용·너무 짧음 안내, 미리보기 섞임, 렌더 길이
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { launch, state, waitReady, check, FIXTURES, ROOT, tempDataDir } from './launch.mjs';

const ffprobe = existsSync(join(ROOT, 'resources', 'bin', 'ffprobe.exe')) ? join(ROOT, 'resources', 'bin', 'ffprobe.exe') : 'ffprobe';
const dataDir = tempDataDir('easycut-e2e-');
const shotDir = process.argv[2] ?? dataDir;
const { app, win } = await launch(dataDir);
await win.evaluate((dir) => window.__ezcut.importPaths([dir]), FIXTURES);
await waitReady(win);

const ids = Object.fromEntries((await state(win)).media.map((m) => [m.fileName, m.id]));
await win.evaluate((list) => {
  const { useProjectStore } = window.__ezcut;
  useProjectStore.getState().edit('add', (d) => {
    for (const [id, out] of list) {
      d.videoTrack.push({ id: crypto.randomUUID(), mediaId: id, inPoint: 0, outPoint: out, speed: 1, muted: false, volume: 1, fitMode: 'blur', filter: 'none', filterStrength: 1, adjust: { brightness: 0, contrast: 0, saturation: 0 } });
    }
  });
}, [[ids['landscape_h264_30.mp4'], 3], [ids['portrait_hevc_60.mov'], 3], [ids['vfr.mp4'], 3], [ids['noaudio.mp4'], 0.15], [ids['landscape_h264_30.mp4'], 2]]);
const total = () => win.evaluate(() => {
  const p = window.__ezcut.useProjectStore.getState().project;
  // 화면에 보이는 전체 시간 표시와 같은 값
  return document.querySelector('[data-testid=timeline-scroll]') ? p : null;
});
const totalSec = async () => {
  const p = await state(win);
  const lens = p.videoTrack.map((c) => (c.outPoint - c.inPoint) / c.speed);
  // 전환이 겹치는 만큼 뺀다 (짧은 장면은 자동 축소, 0.1초 미만이면 컷)
  let sum = lens.reduce((a, b) => a + b, 0);
  for (const t of p.transitions) {
    const i = p.videoTrack.findIndex((c) => c.id === t.afterClipId);
    if (i < 0 || i >= lens.length - 1) continue;
    const d = Math.min(t.duration, Math.min(lens[i], lens[i + 1]) / 2);
    if (d >= 0.1) sum -= d;
  }
  return sum;
};
void total;

const markers = win.locator('[data-testid=transition-marker]');
check((await markers.count()) === 4, `장면 사이 ◆ 4개 (${await markers.count()})`);

// ◆ 누르면 전환 탭
await markers.first().click();
await win.locator('[data-testid=transition-panel]').waitFor({ timeout: 3000 });
check(true, '◆ 를 누르면 전환 탭');
check((await win.locator('[data-testid^=transition-]').filter({ hasText: /./ }).count()) >= 10, '전환 카드 10개');

const before = await totalSec();
await win.locator('[data-testid=transition-fade]').click();
let p = await state(win);
check(p.transitions.length === 1 && p.transitions[0].type === 'fade' && p.transitions[0].duration === 0.6, '부드럽게 겹치기, 기본 길이 보통(0.6초)');
check(Math.abs((await totalSec()) - (before - 0.6)) < 1e-6, '전체 길이가 전환만큼 줄어듦');
check(await win.locator('[data-testid=transition-overlap]').first().isVisible(), '타임라인에 겹침 표시');

await win.locator('[data-testid=transition-duration-1]').click();
check((await state(win)).transitions[0].duration === 1, '길이 길게(1초)');

// 미리보기: 전환 가운데에서 두 장면이 섞여 보임 (가로 영상의 빨강 막대 자리 색이 순수 빨강이 아님)
const layoutStart = 3 - 1; // 두 번째 장면 시작 = 3 - 1(전환)
await win.evaluate((t) => window.__ezcut.useUiStore.getState().setPlayhead(t), layoutStart + 0.5);
await win.waitForTimeout(800);
await win.screenshot({ path: join(shotDir, 'm7-preview-fade.png') });

// 모든 장면에 적용 → 0.15초 장면 양옆은 너무 짧아서 빠짐
await win.locator('[data-testid=transition-slideleft]').click();
await win.locator('[data-testid=transition-apply-all]').click();
p = await state(win);
check(p.transitions.length === 4 && p.transitions.every((t) => t.type === 'slideleft'), `모든 장면에 적용 (${p.transitions.length}곳)`);
const toast = await win.locator('[data-testid=toast]').allInnerTexts();
check(toast.some((t) => t.includes('너무 짧은 2곳')), `너무 짧은 곳 안내: ${toast.at(-1)}`);
// 0.15초 장면 양옆 ◆ 는 기본 배율에선 겹치므로 확대해서 누른다
await win.evaluate(() => window.__ezcut.useUiStore.getState().setPxPerSec(250));
await markers.nth(2).click();
check(await win.locator('[data-testid=transition-too-short]').isVisible(), '짧은 장면 쪽 ◆: "너무 짧아서 넣을 수 없어요"');
await win.screenshot({ path: join(shotDir, 'm7-panel.png') });

// Delete 로 선택한 전환 없애기, Ctrl+Z
await win.evaluate(() => window.__ezcut.useUiStore.getState().setPxPerSec(40));
await markers.first().click();
await win.keyboard.press('Delete');
check((await state(win)).transitions.length === 3, 'Delete 로 전환 없애기');
await win.keyboard.press('Control+z');
check((await state(win)).transitions.length === 4, 'Ctrl+Z 로 되돌리기');

// 영상 만들기 → 길이 = 타임라인 계산
const expected = await totalSec();
await win.locator('[data-testid=export-button]').click();
await win.waitForFunction(() => document.querySelector('[data-testid=export-path]')?.textContent?.endsWith('.mp4'));
const out = (await win.locator('[data-testid=export-path]').innerText()).trim();
await win.locator('[data-testid=export-start]').click();
await win.locator('[data-testid=export-result]').waitFor({ timeout: 240000 });
const dur = Number(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }));
check(Math.abs(dur - expected) <= 0.1, `만든 영상 길이 ${dur.toFixed(2)}초 = 타임라인 ${expected.toFixed(2)}초`);
await app.close();

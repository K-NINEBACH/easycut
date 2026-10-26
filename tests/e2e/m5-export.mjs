// M5: 영상 만들기 창 → 컷 편집 영상 내보내기 (PRD F9). ffprobe 가 PATH 에 있거나 resources/bin 에 있어야 함
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, state, waitReady, check, FIXTURES, ROOT } from './launch.mjs';

const ffprobe = existsSync(join(ROOT, 'resources', 'bin', 'ffprobe.exe')) ? join(ROOT, 'resources', 'bin', 'ffprobe.exe') : 'ffprobe';
const dataDir = mkdtempSync(join(tmpdir(), 'easycut-e2e-'));
const shotDir = process.argv[2] ?? dataDir;
const { app, win } = await launch(dataDir);

check(await win.locator('[data-testid=export-button]').isDisabled(), '장면이 없으면 [영상 만들기] 꺼짐');

await win.evaluate((dir) => window.__ezcut.importPaths([dir]), FIXTURES);
await waitReady(win);
const ids = Object.fromEntries((await state(win)).media.map((m) => [m.fileName, m.id]));
await win.evaluate((list) => {
  const { useProjectStore } = window.__ezcut;
  useProjectStore.getState().edit('add', (d) => {
    for (const id of list) {
      const m = d.media.find((x) => x.id === id);
      const base = { id: crypto.randomUUID(), mediaId: id, speed: 1, muted: false, volume: 1, fitMode: 'blur', filter: 'none', filterStrength: 1, adjust: { brightness: 0, contrast: 0, saturation: 0 } };
      d.videoTrack.push(m.type === 'image' ? { ...base, inPoint: 0, outPoint: 2, imageDuration: 2 } : { ...base, inPoint: 1, outPoint: Math.min(3.5, m.duration) });
    }
  });
}, [ids['landscape_h264_30.mp4'], ids['portrait_hevc_60.mov'], ids['photo_portrait.png']]);
const expected = await win.evaluate(() =>
  window.__ezcut.useProjectStore.getState().project.videoTrack.reduce((a, c) => a + (c.imageDuration ?? (c.outPoint - c.inPoint) / c.speed), 0)
);

// Ctrl+E 로 창 열기
await win.locator('body').click({ position: { x: 5, y: 700 } }).catch(() => {});
await win.keyboard.press('Control+e');
await win.locator('[data-testid=export-dialog]').waitFor({ timeout: 3000 });
check(true, 'Ctrl+E 로 영상 만들기 창');
await win.waitForFunction(() => document.querySelector('[data-testid=export-path]')?.textContent?.endsWith('.mp4'));
const out = (await win.locator('[data-testid=export-path]').innerText()).trim();
check(out.includes(join('Videos', '쉬운편집')) && out.endsWith('.mp4'), `기본 저장 위치: ${out}`);

// Space 를 눌러도 뒤에서 재생되지 않음
await win.keyboard.press(' ');
check(!(await win.evaluate(() => window.__ezcut.useUiStore.getState().playing)), '창이 떠 있으면 편집 단축키 막힘');

// 취소
await win.locator('[data-testid=export-start]').click();
await win.locator('[data-testid=export-cancel]').waitFor();
check(await win.evaluate(() => window.__ezcut.useUiStore.getState().locked), '만드는 동안 편집 잠금');
await win.screenshot({ path: join(shotDir, 'm5-running.png') });
await win.locator('[data-testid=export-cancel]').click();
await win.locator('[data-testid=export-start]').waitFor({ timeout: 15000 });
check(!existsSync(out), '취소하면 만들다 만 파일 삭제');
check(!(await win.evaluate(() => window.__ezcut.useUiStore.getState().locked)), '취소 후 잠금 풀림');

// 유튜브용으로 만들기
const t0 = Date.now();
await win.locator('[data-testid=export-start]').click();
await win.locator('[data-testid=export-result]').waitFor({ timeout: 240000 });
check(existsSync(out), `영상 파일 생성 (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
await win.screenshot({ path: join(shotDir, 'm5-done.png') });
const info = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', out], { encoding: 'utf8' }));
const v = info.streams.find((s) => s.codec_type === 'video');
const a = info.streams.find((s) => s.codec_type === 'audio');
check(v.codec_name === 'h264' && v.width === 1920 && v.height === 1080 && v.r_frame_rate === '30/1', `1080p 30fps H.264 (${v.width}x${v.height} ${v.r_frame_rate})`);
check(a?.codec_name === 'aac', '소리 AAC');
check(Math.abs(Number(info.format.duration) - expected) <= 0.1, `길이 ${Number(info.format.duration).toFixed(2)}초 = 타임라인 ${expected.toFixed(2)}초`);

// 닫으면 다음 기본 이름은 겹치지 않게
await win.keyboard.press('Escape');
check(!(await win.locator('[data-testid=export-dialog]').isVisible()), 'Esc 로 닫기');
await win.locator('[data-testid=export-button]').click();
await win.waitForFunction((prev) => {
  const t = document.querySelector('[data-testid=export-path]')?.textContent ?? '';
  return t.endsWith('.mp4') && t !== prev;
}, out);
check((await win.locator('[data-testid=export-path]').innerText()).includes('(2).mp4'), '같은 이름이 있으면 (2) 붙임');
await app.close();

// 글꼴 21개 + 직접 고른 색: 글꼴마다 미리보기 자막과 결과 자막의 글자 영역을 비교 (PRD 13장 #14)
// 글꼴마다 크기 기준(ratio)·이름(family)이 맞아야 같은 자리·크기로 나온다
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { launch, state, waitReady, check, FIXTURES, ROOT, tempDataDir } from './launch.mjs';

const ffmpeg = existsSync(join(ROOT, 'resources', 'bin', 'ffmpeg.exe')) ? join(ROOT, 'resources', 'bin', 'ffmpeg.exe') : 'ffmpeg';
const dataDir = tempDataDir('easycut-fonts-');
const { app, win } = await launch(dataDir);
// 실패해도 앱을 꺼야 임시 폴더를 지울 수 있다
process.on('uncaughtException', async (e) => { console.error(e); process.exitCode = 1; await app.close().catch(() => {}); process.exit(1); });
await win.evaluate((dir) => window.__ezcut.importPaths([dir]), FIXTURES);
await waitReady(win);

// 사진 한 장을 길게 (배경이 움직이지 않아야 글자만 비교됨)
const photoId = (await state(win)).media.find((m) => m.fileName === 'photo_landscape.jpg').id;
const ids = await win.evaluate(() => window.__ezcut.fontIds);
check(Array.isArray(ids) && ids.length >= 21, `글꼴 ${ids?.length}개`);
await win.evaluate(([photoId, ids]) => {
  const { useProjectStore } = window.__ezcut;
  useProjectStore.getState().edit('test', (d) => {
    d.videoTrack.push({
      id: crypto.randomUUID(), mediaId: photoId, inPoint: 0, outPoint: ids.length, imageDuration: ids.length, speed: 1, muted: false, volume: 1,
      fitMode: 'blur', filter: 'none', filterStrength: 1, adjust: { brightness: 0, contrast: 0, saturation: 0 }
    });
    const clip = d.videoTrack[0].id;
    d.subtitles = ids.map((fontId, i) => ({
      id: crypto.randomUUID(), text: '여행 가나다 Abc 123', anchorClipId: clip, offset: i, duration: 1,
      styleOverride: { fontId, color: i % 2 ? '#FF8A3D' : '#3DDC97' }
    }));
    d.defaultSubtitleStyle = { presetId: 'basic', size: 'L', position: 'bottom' };
  });
}, [photoId, ids]);

const W = 384, H = 216;
const frame = win.locator('[data-testid=preview-canvas]').locator('..');
const fb = await frame.boundingBox();
const grab = async () => (await win.screenshot({ clip: fb })).toString('base64');
const boxOf = (x, base) => {
  let l = W, r = -1, t = H, btm = -1;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = (j * W + i) * 3;
    if (Math.abs(x[k] - base[k]) + Math.abs(x[k + 1] - base[k + 1]) + Math.abs(x[k + 2] - base[k + 2]) > 90) { l = Math.min(l, i); r = Math.max(r, i); t = Math.min(t, j); btm = Math.max(btm, j); }
  }
  return { l: l / W, r: (r + 1) / W, t: t / H, b: (btm + 1) / H };
};
const toRgb = (a) => win.evaluate(
  async ([src, W, H]) => {
    const i = await new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.src = 'data:image/png;base64,' + src; });
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.drawImage(i, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    const out = [];
    for (let k = 0; k < d.length; k += 4) out.push(d[k], d[k + 1], d[k + 2]);
    return out;
  },
  [a, W, H]
);

const preview = [];
await win.evaluate(() => window.__ezcut.useUiStore.getState().setPlayhead(0.5));
await win.waitForTimeout(3000);
for (let i = 0; i < ids.length; i++) {
  await win.evaluate((t) => window.__ezcut.useUiStore.getState().setPlayhead(t), i + 0.5);
  await win.waitForTimeout(500);
  const withSub = await toRgb(await grab());
  await win.evaluate(() => (document.querySelector('[data-testid=subtitle-overlay]').style.visibility = 'hidden'));
  const noSub = await toRgb(await grab());
  await win.evaluate(() => (document.querySelector('[data-testid=subtitle-overlay]').style.visibility = ''));
  preview.push(boxOf(withSub, noSub));
}

const exportWith = async (mode) => {
  await win.locator('[data-testid=export-button]').click();
  await win.waitForFunction(() => document.querySelector('[data-testid=export-path]')?.textContent?.endsWith('.mp4'));
  const out = (await win.locator('[data-testid=export-path]').innerText()).trim();
  if (mode) {
    await win.getByText('▸ 더 보기').click();
    await win.getByRole('button', { name: mode, exact: true }).click();
  }
  await win.locator('[data-testid=export-start]').click();
  await win.locator('[data-testid=export-result]').waitFor({ timeout: 300000 });
  await win.keyboard.press('Escape');
  return out;
};
const burned = await exportWith(null);
const plain = await exportWith('파일로 따로');
const raw = (file, t) => execFileSync(ffmpeg, ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
const fmt = (o) => Object.values(o).map((v) => v.toFixed(3)).join(',');
let worst = 0;
for (let i = 0; i < ids.length; i++) {
  const rb = boxOf(raw(burned, i + 0.5), raw(plain, i + 0.5));
  const d = Math.max(...['l', 'r', 't', 'b'].map((k) => Math.abs(preview[i][k] - rb[k])));
  worst = Math.max(worst, d);
  check(d < 0.02, `${ids[i]}: 미리보기 ${fmt(preview[i])} / 결과 ${fmt(rb)} (차이 ${(d * 100).toFixed(1)}%)`);
}
console.log(`  가장 큰 차이 ${(worst * 100).toFixed(1)}%`);
const st = await state(win);
check(st.subtitles.every((s) => s.styleOverride.fontId), '자막마다 글꼴 저장됨');
await app.close();

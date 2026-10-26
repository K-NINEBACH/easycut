// M6: 필터 — 필터마다 미리보기 화면과 만든 영상의 같은 프레임 색을 비교 (PRD F7 완료 조건)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, state, waitReady, check, FIXTURES, ROOT } from './launch.mjs';

const bin = (n) => (existsSync(join(ROOT, 'resources', 'bin', `${n}.exe`)) ? join(ROOT, 'resources', 'bin', `${n}.exe`) : n);
const dataDir = mkdtempSync(join(tmpdir(), 'easycut-e2e-'));
const shotDir = process.argv[2] ?? dataDir;
const { app, win } = await launch(dataDir);
await win.evaluate((dir) => window.__ezcut.importPaths([dir]), FIXTURES);
await waitReady(win);

const FILTERS = ['none', 'vivid', 'warm', 'cool', 'film', 'mono', 'bright', 'mood', 'forest'];
const ids = Object.fromEntries((await state(win)).media.map((m) => [m.fileName, m.id]));
// 같은 가로 영상 1~2초 구간을 필터만 바꿔 9번 + HDR 영상 1번.
// 샘플은 원색 100% 막대라 채도를 올리는 필터 효과가 안 보이므로, 가로 영상에는 채도·대비를 낮춘 보정을 똑같이 건다
await win.evaluate(([land, hdr, filters]) => {
  const { useProjectStore } = window.__ezcut;
  useProjectStore.getState().edit('add', (d) => {
    const base = (mediaId) => ({ id: crypto.randomUUID(), mediaId, inPoint: 1, outPoint: 2, speed: 1, muted: false, volume: 1, fitMode: 'blur', filterStrength: 1, adjust: { brightness: 0, contrast: 0, saturation: 0 } });
    for (const f of filters) d.videoTrack.push({ ...base(land), filter: f, adjust: { brightness: 0, contrast: -20, saturation: -30 } });
    d.videoTrack.push({ ...base(hdr), filter: 'none' });
  });
}, [ids['landscape_h264_30.mp4'], ids['hdr_hlg.mov'], FILTERS]);
const labels = [...FILTERS, 'HDR'];

// 192x108 로 줄인 뒤 12x12 칸 평균 (16x9 칸) — 미리보기·결과 같은 방식
const blocks = (rgb, w = 192, h = 108) => {
  const out = [];
  for (let by = 0; by < 9; by++)
    for (let bx = 0; bx < 16; bx++) {
      const s = [0, 0, 0];
      for (let y = 0; y < 12; y++)
        for (let x = 0; x < 12; x++) {
          const i = ((by * 12 + y) * w + bx * 12 + x) * 3;
          s[0] += rgb[i]; s[1] += rgb[i + 1]; s[2] += rgb[i + 2];
        }
      out.push(s.map((v) => v / 144));
    }
  return out;
};
const diff = (a, b) => a.reduce((acc, p, i) => acc + Math.abs(p[0] - b[i][0]) + Math.abs(p[1] - b[i][1]) + Math.abs(p[2] - b[i][2]), 0) / (a.length * 3);

// 미리보기: 각 장면 0.5초 지점
const preview = [];
for (let i = 0; i < labels.length; i++) {
  await win.evaluate((t) => window.__ezcut.useUiStore.getState().setPlayhead(t), i + 0.5);
  await win.waitForTimeout(700);
  const rgb = await win.evaluate(() => {
    const c = document.querySelector('[data-testid=preview-canvas]');
    const s = document.createElement('canvas');
    s.width = 192; s.height = 108;
    const g = s.getContext('2d');
    g.drawImage(c, 0, 0, 192, 108);
    const d = g.getImageData(0, 0, 192, 108).data;
    const out = [];
    for (let i = 0; i < d.length; i += 4) out.push(d[i], d[i + 1], d[i + 2]);
    return out;
  });
  preview.push(blocks(rgb));
  if (labels[i] === 'warm' || labels[i] === 'HDR') await win.screenshot({ path: join(shotDir, `m6-preview-${labels[i]}.png`) });
}

// 필터 탭 UI: 카드 9개, 고르면 바뀜, 되돌리기
await win.locator('[data-testid=clip]').first().click();
await win.getByRole('button', { name: '필터', exact: true }).click();
await win.locator('[data-testid=filter-film]').waitFor();
check((await win.locator('[data-testid^=filter-]').filter({ has: win.locator('img') }).count()) >= 9, '필터 카드 9개 (썸네일 미리보기)');
await win.locator('[data-testid=filter-film]').click();
check((await state(win)).videoTrack[0].filter === 'film', '카드를 누르면 필터 적용');
await win.screenshot({ path: join(shotDir, 'm6-panel.png') });
await win.keyboard.press('Control+z');
check((await state(win)).videoTrack[0].filter === 'none', 'Ctrl+Z 로 되돌리기');

// 영상 만들기
await win.locator('[data-testid=export-button]').click();
await win.waitForFunction(() => document.querySelector('[data-testid=export-path]')?.textContent?.endsWith('.mp4'));
const out = (await win.locator('[data-testid=export-path]').innerText()).trim();
await win.locator('[data-testid=export-start]').click();
await win.locator('[data-testid=export-result]').waitFor({ timeout: 240000 });

const results = [];
for (let i = 0; i < labels.length; i++) {
  const raw = execFileSync(bin('ffmpeg'), ['-v', 'error', '-ss', String(i + 0.5), '-i', out, '-frames:v', '1', '-vf', 'scale=192:108', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  const rendered = blocks(raw);
  results.push({ label: labels[i], d: diff(preview[i], rendered), vsNone: diff(rendered, preview[0]) });
}
console.log('  필터별 평균 색 차이 (0~255): ' + results.map((r) => `${r.label} ${r.d.toFixed(1)}`).join(', '));
for (const r of results) check(r.d < 6, `${r.label}: 미리보기 ≈ 결과 (차이 ${r.d.toFixed(1)})`);
// 비교가 의미 있는지: 필터를 넣으면 원본과는 확실히 달라야 함
for (const r of results.slice(1, 9)) check(r.vsNone > r.d * 2, `${r.label}: 원본과는 구별됨 (${r.vsNone.toFixed(1)})`);
await app.close();

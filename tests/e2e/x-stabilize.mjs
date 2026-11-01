// 흔들림 줄이기·영역 고정 + 타임라인 휠 (PRD 13장 #15·#16).
// 합성 영상으로: 미리보기에서 영역을 끌어 고르고 → 영상을 만든 뒤 표식이 실제로 얼마나 고정됐는지 프레임마다 잰다.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { launch, state, waitReady, check, ROOT, tempDataDir } from './launch.mjs';

const bin = (n) => (existsSync(join(ROOT, 'resources', 'bin', `${n}.exe`)) ? join(ROOT, 'resources', 'bin', `${n}.exe`) : n);
const ff = (...a) => execFileSync(bin('ffmpeg'), ['-v', 'error', '-y', ...a], { maxBuffer: 1 << 30 });
const dataDir = tempDataDir('easycut-stab-');
const shotDir = process.argv[2] ?? dataDir;

// 무늬 배경, 빨간 표식 (안쪽에 흰 칸)
const bg = join(dataDir, 'bg.png');
const mark = join(dataDir, 'mark.png');
ff('-f', 'lavfi', '-i', "nullsrc=s=2000x1200,geq=lum='128+60*sin(X/23)*cos(Y/17)+50*sin((X+Y)/7)':cb=128:cr=128", '-frames:v', '1', bg);
ff('-f', 'lavfi', '-i', 'color=red:s=80x80,drawbox=x=20:y=20:w=40:h=40:color=white:t=fill', '-frames:v', '1', mark);
const lockSrc = join(dataDir, 'lock.mp4');
const shakeSrc = join(dataDir, 'shake.mp4');
const enc = ['-t', '5', '-r', '30', '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p'];
ff('-loop', '1', '-r', '30', '-i', bg, '-loop', '1', '-r', '30', '-i', mark, '-filter_complex',
  "[0][1]overlay=x='960+300*sin(t*1.5)':y='560+150*cos(t*1.1)',crop=1280:720:360:240", ...enc, lockSrc);
ff('-loop', '1', '-r', '30', '-i', bg, '-loop', '1', '-r', '30', '-i', mark, '-filter_complex',
  "[0][1]overlay=960:560,crop=1280:720:x='360+14*sin(n*1.7)+9*sin(n*0.9)':y='240+10*cos(n*2.3)'", ...enc, shakeSrc);

const { app, win } = await launch(dataDir);
await win.evaluate((p) => window.__ezcut.importPaths(p), [lockSrc, shakeSrc]);
await waitReady(win);
const ids = Object.fromEntries((await state(win)).media.map((m) => [m.fileName, m.id]));
await win.evaluate(([a, b, c]) => {
  window.__ezcut.useProjectStore.getState().edit('add', (d) => {
    const base = (mediaId) => ({ id: crypto.randomUUID(), mediaId, inPoint: 0, outPoint: 5, speed: 1, muted: false, volume: 1, fitMode: 'blur', filter: 'none', filterStrength: 1, adjust: { brightness: 0, contrast: 0, saturation: 0 } });
    d.videoTrack.push(base(a), base(b), { ...base(b) });
  });
}, [ids['lock.mp4'], ids['shake.mp4']]);

// --- 휠 ---
await win.evaluate(() => window.__ezcut.useUiStore.getState().setPxPerSec(120));
const scroller = win.locator('[data-testid=timeline-scroll]');
const sb = await scroller.boundingBox();
await win.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
const left = () => scroller.evaluate((e) => e.scrollLeft);
await win.mouse.wheel(0, 300);
await win.waitForTimeout(150);
check((await left()) >= 250, `휠을 내리면 오른쪽으로 (${await left()})`);
await win.mouse.wheel(0, -300);
await win.waitForTimeout(150);
check((await left()) < 50, `휠을 올리면 왼쪽으로 (${await left()})`);
const pps0 = await win.evaluate(() => window.__ezcut.useUiStore.getState().pxPerSec);
await win.keyboard.down('Control');
await win.mouse.wheel(0, -200);
await win.keyboard.up('Control');
await win.waitForTimeout(150);
check((await win.evaluate(() => window.__ezcut.useUiStore.getState().pxPerSec)) > pps0, 'Ctrl+휠은 그대로 확대');
await win.evaluate(() => window.__ezcut.useUiStore.getState().setPxPerSec(40));
await win.waitForTimeout(200);

// --- 영역 고정: 표식을 끌어 고른다 (0초: 화면의 600~680, 470~550 / 1280x720) ---
const clips = win.locator('[data-testid=clip]');
await clips.nth(0).click();
await win.evaluate(() => window.__ezcut.useUiStore.getState().setPlayhead(0));
await win.waitForTimeout(800);
await win.screenshot({ path: join(shotDir, 'stab-panel.png') });
await win.locator('[data-testid=stab-lock]').click();
await win.locator('[data-testid=region-picker]').waitFor();
const c = await win.locator('[data-testid=preview-canvas]').boundingBox();
const px = (x, y) => [c.x + (x / 1280) * c.width, c.y + (y / 720) * c.height];
await win.mouse.move(...px(596, 466));
await win.mouse.down();
await win.mouse.move(...px(640, 510), { steps: 4 });
await win.mouse.move(...px(684, 554), { steps: 4 });
await win.screenshot({ path: join(shotDir, 'stab-pick.png') });
await win.mouse.up();
await win.waitForFunction(() => window.__ezcut.useProjectStore.getState().project.videoTrack[0].stabilize, null, { timeout: 120000 });
const lockSt = (await state(win)).videoTrack[0].stabilize;
console.log(`  영역 고정: 표본 ${lockSt.path.length / 2}개, 확대 ${lockSt.zoom}, 놓침 ${lockSt.lost}`);
check(lockSt.mode === 'lock' && lockSt.path.length / 2 >= 148, '경로가 장면 전체를 덮는다');
check(lockSt.lost === 0, '놓친 구간 없음');
// 실제 표식 가운데와 비교 (프레임 i)
let worst = 0;
for (let i = 0; i < lockSt.path.length / 2; i += 7) {
  const t = i / 30;
  const x = (600 + 300 * Math.sin(t * 1.5) + 40) / 1280;
  const y = (320 + 150 * Math.cos(t * 1.1) + 40) / 720;
  worst = Math.max(worst, Math.abs(lockSt.path[i * 2] - x) * 1280, Math.abs(lockSt.path[i * 2 + 1] - y) * 720);
}
console.log(`  따라가기 가장 큰 오차 ${worst.toFixed(1)}px (1280 기준)`);
check(worst < 8, '따라간 경로 ≈ 표식 실제 위치');

// --- 흔들림 줄이기 (장면 2) ---
await clips.nth(1).click();
await win.locator('[data-testid=stab-shake]').click();
await win.waitForFunction(() => window.__ezcut.useProjectStore.getState().project.videoTrack[1].stabilize, null, { timeout: 120000 });
const shakeSt = (await state(win)).videoTrack[1].stabilize;
console.log(`  흔들림: 확대 ${shakeSt.zoom}`);
await win.screenshot({ path: join(shotDir, 'stab-on.png') });

// 표식 가운데 찾기 (RGB 320x180 한 장)
const centroid = (rgb, w, h) => {
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      if (rgb[i] > 170 && rgb[i + 1] < 90 && rgb[i + 2] < 90) { sx += x; sy += y; n++; }
    }
  return n ? { x: sx / n, y: sy / n, n } : null;
};
const W = 480, H = 270;

// 미리보기 표식 위치 (멈춘 화면 몇 곳)
const previewAt = async (t) => {
  await win.evaluate((v) => window.__ezcut.useUiStore.getState().setPlayhead(v), t);
  await win.waitForTimeout(500);
  return win.evaluate(([w, h]) => {
    const s = document.createElement('canvas');
    s.width = w; s.height = h;
    const g = s.getContext('2d');
    g.drawImage(document.querySelector('[data-testid=preview-canvas]'), 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    const out = [];
    for (let i = 0; i < d.length; i += 4) out.push(d[i], d[i + 1], d[i + 2]);
    return out;
  }, [W, H]);
};
const pv = [];
for (const t of [0.5, 2, 3.7]) pv.push({ t, c: centroid(await previewAt(t), W, H) });

// --- 영상 만들기 ---
await win.locator('[data-testid=export-button]').click();
await win.waitForFunction(() => document.querySelector('[data-testid=export-path]')?.textContent?.endsWith('.mp4'));
const out = (await win.locator('[data-testid=export-path]').innerText()).trim();
await win.locator('[data-testid=export-start]').click();
await win.locator('[data-testid=export-result]').waitFor({ timeout: 240000 });

const framesOf = (from, to) => {
  const raw = ff('-ss', String(from), '-t', String(to - from), '-i', out, '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1');
  const list = [];
  for (let i = 0; i + W * H * 3 <= raw.length; i += W * H * 3) list.push(centroid(raw.subarray(i, i + W * H * 3), W, H));
  return list;
};
const spread = (a, k) => {
  const v = a.filter(Boolean).map((p) => p[k]);
  const m = v.reduce((x, y) => x + y, 0) / v.length;
  return Math.sqrt(v.reduce((x, y) => x + (y - m) ** 2, 0) / v.length);
};
// 프레임 사이 평균 이동
const jitter = (a) => {
  const v = a.filter(Boolean);
  let s = 0;
  for (let i = 1; i < v.length; i++) s += Math.hypot(v[i].x - v[i - 1].x, v[i].y - v[i - 1].y);
  return s / (v.length - 1);
};

const scale = 1280 / W;
const locked = framesOf(0.2, 4.8);
check(locked.filter(Boolean).length > 120, `고정 결과: 표식이 계속 보인다 (${locked.filter(Boolean).length}프레임)`);
console.log(`  고정 결과 표식 흩어짐 x ${(spread(locked, 'x') * scale).toFixed(1)}, y ${(spread(locked, 'y') * scale).toFixed(1)} (1280 기준 픽셀, 원래 x 약 210, y 약 105)`);
for (const k of ['x', 'y']) check(spread(locked, k) * scale < 45, `고정 결과 ${k} 흩어짐이 작다`);

const shaky = framesOf(10.3, 14.7); // 보정 끈 장면 (아래에서 비교용은 장면 3)
const fixed = framesOf(5.3, 9.7);
const jf = jitter(fixed) * scale;
const js = jitter(shaky) * scale;
console.log(`  프레임 사이 평균 이동: 보정 전 ${js.toFixed(1)}px → 보정 후 ${jf.toFixed(1)}px`);
check(jf < js * 0.3, '흔들림이 70% 넘게 줄었다');

// 미리보기 ≈ 결과
for (const { t, c: p } of pv) {
  const r = ff('-ss', String(t), '-i', out, '-frames:v', '1', '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1');
  const q = centroid(r, W, H);
  const d = p && q ? Math.hypot(p.x - q.x, p.y - q.y) * scale : Infinity;
  check(d < 12, `${t}초 미리보기 ≈ 결과 (표식 위치 차이 ${d.toFixed(1)}px)`);
}
await app.close();

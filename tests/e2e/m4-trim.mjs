// M4: 앞뒤 자르기 손잡이, 나누기(S), 속도, 소리, 사진 길이, 모두 되돌리기 가능 (PRD F3)
import { join } from 'node:path';
import { launch, state, waitReady, check, FIXTURES, tempDataDir } from './launch.mjs';

const dataDir = tempDataDir('easycut-e2e-');
const shotDir = process.argv[2] ?? dataDir;
const { app, win } = await launch(dataDir);
await win.evaluate((dir) => window.__ezcut.importPaths([dir]), FIXTURES);
await waitReady(win);

const ids = Object.fromEntries((await state(win)).media.map((m) => [m.fileName, m.id]));
await win.evaluate((list) => {
  const { useProjectStore } = window.__ezcut;
  useProjectStore.getState().edit('add', (d) => {
    for (const id of list) {
      const m = d.media.find((x) => x.id === id);
      const base = { id: crypto.randomUUID(), mediaId: id, speed: 1, muted: false, volume: 1, fitMode: 'blur', filter: 'none', filterStrength: 1, adjust: { brightness: 0, contrast: 0, saturation: 0 } };
      d.videoTrack.push(m.type === 'image' ? { ...base, inPoint: 0, outPoint: 3, imageDuration: 3 } : { ...base, inPoint: 0, outPoint: m.duration });
    }
  });
}, [ids['landscape_h264_30.mp4'], ids['vfr.mp4'], ids['photo_landscape.jpg']]);

const clip0 = async () => (await state(win)).videoTrack[0];
const pastLen = () => win.evaluate(() => window.__ezcut.useProjectStore.getState().past.length);
const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;
const pps = await win.evaluate(() => window.__ezcut.useUiStore.getState().pxPerSec);

// 장면 클릭 → 꾸미기 패널이 자르기 탭으로
await win.locator('[data-testid=clip]').first().click();
check(await win.locator('[data-testid=range-bar]').isVisible(), '장면 선택 시 자르기 탭 표시');

// 손잡이 드래그 도우미: 도중에 미리보기 프레임 표시 여부도 확인
const dragHandle = async (testId, dx) => {
  const b = await win.locator(`[data-testid=${testId}]`).boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await win.mouse.move(x, y);
  await win.mouse.down();
  await win.mouse.move(x + dx / 2, y, { steps: 5 });
  const scrub = await win.evaluate(() => window.__ezcut.useUiStore.getState().scrub);
  await win.mouse.move(x + dx, y, { steps: 5 });
  await win.mouse.up();
  return scrub;
};

// 1) 타임라인 손잡이로 앞 1초, 뒤 1초 자르기
const before = await pastLen();
const scrubIn = await dragHandle('trim-in', pps);
let c = await clip0();
check(scrubIn !== null && scrubIn.sourceTime > 0, `자르는 동안 미리보기에 손잡이 위치 프레임 (${scrubIn?.sourceTime?.toFixed(2)}s)`);
check(near(c.inPoint, 1), `앞 손잡이로 앞부분 자르기 (in=${c.inPoint.toFixed(3)})`);
check((await pastLen()) === before + 1, '드래그 한 번 = 되돌리기 1단계');
const total = (await state(win)).media.find((m) => m.id === c.mediaId).duration;
await dragHandle('trim-out', -pps);
c = await clip0();
check(near(c.outPoint, total - 1), `뒤 손잡이로 뒷부분 자르기 (out=${c.outPoint.toFixed(3)})`);
check((await win.evaluate(() => window.__ezcut.useUiStore.getState().scrub)) === null, '손을 떼면 미리보기 프레임 원래대로');

// 2) 원본보다 길게 늘릴 수 없음, 최소 0.5초
await dragHandle('trim-in', -pps * 3);
check((await clip0()).inPoint === 0, '원본 시작보다 앞으로 늘릴 수 없음');
await dragHandle('trim-out', -pps * 20);
c = await clip0();
check(near(c.outPoint - c.inPoint, 0.5, 0.001), `최소 길이 0.5초 (${(c.outPoint - c.inPoint).toFixed(3)})`);
await win.keyboard.press('Control+z');
await win.keyboard.press('Control+z');
c = await clip0();
check(near(c.inPoint, 1) && near(c.outPoint, total - 1), `Ctrl+Z 로 자르기 되돌리기 (${c.inPoint.toFixed(2)}~${c.outPoint.toFixed(2)})`);

// 3) 자른 장면 재생: 시작에서 원본 1초 지점이 나와야 함 (±1프레임)
await win.evaluate(() => window.__ezcut.useUiStore.getState().setPlayhead(0));
await win.waitForTimeout(700);
const times = await win.evaluate(() => Array.from(document.querySelectorAll('video')).map((v) => v.currentTime));
check(times.some((t) => Math.abs(t - 1) <= 1 / 30 + 1e-3), `자른 장면 시작 = 원본 1초 (${times.map((t) => t.toFixed(3))})`);

// 4) 패널 바 손잡이로도 자르기
const bar = await win.locator('[data-testid=range-bar]').boundingBox();
await dragHandle('range-in', (bar.width / total) * 0.5);
check(near((await clip0()).inPoint, 1.5, 0.08), `패널 바로 시작 지점 조절 (in=${(await clip0()).inPoint.toFixed(3)})`);
await win.screenshot({ path: join(shotDir, 'm4-trim.png') });

// 5) 속도 2배 → 장면 길이 절반, 재생 속도 2배 (음높이 유지)
c = await clip0();
await win.locator('[data-testid=speed-2]').click();
const lenOf = () =>
  win.evaluate(() => {
    const p = window.__ezcut.useProjectStore.getState().project;
    const c = p.videoTrack[0];
    return (c.outPoint - c.inPoint) / c.speed;
  });
check((await clip0()).speed === 2 && near(await lenOf(), (c.outPoint - c.inPoint) / 2, 0.001), `2배속: 길이 ${(await lenOf()).toFixed(2)}초`);

await win.locator('[data-testid=play-clip]').click();
await win.waitForTimeout(400);
const rate = await win.evaluate(() =>
  Array.from(document.querySelectorAll('video')).filter((v) => !v.paused).map((v) => [v.playbackRate, v.preservesPitch])
);
check(rate.some(([r, p]) => r === 2 && p === true), `재생 속도 2배, 음높이 유지 (${JSON.stringify(rate)})`);
await win.waitForFunction(() => !window.__ezcut.useUiStore.getState().playing, null, { timeout: 10000 });
const ph = await win.evaluate(() => window.__ezcut.useUiStore.getState().playhead);
check(near(ph, await lenOf(), 0.1), `[이 장면만 재생] 장면 끝에서 멈춤 (${ph.toFixed(2)}s)`);

// 6) 소리 끄기, 볼륨 150%
await win.locator('[data-testid=mute-toggle]').click();
check((await clip0()).muted === true, '소리 끄기');
await win.locator('[data-testid=mute-toggle]').click();
const pv = await pastLen();
await win.locator('[data-testid=volume]').fill('150');
await win.locator('[data-testid=volume]').blur();
check((await clip0()).volume === 1.5 && (await pastLen()) === pv + 1, `볼륨 150% (되돌리기 1단계)`);

// 7) S 키로 나누기 (재생 위치 아래 장면)
await win.evaluate(() => {
  window.__ezcut.useUiStore.getState().select(null);
  window.__ezcut.useUiStore.getState().setPlayhead(0.75);
  document.activeElement?.blur();
});
c = await clip0();
await win.keyboard.press('s');
let p = await state(win);
check(p.videoTrack.length === 4, `S 키로 나누기 (장면 ${p.videoTrack.length}개)`);
check(near(p.videoTrack[0].outPoint, c.inPoint + 0.75 * 2, 0.001) && near(p.videoTrack[1].inPoint, p.videoTrack[0].outPoint, 1e-9),
  `나눈 지점 정확 (${p.videoTrack[0].outPoint.toFixed(3)} / ${p.videoTrack[1].inPoint.toFixed(3)})`);
await win.keyboard.press('Control+z');
check((await state(win)).videoTrack.length === 3, 'Ctrl+Z 로 나누기 되돌리기');

// 8) 사진 길이 1~10초
await win.locator('[data-testid=clip]').nth(2).click();
await win.locator('[data-testid=image-duration]').fill('6');
await win.locator('[data-testid=image-duration]').blur();
p = await state(win);
check(p.videoTrack[2].imageDuration === 6, `사진 길이 6초 (${p.videoTrack[2].imageDuration})`);
await win.screenshot({ path: join(shotDir, 'm4-photo.png') });

// 9) 장면을 넣은 직후 상태까지 전부 되돌리기
while ((await pastLen()) > 1) await win.keyboard.press('Control+z');
p = await state(win);
check(p.videoTrack.length === 3 && p.videoTrack[0].inPoint === 0 && p.videoTrack[0].speed === 1 && p.videoTrack[0].volume === 1 && p.videoTrack[2].imageDuration === 3,
  '모든 동작 Ctrl+Z 로 되돌리기');
await app.close();

// M3: 미리보기 — 프레임 표시, 세로 영상 흐린 배경, 클립 경계에서 멈춤 없는 재생
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
      d.videoTrack.push(m.type === 'image' ? { ...base, inPoint: 0, outPoint: 2, imageDuration: 2 } : { ...base, inPoint: 0, outPoint: Math.min(3, m.duration) });
    }
  });
}, [ids['landscape_h264_30.mp4'], ids['portrait_hevc_60.mov'], ids['photo_portrait.png'], ids['vfr.mp4'], ids['hdr_hlg.mov']]);

// 캔버스 축소본 픽셀 읽기
const sample = (x, y) =>
  win.evaluate(([x, y]) => {
    const c = document.querySelector('[data-testid=preview-canvas]');
    const s = document.createElement('canvas');
    s.width = 192; s.height = 108;
    const g = s.getContext('2d');
    g.drawImage(c, 0, 0, 192, 108);
    return Array.from(g.getImageData(x, y, 1, 1).data.slice(0, 3));
  }, [x, y]);
const seek = async (t) => {
  await win.evaluate((t) => window.__ezcut.useUiStore.getState().setPlayhead(t), t);
  await win.waitForTimeout(600);
};

await seek(1);
const center = await sample(96, 54);
check(center.some((v) => v > 30), `가로 영상 프레임 표시 ${center}`);
await win.screenshot({ path: join(shotDir, 'm3-landscape.png') });

await seek(4);
const edge = await sample(10, 54);
const mid = await sample(96, 54);
check(edge.some((v) => v > 20), `세로 영상 옆 흐린 배경 ${edge}`);
check(mid.some((v) => v > 30), `세로 영상 가운데 ${mid}`);
await win.screenshot({ path: join(shotDir, 'm3-portrait.png') });

await seek(7);
check((await sample(96, 54)).some((v) => v > 30), '세로 사진 표시');
await seek(12);
check((await sample(96, 54)).some((v) => v > 30), 'HDR 영상 표시');
await win.screenshot({ path: join(shotDir, 'm3-hdr.png') });

// 재생: 0~8.5초 (클립 경계 3초, 6초, 8초 포함) 동안 영상이 멈추는 구간 측정.
// 소프트웨어 렌더링이라 화면 갱신은 느리므로, <video> 의 재생 위치가 계속 진행하는지로 판단한다.
await seek(0);
const result = await win.evaluate(async () => {
  const { useUiStore } = window.__ezcut;
  const videos = Array.from(document.querySelectorAll('video'));
  document.querySelector('[data-testid=play-button]').click();
  let frames = 0;
  const countFrames = () => { frames++; if (useUiStore.getState().playing) requestAnimationFrame(countFrames); };
  requestAnimationFrame(countFrames);
  const samples = [];
  const t0 = performance.now();
  while (useUiStore.getState().playhead < 8.5 && performance.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 20));
    samples.push({ t: performance.now(), ph: useUiStore.getState().playhead, v: videos.map((v) => v.currentTime) });
  }
  useUiStore.getState().setPlaying(false);
  const elapsed = (performance.now() - t0) / 1000;
  let worst = 0, worstAt = 0, runStart = samples[0];
  for (let i = 1; i < samples.length; i++) {
    const moved = samples[i].v.some((x, k) => x !== samples[i - 1].v[k]);
    const photo = samples[i].ph > 6 && samples[i].ph < 8;
    if (moved || photo) runStart = samples[i];
    else if (samples[i].t - runStart.t > worst) { worst = samples[i].t - runStart.t; worstAt = runStart.ph; }
  }
  return { worst: worst / 1000, worstAt, elapsed, fps: frames / elapsed };
});
check(result.worst < 0.2, `가장 긴 멈춤 ${result.worst.toFixed(3)}초 (위치 ${result.worstAt.toFixed(2)}s)`);
console.log(`  재생 8.5초에 실제 ${result.elapsed.toFixed(2)}초, 화면 갱신 ${result.fps.toFixed(1)}fps (GPU 없는 소프트웨어 렌더링 기준)`);
await app.close();

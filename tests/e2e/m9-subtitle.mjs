// M9a: 자막 직접 넣기·옮기기·모양·목록·.srt, 미리보기 자막과 결과 자막의 위치·크기 비교 (PRD F4)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, state, waitReady, check, FIXTURES, ROOT, tempDataDir } from './launch.mjs';

const ffmpeg = existsSync(join(ROOT, 'resources', 'bin', 'ffmpeg.exe')) ? join(ROOT, 'resources', 'bin', 'ffmpeg.exe') : 'ffmpeg';
const dataDir = tempDataDir('easycut-e2e-');
const shotDir = process.argv[2] ?? dataDir;
const { app, win } = await launch(dataDir);
await win.evaluate((dir) => window.__ezcut.importPaths([dir]), FIXTURES);
await waitReady(win);

const card = (name) => win.locator(`[data-testid=media-card][title="${name}"]`);
await card('noaudio.mp4').dblclick();
await card('landscape_h264_30.mp4').dblclick();
const subs = async () => (await state(win)).subtitles;

// 1) 자막 추가 → 바로 입력
await win.evaluate(() => window.__ezcut.useUiStore.getState().setPlayhead(1));
await win.getByRole('button', { name: '자막', exact: true }).click();
await win.locator('[data-testid=subtitle-add]').click();
await win.waitForTimeout(100);
check(await win.locator('[data-testid=subtitle-text]').evaluate((el) => el === document.activeElement), '[＋ 자막 추가] 하면 바로 입력 상태');
const before = await win.evaluate(() => window.__ezcut.useProjectStore.getState().past.length);
await win.keyboard.type('가나다라마바사 자막 비교 테스트');
await win.locator('[data-testid=subtitle-text]').blur();
let s = await subs();
check(s.length === 1 && s[0].text === '가나다라마바사 자막 비교 테스트' && s[0].duration === 3, `3초짜리 자막 (${s[0]?.duration}초)`);
check((await win.evaluate(() => window.__ezcut.useProjectStore.getState().past.length)) === before + 1, '글 입력 = 되돌리기 1단계');

// 2) 자막 줄에서 끌어서 옮기기 / 끝 늘리기
const pps = await win.evaluate(() => window.__ezcut.useUiStore.getState().pxPerSec);
const block = win.locator('[data-testid=subtitle-block]').first();
let b = await block.boundingBox();
await win.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
await win.mouse.down();
await win.mouse.move(b.x + b.width / 2 + pps * 5, b.y + b.height / 2, { steps: 8 });
await win.mouse.up();
s = await subs();
const p1 = await state(win);
check(s[0].anchorClipId === p1.videoTrack[1].id && Math.abs(s[0].offset - 1) < 0.1, `끌어서 옮기면 다음 장면에 붙음 (offset ${s[0].offset.toFixed(2)})`);
await win.keyboard.press('Control+z');
s = await subs();
check(s[0].anchorClipId === p1.videoTrack[0].id && Math.abs(s[0].offset - 1) < 0.01, 'Ctrl+Z 로 되돌리기');
b = await block.boundingBox();
const h = await win.locator('[data-testid=subtitle-handle-end]').boundingBox();
await win.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
await win.mouse.down();
await win.mouse.move(h.x + h.width / 2 - pps * 1, h.y + h.height / 2, { steps: 5 });
await win.mouse.up();
check(Math.abs((await subs())[0].duration - 2) < 0.1, `끝을 끌어 길이 조절 (${(await subs())[0].duration.toFixed(2)}초)`);

// 3) 겹치지 않게: 같은 자리에 하나 더 넣으면 뒤로
await win.evaluate(() => window.__ezcut.useUiStore.getState().setPlayhead(1.5));
await win.locator('[data-testid=subtitle-add]').click();
await win.keyboard.type('둘째 자막');
await win.locator('[data-testid=subtitle-text]').blur();
s = (await subs()).sort((a, b) => a.offset - b.offset);
check(s.length === 2 && Math.abs(s[1].offset - 3) < 0.01, `겹치면 뒤로 밀림 (${s[1].offset})`);

// 4) 목록: 합치기·글 고치기
check((await win.locator('[data-testid=subtitle-row]').count()) === 2, '자막 목록 2개');
await win.locator('[data-testid=subtitle-merge]').first().click();
s = await subs();
check(s.length === 1 && s[0].text === '가나다라마바사 자막 비교 테스트 둘째 자막', '두 항목 합치기');
await win.keyboard.press('Control+z');
check((await subs()).length === 2, '합치기 되돌리기');

// 5) 모양: 모든 자막 노랑 → 둘째 자막만 제목형(위)
await win.locator('[data-testid=subtitle-style-yellow]').click();
check((await state(win)).defaultSubtitleStyle.presetId === 'yellow', '모양 카드 → 모든 자막');
await win.locator('[data-testid=subtitle-row]').nth(1).locator('button').first().click();
await win.evaluate(() => window.__ezcut.useUiStore.getState().setPlaying(false));
await win.locator('[data-testid=subtitle-only-this]').check();
await win.locator('[data-testid=subtitle-style-title]').click();
s = (await subs()).sort((a, b) => a.offset - b.offset);
check(s[1].styleOverride?.presetId === 'title' && s[1].styleOverride?.position === 'top' && !s[0].styleOverride, '이 자막만 제목형(위쪽)');
await win.screenshot({ path: join(shotDir, 'm9-panel.png') });

// 6) .srt 저장 (저장 창은 테스트에서 자동 응답)
const srtPath = join(dataDir, '자막.srt');
await app.evaluate(({ dialog }, path) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
}, srtPath);
await win.locator('[data-testid=subtitle-save-srt]').click();
await win.waitForTimeout(500);
const srt = existsSync(srtPath) ? readFileSync(srtPath, 'utf8') : '';
check(srt.startsWith('1\n00:00:01,000 --> 00:00:03,000\n가나다라마바사 자막 비교 테스트\n\n2\n00:00:03,000'), `.srt 저장 (${JSON.stringify(srt.slice(0, 40))})`);

// 7) 미리보기 ↔ 결과: 첫 자막(노랑, 아래)의 글자 영역 비교
await win.evaluate(() => window.__ezcut.useUiStore.getState().setPlayhead(2));
await win.waitForTimeout(800);
const frame = win.locator('[data-testid=preview-canvas]').locator('..');
const fb = await frame.boundingBox();
const grab = async () => (await win.screenshot({ clip: fb })).toString('base64');
// 자막을 숨겼을 때와 비교해 글자 영역을 0~1 비율 상자로 (화면 크기가 달라도 비교 가능)
const W = 384, H = 216;
const previewBoxNow = async () => {
  const withSub = await grab();
  await win.evaluate(() => document.querySelector('[data-testid=subtitle-overlay]').style.visibility = 'hidden');
  const noSub = await grab();
  await win.evaluate(() => document.querySelector('[data-testid=subtitle-overlay]').style.visibility = '');
  return win.evaluate(
    async ([a, b, W, H]) => {
      const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + src; });
      const px = async (src) => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d'); g.drawImage(await load(src), 0, 0, W, H);
        return g.getImageData(0, 0, W, H).data;
      };
      const [x, y] = [await px(a), await px(b)];
      let l = W, r = -1, t = H, btm = -1;
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const k = (j * W + i) * 4;
        if (Math.abs(x[k] - y[k]) + Math.abs(x[k + 1] - y[k + 1]) + Math.abs(x[k + 2] - y[k + 2]) > 90) { l = Math.min(l, i); r = Math.max(r, i); t = Math.min(t, j); btm = Math.max(btm, j); }
      }
      return { l: l / W, r: (r + 1) / W, t: t / H, b: (btm + 1) / H };
    },
    [withSub, noSub, W, H]
  );
};
const previewBox = await previewBoxNow();

const exportWith = async (mode) => {
  await win.locator('[data-testid=export-button]').click();
  await win.waitForFunction(() => document.querySelector('[data-testid=export-path]')?.textContent?.endsWith('.mp4'));
  const out = (await win.locator('[data-testid=export-path]').innerText()).trim();
  if (mode) {
    await win.getByText('▸ 더 보기').click();
    await win.getByRole('button', { name: mode, exact: true }).click();
  }
  await win.locator('[data-testid=export-start]').click();
  await win.locator('[data-testid=export-result]').waitFor({ timeout: 240000 });
  const srtShown = await win.locator('[data-testid=export-srt]').isVisible();
  await win.keyboard.press('Escape');
  return { out, srtShown };
};
const burned = await exportWith(null);
const fileOnly = await exportWith('파일로 따로');
check(fileOnly.srtShown && existsSync(fileOnly.out.replace(/\.mp4$/, '.srt')), '"파일로 따로" → 영상 옆에 .srt');
const raw = (file) => execFileSync(ffmpeg, ['-v', 'error', '-ss', '2', '-i', file, '-frames:v', '1', '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
const plain = raw(fileOnly.out); // 자막을 굽지 않은 영상 = 비교 기준
const renderBoxOf = (file) => {
  const x = raw(file);
  let l = W, r = -1, t = H, btm = -1;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = (j * W + i) * 3;
    if (Math.abs(x[k] - plain[k]) + Math.abs(x[k + 1] - plain[k + 1]) + Math.abs(x[k + 2] - plain[k + 2]) > 90) { l = Math.min(l, i); r = Math.max(r, i); t = Math.min(t, j); btm = Math.max(btm, j); }
  }
  return { l: l / W, r: (r + 1) / W, t: t / H, b: (btm + 1) / H };
};
const fmt = (o) => Object.values(o).map((v) => v.toFixed(3)).join(',');
const compare = (name, pv, rb) => {
  console.log(`  ${name} 글자 영역 (왼,오,위,아래 비율) 미리보기 ${fmt(pv)} / 결과 ${fmt(rb)}`);
  const maxDiff = Math.max(...['l', 'r', 't', 'b'].map((k) => Math.abs(pv[k] - rb[k])));
  check(maxDiff < 0.02, `${name}: 미리보기 자막 ≈ 결과 자막 (가장 큰 차이 ${(maxDiff * 100).toFixed(1)}%)`);
};
compare('노랑·아래', previewBox, renderBoxOf(burned.out));

// 8) 미리보기에서 끌어 옮기기 + 노란 상자 + 아주 크게 + 세밀 조절 → 결과도 같은 자리·크기 (PRD 13장 #13)
// 첫 자막(모든 자막 모양을 따름)을 골라 "모든 자막" 에 적용되게
await win.locator('[data-testid=subtitle-row]').first().locator('button').first().click();
await win.evaluate(() => window.__ezcut.useUiStore.getState().setPlaying(false));
await win.evaluate(() => window.__ezcut.useUiStore.getState().setPlayhead(2));
check(!(await win.locator('[data-testid=subtitle-only-this]').isChecked()), '첫 자막은 "이 자막만" 꺼짐');
await win.locator('[data-testid=subtitle-style-yellowbox]').click();
await win.locator('[data-testid=subtitle-size-XL]').click();
const ov = await win.locator('[data-testid=subtitle-overlay]').boundingBox();
const undoBefore = await win.evaluate(() => window.__ezcut.useProjectStore.getState().past.length);
await win.mouse.move(ov.x + ov.width / 2, ov.y + ov.height / 2);
await win.mouse.down();
await win.mouse.move(ov.x + ov.width / 2 - fb.width * 0.15, ov.y + ov.height / 2 - fb.height * 0.45, { steps: 10 });
await win.mouse.up();
let st = (await state(win)).defaultSubtitleStyle;
check(typeof st.x === 'number' && st.y < 0.6, `끌어서 옮김 (x ${st.x?.toFixed(2)}, y ${st.y?.toFixed(2)})`);
check((await win.evaluate(() => window.__ezcut.useProjectStore.getState().past.length)) === undoBefore + 1, '옮기기 = 되돌리기 1단계');
await win.keyboard.press('Control+z');
check(typeof (await state(win)).defaultSubtitleStyle.x !== 'number', 'Ctrl+Z 로 원래 자리');
await win.keyboard.press('Control+y');
check(typeof (await state(win)).defaultSubtitleStyle.x === 'number', 'Ctrl+Y 로 다시 옮김');
// 세밀 조절 120%
await win.locator('[data-testid=subtitle-size-scale]').evaluate((el) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(el, '120');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
});
st = (await state(win)).defaultSubtitleStyle;
check(st.sizeScale === 1.2 && st.size === 'XL' && st.presetId === 'yellowbox', `크기 아주 크게 × 120% (${st.size}, ${st.sizeScale})`);
await win.evaluate(() => window.__ezcut.useUiStore.getState().setPlayhead(2));
await win.waitForTimeout(800);
await win.screenshot({ path: join(shotDir, 'm9-moved.png') });
const movedPreview = await previewBoxNow();
const moved = await exportWith(null);
compare('옮긴 노란 상자', movedPreview, renderBoxOf(moved.out));
// 위치 단추를 누르면 원래 자리로
await win.locator('[data-testid=subtitle-position-bottom]').click();
check(typeof (await state(win)).defaultSubtitleStyle.x !== 'number', '[아래] 를 누르면 옮긴 자리 지움');
await app.close();

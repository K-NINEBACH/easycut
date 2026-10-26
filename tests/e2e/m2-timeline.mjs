// M2: 타임라인 배치/순서/삭제, Undo/Redo, 자동 저장 + 강제 종료 복구, 원본 재연결
import { cpSync, mkdtempSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, state, waitReady, check, FIXTURES } from './launch.mjs';

const dataDir = mkdtempSync(join(tmpdir(), 'easycut-e2e-'));
const shotDir = process.argv[2] ?? dataDir;
// 원본을 임시 폴더로 복사 (나중에 폴더를 옮겨서 재연결 확인)
const srcA = join(dataDir, '원본 영상');
cpSync(FIXTURES, srcA, { recursive: true });

let { app, win } = await launch(dataDir);
await win.evaluate((dir) => window.__ezcut.importPaths([dir]), srcA);
await waitReady(win);

const order = async () => {
  const p = await state(win);
  const name = new Map(p.media.map((m) => [m.id, m.fileName]));
  return p.videoTrack.map((c) => name.get(c.mediaId));
};
const card = (name) => win.locator(`[data-testid=media-card][title="${name}"]`);

// 1) 더블클릭 → 끝에 추가
await card('landscape_h264_30.mp4').dblclick();
check((await order()).join() === 'landscape_h264_30.mp4', '더블클릭으로 추가');

// 2) 여러 개 선택 → 모두 넣기 (선택 순서대로)
await card('vfr.mp4').click();
await card('photo_landscape.jpg').click({ modifiers: ['Control'] });
await card('portrait_hevc_60.mov').click({ modifiers: ['Control'] });
await win.getByText('타임라인에 모두 넣기 (3개)').click();
check(
  (await order()).join() === 'landscape_h264_30.mp4,vfr.mp4,photo_landscape.jpg,portrait_hevc_60.mov',
  `선택 순서대로 모두 넣기: ${await order()}`
);

// 3) 보관함 → 타임라인 맨 앞에 끌어다 놓기 (HTML5 DnD)
const track = win.locator('[data-testid=video-track]');
const tb = await track.boundingBox();
await card('noaudio.mp4').dragTo(track, { targetPosition: { x: 5, y: tb.height / 2 } });
check((await order())[0] === 'noaudio.mp4', `끌어다 놓은 위치에 삽입: ${await order()}`);

// 음악은 음악 트랙으로
await card('music.mp3').dblclick();
check((await state(win)).musicTrack.length === 1, '음악은 음악 트랙에');

await win.screenshot({ path: join(shotDir, 'm2-timeline.png') });

// 4) 타임라인 안에서 드래그로 순서 변경 (첫 클립 → 맨 끝)
const first = win.locator('[data-testid=clip]').first();
const fb = await first.boundingBox();
const lastBox = await win.locator('[data-testid=clip]').last().boundingBox();
await win.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
await win.mouse.down();
await win.mouse.move(fb.x + fb.width / 2 + 20, fb.y + 30, { steps: 3 });
await win.mouse.move(lastBox.x + lastBox.width - 3, fb.y + 30, { steps: 10 });
await win.mouse.up();
check((await order()).at(-1) === 'noaudio.mp4', `드래그로 맨 뒤로: ${await order()}`);

// 5) 선택 후 Delete → 삭제, Ctrl+Z 복구, Ctrl+Y 다시
const before = await order();
await win.locator('[data-testid=clip]').nth(1).click();
await win.keyboard.press('Delete');
check((await order()).length === before.length - 1, 'Delete 로 삭제');
await win.keyboard.press('Control+z');
check((await order()).join() === before.join(), 'Ctrl+Z 로 되돌리기');
await win.keyboard.press('Control+y');
check((await order()).length === before.length - 1, 'Ctrl+Y 로 다시 하기');
await win.keyboard.press('Control+z');

// 6) 클립 24개 순서 변경이 부드러운지 (조작 시간 측정)
const ids = await win.evaluate(() => window.__ezcut.useProjectStore.getState().project.media.filter((m) => m.type !== 'audio').map((m) => m.id));
await win.evaluate((ids) => {
  const { useProjectStore } = window.__ezcut;
  for (let i = 0; i < 4; i++) useProjectStore.getState().edit('add', (d) => {
    for (const id of ids) d.videoTrack.push({ ...d.videoTrack[0], id: crypto.randomUUID(), mediaId: id });
  });
}, ids);
await win.locator('[data-testid=timeline-scroll]').evaluate((el) => (el.scrollLeft = 0));
await win.getByText('전체 보기').click();
const n = (await order()).length;
const clipsLoc = win.locator('[data-testid=clip]');
const c3 = await clipsLoc.nth(3).boundingBox();
const c20 = await clipsLoc.nth(20).boundingBox();
const t0 = Date.now();
await win.mouse.move(c3.x + c3.width / 2, c3.y + 20);
await win.mouse.down();
await win.mouse.move(c3.x + c3.width / 2 + 15, c3.y + 25, { steps: 2 });
await win.mouse.move(c20.x + c20.width * 0.9, c20.y + 25, { steps: 30 });
await win.mouse.up();
const dt = Date.now() - t0;
const movedId = (await state(win)).videoTrack;
check(n >= 24, `클립 ${n}개`);
check(dt < 2500, `30단계 드래그 ${dt}ms`);
await win.screenshot({ path: join(shotDir, 'm2-many.png') });

// 7) 자동 저장 후 강제 종료 → 재실행 시 복구
const expected = await order();
await win.waitForFunction(() => window.__ezcut.useProjectStore.getState().saveState === 'saved', null, { timeout: 8000 });
app.process().kill('SIGKILL');
await new Promise((r) => setTimeout(r, 500));
({ app, win } = await launch(dataDir));
check((await order()).join() === expected.join(), `강제 종료 후 직전 상태 복구 (${(await order()).length}개)`);
await app.close();

// 8) 원본 폴더를 옮긴 뒤 재연결
const srcB = join(dataDir, '옮긴 폴더');
renameSync(srcA, srcB);
({ app, win } = await launch(dataDir));
await win.waitForTimeout(1000);
const dialog = await win.getByText('영상 파일을 찾을 수 없어요').isVisible();
check(dialog, '파일을 찾을 수 없어요 창');
await win.screenshot({ path: join(shotDir, 'm2-missing.png') });
await win.evaluate(async (folder) => {
  const { useProjectStore } = window.__ezcut;
  const p = useProjectStore.getState().project;
  const relinked = await window.api.media.relinkFolder(folder, p.media.filter((m) => m.missing));
  const byId = new Map(relinked.map((m) => [m.id, m]));
  useProjectStore.getState().silent((d) => { d.media = d.media.map((m) => byId.get(m.id) ?? m); });
}, srcB);
const p = await state(win);
check(p.media.length === 8 && p.media.every((m) => !m.missing && m.path.includes('옮긴 폴더')), `같은 파일명으로 재연결 (${p.media.length}개)`);
check(p.videoTrack.length === 33, '재연결 후 타임라인 그대로');
check(p.media.every((m) => m.proxyStatus === 'ready'), '재연결 후 캐시 재사용 (프록시 다시 안 만듦)');
await app.close();

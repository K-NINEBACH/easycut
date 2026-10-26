// M9b: [🎤 말소리로 자막 만들기] — 범위, 진행, 기존 자막 확인, 취소, 되돌리기 (PRD 4-2)
// 필요: node scripts/fetch-whisper.mjs, node scripts/make-speech-fixture.mjs
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, state, waitReady, check, ROOT } from './launch.mjs';

const sample = join(ROOT, 'tests', 'speech', 'korean_speech.mp4');
if (!existsSync(sample) || !existsSync(join(ROOT, 'resources', 'models', 'ggml-small.bin'))) {
  console.log('건너뜀: 말소리 샘플 또는 whisper 모델이 없어요');
  process.exit(0);
}
const dataDir = mkdtempSync(join(tmpdir(), 'easycut-e2e-'));
const shotDir = process.argv[2] ?? dataDir;
const { app, win } = await launch(dataDir);
await win.evaluate((f) => window.__ezcut.importPaths([f]), sample);
await waitReady(win);
await win.locator('[data-testid=media-card]').first().dblclick();
await win.getByRole('button', { name: '자막', exact: true }).click();

const run = async () => {
  await win.locator('[data-testid=speech-open]').click();
  await win.locator('[data-testid=speech-start]').click();
};
const waitDone = () => win.locator('[data-testid=speech-dialog]').waitFor({ state: 'detached', timeout: 120000 });

// 1) 전체 영상
await run();
await win.locator('[data-testid=speech-progress]').waitFor({ timeout: 5000 });
check(await win.evaluate(() => window.__ezcut.useUiStore.getState().locked), '듣는 동안 편집 잠금');
await win.screenshot({ path: join(shotDir, 'm9b-progress.png') });
await waitDone();
let subs = (await state(win)).subtitles;
const text = subs.map((s) => s.text).join(' ');
check(subs.length >= 3 && ['바다', '날씨', '산'].every((w) => text.includes(w)), `자막 ${subs.length}개: ${text.replace(/\n/g, ' ')}`);
check((await win.locator('[data-testid=toast]').allInnerTexts()).some((t) => t.includes('자막') && t.includes('만들었어요')), '완료 안내');
check((await win.locator('[data-testid=subtitle-row]').count()) === subs.length, '자막 목록에 표시');
check(!(await win.evaluate(() => window.__ezcut.useUiStore.getState().locked)), '끝나면 잠금 풀림');
await win.screenshot({ path: join(shotDir, 'm9b-done.png') });

// 2) 다시 하면 기존 자막을 지울지 묻는다 → 취소하면 그대로
await run();
check(await win.locator('[data-testid=speech-confirm]').isVisible(), '"기존 자막을 지우고 새로 만들까요?"');
await win.getByRole('button', { name: '취소', exact: true }).click();
await win.getByRole('button', { name: '닫기', exact: true }).click();
check((await state(win)).subtitles.length === subs.length, '취소하면 기존 자막 그대로');

// 3) 듣는 중 취소
await run();
await win.locator('[data-testid=speech-overwrite]').click();
await win.locator('[data-testid=speech-cancel]').click();
await win.locator('[data-testid=speech-start]').waitFor({ timeout: 15000 });
check((await state(win)).subtitles.length === subs.length, '듣는 중 취소 → 바뀐 것 없음');
await win.getByRole('button', { name: '닫기', exact: true }).click();

// 4) Ctrl+Z 로 만든 자막 되돌리기
await win.locator('body').click({ position: { x: 640, y: 30 } });
await win.keyboard.press('Control+z');
check((await state(win)).subtitles.length === 0, 'Ctrl+Z 로 자동 자막 되돌리기');
await app.close();

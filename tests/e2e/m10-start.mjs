// M10: 시작 화면, 새 영상 만들기 → 바로 파일 고르기, 첫 실행 안내, 메뉴(단축키·처음 화면), 비정상 종료 복구
import { join } from 'node:path';
import { launch, state, check, forceKill, tempDataDir } from './launch.mjs';

const dataDir = tempDataDir('easycut-e2e-');
const shotDir = process.argv[2] ?? dataDir;
const env = { EASYCUT_TEST_TOUR: '1' };

// 1) 처음 실행: 시작 화면
let { app, win } = await launch(dataDir, { start: 'none', env });
await win.locator('[data-testid=start-screen]').waitFor();
check(true, '시작 화면');
check(await win.locator('[data-testid=start-continue]').isDisabled(), '처음엔 [이어서 만들기] 꺼짐');
await win.screenshot({ path: join(shotDir, 'm10-start.png') });

// 2) 새 영상 만들기: 이름 기본값 "YYYY-MM-DD 여행 영상" → 편집 화면 + 바로 파일 고르기 창
let pickerOpened = 0;
await app.evaluate(({ dialog }) => {
  globalThis.__picks = 0;
  dialog.showOpenDialog = async () => {
    globalThis.__picks++;
    return { canceled: true, filePaths: [] };
  };
});
await win.locator('[data-testid=start-new]').click();
const def = await win.locator('[data-testid=project-name]').inputValue();
check(/^\d{4}-\d{2}-\d{2} 여행 영상$/.test(def), `기본 이름 "${def}"`);
await win.locator('[data-testid=project-name]').fill('제주 여행');
await win.locator('[data-testid=project-create]').click();
await win.waitForFunction(() => window.__ezcut.useProjectStore.getState().project);
check((await state(win)).name === '제주 여행', '편집 화면으로');
await win.waitForTimeout(300);
pickerOpened = await app.evaluate(() => globalThis.__picks);
check(pickerOpened === 1, '바로 파일 고르기 창');

// 3) 첫 실행 안내 4단계
await win.locator('[data-testid=tour]').waitFor({ timeout: 3000 });
const titles = [];
for (let i = 0; i < 4; i++) {
  titles.push(await win.locator('[data-testid=tour-title]').innerText());
  if (i === 2) await win.screenshot({ path: join(shotDir, 'm10-tour.png') });
  await win.locator('[data-testid=tour-next]').click();
}
check(titles.join('|') === '1. 불러오기|2. 타임라인에 놓기|3. 꾸미기|4. 영상 만들기', `안내 4단계 (${titles.join(', ')})`);
check(!(await win.locator('[data-testid=tour]').count()), '시작하기 누르면 닫힘');

// 4) 메뉴: 단축키 보기, 사용 안내 다시 보기
await win.locator('[data-testid=menu-button]').click();
await win.locator('[data-testid=menu-shortcuts]').click();
check((await win.locator('[data-testid=shortcuts-dialog] tr').count()) === 10, '단축키 표');
await win.keyboard.press('Escape');
await win.locator('[data-testid=menu-button]').click();
await win.locator('[data-testid=menu-tour]').click();
check(await win.locator('[data-testid=tour]').isVisible(), '메뉴에서 안내 다시 보기');
await win.locator('[data-testid=tour-skip]').click();

// 5) 처음 화면으로 → 최근 목록·이어서 만들기
await win.locator('[data-testid=menu-button]').click();
await win.locator('[data-testid=menu-start]').click();
await win.locator('[data-testid=start-screen]').waitFor();
check((await win.locator('[data-testid=recent-project]').count()) === 1, '최근 프로젝트 목록');
await win.locator('[data-testid=start-continue]').click();
await win.waitForFunction(() => window.__ezcut.useProjectStore.getState().project);
check((await state(win)).name === '제주 여행', '이어서 만들기');
check(!(await win.locator('[data-testid=tour]').count()), '"다시 보지 않기" 후 안내 안 뜸');
await app.close();

// 6) 정상 종료 → 다음 실행은 시작 화면
({ app, win } = await launch(dataDir, { start: 'none', env }));
await win.waitForTimeout(800);
check(await win.locator('[data-testid=start-screen]').isVisible(), '정상 종료 뒤에는 시작 화면');
await win.locator('[data-testid=start-continue]').click();
await win.waitForFunction(() => window.__ezcut.useProjectStore.getState().project);

// 7) 연 채로 강제 종료 → 다음 실행은 바로 그 프로젝트
forceKill(app);
await new Promise((r) => setTimeout(r, 500));
({ app, win } = await launch(dataDir, { start: 'none', env }));
await win.waitForFunction(() => window.__ezcut?.useProjectStore.getState().project, null, { timeout: 10000 });
check((await state(win)).name === '제주 여행', '비정상 종료 뒤에는 바로 복구');
await app.close();

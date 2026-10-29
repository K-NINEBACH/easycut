// Playwright 로 실제 Electron 앱을 띄우는 도우미 (E2E). 먼저 npx electron-vite build.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// 전역 설치된 playwright 사용 (require 경로 탐색)
const { _electron } = createRequire(import.meta.url)('playwright');

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FIXTURES = join(ROOT, 'tests', 'fixtures');

/**
 * 시험용 임시 폴더. 시험이 끝나면(실패해도) 지운다 — 영상·프록시가 쌓여 C 드라이브를 채우지 않게.
 * 결과물을 보고 싶으면 EZ_KEEP=1.
 */
export function tempDataDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  process.on('exit', () => {
    if (process.env.EZ_KEEP) return console.log('결과물:', dir);
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
    } catch (e) {
      console.warn('임시 폴더를 못 지움:', dir, e.message);
    }
  });
  return dir;
}

/**
 * start: 'auto' 면 시작 화면을 지나간다 (최근 프로젝트가 있으면 이어서 만들기, 없으면 새 영상 만들기).
 * 'none' 이면 시작 화면에서 멈춘다. 새 영상의 파일 고르기 창은 취소로 자동 응답.
 */
export async function launch(dataDir, { width = 1280, height = 720, start = 'auto', env = {} } = {}) {
  const require = createRequire(import.meta.url);
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: ['--no-sandbox', ROOT],
    cwd: ROOT,
    env: { ...process.env, EASYCUT_DATA_DIR: dataDir, EASYCUT_TEST: '1', ...env }
  });
  app.process().stderr.on('data', (d) => {
    const s = String(d);
    if (/easycut|Error|error/.test(s) && !/GPU|gpu|dbus|Fontconfig/.test(s)) process.stderr.write('[main] ' + s);
  });
  const win = await app.firstWindow();
  win.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`[renderer ${m.type()}]`, m.text());
  });
  win.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await win.setViewportSize({ width, height });
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  });
  await win.waitForFunction(
    () => window.__ezcut?.useProjectStore.getState().project || document.querySelector('[data-testid=start-screen]')
  );
  if (start === 'auto' && (await win.locator('[data-testid=start-screen]').count())) {
    // 최근 목록을 읽을 때까지 잠깐
    await win.waitForTimeout(300);
    const cont = win.locator('[data-testid=start-continue]');
    if (await cont.isEnabled()) await cont.click();
    else {
      await win.locator('[data-testid=start-new]').click();
      await win.locator('[data-testid=project-create]').click();
    }
    await win.waitForFunction(() => window.__ezcut?.useProjectStore.getState().project);
  }
  return { app, win };
}

export const state = (win) => win.evaluate(() => window.__ezcut.useProjectStore.getState().project);

export async function waitReady(win, timeout = 120000) {
  await win.waitForFunction(
    () => {
      const p = window.__ezcut.useProjectStore.getState().project;
      return p.media.length > 0 && p.media.every((m) => m.proxyStatus === 'ready' || m.proxyStatus === 'error');
    },
    null,
    { timeout, polling: 250 }
  );
}

export function check(cond, msg) {
  if (!cond) {
    console.error('✗', msg);
    process.exitCode = 1;
  } else console.log('✓', msg);
}

/** 강제 종료 흉내. Windows 는 kill 이 주 프로세스만 죽여 자식이 남으므로 묶음째 끈다 */
export function forceKill(app) {
  const proc = app.process();
  if (process.platform === 'win32') {
    createRequire(import.meta.url)('node:child_process').execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
  } else proc.kill('SIGKILL');
}

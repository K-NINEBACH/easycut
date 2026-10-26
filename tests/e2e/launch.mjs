// Playwright 로 실제 Electron 앱을 띄우는 도우미 (E2E). 먼저 npx electron-vite build.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// 전역 설치된 playwright 사용 (require 경로 탐색)
const { _electron } = createRequire(import.meta.url)('playwright');

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FIXTURES = join(ROOT, 'tests', 'fixtures');

export async function launch(dataDir, { width = 1280, height = 720 } = {}) {
  const require = createRequire(import.meta.url);
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: ['--no-sandbox', ROOT],
    cwd: ROOT,
    env: { ...process.env, EASYCUT_DATA_DIR: dataDir, EASYCUT_TEST: '1' }
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
  await win.waitForFunction(() => window.__ezcut?.useProjectStore.getState().project);
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

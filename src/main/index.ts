import { join } from 'node:path';
import { app, BrowserWindow, shell } from 'electron';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { applyDataDirOverride, createContext } from './context';
import { getAppInfo, registerIpc } from './ipc';
import { registerMediaProtocol, registerMediaSchemePrivileges } from './protocol';

applyDataDirOverride();
registerMediaSchemePrivileges();
// 그래픽 드라이버가 막혀 있는 PC 에서도 미리보기(WebGL)가 동작하도록 소프트웨어 대체 허용.
// 앱은 자기 화면만 그리므로(외부 웹페이지를 열지 않음) 위험이 없다.
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    show: false,
    title: '쉬운편집',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  win.on('ready-to-show', () => win.show());

  // 외부 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.easycut.app');
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window));

  const ctx = createContext();
  registerMediaProtocol({
    allowedRoots: () => [ctx.projects.currentDir].filter((d): d is string => !!d),
    allowedFiles: ctx.allowedFiles,
    resourcesDir: ctx.resourcesDir
  });
  registerIpc(ctx);

  // 시작 시 FFmpeg/FFprobe 버전을 로그로 출력 (M0)
  const info = await getAppInfo(ctx);
  for (const bin of [info.ffmpeg, info.ffprobe]) {
    if (bin.version) console.log(`[easycut] ${bin.name}: ${bin.version} (${bin.path})`);
    else console.error(`[easycut] ${bin.name} 실행 실패: ${bin.path} — ${bin.error}`);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

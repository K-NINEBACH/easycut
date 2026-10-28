import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { IpcChannel, type UpdateReady } from '@shared/ipc';

/**
 * 자동 업데이트 (PRD 13장 #11): 실행할 때 GitHub 릴리스에 새 버전이 있으면 뒤에서 받아 두고,
 * 다 받으면 화면에 [지금 다시 시작] 안내를 띄운다. 그냥 꺼도 끌 때 설치된다.
 * 설치한 앱에서만 동작한다. 시험에서는 EASYCUT_UPDATE_URL 로 받을 곳을 바꾼다.
 */
export function startAutoUpdate(logError: (kind: string, err: unknown) => void): void {
  let ready: UpdateReady | null = null;
  // 안내가 뜨기 전에 화면이 다시 열려도 알 수 있게
  ipcMain.handle(IpcChannel.UpdateGetReady, () => ready);
  // 조용히 설치하고 다시 켠다
  ipcMain.handle(IpcChannel.UpdateInstall, () => {
    if (ready) setImmediate(() => autoUpdater.quitAndInstall(true, true));
  });

  const testUrl = process.env.EASYCUT_UPDATE_URL;
  if (!app.isPackaged || (process.env.EASYCUT_TEST === '1' && !testUrl)) return;
  // 시험용 서버는 한 번에 한 구간만 보내므로 여러 구간 요청을 끈다
  if (testUrl) autoUpdater.setFeedURL({ provider: 'generic', url: testUrl, useMultipleRangeRequest: false });

  autoUpdater.logger = {
    info: (m: unknown) => console.log('[easycut] 업데이트', m),
    warn: (m: unknown) => console.warn('[easycut] 업데이트', m),
    error: (m: unknown) => logError('update', m),
    debug: () => {}
  };
  autoUpdater.on('update-downloaded', (info) => {
    ready = { version: info.version };
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(IpcChannel.UpdateReady, ready);
  });
  autoUpdater.checkForUpdates().catch((e) => logError('update', e));
}

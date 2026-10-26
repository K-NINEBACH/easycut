import { readFile } from 'node:fs/promises';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { IpcChannel, type AppInfo } from '@shared/ipc';
import type { MediaItem, Project } from '@shared/types';
import { SUPPORTED_EXTENSIONS } from '@shared/mediaFormats';
import { getBinaryVersion } from './ffmpeg/binaries';
import type { AppContext } from './context';

export async function getAppInfo(ctx: Pick<AppContext, 'tools'>): Promise<AppInfo> {
  const [ffmpeg, ffprobe] = await Promise.all([
    getBinaryVersion('ffmpeg', ctx.tools.ffmpeg),
    getBinaryVersion('ffprobe', ctx.tools.ffprobe)
  ]);
  return { appVersion: app.getVersion(), platform: process.platform, ffmpeg, ffprobe };
}

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

export function registerIpc(ctx: AppContext): void {
  const { projects, media } = ctx;

  ipcMain.handle(IpcChannel.AppGetInfo, () => getAppInfo(ctx));

  // --- 프로젝트 ---
  const onProjectSwitch = (): void => {
    media.cancelAll();
    ctx.allowedFiles.clear();
  };
  ipcMain.handle(IpcChannel.ProjectCreate, async (_e, name: string) => {
    onProjectSwitch();
    return projects.create(name);
  });
  ipcMain.handle(IpcChannel.ProjectOpen, async (_e, path: string) => {
    onProjectSwitch();
    return projects.open(path);
  });
  ipcMain.handle(IpcChannel.ProjectOpenLast, async () => {
    const last = await projects.lastProjectPath();
    if (!last) return null;
    onProjectSwitch();
    return projects.open(last);
  });
  ipcMain.handle(IpcChannel.ProjectSave, (_e, project: Project) => projects.save(project));
  ipcMain.handle(IpcChannel.ProjectListRecent, () => projects.listRecent());

  // --- 미디어 ---
  ipcMain.handle(IpcChannel.MediaPickFiles, async () => {
    const win = focusedWindow();
    const opts: Electron.OpenDialogOptions = {
      title: '불러올 영상·사진·음악을 고르세요',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '영상·사진·음악', extensions: SUPPORTED_EXTENSIONS },
        { name: '모든 파일', extensions: ['*'] }
      ]
    };
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return res.canceled ? [] : res.filePaths;
  });
  ipcMain.handle(IpcChannel.MediaPickFolder, async (_e, title?: string) => {
    const win = focusedWindow();
    const opts: Electron.OpenDialogOptions = { title: title ?? '폴더를 고르세요', properties: ['openDirectory'] };
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return res.canceled ? null : res.filePaths[0];
  });
  ipcMain.handle(IpcChannel.MediaImport, (_e, paths: string[], knownPaths: string[]) =>
    media.import(paths, knownPaths)
  );
  ipcMain.handle(IpcChannel.MediaPrepare, (_e, items: MediaItem[]) => media.prepare(items));
  ipcMain.handle(IpcChannel.MediaRelinkFolder, async (_e, folder: string, items: MediaItem[]) => {
    const found = await media.findByNames(folder, new Set(items.map((m) => m.fileName)));
    const relinked: MediaItem[] = [];
    for (const item of items) {
      const p = found.get(item.fileName);
      if (!p) continue;
      const updated = await media.relink(item, p);
      if (updated) relinked.push(updated);
    }
    return relinked;
  });
  ipcMain.handle(IpcChannel.MediaReadWaveform, async (_e, path: string) => {
    try {
      return JSON.parse(await readFile(path, 'utf8'));
    } catch {
      return null;
    }
  });

  // --- 작업 ---
  ipcMain.handle(IpcChannel.JobsCancel, (_e, jobId: string) => {
    media.cancel(jobId);
  });

  // --- 셸 ---
  ipcMain.handle(IpcChannel.ShellOpenFolder, (_e, path: string) => shell.showItemInFolder(path));
  ipcMain.handle(IpcChannel.ShellOpenFile, (_e, path: string) => shell.openPath(path));
  ipcMain.handle(IpcChannel.ShellOpenExternal, (_e, url: string) => {
    if (/^https:\/\//.test(url)) return shell.openExternal(url);
  });
}

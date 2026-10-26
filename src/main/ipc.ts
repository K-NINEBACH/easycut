import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { IpcChannel, type AppInfo } from '@shared/ipc';
import type { MediaItem, Project, RenderOptions } from '@shared/types';
import type { GenerateArgs } from './services/SubtitleService';
import type { Settings } from './services/SettingsService';
import { safeFolderName } from '@shared/project';
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
    // 프로젝트를 연 상태로 표시 → 정상 종료 없이 꺼지면 다음 실행에 바로 복구 (PRD F10)
    ctx.settings.set({ sessionOpen: true });
  };
  // 시작: 프로젝트를 연 채로 꺼졌으면 그 프로젝트를 바로 연다. 아니면 null → 시작 화면 (PRD 5.2)
  ipcMain.handle(IpcChannel.ProjectStartup, async () => {
    if (!ctx.settings.get().sessionOpen) return null;
    const last = await projects.lastProjectPath();
    if (!last) return null;
    onProjectSwitch();
    return projects.open(last);
  });
  ipcMain.handle(IpcChannel.ProjectClose, () => {
    media.cancelAll();
    ctx.settings.set({ sessionOpen: false });
  });
  ipcMain.handle(IpcChannel.SettingsGet, () => ctx.settings.get());
  ipcMain.handle(IpcChannel.SettingsSet, (_e, patch: Partial<Settings>) => {
    // 렌더러는 안내 설정만 바꿀 수 있다
    if (typeof patch.tourDone === 'boolean') ctx.settings.set({ tourDone: patch.tourDone });
  });
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

  // --- 영상 만들기 (PRD F9) ---
  // 기본 저장 위치: 내 동영상\쉬운편집\프로젝트이름.mp4 (이미 있으면 (2), (3)…)
  const videosDir = (): string =>
    join(process.env.EASYCUT_DATA_DIR ? join(process.env.EASYCUT_DATA_DIR, 'Videos') : app.getPath('videos'), '쉬운편집');
  ipcMain.handle(IpcChannel.RenderDefaultPath, (_e, name: string) => {
    const dir = videosDir();
    const base = safeFolderName(name) || '내 영상';
    let path = join(dir, `${base}.mp4`);
    for (let n = 2; existsSync(path); n++) path = join(dir, `${base} (${n}).mp4`);
    return path;
  });
  ipcMain.handle(IpcChannel.RenderPickOutput, async (_e, current: string) => {
    const win = focusedWindow();
    const opts: Electron.SaveDialogOptions = {
      title: '영상을 저장할 곳을 고르세요',
      defaultPath: current,
      filters: [{ name: 'MP4 영상', extensions: ['mp4'] }]
    };
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    return res.canceled || !res.filePath ? null : res.filePath;
  });
  ipcMain.handle(IpcChannel.RenderStart, (_e, opts: RenderOptions) => ({ jobId: ctx.render.start(opts) }));
  ipcMain.handle(IpcChannel.RenderLogPath, () => ctx.render.logPath);

  // --- 말소리로 자막 만들기 (PRD 4-2) ---
  ipcMain.handle(IpcChannel.SubtitleGenerate, (_e, args: GenerateArgs) => ({ jobId: ctx.subtitles.generate(args) }));

  // --- 자막 파일 저장 (PRD F4, 유튜브 자막 올리기용) ---
  ipcMain.handle(IpcChannel.SubtitleSaveSrt, async (_e, name: string, content: string) => {
    const win = focusedWindow();
    const opts: Electron.SaveDialogOptions = {
      title: '자막 파일을 저장할 곳을 고르세요',
      defaultPath: join(videosDir(), `${safeFolderName(name) || '자막'}.srt`),
      filters: [{ name: '자막 파일 (SRT)', extensions: ['srt'] }]
    };
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    if (res.canceled || !res.filePath) return null;
    await writeFile(res.filePath, content, 'utf8');
    return res.filePath;
  });

  // --- 작업 ---
  ipcMain.handle(IpcChannel.JobsCancel, (_e, jobId: string) => {
    if (!ctx.render.cancel(jobId) && !ctx.subtitles.cancel(jobId)) media.cancel(jobId);
  });

  // --- 셸 ---
  ipcMain.handle(IpcChannel.ShellOpenFolder, (_e, path: string) => shell.showItemInFolder(path));
  ipcMain.handle(IpcChannel.ShellOpenFile, (_e, path: string) => shell.openPath(path));
  ipcMain.handle(IpcChannel.ShellOpenExternal, (_e, url: string) => {
    if (/^https:\/\//.test(url)) return shell.openExternal(url);
  });
}

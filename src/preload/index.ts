import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IpcChannel, type AppInfo, type ImportResult, type WaveformData } from '@shared/ipc';
import type { JobDone, JobProgress, MediaItem, Project, RecentProject, RenderOptions } from '@shared/types';

function subscribe<T>(channel: string, cb: (e: T) => void): () => void {
  const listener = (_: unknown, e: T): void => cb(e);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

// 렌더러는 window.api.* 로만 메인과 통신한다 (PRD 8.1, 8.2)
const api = {
  isTest: process.env.EASYCUT_TEST === '1',
  app: {
    getInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IpcChannel.AppGetInfo)
  },
  project: {
    create: (name: string): Promise<Project> => ipcRenderer.invoke(IpcChannel.ProjectCreate, name),
    open: (path: string): Promise<Project> => ipcRenderer.invoke(IpcChannel.ProjectOpen, path),
    openLast: (): Promise<Project | null> => ipcRenderer.invoke(IpcChannel.ProjectOpenLast),
    save: (project: Project): Promise<void> => ipcRenderer.invoke(IpcChannel.ProjectSave, project),
    listRecent: (): Promise<RecentProject[]> => ipcRenderer.invoke(IpcChannel.ProjectListRecent)
  },
  media: {
    pickFiles: (): Promise<string[]> => ipcRenderer.invoke(IpcChannel.MediaPickFiles),
    pickFolder: (title?: string): Promise<string | null> => ipcRenderer.invoke(IpcChannel.MediaPickFolder, title),
    import: (paths: string[], knownPaths: string[]): Promise<ImportResult> =>
      ipcRenderer.invoke(IpcChannel.MediaImport, paths, knownPaths),
    prepare: (items: MediaItem[]): Promise<MediaItem[]> => ipcRenderer.invoke(IpcChannel.MediaPrepare, items),
    relinkFolder: (folder: string, items: MediaItem[]): Promise<MediaItem[]> =>
      ipcRenderer.invoke(IpcChannel.MediaRelinkFolder, folder, items),
    readWaveform: (path: string): Promise<WaveformData | null> =>
      ipcRenderer.invoke(IpcChannel.MediaReadWaveform, path),
    /** 드래그 앤 드롭한 File 의 실제 경로 */
    pathForFile: (file: File): string => webUtils.getPathForFile(file)
  },
  render: {
    defaultPath: (name: string): Promise<string> => ipcRenderer.invoke(IpcChannel.RenderDefaultPath, name),
    pickOutput: (current: string): Promise<string | null> => ipcRenderer.invoke(IpcChannel.RenderPickOutput, current),
    start: (opts: RenderOptions): Promise<{ jobId: string }> => ipcRenderer.invoke(IpcChannel.RenderStart, opts),
    logPath: (): Promise<string | null> => ipcRenderer.invoke(IpcChannel.RenderLogPath)
  },
  jobs: {
    cancel: (jobId: string): Promise<void> => ipcRenderer.invoke(IpcChannel.JobsCancel, jobId),
    onProgress: (cb: (e: JobProgress) => void): (() => void) => subscribe(IpcChannel.JobsProgress, cb),
    onDone: (cb: (e: JobDone) => void): (() => void) => subscribe(IpcChannel.JobsDone, cb)
  },
  shell: {
    openFolder: (path: string): Promise<void> => ipcRenderer.invoke(IpcChannel.ShellOpenFolder, path),
    openFile: (path: string): Promise<void> => ipcRenderer.invoke(IpcChannel.ShellOpenFile, path),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IpcChannel.ShellOpenExternal, url)
  }
};

export type Api = typeof api;

contextBridge.exposeInMainWorld('api', api);

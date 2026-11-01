import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IpcChannel, type AppInfo, type ImportResult, type StabilizeRequest, type UpdateReady, type WaveformData } from '@shared/ipc';
import type { JobDone, JobProgress, MediaItem, Project, RecentProject, RenderOptions } from '@shared/types';

function subscribe<T>(channel: string, cb: (e: T) => void): () => void {
  const listener = (_: unknown, e: T): void => cb(e);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

// 렌더러는 window.api.* 로만 메인과 통신한다 (PRD 8.1, 8.2)
const api = {
  isTest: process.env.EASYCUT_TEST === '1',
  /** 테스트에서도 첫 실행 안내를 보여줄지 (안내 E2E 용) */
  testTour: process.env.EASYCUT_TEST_TOUR === '1',
  app: {
    getInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IpcChannel.AppGetInfo)
  },
  update: {
    /** 이미 받아 둔 새 버전 (없으면 null) */
    getReady: (): Promise<UpdateReady | null> => ipcRenderer.invoke(IpcChannel.UpdateGetReady),
    onReady: (cb: (e: UpdateReady) => void): (() => void) => subscribe(IpcChannel.UpdateReady, cb),
    /** 앱을 끄고 새 버전을 설치한 뒤 다시 켠다 */
    install: (): Promise<void> => ipcRenderer.invoke(IpcChannel.UpdateInstall)
  },
  project: {
    create: (name: string): Promise<Project> => ipcRenderer.invoke(IpcChannel.ProjectCreate, name),
    open: (path: string): Promise<Project> => ipcRenderer.invoke(IpcChannel.ProjectOpen, path),
    openLast: (): Promise<Project | null> => ipcRenderer.invoke(IpcChannel.ProjectOpenLast),
    /** 연 채로 꺼졌으면 그 프로젝트, 아니면 null (시작 화면) */
    startup: (): Promise<Project | null> => ipcRenderer.invoke(IpcChannel.ProjectStartup),
    /** 처음 화면으로 돌아갈 때 */
    close: (): Promise<void> => ipcRenderer.invoke(IpcChannel.ProjectClose),
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
  settings: {
    get: (): Promise<{ tourDone?: boolean }> => ipcRenderer.invoke(IpcChannel.SettingsGet),
    set: (patch: { tourDone?: boolean }): Promise<void> => ipcRenderer.invoke(IpcChannel.SettingsSet, patch)
  },
  subtitle: {
    /** 말소리로 자막 만들기. clipIds 를 비우면 전체 영상. 결과는 jobs.onDone 의 result (Subtitle[]) */
    generate: (args: { project: Project; clipIds?: string[] }): Promise<{ jobId: string }> =>
      ipcRenderer.invoke(IpcChannel.SubtitleGenerate, args),
    /** 저장 위치를 고르게 한 뒤 저장. 취소하면 null */
    saveSrt: (name: string, content: string): Promise<string | null> =>
      ipcRenderer.invoke(IpcChannel.SubtitleSaveSrt, name, content)
  },
  stabilize: {
    /** 결과는 jobs.onDone 의 result (Stabilize) */
    analyze: (req: StabilizeRequest): Promise<{ jobId: string }> => ipcRenderer.invoke(IpcChannel.StabilizeAnalyze, req)
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

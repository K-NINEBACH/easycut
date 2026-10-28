// main ↔ renderer 사이에서 주고받는 타입 (순수 TS, Node/DOM 의존 없음)

export interface BinaryInfo {
  name: 'ffmpeg' | 'ffprobe' | 'whisper';
  path: string;
  /** `-version` 첫 줄. 실행 실패 시 null */
  version: string | null;
  error?: string;
}

export interface AppInfo {
  appVersion: string;
  platform: string;
  ffmpeg: BinaryInfo;
  ffprobe: BinaryInfo;
}

/** 새 버전을 다 받아 설치할 준비가 됨 */
export interface UpdateReady {
  version: string;
}

export const IpcChannel = {
  AppGetInfo: 'app:getInfo',
  UpdateReady: 'update:ready',
  UpdateGetReady: 'update:getReady',
  UpdateInstall: 'update:install',
  ProjectCreate: 'project:create',
  ProjectOpen: 'project:open',
  ProjectOpenLast: 'project:openLast',
  ProjectStartup: 'project:startup',
  ProjectClose: 'project:close',
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',
  ProjectSave: 'project:save',
  ProjectListRecent: 'project:listRecent',
  MediaPickFiles: 'media:pickFiles',
  MediaPickFolder: 'media:pickFolder',
  MediaImport: 'media:import',
  MediaPrepare: 'media:prepare',
  MediaRelinkFolder: 'media:relinkFolder',
  MediaReadWaveform: 'media:readWaveform',
  RenderStart: 'render:start',
  RenderDefaultPath: 'render:defaultPath',
  RenderPickOutput: 'render:pickOutput',
  RenderLogPath: 'render:logPath',
  SubtitleSaveSrt: 'subtitle:saveSrt',
  SubtitleGenerate: 'subtitle:generate',
  JobsCancel: 'jobs:cancel',
  JobsProgress: 'jobs:progress',
  JobsDone: 'jobs:done',
  ShellOpenFolder: 'shell:openFolder',
  ShellOpenFile: 'shell:openFile',
  ShellOpenExternal: 'shell:openExternal'
} as const;

export interface ImportResult {
  items: import('./types').MediaItem[];
  /** 열 수 없는 파일 */
  failed: { path: string; fileName: string }[];
  /** 이미 불러온 파일이라 건너뛴 경로 */
  duplicates: string[];
}

export interface WaveformData {
  peaksPerSec: number;
  peaks: number[]; // 0~1
}

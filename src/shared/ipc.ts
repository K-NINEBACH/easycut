// main ↔ renderer 사이에서 주고받는 타입 (순수 TS, Node/DOM 의존 없음)

export interface BinaryInfo {
  name: 'ffmpeg' | 'ffprobe';
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

export const IpcChannel = {
  AppGetInfo: 'app:getInfo'
} as const;

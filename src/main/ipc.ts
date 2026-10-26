import { app, ipcMain } from 'electron';
import { IpcChannel, type AppInfo } from '@shared/ipc';
import { getBinaryVersion } from './ffmpeg/binaries';
import { getBinaryPath } from './paths';

export async function getAppInfo(): Promise<AppInfo> {
  const [ffmpeg, ffprobe] = await Promise.all([
    getBinaryVersion('ffmpeg', getBinaryPath('ffmpeg')),
    getBinaryVersion('ffprobe', getBinaryPath('ffprobe'))
  ]);
  return { appVersion: app.getVersion(), platform: process.platform, ffmpeg, ffprobe };
}

export function registerIpc(): void {
  ipcMain.handle(IpcChannel.AppGetInfo, () => getAppInfo());
}

import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel, type AppInfo } from '@shared/ipc';

// 렌더러는 window.api.* 로만 메인과 통신한다 (PRD 8.1)
const api = {
  app: {
    getInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IpcChannel.AppGetInfo)
  }
};

export type Api = typeof api;

contextBridge.exposeInMainWorld('api', api);

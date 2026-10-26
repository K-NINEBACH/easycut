import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { IpcChannel } from '@shared/ipc';
import type { JobDone, JobProgress } from '@shared/types';
import { getBinaryPath, getResourcesDir } from './paths';
import { MediaService } from './services/MediaService';
import { ProjectService } from './services/ProjectService';
import type { JobEvents } from './services/JobQueue';

/** 메인 프로세스 서비스 모음 (app ready 이후 생성) */
export interface AppContext {
  projects: ProjectService;
  media: MediaService;
  jobEvents: JobEvents;
  allowedFiles: Set<string>;
  resourcesDir: string;
  tools: { ffmpeg: string; ffprobe: string };
}

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

/**
 * 데이터 위치. EASYCUT_DATA_DIR 을 주면 (테스트용) 그 아래에 문서/설정을 둔다.
 * 기본: 문서\쉬운편집 (PRD F10)
 */
export function getProjectsRoot(): string {
  const override = process.env.EASYCUT_DATA_DIR;
  if (override) return join(override, 'Documents', '쉬운편집');
  return join(app.getPath('documents'), '쉬운편집');
}

export function applyDataDirOverride(): void {
  const override = process.env.EASYCUT_DATA_DIR;
  if (override) app.setPath('userData', join(override, 'userData'));
}

export function createContext(): AppContext {
  const projects = new ProjectService(getProjectsRoot(), app.getPath('userData'));
  const allowedFiles = new Set<string>();
  const jobEvents: JobEvents = {
    progress: (e: JobProgress) => broadcast(IpcChannel.JobsProgress, e),
    done: (e: JobDone) => broadcast(IpcChannel.JobsDone, e)
  };
  const tools = { ffmpeg: getBinaryPath('ffmpeg'), ffprobe: getBinaryPath('ffprobe') };
  const media = new MediaService(tools, () => projects.cacheDir, jobEvents, (p) => allowedFiles.add(p));
  const resourcesDir = getResourcesDir();
  if (!existsSync(resourcesDir)) console.warn(`[easycut] resources 폴더가 없어요: ${resourcesDir}`);
  return { projects, media, jobEvents, allowedFiles, resourcesDir, tools };
}

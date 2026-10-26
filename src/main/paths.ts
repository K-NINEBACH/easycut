import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { resolveBinaryPath, type BinaryName } from './ffmpeg/binaries';

/** resources/ 폴더 (ffmpeg, 모델, 폰트, LUT). 배포 시 electron-builder extraResources 위치 */
export function getResourcesDir(): string {
  return app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources');
}

export function getBinaryPath(name: BinaryName): string {
  return resolveBinaryPath(name, {
    platform: process.platform,
    resourcesDir: getResourcesDir(),
    exists: existsSync
  });
}

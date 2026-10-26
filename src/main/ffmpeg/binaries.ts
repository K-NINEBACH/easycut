import { execFile } from 'node:child_process';
import { join } from 'node:path';
import type { BinaryInfo } from '@shared/ipc';

export type BinaryName = 'ffmpeg' | 'ffprobe' | 'whisper-cli';

export interface ResolveOptions {
  platform: NodeJS.Platform;
  /** 개발: <프로젝트>/resources, 배포: process.resourcesPath */
  resourcesDir: string;
  exists: (path: string) => boolean;
}

/**
 * 동봉 바이너리 경로를 정한다.
 * - Windows: 항상 resources/bin/<name>.exe (동봉 필수)
 * - 그 외(개발용): resources/bin/<name> 이 있으면 사용, 없으면 PATH 의 <name>
 */
export function resolveBinaryPath(name: BinaryName, opts: ResolveOptions): string {
  const exe = opts.platform === 'win32' ? `${name}.exe` : name;
  const bundled = join(opts.resourcesDir, 'bin', exe);
  if (opts.platform === 'win32' || opts.exists(bundled)) return bundled;
  return name;
}

export function getBinaryVersion(name: BinaryInfo['name'], path: string): Promise<BinaryInfo> {
  return new Promise((resolve) => {
    execFile(path, ['-version'], { windowsHide: true, timeout: 10_000 }, (err, stdout) => {
      if (err) {
        resolve({ name, path, version: null, error: err.message });
        return;
      }
      resolve({ name, path, version: stdout.split(/\r?\n/)[0].trim() });
    });
  });
}

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveBinaryPath } from '../../src/main/ffmpeg/binaries';

const res = '/app/resources';

describe('resolveBinaryPath', () => {
  it('Windows는 항상 동봉된 .exe 를 쓴다', () => {
    const p = resolveBinaryPath('ffmpeg', { platform: 'win32', resourcesDir: res, exists: () => false });
    expect(p).toBe(join(res, 'bin', 'ffmpeg.exe'));
  });

  it('그 외 OS는 동봉 파일이 있으면 그것을 쓴다', () => {
    const p = resolveBinaryPath('ffprobe', { platform: 'linux', resourcesDir: res, exists: () => true });
    expect(p).toBe(join(res, 'bin', 'ffprobe'));
  });

  it('그 외 OS에서 동봉 파일이 없으면 PATH 의 이름을 쓴다', () => {
    const p = resolveBinaryPath('ffmpeg', { platform: 'darwin', resourcesDir: res, exists: () => false });
    expect(p).toBe('ffmpeg');
  });
});

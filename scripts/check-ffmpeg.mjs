// 앱이 사용할 FFmpeg/FFprobe 를 찾아 버전을 출력한다 (앱 실행 없이 확인용).
// 사용: npm run check:ffmpeg
// 경로 규칙은 src/main/ffmpeg/binaries.ts 와 같다.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const binDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'bin');

let failed = false;
for (const name of ['ffmpeg', 'ffprobe']) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const bundled = join(binDir, exe);
  const path = existsSync(bundled) ? bundled : process.platform === 'win32' ? null : name;
  if (!path) {
    console.error(`${name}: 찾을 수 없음 (npm run fetch:ffmpeg 실행 필요)`);
    failed = true;
    continue;
  }
  try {
    const out = execFileSync(path, ['-version'], { encoding: 'utf8' });
    console.log(`${name} [${path === name ? 'PATH' : bundled}]: ${out.split('\n')[0]}`);
  } catch (e) {
    console.error(`${name}: 실행 실패 (${e.message})`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);

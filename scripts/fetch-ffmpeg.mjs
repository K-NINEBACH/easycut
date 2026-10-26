// Windows용 FFmpeg/FFprobe 바이너리를 resources/bin 에 내려받는다.
// 사용: npm run fetch:ffmpeg
// 빌드: BtbN/FFmpeg-Builds 의 8.1 릴리스 브랜치 GPL 빌드 (PRD 13장 #1: 개인 사용 → GPL)
import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';

const ASSET = 'ffmpeg-n8.1-latest-win64-gpl-8.1';
const URL = `https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/${ASSET}.zip`;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const binDir = join(root, 'resources', 'bin');
const force = process.argv.includes('--force');

if (!force && existsSync(join(binDir, 'ffmpeg.exe')) && existsSync(join(binDir, 'ffprobe.exe'))) {
  console.log('이미 resources/bin 에 ffmpeg.exe, ffprobe.exe 가 있어요. 다시 받으려면 --force');
  process.exit(0);
}

const work = join(tmpdir(), `easycut-ffmpeg-${Date.now()}`);
mkdirSync(work, { recursive: true });
const zipPath = join(work, `${ASSET}.zip`);

console.log(`내려받는 중: ${URL}`);
const res = await fetch(URL);
if (!res.ok || !res.body) throw new Error(`다운로드 실패: HTTP ${res.status}`);
await pipeline(Readable.fromWeb(res.body), createWriteStream(zipPath));

// Windows 10+ 의 tar(bsdtar)는 zip 을 풀 수 있고, 리눅스/맥 개발 환경은 unzip 사용
const extractDir = join(work, 'x');
mkdirSync(extractDir);
if (process.platform === 'win32') {
  // Git Bash 의 GNU tar 는 "C:" 를 원격 주소로 읽으므로 Windows 기본 tar 를 직접 쓴다
  const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  execFileSync(tar, ['-xf', zipPath, '-C', extractDir], { stdio: 'inherit' });
} else {
  execFileSync('unzip', ['-q', zipPath, '-d', extractDir], { stdio: 'inherit' });
}

const [top] = readdirSync(extractDir);
const src = join(extractDir, top);
mkdirSync(binDir, { recursive: true });
copyFileSync(join(src, 'bin', 'ffmpeg.exe'), join(binDir, 'ffmpeg.exe'));
copyFileSync(join(src, 'bin', 'ffprobe.exe'), join(binDir, 'ffprobe.exe'));
copyFileSync(join(src, 'LICENSE.txt'), join(binDir, 'LICENSE-ffmpeg.txt'));
rmSync(work, { recursive: true, force: true });

console.log('완료: resources/bin/ffmpeg.exe, ffprobe.exe, LICENSE-ffmpeg.txt');

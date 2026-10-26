// 음성 인식(whisper.cpp)과 모델을 내려받는다 (PRD 4.2, 13장 #2: 1차는 resources/models 에 미리 넣기).
// 사용: node scripts/fetch-whisper.mjs [--force] [--model small|base|medium]
// - resources/bin: whisper-cli.exe + 필요한 dll (ggml-org/whisper.cpp v1.9.5 CPU 빌드)
// - resources/models: ggml-<모델>.bin (Hugging Face ggerganov/whisper.cpp)
import { execFileSync } from 'node:child_process';
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';

const BUILD = 'b5454'; // = v1.9.5 (2026-10-06)
const ZIP = `https://github.com/ggml-org/whisper.cpp/releases/download/${BUILD}/whisper-bin-x64.zip`;
const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const model = arg('--model') ?? 'small';
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${model}.bin`;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const binDir = join(root, 'resources', 'bin');
const modelDir = join(root, 'resources', 'models');
const force = process.argv.includes('--force');
mkdirSync(binDir, { recursive: true });
mkdirSync(modelDir, { recursive: true });

async function download(url, to) {
  console.log(`내려받는 중: ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`다운로드 실패: HTTP ${res.status}`);
  const tmp = `${to}.part`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  renameSync(tmp, to);
}

if (process.platform !== 'win32') {
  console.log('Windows 가 아니면 whisper-cli 를 직접 빌드하거나 PATH 에 두세요. 모델만 받습니다.');
} else if (force || !existsSync(join(binDir, 'whisper-cli.exe'))) {
  const work = join(tmpdir(), `easycut-whisper-${Date.now()}`);
  mkdirSync(work, { recursive: true });
  const zipPath = join(work, 'whisper.zip');
  await download(ZIP, zipPath);
  const x = join(work, 'x');
  mkdirSync(x);
  // Git Bash 의 GNU tar 는 "C:" 를 원격 주소로 읽으므로 Windows 기본 tar(bsdtar)를 직접 쓴다
  const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  execFileSync(tar, ['-xf', zipPath, '-C', x], { stdio: 'inherit' });
  // 압축 안의 whisper-cli.exe 가 있는 폴더에서 exe 하나와 dll 들을 가져온다
  const find = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        const r = find(p);
        if (r) return r;
      } else if (e.name === 'whisper-cli.exe') return dir;
    }
    return null;
  };
  const src = find(x);
  if (!src) throw new Error('압축 안에 whisper-cli.exe 가 없어요');
  for (const f of readdirSync(src)) {
    if (f === 'whisper-cli.exe' || f.toLowerCase().endsWith('.dll')) copyFileSync(join(src, f), join(binDir, f));
  }
  rmSync(work, { recursive: true, force: true });
  console.log('완료: resources/bin/whisper-cli.exe');
} else {
  console.log('이미 resources/bin/whisper-cli.exe 가 있어요');
}

const modelPath = join(modelDir, `ggml-${model}.bin`);
if (force || !existsSync(modelPath)) {
  await download(MODEL_URL, modelPath);
  console.log(`완료: resources/models/ggml-${model}.bin (${Math.round(statSync(modelPath).size / 1e6)}MB)`);
} else {
  console.log(`이미 resources/models/ggml-${model}.bin 이 있어요`);
}

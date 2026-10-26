// 자막 자동 생성 테스트용 한국어 말소리 영상 (PRD 12.1 "한국어 말소리가 있는 영상").
// Windows 음성 합성(한국어 목소리 Heami)으로 세 문장을 읽고 테스트 화면과 합친다 → tests/speech/korean_speech.mp4
// 사용: node scripts/make-speech-fixture.mjs  (Windows + 한국어 음성 필요, ffmpeg 는 PATH 또는 resources/bin)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SENTENCES = ['안녕하세요. 오늘은 바다를 보러 왔어요.', '날씨가 정말 좋네요. 점심은 회를 먹을 거예요.', '내일은 산에 올라갈 계획입니다.'];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'tests', 'speech');
const out = join(dir, 'korean_speech.mp4');
mkdirSync(dir, { recursive: true });
if (existsSync(out) && !process.argv.includes('--force')) {
  console.log('이미 있어요:', out);
  process.exit(0);
}
if (process.platform !== 'win32') throw new Error('Windows 음성 합성이 필요해요');

const wav = join(tmpdir(), `easycut-speech-${Date.now()}.wav`);
const ps1 = join(tmpdir(), `easycut-speech-${Date.now()}.ps1`);
const lines = SENTENCES.map((s, i) => `${i ? '$p.AppendBreak([TimeSpan]::FromSeconds(1.5))\n' : ''}$p.AppendText('${s}')`).join('\n');
const script = `Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('Microsoft Heami Desktop')
$s.SetOutputToWaveFile($args[0])
$p = New-Object System.Speech.Synthesis.PromptBuilder
${lines}
$s.Speak($p)
$s.Dispose()
`;
// PowerShell 5.1 은 BOM 이 있어야 UTF-8 로 읽는다 (없으면 한글이 깨짐)
writeFileSync(ps1, '﻿' + script.replace(/\n/g, '\r\n'));
execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, wav], { stdio: 'inherit' });

const bundled = join(root, 'resources', 'bin', 'ffmpeg.exe');
const ffmpeg = existsSync(bundled) ? bundled : 'ffmpeg';
execFileSync(ffmpeg, [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=17',
  '-i', wav,
  '-filter_complex', '[1:a]apad,atrim=end=17,aresample=48000[a]',
  '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ac', '2', out
]);
console.log('만듦:', out);

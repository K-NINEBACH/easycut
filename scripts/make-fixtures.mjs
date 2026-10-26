// 테스트용 짧은 샘플 미디어를 tests/fixtures 에 만든다 (PRD 12.1). 시스템 ffmpeg 필요.
// 사용: node scripts/make-fixtures.mjs [--force]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures');
mkdirSync(dir, { recursive: true });
const force = process.argv.includes('--force');

function ff(out, args) {
  const target = join(dir, out);
  if (!force && existsSync(target)) return;
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args, target], { stdio: 'inherit' });
  console.log('만듦:', out);
}

const src = (size, rate, d = 5) => [
  '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=${rate}:duration=${d}`
];
const tone = (d = 5, f = 440) => ['-f', 'lavfi', '-i', `sine=frequency=${f}:duration=${d}:sample_rate=48000`];

// 1. 가로 H.264 30fps (갤럭시)
ff('landscape_h264_30.mp4', [
  ...src('1920x1080', 30), ...tone(),
  '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
  '-metadata', 'creation_time=2026-08-01T10:00:00Z'
]);

// 2. 세로 HEVC 60fps (아이폰: 가로로 저장 + 회전 메타데이터)
const tmpHevc = join(dir, '_tmp_hevc.mov');
if (force || !existsSync(join(dir, 'portrait_hevc_60.mov'))) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...src('1920x1080', 60), ...tone(5, 660),
    '-c:v', 'libx265', '-preset', 'ultrafast', '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
    '-x265-params', 'log-level=error', tmpHevc]);
  ff('portrait_hevc_60.mov', [
    '-display_rotation:v:0', '-90', '-i', tmpHevc, '-c', 'copy',
    '-metadata', 'creation_time=2026-08-01T09:00:00Z'
  ]);
  rmSync(tmpHevc, { force: true });
}

// 3. 아이폰 HDR (HLG, 10bit HEVC)
ff('hdr_hlg.mov', [
  ...src('1280x720', 30), ...tone(5, 550),
  '-vf', 'setparams=color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc,format=yuv420p10le',
  // 아이폰처럼 색 정보를 HEVC 스트림(VUI)에도 기록 (ffmpeg 8 은 -color_trc 만으로는 안 남음)
  '-c:v', 'libx265', '-preset', 'ultrafast', '-tag:v', 'hvc1',
  '-x265-params', 'log-level=error:colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc',
  '-color_primaries', 'bt2020', '-color_trc', 'arib-std-b67', '-colorspace', 'bt2020nc',
  '-c:a', 'aac', '-shortest', '-metadata', 'creation_time=2026-08-01T11:00:00Z'
]);

// 4. 가변 프레임(VFR)
ff('vfr.mp4', [
  ...src('1280x720', 30), ...tone(5, 330),
  '-vf', "select='not(mod(n\\,3))+lt(mod(n\\,7)\\,2)'", '-fps_mode', 'vfr',
  '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest'
]);

// 5. 오디오 없는 영상
ff('noaudio.mp4', [...src('1280x720', 30), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p']);

// 6. 사진 (가로, 세로)
ff('photo_landscape.jpg', ['-f', 'lavfi', '-i', 'testsrc2=size=1600x1200:rate=1', '-frames:v', '1']);
ff('photo_portrait.png', ['-f', 'lavfi', '-i', 'smptebars=size=900x1600:rate=1', '-frames:v', '1']);

// 7. 음악 MP3 (30초)
ff('music.mp3', [
  '-f', 'lavfi', '-i',
  "aevalsrc='0.3*sin(2*PI*(220+110*floor(mod(t,4)))*t)|0.3*sin(2*PI*(330+55*floor(mod(t,3)))*t)':s=44100:d=30",
  '-c:a', 'libmp3lame', '-b:a', '128k'
]);

// 8. 확장자는 영상이지만 열 수 없는 파일
const broken = join(dir, 'not_media.mp4');
if (force || !existsSync(broken)) writeFileSync(broken, 'this is not a video file\n'.repeat(100));

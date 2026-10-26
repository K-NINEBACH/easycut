// FFmpeg 명령 생성 순수 함수 (PRD 9.4). 실행은 run.ts 가 담당한다.
// 반환값은 ffmpeg 인자 배열 (공통 옵션 -y, -progress 등은 runFfmpeg 가 붙임).
import type { MediaItem } from '@shared/types';

/** HDR(HLG/PQ) → SDR bt709 톤매핑 (PRD F7, 9.1) */
export const HDR_TO_SDR =
  'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,' +
  'tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p';

const SDR_TAGS = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];

export const PROXY_SHORT_SIDE = 720;
export const PROXY_FPS = 30;

/** 프록시 크기: 짧은 변을 720 (원본보다 크게 만들지 않음), 짝수로 */
export function proxySize(width: number, height: number): { w: number; h: number } {
  const short = Math.min(width, height);
  const scale = Math.min(1, PROXY_SHORT_SIDE / short);
  const even = (n: number): number => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { w: even(width), h: even(height) };
}

/** 미리보기용 프록시: H.264 720p 30fps, 탐색이 빠르도록 키프레임 0.5초 간격 */
export function buildVideoProxyCommand(media: MediaItem, output: string): string[] {
  const { w, h } = proxySize(media.width ?? 1280, media.height ?? 720);
  const vf = [media.isHdr ? HDR_TO_SDR : null, `scale=${w}:${h}`, `fps=${PROXY_FPS}`, 'setsar=1', 'format=yuv420p']
    .filter(Boolean)
    .join(',');
  const args = ['-i', media.path, '-map', '0:v:0'];
  if (media.hasAudio) args.push('-map', '0:a:0');
  args.push(
    '-vf', vf,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-g', '15', '-bf', '0',
    ...SDR_TAGS
  );
  if (media.hasAudio) args.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '48000');
  args.push('-movflags', '+faststart', output);
  return args;
}

/** 사진 프록시: 긴 변 최대 1920 JPG (HEIC 등도 브라우저에서 보이게) */
export function buildImageProxyCommand(media: MediaItem, output: string): string[] {
  return [
    '-i', media.path,
    '-frames:v', '1',
    '-vf', "scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuvj420p",
    '-q:v', '2',
    output
  ];
}

/** 음악 프록시: AAC m4a (ALAC 등 Chromium 재생 불가 코덱 대비) */
export function buildAudioProxyCommand(media: MediaItem, output: string): string[] {
  return ['-i', media.path, '-map', '0:a:0', '-vn', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', output];
}

/** 보관함 썸네일: 영상 1초 지점 (짧으면 중간) */
export function buildThumbnailCommand(input: string, durationSec: number, output: string): string[] {
  const t = durationSec > 0 ? Math.min(1, durationSec / 2) : 0;
  const args = t > 0 ? ['-ss', t.toFixed(3)] : [];
  return [...args, '-i', input, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '4', output];
}

export const FILMSTRIP_HEIGHT = 64;

/** 타임라인 필름스트립: 1초 간격, 파일 이름 00001.jpg = 0초 */
export function buildFilmstripCommand(proxy: string, outDir: string): string[] {
  return [
    '-i', proxy,
    '-an',
    '-vf', `fps=1:round=down,scale=-2:${FILMSTRIP_HEIGHT}`,
    '-q:v', '6',
    `${outDir}/%05d.jpg`
  ];
}

export const WAVEFORM_SAMPLE_RATE = 4000;
export const WAVEFORM_PEAKS_PER_SEC = 20;

/** 파형 추출용 원시 오디오 (mono s16le) 를 stdout 으로 */
export function buildWaveformCommand(input: string): string[] {
  return ['-i', input, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', String(WAVEFORM_SAMPLE_RATE), '-f', 's16le', 'pipe:1'];
}

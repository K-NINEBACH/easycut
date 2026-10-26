// FFmpeg 명령 생성 순수 함수 (PRD 9.4). 실행은 run.ts 가 담당한다.
// 반환값은 ffmpeg 인자 배열 (공통 옵션 -y, -progress 등은 runFfmpeg 가 붙임).
import type { ExportQuality, FitMode, MediaItem, VideoClip } from '@shared/types';

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

// ---------------------------------------------------------------------------
// 렌더 (PRD 9장). M5: 전환·필터·자막·음악 없이 컷 편집만.

export interface RenderFormat {
  width: number;
  height: number;
  fps: number;
}

export const RENDER_SIZES: Record<ExportQuality, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '4k': { width: 3840, height: 2160 }
};

export const AUDIO_RATE = 48000;

/** 화면 맞춤 (PRD F2, 9.1). 입력 [in] → 출력 [out] 인 filter_complex 조각 */
export function fitFilter(mode: FitMode, w: number, h: number): string {
  const cover = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
  const contain = `scale=${w}:${h}:force_original_aspect_ratio=decrease:force_divisible_by=2`;
  if (mode === 'fill') return `[in]${cover}[out]`;
  if (mode === 'black') return `[in]${contain},pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black[out]`;
  // 흐린 배경: 미리보기 셰이더와 같은 세기 (1080p 기준 boxblur=20)
  const radius = Math.max(1, Math.round((20 * h) / 1080));
  return (
    `[in]split[bg0][fg0];[bg0]${cover},boxblur=${radius}[bg];[fg0]${contain}[fg];` +
    `[bg][fg]overlay=(W-w)/2:(H-h)/2[out]`
  );
}

/**
 * 1단계: 장면 하나를 출력 규격(해상도·고정 fps·48kHz 스테레오)의 중간 파일로 (PRD 9.1).
 * frames: 이 장면이 차지할 출력 프레임 수 (timeline.clipFrameCounts). 영상·소리를 정확히 이 길이로 맞춘다.
 * 중간 파일은 .mov + PCM 소리: 이어 붙일 때 AAC 앞부분 지연(priming)으로 소리가 밀리는 것을 피한다.
 */
export function buildClipCommand(
  clip: VideoClip,
  media: MediaItem,
  fmt: RenderFormat,
  frames: number,
  output: string,
  /** 사진 입력 경로 (HEIC 는 미리 변환한 JPG) */
  imagePath?: string
): string[] {
  const { width: w, height: h, fps } = fmt;
  const seconds = frames / fps;
  const samples = Math.round(seconds * AUDIO_RATE);
  const image = clip.imageDuration !== undefined;
  const useSourceAudio = !image && media.hasAudio && !clip.muted && clip.volume > 0;

  const args: string[] = [];
  if (image) {
    args.push('-loop', '1', '-framerate', String(fps), '-t', seconds.toFixed(6), '-i', imagePath ?? media.path);
  } else {
    args.push('-ss', clip.inPoint.toFixed(6), '-t', (clip.outPoint - clip.inPoint).toFixed(6), '-i', media.path);
  }
  if (!useSourceAudio) args.push('-f', 'lavfi', '-i', `anullsrc=r=${AUDIO_RATE}:cl=stereo`);

  const pre: string[] = [];
  if (media.isHdr && !image) pre.push(HDR_TO_SDR);
  pre.push(image ? 'setpts=PTS-STARTPTS' : `setpts=(PTS-STARTPTS)/${clip.speed}`);
  const video =
    `[0:v]${pre.join(',')}[in];` +
    fitFilter(clip.fitMode, w, h) +
    // 끝이 모자라면 마지막 프레임을 늘려서라도 정확히 frames 개
    `;[out]fps=${fps},setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${frames}[v]`;

  const audioParts = useSourceAudio
    ? [
        'asetpts=PTS-STARTPTS',
        ...(clip.speed !== 1 ? [`atempo=${clip.speed}`] : []),
        ...(clip.volume !== 1 ? [`volume=${clip.volume}`] : []),
        `aresample=${AUDIO_RATE}`,
        'aformat=sample_fmts=s16:channel_layouts=stereo'
      ]
    : ['aformat=sample_fmts=s16:channel_layouts=stereo'];
  const audio = `[${useSourceAudio ? '0:a:0' : '1:a'}]${[...audioParts, 'apad', `atrim=end_sample=${samples}`].join(',')}[a]`;

  args.push(
    '-filter_complex', `${video};${audio}`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(fps),
    ...SDR_TAGS,
    '-c:a', 'pcm_s16le', '-ar', String(AUDIO_RATE), '-ac', '2',
    '-f', 'mov', output
  );
  return args;
}

/** concat demuxer 목록 파일 내용. 작은따옴표 안은 그대로 읽히므로 ' 만 이스케이프 */
export function buildConcatList(paths: string[]): string {
  return paths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n';
}

/** 2·3단계: 중간 파일을 이어 붙여 최종 인코딩 (PRD 9.2, 9.3) */
export function buildFinalCommand(listPath: string, output: string, fmt: RenderFormat): string[] {
  return [
    '-f', 'concat', '-safe', '0', '-i', listPath,
    '-map', '0:v:0', '-map', '0:a:0',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-r', String(fmt.fps),
    ...SDR_TAGS,
    '-c:a', 'aac', '-b:a', '192k', '-ar', String(AUDIO_RATE), '-ac', '2',
    '-movflags', '+faststart',
    '-f', 'mp4', output
  ];
}

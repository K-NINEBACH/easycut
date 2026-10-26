import { execFile } from 'node:child_process';
import type { MediaItem, MediaType } from '@shared/types';

/** ffprobe -show_format -show_streams JSON 중 사용하는 부분 */
export interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  color_transfer?: string;
  duration?: string;
  disposition?: { attached_pic?: number };
  tags?: Record<string, string>;
  side_data_list?: { side_data_type?: string; rotation?: number }[];
}

export interface ProbeJson {
  streams?: ProbeStream[];
  format?: { duration?: string; tags?: Record<string, string> };
}

export type ProbedFields = Pick<
  MediaItem,
  | 'duration'
  | 'width'
  | 'height'
  | 'rotation'
  | 'fps'
  | 'isVfr'
  | 'isHdr'
  | 'hasAudio'
  | 'codec'
  | 'createdAt'
>;

function parseRate(rate?: string): number | undefined {
  if (!rate) return undefined;
  const [n, d] = rate.split('/').map(Number);
  if (!n || !d) return undefined;
  return n / d;
}

/** 화면에 보이도록 시계 방향으로 돌려야 하는 각도 (0|90|180|270) */
export function rotationOf(stream: ProbeStream): number {
  const tag = stream.tags?.rotate;
  if (tag !== undefined && tag !== '') return normalizeAngle(Number(tag));
  const dm = stream.side_data_list?.find((s) => s.rotation !== undefined);
  // display matrix 의 rotation 은 반시계 방향 (아이폰 세로 = -90)
  if (dm?.rotation !== undefined) return normalizeAngle(-dm.rotation);
  return 0;
}

function normalizeAngle(a: number): number {
  if (!Number.isFinite(a)) return 0;
  const r = ((Math.round(a / 90) * 90) % 360 + 360) % 360;
  return r;
}

const HDR_TRANSFERS = new Set(['arib-std-b67', 'smpte2084']);

/**
 * ffprobe 결과를 MediaItem 필드로 바꾼다. 열 수 없는 파일이면 null.
 * fallbackCreatedAt: 촬영 시각 메타데이터가 없을 때 쓸 값 (파일 수정 시각)
 */
export function parseProbe(json: ProbeJson, type: MediaType, fallbackCreatedAt?: string): ProbedFields | null {
  const streams = json.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const audio = streams.find((s) => s.codec_type === 'audio');
  const formatDuration = Number(json.format?.duration);

  const createdAt =
    normalizeDate(json.format?.tags?.['com.apple.quicktime.creationdate']) ??
    normalizeDate(json.format?.tags?.creation_time) ??
    normalizeDate(video?.tags?.creation_time) ??
    fallbackCreatedAt;

  if (type === 'audio') {
    if (!audio) return null;
    const duration = Number.isFinite(formatDuration) ? formatDuration : Number(audio.duration);
    if (!(duration > 0)) return null;
    return { duration, hasAudio: true, codec: audio.codec_name, createdAt };
  }

  if (!video || !video.width || !video.height) return null;
  const rotation = rotationOf(video);
  const swap = rotation === 90 || rotation === 270;
  const width = swap ? video.height : video.width;
  const height = swap ? video.width : video.height;

  if (type === 'image') {
    return { duration: 0, width, height, rotation, hasAudio: false, codec: video.codec_name, createdAt };
  }

  const duration = Number.isFinite(formatDuration) ? formatDuration : Number(video.duration);
  if (!(duration > 0)) return null;
  const rFps = parseRate(video.r_frame_rate);
  const avgFps = parseRate(video.avg_frame_rate);
  const fps = avgFps ?? rFps;
  const isVfr = !!(rFps && avgFps && Math.abs(rFps - avgFps) / rFps > 0.01);

  return {
    duration,
    width,
    height,
    rotation,
    fps: fps ? Math.round(fps * 1000) / 1000 : undefined,
    isVfr,
    isHdr: HDR_TRANSFERS.has(video.color_transfer ?? ''),
    hasAudio: !!audio,
    codec: video.codec_name,
    createdAt
  };
}

function normalizeDate(s?: string): string | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 1990) return undefined;
  return d.toISOString();
}

export function runProbe(ffprobe: string, path: string): Promise<ProbeJson> {
  return new Promise((resolve, reject) => {
    execFile(
      ffprobe,
      ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path],
      { windowsHide: true, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err);
        try {
          resolve(JSON.parse(stdout) as ProbeJson);
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

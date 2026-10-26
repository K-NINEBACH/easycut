import type { MediaType } from './types';

// PRD F1 지원 형식
const EXT_TYPES: Record<string, MediaType> = {
  mp4: 'video',
  mov: 'video',
  m4v: 'video',
  mkv: 'video',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  heic: 'image',
  mp3: 'audio',
  m4a: 'audio',
  wav: 'audio',
  aac: 'audio'
};

export function extOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function mediaTypeFromPath(path: string): MediaType | null {
  return EXT_TYPES[extOf(path)] ?? null;
}

export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export const SUPPORTED_EXTENSIONS = Object.keys(EXT_TYPES);

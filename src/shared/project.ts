import type { Project } from './types';

export const PROJECT_FILE = 'project.ezcut';

/** 기본 프로젝트 이름: "2026-10-27 여행 영상" (PRD 5.2) */
export function defaultProjectName(now = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} 여행 영상`;
}

export function newProject(id: string, name: string, now = new Date()): Project {
  const iso = now.toISOString();
  return {
    version: 1,
    id,
    name,
    createdAt: iso,
    updatedAt: iso,
    output: { width: 1920, height: 1080, fps: 30 },
    media: [],
    videoTrack: [],
    transitions: [],
    subtitles: [],
    defaultSubtitleStyle: { presetId: 'basic', size: 'M', position: 'bottom' },
    musicTrack: [],
    music: { volume: 0.3, fadeIn: 1, fadeOut: 3, ducking: true }
  };
}

/** Windows 폴더 이름으로 쓸 수 없는 문자를 바꾼다 */
export function safeFolderName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  const reserved = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
  if (!cleaned || reserved.test(cleaned)) return '새 영상';
  return cleaned.slice(0, 80);
}

import type { JobDone, JobProgress, MediaItem } from '@shared/types';
import { summarizeNames } from '@shared/format';
import { getProject, silent } from './project';
import { toast } from './ui';

/** 파일·폴더 경로를 불러온다 (PRD F1). 새로 들어온 미디어를 돌려준다. */
export async function importPaths(paths: string[]): Promise<MediaItem[]> {
  const project = getProject();
  if (!project || paths.length === 0) return [];
  const res = await window.api.media.import(
    paths,
    project.media.map((m) => m.path)
  );

  if (res.duplicates.length === 1 && res.items.length === 0) {
    toast(`이미 불러온 파일이에요: ${res.duplicates[0].split(/[\\/]/).pop()}`);
  } else if (res.duplicates.length > 0) {
    toast(`이미 불러온 파일 ${res.duplicates.length}개는 건너뛰었어요`);
  }
  if (res.failed.length > 0) {
    toast(`이 파일은 열 수 없어요: ${summarizeNames(res.failed.map((f) => f.fileName))}`, 'error');
  }
  if (res.items.length > 0) {
    silent((d) => {
      d.media.push(...res.items);
    });
  }
  return res.items;
}

export async function pickAndImport(): Promise<MediaItem[]> {
  const paths = await window.api.media.pickFiles();
  return importPaths(paths);
}

/** 프로젝트를 연 뒤 캐시 확인 + 필요한 작업 다시 시작 */
export async function prepareAllMedia(): Promise<void> {
  const project = getProject();
  if (!project || project.media.length === 0) return;
  const prepared = await window.api.media.prepare(project.media);
  const byId = new Map(prepared.map((m) => [m.id, m]));
  silent((d) => {
    d.media = d.media.map((m) => byId.get(m.id) ?? m);
  });
}

/** 메인의 작업 이벤트를 미디어 상태에 반영 */
export function subscribeMediaJobs(): () => void {
  const offProgress = window.api.jobs.onProgress((e: JobProgress) => {
    if (e.kind !== 'media' || !e.targetId) return;
    silent((d) => {
      const m = d.media.find((x) => x.id === e.targetId);
      if (!m || m.proxyStatus === 'ready') return;
      m.proxyStatus = 'processing';
      m.proxyProgress = Math.round(e.progress * 100) / 100;
    });
  });
  const offDone = window.api.jobs.onDone((e: JobDone) => {
    if (e.kind !== 'media' || !e.targetId) return;
    silent((d) => {
      const m = d.media.find((x) => x.id === e.targetId);
      if (!m) return;
      if (e.status === 'done' && e.result) Object.assign(m, e.result as Partial<MediaItem>);
      else if (e.status === 'error') {
        m.proxyStatus = 'error';
        console.error(`[media] ${m.fileName} 준비 실패`, e.error);
      }
    });
  });
  return () => {
    offProgress();
    offDone();
  };
}

/** 보관함 정렬: 촬영 시각순(기본) / 이름순 */
export function sortMedia(media: MediaItem[], mode: 'date' | 'name'): MediaItem[] {
  const list = [...media];
  if (mode === 'name') return list.sort((a, b) => a.fileName.localeCompare(b.fileName, 'ko', { numeric: true }));
  return list.sort(
    (a, b) =>
      (a.createdAt ?? '').localeCompare(b.createdAt ?? '') ||
      a.fileName.localeCompare(b.fileName, 'ko', { numeric: true })
  );
}

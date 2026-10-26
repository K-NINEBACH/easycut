import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Project, RecentProject } from '@shared/types';
import { newProject, PROJECT_FILE, safeFolderName } from '@shared/project';

const BACKUP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_RECENT = 8;

/**
 * 프로젝트 저장/불러오기 (PRD F10)
 * 위치: <projectsRoot>/<프로젝트이름>/project.ezcut + cache/
 * 폴더 이름은 만들 때 정하고 이후 이름을 바꿔도 그대로 둔다 (캐시 경로 유지).
 */
export class ProjectService {
  private currentPath: string | null = null;
  private lastBackupAt = 0;

  constructor(
    private readonly projectsRoot: string,
    private readonly userDataDir: string
  ) {}

  get current(): string | null {
    return this.currentPath;
  }

  get currentDir(): string | null {
    return this.currentPath ? dirname(this.currentPath) : null;
  }

  get cacheDir(): string | null {
    return this.currentDir ? join(this.currentDir, 'cache') : null;
  }

  async create(name: string): Promise<Project> {
    const base = safeFolderName(name);
    await mkdir(this.projectsRoot, { recursive: true });
    let dir = join(this.projectsRoot, base);
    for (let i = 2; existsSync(dir); i++) dir = join(this.projectsRoot, `${base} (${i})`);
    await mkdir(join(dir, 'cache'), { recursive: true });

    const project = newProject(randomUUID(), name.trim() || base);
    const path = join(dir, PROJECT_FILE);
    await writeFile(path, JSON.stringify(project, null, 1), 'utf8');
    this.currentPath = path;
    this.lastBackupAt = Date.now();
    await this.touchRecent(path, project);
    return project;
  }

  async open(path: string): Promise<Project> {
    let project: Project;
    try {
      project = parseProject(await readFile(path, 'utf8'));
    } catch (e) {
      // 본 파일이 깨졌으면 백업본으로 복구
      const bak = `${path}.bak`;
      if (!existsSync(bak)) throw e;
      project = parseProject(await readFile(bak, 'utf8'));
    }
    await mkdir(join(dirname(path), 'cache'), { recursive: true });
    this.currentPath = path;
    this.lastBackupAt = Date.now();
    await this.touchRecent(path, project);
    return project;
  }

  /** 자동 저장 (렌더러가 2초 디바운스로 호출). 임시 파일에 쓴 뒤 교체해서 강제 종료에도 안전 */
  async save(project: Project): Promise<void> {
    const path = this.currentPath;
    if (!path) throw new Error('열린 프로젝트가 없어요');
    const data = JSON.stringify({ ...project, updatedAt: new Date().toISOString() }, null, 1);
    const tmp = `${path}.tmp`;
    await writeFile(tmp, data, 'utf8');
    await renameWithRetry(tmp, path);

    if (Date.now() - this.lastBackupAt >= BACKUP_INTERVAL_MS) {
      await copyFile(path, `${path}.bak`);
      this.lastBackupAt = Date.now();
    }
    await this.touchRecent(path, project);
  }

  async listRecent(): Promise<RecentProject[]> {
    const list = await this.readRecent();
    return list.filter((r) => existsSync(r.path));
  }

  /** 가장 최근 프로젝트 (비정상 종료 후 이어서 열기용) */
  async lastProjectPath(): Promise<string | null> {
    const [first] = await this.listRecent();
    return first?.path ?? null;
  }

  private recentFile(): string {
    return join(this.userDataDir, 'recent.json');
  }

  private async readRecent(): Promise<RecentProject[]> {
    try {
      const list = JSON.parse(await readFile(this.recentFile(), 'utf8'));
      return Array.isArray(list) ? (list as RecentProject[]) : [];
    } catch {
      return [];
    }
  }

  private async touchRecent(path: string, project: Project): Promise<void> {
    const list = (await this.readRecent()).filter((r) => r.path !== path);
    const firstClip = project.videoTrack[0];
    const thumb = firstClip
      ? project.media.find((m) => m.id === firstClip.mediaId)?.thumbnailPath
      : project.media[0]?.thumbnailPath;
    list.unshift({ path, name: project.name, updatedAt: new Date().toISOString(), thumbnailPath: thumb });
    await mkdir(this.userDataDir, { recursive: true });
    await writeFile(this.recentFile(), JSON.stringify(list.slice(0, MAX_RECENT), null, 1), 'utf8');
  }
}

export function parseProject(text: string): Project {
  const p = JSON.parse(text) as Project;
  if (p?.version !== 1 || !Array.isArray(p.videoTrack) || !Array.isArray(p.media)) {
    throw new Error('프로젝트 파일 형식이 올바르지 않아요');
  }
  return p;
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  // Windows 에서 백신 등이 파일을 잠깐 잡고 있으면 EPERM 이 날 수 있다
  for (let i = 0; ; i++) {
    try {
      await rename(from, to);
      return;
    } catch (e) {
      if (i >= 4) throw e;
      await new Promise((r) => setTimeout(r, 50 * (i + 1)));
    }
  }
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

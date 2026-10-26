// 앱 설정 (userData/settings.json): 첫 실행 안내를 봤는지, 프로젝트를 연 채로 꺼졌는지 등
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Settings {
  /** 첫 실행 안내 "다시 보지 않기" (PRD 5.4) */
  tourDone?: boolean;
  /** 프로젝트를 연 상태. 정상 종료 때 false → 다음 실행에 true 면 비정상 종료로 보고 바로 복구 (PRD F10) */
  sessionOpen?: boolean;
}

export class SettingsService {
  private cache: Settings | null = null;

  constructor(private readonly dir: string) {}

  private get file(): string {
    return join(this.dir, 'settings.json');
  }

  get(): Settings {
    if (!this.cache) {
      try {
        this.cache = JSON.parse(readFileSync(this.file, 'utf8')) as Settings;
      } catch {
        this.cache = {};
      }
    }
    return this.cache;
  }

  /** 바로 디스크에 쓴다 (강제 종료에도 남도록, 종료 직전에도 쓸 수 있게 동기) */
  set(patch: Partial<Settings>): void {
    this.cache = { ...this.get(), ...patch };
    mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.cache, null, 1));
    renameSync(tmp, this.file);
  }
}

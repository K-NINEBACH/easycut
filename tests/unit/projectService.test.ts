import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ProjectService } from '../../src/main/services/ProjectService';

const root = mkdtempSync(join(tmpdir(), 'easycut-ps-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('ProjectService', () => {
  const svc = new ProjectService(join(root, 'docs'), join(root, 'user'));

  it('만들기 → 폴더·cache 생성, 같은 이름이면 (2)', async () => {
    const a = await svc.create('제주 여행');
    const pathA = svc.current!;
    expect(pathA).toContain(join('docs', '제주 여행', 'project.ezcut'));
    expect(existsSync(join(svc.currentDir!, 'cache'))).toBe(true);
    await svc.create('제주 여행');
    expect(svc.current).toContain('제주 여행 (2)');
    expect(a.name).toBe('제주 여행');
  });

  it('저장 → 다시 열기, 최근 목록 순서', async () => {
    const p = await svc.create('부산');
    const path = svc.current!;
    await svc.save({ ...p, name: '부산 바다' });
    const opened = await svc.open(path);
    expect(opened.name).toBe('부산 바다');
    const recent = await svc.listRecent();
    expect(recent[0].name).toBe('부산 바다');
    expect(recent.length).toBe(3);
  });

  it('본 파일이 깨지면 백업본으로 복구', async () => {
    const p = await svc.create('백업 테스트');
    const path = svc.current!;
    writeFileSync(`${path}.bak`, JSON.stringify({ ...p, name: '백업본' }));
    writeFileSync(path, '{ 깨진');
    expect((await svc.open(path)).name).toBe('백업본');
  });

  it('최근 목록이 깨져도 가장 최근 프로젝트를 찾는다', async () => {
    await svc.create('마지막');
    const last = svc.current!;
    const future = new Date(Date.now() + 60_000);
    utimesSync(last, future, future);
    writeFileSync(join(root, 'user', 'recent.json'), '');
    expect(await svc.lastProjectPath()).toBe(last);
    expect(JSON.parse(readFileSync(last, 'utf8')).name).toBe('마지막');
  });
});

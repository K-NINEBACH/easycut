// 말소리로 자막 만들기 (PRD 4-2) — 실제 ffmpeg + whisper.cpp.
// 필요: node scripts/fetch-whisper.mjs (whisper-cli + ggml-small), node scripts/make-speech-fixture.mjs
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { produce } from 'immer';
import { afterAll, describe, expect, it } from 'vitest';
import { MediaService } from '../../src/main/services/MediaService';
import { SubtitleService } from '../../src/main/services/SubtitleService';
import { insertMedia, setSpeed, trimClip } from '../../src/shared/ops';
import { newProject } from '../../src/shared/project';
import { layoutTimeline, subtitleRange } from '../../src/shared/timeline';
import type { JobDone, Project, Subtitle } from '../../src/shared/types';
import { waitFor } from './helpers';

const ROOT = join(__dirname, '..', '..');
const whisper = join(ROOT, 'resources', 'bin', process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli');
const model = join(ROOT, 'resources', 'models', 'ggml-small.bin');
const sample = join(ROOT, 'tests', 'speech', 'korean_speech.mp4');
const ready = existsSync(whisper) && existsSync(model) && existsSync(sample);

const root = mkdtempSync(join(tmpdir(), 'easycut-speech-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const done: JobDone[] = [];
const events = { progress: () => {}, done: (e: JobDone) => done.push(e) };
const cache = () => join(root, 'cache');
const media = new MediaService({ ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' }, cache, { progress: () => {}, done: () => {} }, () => {});
const speech = new SubtitleService({ ffmpeg: 'ffmpeg', whisper, model }, cache, events);
const finished = async (id: string): Promise<JobDone> => {
  await waitFor(() => done.some((d) => d.jobId === id), 120_000);
  return done.find((d) => d.jobId === id)!;
};

describe.skipIf(!ready)('말소리로 자막 만들기 (whisper.cpp)', () => {
  let project: Project;

  it('한국어 세 문장을 알아듣고, 타임라인 시간에 맞는 자막으로', async () => {
    const res = await media.import([sample]);
    media.cancelAll();
    project = produce(newProject('말', 'x'), (d) => {
      d.media = res.items;
      insertMedia(d, [res.items[0].id]);
    });
    const t0 = Date.now();
    const r = await finished(speech.generate({ project }));
    expect(r.error).toBeUndefined();
    const subs = r.result as Subtitle[];
    const all = subs.map((s) => s.text).join(' ');
    console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}초:`, subs.map((s) => `[${s.offset.toFixed(1)}~${(s.offset + s.duration).toFixed(1)}] ${s.text}`).join(' / '));
    for (const w of ['바다', '날씨', '산']) expect(all).toContain(w);
    // 시간순, 첫 자막은 처음 몇 초 안, 장면 길이 안
    expect(subs[0].offset).toBeLessThan(2);
    expect(subs.every((s) => s.anchorClipId === project.videoTrack[0].id && s.offset + s.duration <= 17 + 1e-6)).toBe(true);
    expect(subs.every((s) => s.text.split('\n').every((l) => [...l].length <= 20))).toBe(true);
  }, 150_000);

  it('앞을 자르고 2배속인 장면 + 소리 없는 사진: 자른 뒤 시간 기준으로 붙는다', async () => {
    const photo = (await media.import([join(ROOT, 'tests', 'fixtures', 'photo_portrait.png')])).items[0];
    media.cancelAll();
    const p2 = produce(project, (d) => {
      d.media.push(photo);
      d.videoTrack = [];
      insertMedia(d, [photo.id, d.media[0].id]);
      const c = d.videoTrack[1];
      trimClip(d, c.id, 5.5, 17); // 첫 문장 빼고 "날씨가…" 부터
      setSpeed(d, c.id, 2);
    });
    const r = await finished(speech.generate({ project: p2 }));
    expect(r.error).toBeUndefined();
    const subs = r.result as Subtitle[];
    const all = subs.map((s) => s.text).join(' ');
    expect(all).not.toContain('바다');
    expect(all).toContain('날씨');
    expect(subs.every((s) => s.anchorClipId === p2.videoTrack[1].id)).toBe(true);
    // 2배속이라 장면 길이는 5.75초 — 자막은 그 안에
    const layout = layoutTimeline(p2.videoTrack, p2.transitions);
    for (const s of subs) {
      const range = subtitleRange(layout, s);
      expect(range.end).toBeLessThanOrEqual(3 + 5.75 + 1e-6);
      expect(range.start).toBeGreaterThanOrEqual(3);
    }
  }, 150_000);

  it('말소리 장면이 없으면 쉬운 안내', async () => {
    const p3 = produce(project, (d) => {
      d.videoTrack[0].muted = true;
    });
    const r = await finished(speech.generate({ project: p3 }));
    expect(r.status).toBe('error');
    expect(r.error).toContain('말소리가 들어 있는 장면이 없어요');
  });

  it('취소', async () => {
    const id = speech.generate({ project });
    setTimeout(() => speech.cancel(id), 300);
    const r = await finished(id);
    expect(r.status).toBe('canceled');
  });
});

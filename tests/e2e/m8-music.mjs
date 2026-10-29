// M8: 배경음악 — 음악 넣기·자르기·영상 길이에 맞추기·설정, 미리보기 소리 크기(페이드·덕킹 근사), 렌더
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { launch, state, waitReady, check, FIXTURES, ROOT, tempDataDir } from './launch.mjs';

const ffprobe = existsSync(join(ROOT, 'resources', 'bin', 'ffprobe.exe')) ? join(ROOT, 'resources', 'bin', 'ffprobe.exe') : 'ffprobe';
const dataDir = tempDataDir('easycut-e2e-');
const shotDir = process.argv[2] ?? dataDir;
const { app, win } = await launch(dataDir);
await win.evaluate((dir) => window.__ezcut.importPaths([dir]), FIXTURES);
await waitReady(win);

const card = (name) => win.locator(`[data-testid=media-card][title="${name}"]`);
// 0~5초 소리 없는 영상, 5~10초 소리 있는 영상
await card('noaudio.mp4').dblclick();
await card('landscape_h264_30.mp4').dblclick();

// 음악 탭: 아직 음악이 없으면 넣기 버튼과 저작권 안내
await win.getByRole('button', { name: '음악', exact: true }).click();
check(await win.locator('[data-testid=music-add]').isVisible(), '음악 탭에 [♪ 음악 넣기]');
check(await win.getByText('저작권 없는 음악을 써주세요').isVisible(), '저작권 안내 문구');

// 보관함에서 음악을 음악 줄로
await card('music.mp3').dragTo(win.locator('[data-testid=music-track]'));
let p = await state(win);
check(p.musicTrack.length === 1 && p.videoTrack.length === 2, '음악은 음악 줄에 (영상 줄은 그대로)');

// 음악 자르기 손잡이: 뒤에서 22초 잘라 8초로
await win.locator('[data-testid=music-clip]').first().click();
const pps = await win.evaluate(() => window.__ezcut.useUiStore.getState().pxPerSec);
const h = await win.locator('[data-testid=music-trim-out]').boundingBox();
await win.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
await win.mouse.down();
await win.mouse.move(h.x + h.width / 2 - pps * 22, h.y + h.height / 2, { steps: 10 });
await win.mouse.up();
p = await state(win);
const len = p.musicTrack[0].outPoint - p.musicTrack[0].inPoint;
check(Math.abs(len - 8) < 0.1, `음악 손잡이로 자르기 (${len.toFixed(2)}초)`);

// 영상 길이에 맞추기: 8초 → 10초 영상이면 반복 1번 (2초)
await win.locator('[data-testid=music-fit]').click();
p = await state(win);
const total = p.musicTrack.reduce((a, m) => a + m.outPoint - m.inPoint, 0);
check(p.musicTrack.length === 2 && p.musicTrack[1].loop && Math.abs(total - 10) < 0.01, `영상 길이에 맞추기: 반복 (${p.musicTrack.length}곡, ${total.toFixed(2)}초)`);
await win.screenshot({ path: join(shotDir, 'm8-music.png') });

// 설정
await win.locator('[data-testid=music-volume]').fill('50');
await win.locator('[data-testid=music-volume]').blur();
await win.locator('[data-testid=music-fadeout]').click();
p = await state(win);
check(p.music.volume === 0.5 && p.music.fadeOut === 0 && p.music.fadeIn === 1 && p.music.ducking, '볼륨 50%, 끝 페이드 끔');
await win.keyboard.press('Control+z');
check((await state(win)).music.fadeOut === 3, 'Ctrl+Z 로 되돌리기');

// 미리보기 소리 크기: 재생 중 값 확인 (페이드인 1초, 덕킹 근사 50%)
const gainAt = async (t) => {
  await win.evaluate((t) => {
    const { useUiStore } = window.__ezcut;
    useUiStore.getState().setPlayhead(t);
    useUiStore.getState().setPlaying(true);
  }, t);
  await win.waitForTimeout(250);
  const g = await win.evaluate(() => {
    const e = window.__ezcut.preview();
    return { gains: e.music.currentGains, playing: e.music.elements.some((a) => !a.paused) };
  });
  await win.evaluate(() => window.__ezcut.useUiStore.getState().setPlaying(false));
  return g;
};
await win.locator('[data-testid=play-button]').click(); // 오디오 연결 (사용자 동작)
await win.evaluate(() => window.__ezcut.useUiStore.getState().setPlaying(false));
const quiet = await gainAt(3);
check(quiet.playing && Math.abs(Math.max(...quiet.gains) - 0.5) < 0.03, `소리 없는 장면: 음악 50% 그대로 (${quiet.gains.map((g) => g.toFixed(2))})`);
const ducked = await gainAt(6.5);
check(Math.abs(Math.max(...ducked.gains) - 0.25) < 0.03, `말소리 장면: 덕킹 근사 절반 (${ducked.gains.map((g) => g.toFixed(2))})`);
const early = await gainAt(0.2);
check(Math.max(...early.gains) < 0.5 * 0.6, `시작 페이드인 (${early.gains.map((g) => g.toFixed(2))})`);
await win.locator('[data-testid=music-ducking]').click();
const noduck = await gainAt(6.5);
check(Math.abs(Math.max(...noduck.gains) - 0.5) < 0.03, `덕킹 끄면 말소리 장면도 50% (${noduck.gains.map((g) => g.toFixed(2))})`);

// 영상 만들기: 길이 = 영상 길이, 소리 있음
await win.locator('[data-testid=export-button]').click();
await win.waitForFunction(() => document.querySelector('[data-testid=export-path]')?.textContent?.endsWith('.mp4'));
const out = (await win.locator('[data-testid=export-path]').innerText()).trim();
await win.locator('[data-testid=export-start]').click();
await win.locator('[data-testid=export-result]').waitFor({ timeout: 240000 });
const info = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', out], { encoding: 'utf8' }));
const a = info.streams.find((s) => s.codec_type === 'audio');
check(a && Math.abs(Number(a.duration) - 10) <= 0.1 && Math.abs(Number(info.format.duration) - 10) <= 0.1, `음악 넣은 영상 길이 ${Number(info.format.duration).toFixed(2)}초`);
await app.close();

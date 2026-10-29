// 까다로운 입력 시험:
// 1) 한글·공백·따옴표·괄호·&·#·% 가 든 파일/폴더 이름 + 금지 문자가 든 프로젝트 이름
// 2) 모든 기능을 섞어(사진·세로 HEVC·속도·필터·전환·자막 특수문자·배경음악) 영상 만들기 → 결과 파일 검사
// 3) 프로젝트 파일이 깨졌을 때 (백업 있음 / 없음)
// 4) 빈 타임라인에서 영상 만들기 막힘
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, state, waitReady, check, FIXTURES, ROOT, tempDataDir } from './launch.mjs';

const ffprobe = existsSync(join(ROOT, 'resources', 'bin', 'ffprobe.exe')) ? join(ROOT, 'resources', 'bin', 'ffprobe.exe') : 'ffprobe';
const dataDir = tempDataDir('easycut-edge-');
const src = join(dataDir, "원본 폴더 (1) & 'q' #2");
mkdirSync(src);
const files = {
  video: "여행 영상 [1] & 'q' %d.mp4",
  portrait: '세로 영상 ,;=.mov',
  photo: '사진 #1.jpg',
  music: "음악 'bgm'.mp3"
};
copyFileSync(join(FIXTURES, 'landscape_h264_30.mp4'), join(src, files.video));
copyFileSync(join(FIXTURES, 'portrait_hevc_60.mov'), join(src, files.portrait));
copyFileSync(join(FIXTURES, 'photo_landscape.jpg'), join(src, files.photo));
copyFileSync(join(FIXTURES, 'music.mp3'), join(src, files.music));

const errors = [];
const watch = (win) => {
  win.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  win.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
};

// ---- 1) 금지 문자 프로젝트 이름 ----
let { app, win } = await launch(dataDir, { start: 'none' });
watch(win);
await win.locator('[data-testid=start-new]').click();
const badName = '<제주>:"여행"/\\|?* 끝.';
await win.locator('[data-testid=project-name]').fill(badName);
await win.locator('[data-testid=project-create]').click();
await win.waitForFunction(() => window.__ezcut.useProjectStore.getState().project, null, { timeout: 10000 });
check((await state(win)).name === badName, '금지 문자가 든 이름으로도 프로젝트가 만들어짐 (이름은 그대로)');
const projDirs = readdirSync(join(dataDir, 'Documents', '쉬운편집'));
check(projDirs.length === 1 && !/[<>:"/\\|?*]/.test(projDirs[0]), `폴더 이름은 안전하게 바뀜 ("${projDirs[0]}")`);

// ---- 2) 특수문자 파일들로 모든 기능 섞기 ----
await win.evaluate((paths) => window.__ezcut.importPaths(paths), Object.values(files).map((f) => join(src, f)));
await waitReady(win);
let p = await state(win);
check(p.media.length === 4 && p.media.every((m) => m.proxyStatus === 'ready'), '특수문자 파일 4개 불러오기·준비 완료');
const card = (name) => win.locator(`[data-testid=media-card][title="${name.replace(/"/g, '\\"')}"]`);
for (const f of [files.video, files.portrait, files.photo]) await card(f).dblclick();
await card(files.music).dblclick();
p = await state(win);
check(p.videoTrack.length === 3 && p.musicTrack.length === 1, '장면 3개 + 배경음악');

const clip = (i) => win.locator('[data-testid=clip]').nth(i);
// 첫 장면: 2배속 + 필터
await clip(0).click();
await win.getByRole('button', { name: '자르기', exact: true }).click();
await win.locator('[data-testid="speed-2"]').click();
await win.getByRole('button', { name: '필터', exact: true }).click();
await win.locator('[data-testid=filter-warm]').click();
// 둘째(세로): 꽉 채우기
await clip(1).click();
await win.getByRole('button', { name: '자르기', exact: true }).click();
await win.locator('[data-testid=fit-fill]').click();
// 전환: 모두 부드럽게
await win.locator('[data-testid=transition-marker]').first().click();
await win.locator('[data-testid=transition-fade]').click();
await win.locator('[data-testid=transition-apply-all]').click();
// 자막: 특수문자
await clip(0).click();
await win.getByRole('button', { name: '자막', exact: true }).click();
await win.locator('[data-testid=subtitle-add]').click();
const subText = `'따옴표' "쌍" \\백슬래시 {중괄호} :콜론 %퍼센트 [대괄호] 😀`;
await win.locator('[data-testid=subtitle-text]').fill(subText);
await win.locator('[data-testid=subtitle-text]').blur();
await win.waitForTimeout(300);
p = await state(win);
check(p.subtitles.length === 1 && p.subtitles[0].text === subText, '특수문자 자막 저장');
check(p.transitions.filter((t) => t.type === 'fade').length === 2, '전환 2곳');

const total = await win.evaluate(() => {
  const p = window.__ezcut.useProjectStore.getState().project;
  return document.querySelector('[data-testid=time-display]').innerText + '|' + p.videoTrack.length;
});
console.log('  타임라인:', total);

// 영상 만들기
await win.locator('[data-testid=export-button]').click();
const outPath = (await win.locator('[data-testid=export-path]').innerText()).trim();
check(!/[<>:"|?*]/.test(outPath.slice(3)), `저장 이름에 금지 문자 없음 (${outPath})`);
await win.locator('[data-testid=export-start]').click();
await Promise.race([
  win.locator('[data-testid=export-result]').waitFor({ timeout: 300000 }),
  win.locator('[data-testid=export-error]').waitFor({ timeout: 300000 })
]);
const failed = await win.locator('[data-testid=export-error]').count();
if (failed) console.log('  오류 내용:', (await win.locator('[data-testid=export-error]').innerText()).slice(0, 600));
check(!failed, '특수문자 파일·모든 기능 섞은 영상 만들기 성공');
const realOut = failed ? null : (await win.locator('[data-testid=export-result]').innerText()).match(/[A-Z]:\\[^\n]+\.mp4/)?.[0];
if (realOut && existsSync(realOut)) {
  const info = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate', '-of', 'json', realOut]).toString());
  const v = info.streams.find((s) => s.codec_type === 'video');
  const a = info.streams.find((s) => s.codec_type === 'audio');
  const dur = Number(info.format.duration);
  const expected = await win.evaluate(() => {
    const p = window.__ezcut.useProjectStore.getState().project;
    // 타임라인 길이 = 화면의 전체 시간
    return document.querySelector('[data-testid=time-display]').innerText.split('/')[1].trim();
  });
  console.log(`  결과: ${v?.width}x${v?.height} ${v?.r_frame_rate} 소리 ${a ? '있음' : '없음'} ${dur.toFixed(2)}초 (타임라인 ${expected})`);
  check(v?.width === 1920 && v?.height === 1080 && !!a, '1920×1080 + 소리');
  const [mm, ss] = expected.split(':').map(Number);
  check(Math.abs(dur - (mm * 60 + ss)) < 1.1, '결과 길이 ≈ 타임라인 길이');
} else check(false, `결과 파일 찾기 (${realOut})`);
await win.keyboard.press('Escape');
await win.waitForFunction(() => window.__ezcut.useProjectStore.getState().saveState === 'saved', null, { timeout: 10000 });
await app.close();

// ---- 3) 프로젝트 파일이 깨졌을 때 ----
const projFile = join(dataDir, 'Documents', '쉬운편집', projDirs[0], 'project.ezcut');
copyFileSync(projFile, projFile + '.bak');
writeFileSync(projFile, '{ 깨진 파일');
({ app, win } = await launch(dataDir, { start: 'none' }));
watch(win);
await win.locator('[data-testid=start-continue]').click();
await win.waitForFunction(() => window.__ezcut.useProjectStore.getState().project, null, { timeout: 10000 }).catch(() => {});
p = await state(win).catch(() => null);
check(p?.videoTrack.length === 3, '본 파일이 깨지면 백업본으로 열림');
await app.close();

writeFileSync(projFile, '{ 깨진 파일');
writeFileSync(projFile + '.bak', '이것도 깨짐');
({ app, win } = await launch(dataDir, { start: 'none' }));
watch(win);
const startShown = await win.locator('[data-testid=start-screen]').isVisible();
check(startShown, '둘 다 깨져도 앱은 시작 화면으로 뜸');
await win.locator('[data-testid=start-continue]').click().catch(() => {});
await win.waitForTimeout(800);
const msg = await win.locator('[data-testid=start-screen]').innerText();
check(/열지 못했어요/.test(msg), '깨진 프로젝트는 "열지 못했어요" 안내');

// ---- 4) 빈 타임라인 ----
await win.locator('[data-testid=start-new]').click();
await win.locator('[data-testid=project-create]').click();
await win.waitForFunction(() => window.__ezcut.useProjectStore.getState().project);
check(await win.locator('[data-testid=export-button]').isDisabled(), '빈 타임라인이면 [영상 만들기] 꺼짐');
await win.keyboard.press('Control+e');
await win.waitForTimeout(300);
check(!(await win.locator('[data-testid=export-dialog]').count()), '빈 타임라인에서 Ctrl+E 해도 창 안 뜸');
for (const k of ['s', 'Delete', 'Control+z', 'Control+y', 'Control+c', 'Control+v', ' ', 'ArrowRight', 'End', 'Home']) await win.keyboard.press(k);
await win.waitForTimeout(300);
check(!(await win.locator('[data-testid=error-boundary]').count()), '빈 타임라인에서 단축키를 눌러도 오류 없음');
await app.close();

const real = errors.filter((e) => !/net::ERR_ABORTED/.test(e));
if (real.length) console.log('  오류 기록:\n   ' + [...new Set(real)].slice(0, 15).join('\n   '));
check(real.length === 0, `화면 오류 없음 (${real.length}건)`);

// 자동 업데이트 시험 (PRD 13장 #11): 옛 설치 파일을 시험 폴더에 조용히 설치하고,
// 내 PC 안의 시험 서버에 올린 새 버전으로 실제로 업데이트되는지 본다.
//   node tests/e2e/x-update.mjs <옛 설치 파일.exe> <새 버전 폴더(latest.yml·exe·blockmap, 옛 blockmap)>
// 프로젝트는 시험용 데이터 폴더에 만들므로 내 문서는 건드리지 않는다. 끝나면 시험 설치를 지운다.
import { execFileSync, spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { check as checkCond, ROOT } from './launch.mjs';

const { _electron } = createRequire(join(ROOT, 'package.json'))('playwright');
const check = (msg, cond) => checkCond(cond, msg);

const [oldInstaller, feedDir] = process.argv.slice(2);
if (!oldInstaller || !feedDir) throw new Error('사용법: node tests/e2e/x-update.mjs <옛 설치 파일> <새 버전 폴더>');
const newVersion = /version: (.+)/.exec(readFileSync(join(feedDir, 'latest.yml'), 'utf8'))[1].trim();

// --- 시험 서버: 한 구간 Range 요청까지 지원, 파일별로 보낸 바이트를 센다 ---
const sent = {};
const server = createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://x').pathname.slice(1));
  const file = join(feedDir, name);
  if (!name || name.includes('..') || !existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  const size = statSync(file).size;
  const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
  const start = m ? Number(m[1]) : 0;
  const end = m && m[2] ? Number(m[2]) : size - 1;
  res.writeHead(m ? 206 : 200, {
    'Content-Length': end - start + 1,
    'Accept-Ranges': 'bytes',
    ...(m ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {})
  });
  sent[name] = (sent[name] ?? 0) + end - start + 1;
  createReadStream(file, { start, end }).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const feedUrl = `http://127.0.0.1:${server.address().port}/`;

const work = mkdtempSync(join(tmpdir(), 'easycut-update-'));
const installDir = join(work, 'app');
const exe = join(installDir, '쉬운편집.exe');
const env = { ...process.env, EASYCUT_DATA_DIR: join(work, 'data'), EASYCUT_TEST: '1', EASYCUT_UPDATE_URL: feedUrl };

/** 시험 폴더에서 실행 중인 앱을 끈다 (업데이트 뒤 설치 프로그램이 다시 켠 것) */
function killInstalled() {
  const ps = `Get-Process | Where-Object { $_.Path -like '${installDir}\\*' } | Stop-Process -Force`;
  spawnSync('powershell', ['-NoProfile', '-Command', ps]);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 지난번에 받아 둔 새 버전이 있으면 받기를 건너뛰므로 업데이트 임시 폴더를 비운다
const updaterCache = join(process.env.LOCALAPPDATA, 'easycut-updater');
rmSync(updaterCache, { recursive: true, force: true });

try {
  // 1. 옛 버전 설치 (조용히, 시험 폴더에)
  execFileSync(oldInstaller, ['/S', `/D=${installDir}`]);
  check('옛 버전 설치됨', existsSync(exe));

  // 2. 옛 버전 실행 → 프로젝트 하나 만들기 → 새 버전 안내 기다리기
  let app = await _electron.launch({ executablePath: exe, env });
  let win = await app.firstWindow();
  await win.locator('[data-testid=start-screen]').waitFor();
  const oldVersion = (await win.evaluate(() => window.api.app.getInfo())).appVersion;
  console.log(`  옛 버전 ${oldVersion} → 새 버전 ${newVersion}`);
  check('옛 버전이 더 낮음', oldVersion !== newVersion);
  await win.evaluate(() => window.api.project.create('업데이트 시험'));

  const t0 = Date.now();
  await win.locator('[data-testid=update-banner]').waitFor({ timeout: 10 * 60_000 });
  console.log(`  받기 ${((Date.now() - t0) / 1000).toFixed(1)}초, 보낸 양:`, sent);
  check('새 버전 안내가 뜸', await win.getByText(`새 버전(${newVersion})`).isVisible());

  // 3. [지금 다시 시작] → 앱이 꺼지고 설치 프로그램이 새 버전을 깐다
  const closed = new Promise((r) => app.process().once('exit', r));
  const before = statSync(exe).mtimeMs;
  await win.locator('[data-testid=update-restart]').click();
  await closed;
  // 설치 중에는 실행 파일이 잠시 없어진다
  const replaced = () => existsSync(exe) && statSync(exe).mtimeMs !== before;
  for (let i = 0; i < 240 && !replaced(); i++) await sleep(500);
  check('설치 프로그램이 앱을 새로 깔았음', replaced());
  await sleep(5000); // 설치 마무리·다시 켜기를 기다린 뒤 끈다
  killInstalled();
  await sleep(1000);

  // 4. 다시 켜서 버전과 프로젝트 확인
  app = await _electron.launch({ executablePath: exe, env: { ...env, EASYCUT_UPDATE_URL: '' } });
  win = await app.firstWindow();
  await win.locator('[data-testid=start-screen]').waitFor();
  const info = await win.evaluate(() => window.api.app.getInfo());
  check(`새 버전으로 바뀜 (${info.appVersion})`, info.appVersion === newVersion);
  const recent = await win.evaluate(() => window.api.project.listRecent());
  check('만들던 프로젝트가 그대로 있음', recent.some((r) => r.name === '업데이트 시험'));
  check('ffmpeg 그대로 동작', !!info.ffmpeg.version);
  const full = statSync(join(feedDir, `${/path: (.+)/.exec(readFileSync(join(feedDir, 'latest.yml'), 'utf8'))[1].trim()}`)).size;
  const got = Object.values(sent).reduce((a, b) => a + b, 0);
  console.log(`  받은 양 ${(got / 1e6).toFixed(1)}MB / 전체 설치 파일 ${(full / 1e6).toFixed(0)}MB`);
  check('바뀐 부분만 받음 (전체의 절반 미만)', got > 0 && got < full / 2);
  await app.close();
} finally {
  killInstalled();
  server.close();
  const uninstaller = join(installDir, 'Uninstall 쉬운편집.exe');
  // 제거 프로그램은 임시 폴더로 자기를 복사해 돌므로 폴더가 없어질 때까지 기다린다 (바로가기·제어판 등록도 지움)
  if (existsSync(uninstaller)) {
    spawnSync(uninstaller, ['/S']);
    for (let i = 0; i < 120 && existsSync(installDir); i++) await sleep(500);
  }
  check('시험 설치 지움', !existsSync(installDir));
  rmSync(updaterCache, { recursive: true, force: true });
}

// 자막용 무료 한글 글꼴(SIL OFL 1.1 — 상업 이용·동봉 가능)을 resources/fonts 에 내려받는다 (PRD F4, 13장 #6).
// 사용: node scripts/fetch-fonts.mjs [--force]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Google Fonts 저장소의 OFL 글꼴 */
const gf = (dir, name) => ({
  file: `${name}.ttf`,
  url: `https://raw.githubusercontent.com/google/fonts/main/ofl/${dir}/${name}.ttf`,
  license: `${name.split('-')[0]}-OFL.txt`,
  licenseUrl: `https://raw.githubusercontent.com/google/fonts/main/ofl/${dir}/OFL.txt`
});

const FONTS = [
  {
    file: 'Pretendard-Bold.otf',
    url: 'https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/Pretendard-Bold.otf',
    license: 'Pretendard-LICENSE.txt',
    licenseUrl: 'https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/LICENSE'
  },
  {
    file: 'NanumPenScript-Regular.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/nanumpenscript/NanumPenScript-Regular.ttf',
    license: 'NanumPenScript-OFL.txt',
    licenseUrl: 'https://raw.githubusercontent.com/google/fonts/main/ofl/nanumpenscript/OFL.txt'
  },
  {
    file: 'BlackHanSans-Regular.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/blackhansans/BlackHanSans-Regular.ttf',
    license: 'BlackHanSans-OFL.txt',
    licenseUrl: 'https://raw.githubusercontent.com/google/fonts/main/ofl/blackhansans/OFL.txt'
  },
  // 2026-10-30 추가 (PRD 13장 #14)
  gf('dohyeon', 'DoHyeon-Regular'),
  gf('jua', 'Jua-Regular'),
  gf('gowundodum', 'GowunDodum-Regular'),
  gf('gowunbatang', 'GowunBatang-Bold'),
  gf('nanummyeongjo', 'NanumMyeongjo-ExtraBold'),
  gf('nanumgothic', 'NanumGothic-ExtraBold'),
  gf('gaegu', 'Gaegu-Bold'),
  gf('dongle', 'Dongle-Bold'),
  gf('sunflower', 'Sunflower-Bold'),
  gf('yeonsung', 'YeonSung-Regular'),
  gf('singleday', 'SingleDay-Regular'),
  gf('dokdo', 'Dokdo-Regular'),
  gf('cutefont', 'CuteFont-Regular'),
  gf('eastseadokdo', 'EastSeaDokdo-Regular'),
  gf('songmyung', 'SongMyung-Regular'),
  gf('poorstory', 'PoorStory-Regular'),
  gf('gugi', 'Gugi-Regular'),
  gf('gamjaflower', 'GamjaFlower-Regular')
];

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'fonts');
mkdirSync(dir, { recursive: true });
const force = process.argv.includes('--force');

for (const f of FONTS) {
  for (const [name, url] of [
    [f.file, f.url],
    [f.license, f.licenseUrl]
  ]) {
    const target = join(dir, name);
    if (!force && existsSync(target)) continue;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`다운로드 실패 ${url}: HTTP ${res.status}`);
    writeFileSync(target, Buffer.from(await res.arrayBuffer()));
    console.log('받음:', name);
  }
}

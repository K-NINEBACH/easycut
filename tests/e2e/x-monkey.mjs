// 무작위 조작 시험 (몽키 테스트): 화면에서 할 수 있는 동작을 무작위로 수백 번 하면서
// 매번 프로젝트 자료가 올바른지 검사하고, 끝에 되돌리기/다시 하기로 처음·마지막 상태가 그대로 돌아오는지 본다.
// 실행: node tests/e2e/x-monkey.mjs [반복 횟수=300] [씨앗=1]
import { join } from 'node:path';
import { launch, state, waitReady, check, FIXTURES, tempDataDir } from './launch.mjs';

const STEPS = Number(process.argv[2] ?? 300);
let seed = Number(process.argv[3] ?? 1);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];

const dataDir = tempDataDir('easycut-monkey-');
const { app, win } = await launch(dataDir);
const errors = [];
win.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
win.on('console', (m) => {
  // 일부러 막는 403(허용 안 된 파일)은 이 시험에서 나오지 않아야 한다
  if (m.type() === 'error') errors.push('console: ' + m.text());
});

await win.evaluate((dir) => window.__ezcut.importPaths([dir]), FIXTURES);
await waitReady(win);
const cards = win.locator('[data-testid=media-card]');
const snap = async () => {
  const p = await state(win);
  return JSON.stringify({ v: p.videoTrack, t: p.transitions, s: p.subtitles, m: p.musicTrack, ms: p.music, st: p.defaultSubtitleStyle });
};
// 처음 상태 = 장면을 넣기 전 (무작위 되돌리기가 처음 넣은 장면까지 되돌릴 수 있으므로)
const initial = await snap();
const pastAtStart = await win.evaluate(() => window.__ezcut.useProjectStore.getState().past.length);
// 처음 장면 3개
for (let i = 0; i < 3; i++) await cards.nth(i).dblclick();
await win.waitForTimeout(300);

/** 프로젝트 자료가 서로 맞는지 */
async function invariants(action = '') {
  const p = await state(win);
  const bad = [];
  const media = new Map(p.media.map((m) => [m.id, m]));
  const ids = new Set(p.videoTrack.map((c) => c.id));
  for (const c of p.videoTrack) {
    const m = media.get(c.mediaId);
    if (!m) bad.push(`장면 ${c.id} 의 파일이 없음`);
    if (![0.5, 1, 1.5, 2].includes(c.speed)) bad.push(`속도 이상 ${c.speed}`);
    if (!(c.volume >= 0 && c.volume <= 2)) bad.push(`소리 크기 이상 ${c.volume}`);
    if (c.imageDuration !== undefined) {
      if (!(c.imageDuration >= 0.49 && c.imageDuration <= 10)) bad.push(`사진 길이 이상 ${c.imageDuration}`);
    } else {
      if (!(c.inPoint >= 0 && c.outPoint > c.inPoint)) bad.push(`자르기 범위 이상 ${c.inPoint}~${c.outPoint}`);
      if (m && c.outPoint > m.duration + 0.05) bad.push(`끝점이 원본보다 김 ${c.outPoint} > ${m.duration}`);
      if ((c.outPoint - c.inPoint) / c.speed < 0.49) bad.push(`장면이 너무 짧음 ${(c.outPoint - c.inPoint).toFixed(3)}`);
    }
  }
  for (const t of p.transitions) {
    if (!ids.has(t.afterClipId)) bad.push(`없는 장면의 전환 ${t.afterClipId}`);
    // 옮기기로 끝에 간 장면의 전환은 장면을 따라다니도록 남겨 두지만, 지우기 뒤에는 없어야 한다
    if (action.startsWith('지우기') && p.videoTrack.length && p.videoTrack[p.videoTrack.length - 1].id === t.afterClipId)
      bad.push('마지막 장면 뒤에 전환');
  }
  for (const s of p.subtitles) {
    if (!ids.has(s.anchorClipId)) bad.push(`없는 장면에 붙은 자막 "${s.text}"`);
    if (!(s.duration > 0) || !Number.isFinite(s.offset)) bad.push(`자막 시간 이상 ${s.offset}/${s.duration}`);
  }
  for (const m of p.musicTrack) if (!(m.outPoint > m.inPoint && m.inPoint >= 0)) bad.push(`음악 범위 이상 ${m.inPoint}~${m.outPoint}`);
  if (await win.locator('[data-testid=error-boundary]').count()) bad.push('오류 화면이 뜸');
  return bad;
}

const click = async (loc) => {
  if (!(await loc.count())) return false;
  try {
    await loc.click({ timeout: 800 });
    return true;
  } catch {
    return false;
  }
};
const tab = (name) => click(win.getByRole('button', { name, exact: true }));
const anyClip = async () => {
  const n = await win.locator('[data-testid=clip]').count();
  return n ? click(win.locator('[data-testid=clip]').nth(Math.floor(rnd() * n))) : false;
};

const actions = {
  '보관함 두 번 누르기': async () => {
    const n = await cards.count();
    await cards.nth(Math.floor(rnd() * n)).dblclick({ timeout: 800 }).catch(() => {});
  },
  '보관함 [+]': async () => {
    const c = cards.nth(Math.floor(rnd() * (await cards.count())));
    await c.hover({ timeout: 800 }).catch(() => {});
    await click(c.locator('[data-testid=media-add]'));
  },
  '장면 누르기': anyClip,
  '나누기(S)': async () => {
    const total = await win.evaluate(() => {
      const p = window.__ezcut.useProjectStore.getState().project;
      return p.videoTrack.length;
    });
    if (!total) return;
    await win.locator('[data-testid=ruler]').click({ position: { x: 5 + rnd() * 400, y: 10 }, timeout: 800 }).catch(() => {});
    await win.keyboard.press('s');
  },
  '지우기(Delete)': async () => {
    if (await anyClip()) await win.keyboard.press('Delete');
  },
  '되돌리기': () => win.keyboard.press('Control+z'),
  '다시 하기': () => win.keyboard.press('Control+y'),
  '복사·붙여넣기': async () => {
    if (await anyClip()) {
      await win.keyboard.press('Control+c');
      await win.keyboard.press('Control+v');
    }
  },
  '재생/멈춤': () => win.keyboard.press(' '),
  '방향키': () => win.keyboard.press(pick(['ArrowLeft', 'ArrowRight', 'Shift+ArrowRight', 'Home', 'End'])),
  '자르기 손잡이 끌기': async () => {
    if (!(await anyClip())) return;
    const h = win.locator(`[data-testid=${pick(['trim-in', 'trim-out'])}]`).first();
    const b = await h.boundingBox().catch(() => null);
    if (!b) return;
    await win.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await win.mouse.down();
    await win.mouse.move(b.x + b.width / 2 + (rnd() - 0.5) * 300, b.y + b.height / 2, { steps: 5 });
    await win.mouse.up();
  },
  '속도': async () => {
    if (!(await anyClip())) return;
    await tab('자르기');
    await click(win.locator(`[data-testid="speed-${pick(['0.5', '1', '1.5', '2'])}"]`));
  },
  '소리 켜기/끄기': async () => {
    if (!(await anyClip())) return;
    await tab('자르기');
    await click(win.locator('[data-testid=mute-toggle]'));
  },
  '필터': async () => {
    if (!(await anyClip())) return;
    await tab('필터');
    const f = win.locator('[data-testid^=filter-]:not([data-testid=filter-panel]):not([data-testid=filter-apply-all]):not([data-testid=filter-strength])');
    const n = await f.count();
    if (n) await click(f.nth(Math.floor(rnd() * n)));
    if (rnd() < 0.2) await click(win.locator('[data-testid=filter-apply-all]'));
  },
  '전환': async () => {
    const m = win.locator('[data-testid=transition-marker]');
    const n = await m.count();
    if (!n) return;
    await click(m.nth(Math.floor(rnd() * n)));
    const t = win.locator('[data-testid^=transition-]:is(button)[aria-pressed]');
    const k = await t.count();
    if (k) await click(t.nth(Math.floor(rnd() * k)));
    if (rnd() < 0.2) await click(win.locator('[data-testid=transition-apply-all]'));
  },
  '자막 넣기': async () => {
    await tab('자막');
    if (await click(win.locator('[data-testid=subtitle-add]'))) {
      const box = win.locator('[data-testid=subtitle-text]');
      if (await box.count()) {
        await box.fill(pick(['안녕하세요', '제주 바다', '아주 긴 자막 문장이 들어가서 두 줄로 나뉘는지 확인하는 글', '😀 이모지', '']), { timeout: 800 }).catch(() => {});
        await box.blur().catch(() => {});
      }
    }
  },
  '자막 지우기': async () => {
    const b = win.locator('[data-testid=subtitle-block]');
    const n = await b.count();
    if (!n) return;
    await click(b.nth(Math.floor(rnd() * n)));
    await click(win.locator('[data-testid=subtitle-delete]'));
  },
  '자막 끌기': async () => {
    const b = win.locator('[data-testid=subtitle-block]');
    const n = await b.count();
    if (!n) return;
    const bb = await b.nth(Math.floor(rnd() * n)).boundingBox().catch(() => null);
    if (!bb) return;
    await win.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await win.mouse.down();
    await win.mouse.move(bb.x + bb.width / 2 + (rnd() - 0.5) * 400, bb.y + bb.height / 2, { steps: 5 });
    await win.mouse.up();
  },
  '음악 넣기': async () => {
    const music = win.locator('[data-testid=media-card][title="music.mp3"]');
    await music.dragTo(win.locator('[data-testid=music-track]'), { timeout: 1500 }).catch(() => {});
  },
  '음악 길이 맞추기': async () => {
    await tab('음악');
    await click(win.locator('[data-testid=music-fit]'));
  },
  '장면 끌어 옮기기': async () => {
    const c = win.locator('[data-testid=clip]');
    const n = await c.count();
    if (n < 2) return;
    const b = await c.nth(Math.floor(rnd() * n)).boundingBox().catch(() => null);
    if (!b) return;
    await win.mouse.move(b.x + b.width / 2, b.y + 10);
    await win.mouse.down();
    await win.mouse.move(b.x + b.width / 2 + (rnd() - 0.5) * 500, b.y + 10, { steps: 8 });
    await win.mouse.up();
  },
  '확대/축소': () => win.locator('[data-testid=timeline-scroll]').hover().then(() => win.mouse.wheel(0, (rnd() - 0.5) * 600)).catch(() => {}),
  '전체 보기': () => click(win.getByText('전체 보기')),
  'Esc': () => win.keyboard.press('Escape')
};
const names = Object.keys(actions);
const counts = {};
let firstBad = null;
const depthNow = () => win.evaluate(() => window.__ezcut.useProjectStore.getState().past.length);
const historyBad = [];
let maxDepth = 0;
for (let i = 0; i < STEPS; i++) {
  const name = pick(names);
  counts[name] = (counts[name] ?? 0) + 1;
  const before = await snap();
  const d0 = await depthNow();
  try {
    await actions[name]();
  } catch (e) {
    errors.push(`${i}번째 ${name}: ${e.message.split('\n')[0]}`);
  }
  await win.waitForTimeout(40);
  const bad = await invariants(name);
  if (bad.length && !firstBad) {
    firstBad = { step: i, name, bad };
    console.log(`  ${i}번째 동작 "${name}" 뒤 자료 이상:`, bad.join(' / '));
  }
  // 되돌리기 기록 검사: 내용이 바뀌었으면 기록이 늘어야 하고, 그 기록 하나를 되돌리면 바로 전 상태여야 한다
  if (name === '되돌리기' || name === '다시 하기') continue;
  const after = await snap();
  const d1 = await depthNow();
  maxDepth = Math.max(maxDepth, d1);
  if (after !== before && d1 === d0 && d0 < 100) {
    historyBad.push(`${i}번째 "${name}": 기록 없이 내용이 바뀜`);
    if (process.env.MONKEY_DEBUG) {
      const a = JSON.parse(before);
      const b = JSON.parse(after);
      for (const k of Object.keys(a))
        if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) console.log(`    [${k}] 전:`, JSON.stringify(a[k]).slice(0, 700), '\n    후:', JSON.stringify(b[k]).slice(0, 700));
    }
  } else if (d1 > d0) {
    // 여러 단계가 생겼으면 그만큼 되돌린다
    for (let k = d0; k < d1; k++) await win.evaluate(() => window.__ezcut.useProjectStore.getState().undo());
    const undone = await snap();
    for (let k = d0; k < d1; k++) await win.evaluate(() => window.__ezcut.useProjectStore.getState().redo());
    const redone = await snap();
    if (undone !== before) historyBad.push(`${i}번째 "${name}": 되돌려도 전 상태가 아님`);
    if (redone !== after) historyBad.push(`${i}번째 "${name}": 다시 해도 같은 상태가 아님`);
  }
}
if (historyBad.length) console.log('  되돌리기 기록 문제:\n   ' + historyBad.slice(0, 15).join('\n   '));
check(historyBad.length === 0, `모든 편집이 되돌리기 1단계씩 정확히 기록됨 (문제 ${historyBad.length}건)`);
await win.keyboard.press('Escape');
await win.evaluate(() => window.__ezcut.useUiStore.getState().setPlaying(false));
console.log('  동작 횟수:', JSON.stringify(counts));
check(!firstBad, `${STEPS}번 무작위 조작 동안 자료가 늘 올바름`);

// 되돌리기 끝까지 → 처음 상태, 다시 하기 끝까지 → 마지막 상태
const final = await snap();
const depth = await win.evaluate(() => window.__ezcut.useProjectStore.getState().past.length);
for (let k = 0; k < depth - pastAtStart; k++) await win.evaluate(() => window.__ezcut.useProjectStore.getState().undo());
if (maxDepth < 100) check((await snap()) === initial, `되돌리기 ${depth - pastAtStart}번으로 처음 상태`);
else console.log(`  (편집이 되돌리기 한도 100단계를 넘어서 처음 상태 비교는 건너뜀)`);
check((await invariants()).length === 0, '처음 상태로 돌아온 자료도 올바름');
for (let k = 0; k < depth - pastAtStart; k++) await win.evaluate(() => window.__ezcut.useProjectStore.getState().redo());
check((await snap()) === final, '다시 하기로 마지막 상태');

// 자동 저장 → 다시 열어서 같은지
await win.waitForFunction(() => window.__ezcut.useProjectStore.getState().saveState === 'saved', null, { timeout: 10000 });
await app.close();
const again = await launch(dataDir);
const reopened = await again.win.evaluate(() => {
  const p = window.__ezcut.useProjectStore.getState().project;
  return JSON.stringify({ v: p.videoTrack, t: p.transitions, s: p.subtitles, m: p.musicTrack, ms: p.music, st: p.defaultSubtitleStyle });
});
check(reopened === final, '다시 열어도 같은 내용 (자동 저장)');
await again.app.close();

const real = errors.filter((e) => !/net::ERR_ABORTED|Failed to load resource.*404/.test(e));
if (real.length) console.log('  오류 기록:\n   ' + [...new Set(real)].slice(0, 20).join('\n   '));
check(real.length === 0, `화면 오류 없음 (${real.length}건)`);

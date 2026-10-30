import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildAss, buildSrt, escapeAssText, FONTS, resolveStyle, segmentsToSubtitles, usedFontFiles, wrapSubtitle } from '../../src/shared/subtitles';
import {
  addSubtitleAt,
  clearSubtitleStyle,
  deleteClips,
  insertMedia,
  mergeWithNextSubtitle,
  moveClip,
  setSubtitleSpan,
  setSubtitleStyle
} from '../../src/shared/ops';
import { newProject } from '../../src/shared/project';
import { layoutTimeline, subtitleRange } from '../../src/shared/timeline';
import type { MediaItem, Project } from '../../src/shared/types';

const media = (id: string, duration: number): MediaItem => ({
  id, type: 'video', path: `/x/${id}`, fileName: id, fileSize: 1, fileMtime: 1, duration, hasAudio: true, proxyStatus: 'ready'
});
const base = (): Project =>
  produce(newProject('p', 'x'), (d) => {
    d.media = [media('a', 10), media('b', 10)];
    insertMedia(d, ['a', 'b']);
  });

describe('장면 끝에 붙은 자막 (자막은 소속 장면 끝에서 잘림)', () => {
  const visible = (p: Project): boolean[] => {
    const l = layoutTimeline(p.videoTrack, p.transitions);
    return p.subtitles.map((s) => !subtitleRange(l, s).hidden);
  };
  it('장면 끝 바로 앞에 넣어도 보이는 자리로 당긴다', () => {
    const p = produce(base(), (d) => void addSubtitleAt(d, 9.99, 3, '끝'));
    expect(visible(p)).toEqual([true]);
    const r = subtitleRange(layoutTimeline(p.videoTrack, p.transitions), p.subtitles[0]);
    expect(r.end - r.start).toBeGreaterThanOrEqual(0.3 - 1e-9);
  });
  it('끌어서 장면 끝 바로 앞에 놓아도 사라지지 않는다', () => {
    const p = produce(base(), (d) => {
      const s = addSubtitleAt(d, 1, 2, '끌기')!;
      setSubtitleSpan(d, s.id, 9.98, 2);
    });
    expect(visible(p)).toEqual([true]);
  });
});

describe('줄바꿈 (한 줄 20자)', () => {
  it('띄어쓰기에서 나누고, 없으면 20자에서', () => {
    expect(wrapSubtitle('오늘은 바다를 보러 왔어요 날씨가 정말 좋네요')).toEqual(['오늘은 바다를 보러 왔어요 날씨가', '정말 좋네요']);
    expect(wrapSubtitle('가'.repeat(25))).toEqual(['가'.repeat(20), '가'.repeat(5)]);
    expect(wrapSubtitle('첫 줄\n\n둘째 줄 ')).toEqual(['첫 줄', '둘째 줄']);
    expect(wrapSubtitle('😀'.repeat(21))).toEqual(['😀'.repeat(20), '😀']);
  });
});

describe('ASS (영상에 굽기)', () => {
  const p = produce(base(), (d) => {
    addSubtitleAt(d, 1, 2, '안녕 {굵게}\\N 하세요');
    addSubtitleAt(d, 12, 1.5, '제목');
    setSubtitleStyle(d, d.subtitles[1].id, { presetId: 'title' });
    addSubtitleAt(d, 5, 1, '   '); // 빈 자막은 빼기
  });
  const ass = buildAss(layoutTimeline(p.videoTrack, p.transitions), p.subtitles, p.defaultSubtitleStyle);

  it('1080p 기준, 자동 줄바꿈 끔', () => {
    expect(ass).toContain('PlayResX: 1920\nPlayResY: 1080\nWrapStyle: 2');
  });
  it('모양별 Style (기본 = 흰 글씨 검은 테두리 아래, 제목 = 위 큰 글씨)', () => {
    expect(ass).toContain('Style: basic_60_bottom,Pretendard,60,&H00FFFFFF,&H00FFFFFF,&H00000000,&HFF000000,-1,0,0,0,100,100,0,0,1,4,0,2,80,80,64,1');
    expect(ass).toContain('Style: title_90_top,Black Han Sans,90,');
    expect(ass).toMatch(/,1,5,0,8,80,80,64,1/);
  });
  it('시간·특수문자', () => {
    expect(ass).toContain('Dialogue: 0,0:00:01.00,0:00:03.00,basic_60_bottom,,0,0,0,,안녕 ｛굵게｝＼N 하세요');
    expect(ass).toContain('Dialogue: 0,0:00:12.00,0:00:13.50,title_90_top,,0,0,0,,제목');
    expect(ass.match(/^Dialogue/gm)?.length).toBe(2);
    expect(escapeAssText('a{b}c\\d')).toBe('a｛b｝c＼d');
  });
  it('반투명 박스는 BorderStyle 3 + 반투명 상자색', () => {
    const q = produce(p, (d) => setSubtitleStyle(d, 'all', { presetId: 'box' }));
    const a2 = buildAss(layoutTimeline(q.videoTrack, q.transitions), q.subtitles, q.defaultSubtitleStyle);
    expect(a2).toMatch(/Style: box_60_bottom,Pretendard,60,&H00FFFFFF,&H00FFFFFF,&H66000000,&HFF000000,-1,0,0,0,100,100,0,0,3,14,0,2/);
  });
  it('색 상자 (노란 상자 = 노란 상자색, 검은 글씨)', () => {
    const q = produce(p, (d) => setSubtitleStyle(d, 'all', { presetId: 'yellowbox' }));
    const a2 = buildAss(layoutTimeline(q.videoTrack, q.transitions), q.subtitles, q.defaultSubtitleStyle);
    // &HAABBGGRR: 0.95 불투명 → 투명도 0D, #FFD83D → 3DD8FF
    expect(a2).toMatch(/Style: yellowbox_60_bottom,Pretendard,60,&H001A1A1A,&H001A1A1A,&H0D3DD8FF,/);
  });
});

describe('글꼴·색 직접 고르기 (PRD 13장 #14)', () => {
  it('글꼴 파일이 모두 있고 이름이 겹치지 않음', () => {
    const files = Object.values(FONTS).map((f) => f.file);
    expect(new Set(files).size).toBe(files.length);
    for (const f of files) expect(existsSync(join(__dirname, '../../resources/fonts', f)), f).toBe(true);
  });
  it('고른 글꼴·글자 색·테두리 색이 ASS Style 에 들어가고 이름으로 구분', () => {
    const q = produce(base(), (d) => {
      addSubtitleAt(d, 1, 2, '하나');
      setSubtitleStyle(d, 'all', { fontId: 'jua', color: '#ff8a3d', outlineColor: '#1A1A1A' });
    });
    const a = buildAss(layoutTimeline(q.videoTrack, q.transitions), q.subtitles, q.defaultSubtitleStyle);
    expect(a).toContain('Style: basic_60_bottom_jua_FF8A3D_1A1A1A,Jua,60,&H003D8AFF,&H003D8AFF,&H001A1A1A,&HFF000000,0,');
    expect(usedFontFiles(layoutTimeline(q.videoTrack, q.transitions), q.subtitles, q.defaultSubtitleStyle)).toEqual(['Jua-Regular.ttf']);
  });
  it('상자 모양이면 테두리 색 = 상자 색, 잘못된 값은 무시', () => {
    expect(resolveStyle({ presetId: 'box', size: 'M', position: 'bottom', outlineColor: '#123456' }).preset.boxColor).toBe('#123456');
    const r = resolveStyle({ presetId: 'basic', size: 'M', position: 'bottom', fontId: 'nope', color: 'red' });
    expect(r.preset.font.family).toBe('Pretendard');
    expect(r.preset.color).toBe('#FFFFFF');
    expect(r.custom).toBeUndefined();
  });
  it('모양 카드를 고르면 직접 고른 글꼴·색은 지움 (이 자막만은 null 로 덮음)', () => {
    let q = produce(base(), (d) => {
      addSubtitleAt(d, 1, 2, '하나');
      setSubtitleStyle(d, 'all', { fontId: 'dokdo', color: '#FF4F8B' });
      setSubtitleStyle(d, 'all', { presetId: 'yellow' });
    });
    expect(q.defaultSubtitleStyle.fontId).toBeUndefined();
    expect(q.defaultSubtitleStyle.color).toBeUndefined();
    q = produce(q, (d) => {
      setSubtitleStyle(d, 'all', { color: '#5AB8FF' });
      setSubtitleStyle(d, d.subtitles[0].id, { presetId: 'mint' });
    });
    const eff = { ...q.defaultSubtitleStyle, ...q.subtitles[0].styleOverride };
    expect(resolveStyle(eff).preset.color).toBe('#FFFFFF');
  });
});

describe('크기 세밀 조절·직접 옮기기 (PRD 13장 #13)', () => {
  it('5단계 크기 × 세밀 배율 (범위 밖은 0.7~1.5 로)', () => {
    expect(resolveStyle({ presetId: 'basic', size: 'XS', position: 'bottom' }).size).toBe(38);
    expect(resolveStyle({ presetId: 'basic', size: 'XL', position: 'bottom' }).size).toBe(96);
    expect(resolveStyle({ presetId: 'basic', size: 'M', position: 'bottom', sizeScale: 1.2 }).size).toBe(72);
    expect(resolveStyle({ presetId: 'basic', size: 'M', position: 'bottom', sizeScale: 9 }).size).toBe(90);
  });
  it('옮긴 자리는 ASS \\an5\\pos 로, 가장자리 밖으로는 못 나감', () => {
    const q = produce(base(), (d) => {
      addSubtitleAt(d, 1, 2, '여기');
      setSubtitleStyle(d, 'all', { x: 0.25, y: 0.3 });
    });
    const a = buildAss(layoutTimeline(q.videoTrack, q.transitions), q.subtitles, q.defaultSubtitleStyle);
    expect(a).toContain(',,0,0,0,,{\\an5\\pos(480,324)}여기');
    expect(resolveStyle({ presetId: 'basic', size: 'M', position: 'bottom', x: -1, y: 2 }).pos).toEqual({ x: 77, y: 1037 });
  });
  it('모양을 바꿔도 옮긴 자리는 그대로, 위·가운데·아래를 고르면 원래 자리로', () => {
    let q = produce(base(), (d) => {
      addSubtitleAt(d, 1, 2, '하나');
      setSubtitleStyle(d, 'all', { x: 0.5, y: 0.5 });
      setSubtitleStyle(d, 'all', { presetId: 'titleyellow' });
    });
    expect(q.defaultSubtitleStyle).toMatchObject({ x: 0.5, y: 0.5, position: 'top' });
    // 이 자막만 아래로: 전체의 옮긴 자리를 null 로 덮음
    q = produce(q, (d) => setSubtitleStyle(d, d.subtitles[0].id, { position: 'bottom' }));
    const eff = { ...q.defaultSubtitleStyle, ...q.subtitles[0].styleOverride };
    expect(resolveStyle(eff).pos).toBeUndefined();
    expect(JSON.parse(JSON.stringify(eff)).x).toBeNull();
    q = produce(q, (d) => setSubtitleStyle(d, 'all', { position: 'middle' }));
    expect(q.defaultSubtitleStyle.x).toBeUndefined();
  });
});

describe('SRT (유튜브 자막)', () => {
  it('번호·시간(쉼표 밀리초)·줄바꿈, 시간순', () => {
    const p = produce(base(), (d) => {
      addSubtitleAt(d, 12.345, 2, '두 번째');
      addSubtitleAt(d, 0.5, 1.25, '첫 번째 자막입니다 길게 써서 줄이 나뉘는지 봅니다');
    });
    expect(buildSrt(layoutTimeline(p.videoTrack, p.transitions), p.subtitles)).toBe(
      '1\n00:00:00,500 --> 00:00:01,750\n첫 번째 자막입니다 길게 써서 줄이\n나뉘는지 봅니다\n\n2\n00:00:12,345 --> 00:00:14,345\n두 번째\n'
    );
  });
});

describe('자막 편집 (PRD 4-1)', () => {
  it('추가: 3초, 겹치면 뒤로, 자리 없으면 null', () => {
    const p = produce(base(), (d) => {
      addSubtitleAt(d, 1);
      expect(addSubtitleAt(d, 2)!).toMatchObject({ offset: 4, duration: 3 }); // 1~4 뒤
      // 끝 근처면 남은 만큼만 (최소 0.3초)
      expect(addSubtitleAt(d, 19.9)!).toMatchObject({ offset: 9.7, duration: expect.closeTo(0.3) });
    });
    expect(p.subtitles.length).toBe(3);
    // 자막은 소속 장면 끝에서 잘리므로 장면마다 하나씩 꽉 채우면 자리가 없다
    const full = produce(base(), (d) => {
      addSubtitleAt(d, 0, 10);
      addSubtitleAt(d, 10, 10);
      expect(addSubtitleAt(d, 5)).toBeNull();
    });
    expect(full.subtitles.length).toBe(2);
  });

  it('옮기면 소속 장면이 바뀌고, 다른 자막과 겹치지 않게', () => {
    const p = produce(base(), (d) => {
      addSubtitleAt(d, 1, 2);
      addSubtitleAt(d, 5, 2);
      setSubtitleSpan(d, d.subtitles[1].id, 12, 2);
      setSubtitleSpan(d, d.subtitles[0].id, 11, 3); // 12~14 와 겹침 → 11~12 로 줄어듦
    });
    const l = layoutTimeline(p.videoTrack, p.transitions);
    expect(p.subtitles[1].anchorClipId).toBe(p.videoTrack[1].id);
    expect(subtitleRange(l, p.subtitles[0])).toMatchObject({ start: 11, end: 12 });
  });

  it('장면 순서를 바꾸면 자막도 따라가고, 장면을 지우면 같이 지워짐', () => {
    const p = produce(base(), (d) => {
      addSubtitleAt(d, 11, 2, 'b 장면');
      moveClip(d, 1, 0);
    });
    expect(subtitleRange(layoutTimeline(p.videoTrack, p.transitions), p.subtitles[0]).start).toBe(1);
    const q = produce(p, (d) => deleteClips(d, [d.videoTrack[0].id]));
    expect(q.subtitles).toEqual([]);
  });

  it('합치기: 다음 자막과 글·시간을 합친다', () => {
    const p = produce(base(), (d) => {
      addSubtitleAt(d, 1, 1, '안녕');
      addSubtitleAt(d, 3, 1, '하세요');
      expect(mergeWithNextSubtitle(d, d.subtitles[0].id)).toBe(true);
    });
    expect(p.subtitles.length).toBe(1);
    expect(p.subtitles[0].text).toBe('안녕 하세요');
    expect(subtitleRange(layoutTimeline(p.videoTrack, p.transitions), p.subtitles[0])).toMatchObject({ start: 1, end: 4 });
  });

  it('모양: 모든 자막 / 이 자막만, 제목형은 위로', () => {
    const p = produce(base(), (d) => {
      addSubtitleAt(d, 1, 1, 'a');
      setSubtitleStyle(d, 'all', { presetId: 'yellow', size: 'L' });
      setSubtitleStyle(d, d.subtitles[0].id, { presetId: 'title' });
    });
    expect(p.defaultSubtitleStyle).toEqual({ presetId: 'yellow', size: 'L', position: 'bottom' });
    expect(p.subtitles[0].styleOverride).toEqual({ presetId: 'title', position: 'top' });
    expect(resolveStyle({ ...p.defaultSubtitleStyle, ...p.subtitles[0].styleOverride })).toMatchObject({ size: 114, position: 'top' });
    const q = produce(p, (d) => clearSubtitleStyle(d, d.subtitles[0].id));
    expect(q.subtitles[0].styleOverride).toBeUndefined();
  });
});

describe('말소리 → 자막 (PRD 4-2)', () => {
  const spans = [
    { clipId: 'a', start: 0, length: 5 },
    { clipId: 'b', start: 5, length: 4 }
  ];
  it('구간이 시작하는 장면에 붙고, 장면 끝을 넘지 않음', () => {
    const r = segmentsToSubtitles(
      [
        { start: 0.5, end: 2, text: ' 안녕하세요.' },
        { start: 4.2, end: 6.5, text: ' -걸쳐 있는 말' },
        { start: 6, end: 7, text: '   ' }
      ],
      spans
    );
    expect(r).toEqual([
      { anchorClipId: 'a', offset: 0.5, duration: 1.5, text: '안녕하세요.' },
      { anchorClipId: 'a', offset: expect.closeTo(4.2), duration: expect.closeTo(0.8), text: '걸쳐 있는 말' }
    ]);
  });
  it('두 줄(40자)을 넘으면 나누고 시간은 글자 수 비율로', () => {
    const long = '오늘은 아침 일찍 일어나서 바닷가를 따라 오래 걸었어요 그리고 작은 카페에서 따뜻한 커피를 마셨습니다';
    const r = segmentsToSubtitles([{ start: 5, end: 9, text: long }], spans);
    expect(r.length).toBe(2);
    expect(r.every((x) => x.anchorClipId === 'b' && x.text.split('\n').length <= 2)).toBe(true);
    expect(r[0].offset).toBe(0);
    expect(r[0].duration + r[1].duration).toBeCloseTo(4);
    expect(r[1].offset).toBeCloseTo(r[0].duration);
  });
});

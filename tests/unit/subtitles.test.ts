import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { buildAss, buildSrt, escapeAssText, resolveStyle, wrapSubtitle } from '../../src/shared/subtitles';
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

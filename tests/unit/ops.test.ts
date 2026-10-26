import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import {
  addSubtitle,
  clampSubtitleSpan,
  deleteClips,
  fitMusicToVideo,
  insertMedia,
  moveClip,
  moveClipsTo,
  moveSubtitle,
  setSpeed,
  splitClip,
  trimClip
} from '../../src/shared/ops';
import { newProject } from '../../src/shared/project';
import { layoutMusic, layoutTimeline, subtitleRange } from '../../src/shared/timeline';
import type { MediaItem, Project } from '../../src/shared/types';

function media(id: string, type: MediaItem['type'], duration: number): MediaItem {
  return {
    id,
    type,
    path: `/x/${id}`,
    fileName: id,
    fileSize: 1,
    fileMtime: 1,
    duration,
    hasAudio: type !== 'image',
    proxyStatus: 'ready'
  };
}

function base(): Project {
  const p = newProject('p', 'test');
  p.media = [media('v1', 'video', 10), media('v2', 'video', 6), media('img', 'image', 0), media('mus', 'audio', 30)];
  return p;
}

const ids = (p: Project): string[] => p.videoTrack.map((c) => c.mediaId);

describe('insertMedia', () => {
  it('영상·사진은 영상 트랙에, 음악은 음악 트랙에', () => {
    const p = produce(base(), (d) => {
      insertMedia(d, ['v1', 'mus', 'img']);
      insertMedia(d, ['v2'], 1);
    });
    expect(ids(p)).toEqual(['v1', 'v2', 'img']);
    expect(p.musicTrack.map((m) => m.mediaId)).toEqual(['mus']);
    const img = p.videoTrack[2];
    expect(img.imageDuration).toBe(3);
  });
});

describe('순서 변경·삭제 시 전환·자막이 따라감', () => {
  const start = produce(base(), (d) => {
    insertMedia(d, ['v1', 'v2', 'img']);
    const [a, b] = d.videoTrack;
    d.transitions.push({ afterClipId: a.id, type: 'fade', duration: 1 });
    d.subtitles.push({ id: 's1', text: '안녕', anchorClipId: b.id, offset: 1, duration: 2 });
  });

  it('moveClip: 자막은 소속 클립과 같이 이동', () => {
    const p = produce(start, (d) => moveClip(d, 1, 0));
    expect(ids(p)).toEqual(['v2', 'v1', 'img']);
    const l = layoutTimeline(p.videoTrack, p.transitions);
    // v2 가 맨 앞 → 자막 1초. v1 뒤 전환은 이제 v1-img 사이
    expect(subtitleRange(l, p.subtitles[0]).start).toBe(1);
    expect(l.total).toBeCloseTo(6 + 10 + 3 - 1);
  });

  it('moveClipsTo: 여러 개를 한 번에', () => {
    const p = produce(start, (d) => moveClipsTo(d, [d.videoTrack[0].id, d.videoTrack[1].id], 3));
    expect(ids(p)).toEqual(['img', 'v1', 'v2']);
  });

  it('deleteClips: 붙어 있던 전환·자막도 삭제', () => {
    const p = produce(start, (d) => deleteClips(d, [d.videoTrack[0].id, d.videoTrack[1].id]));
    expect(ids(p)).toEqual(['img']);
    expect(p.transitions).toEqual([]);
    expect(p.subtitles).toEqual([]);
  });
});

describe('trim / speed / split', () => {
  const start = produce(base(), (d) => {
    insertMedia(d, ['v1', 'v2']);
    const a = d.videoTrack[0];
    d.subtitles.push({ id: 's1', text: 'a', anchorClipId: a.id, offset: 4, duration: 2 });
    d.subtitles.push({ id: 's2', text: 'b', anchorClipId: a.id, offset: 7, duration: 1 });
    d.transitions.push({ afterClipId: a.id, type: 'fade', duration: 0.6 });
  });
  const a = start.videoTrack[0].id;

  it('앞을 자르면 자막이 내용과 함께 당겨짐', () => {
    const p = produce(start, (d) => trimClip(d, a, 2, 10));
    expect(p.videoTrack[0].inPoint).toBe(2);
    expect(p.subtitles[0].offset).toBe(2);
  });

  it('원본 길이 이상으로 늘릴 수 없음, 최소 0.5초', () => {
    let p = produce(start, (d) => trimClip(d, a, -3, 99));
    expect([p.videoTrack[0].inPoint, p.videoTrack[0].outPoint]).toEqual([0, 10]);
    p = produce(start, (d) => trimClip(d, a, 0, 0.1));
    expect(p.videoTrack[0].outPoint).toBe(0.5);
    p = produce(start, (d) => trimClip(d, a, 9.9, 10));
    expect(p.videoTrack[0].inPoint).toBe(9.5);
  });

  it('속도 2배: 자막 시간도 절반', () => {
    const p = produce(start, (d) => setSpeed(d, a, 2));
    expect(p.subtitles[0]).toMatchObject({ offset: 2, duration: 1 });
    expect(layoutTimeline(p.videoTrack, []).clips[0].length).toBe(5);
  });

  it('나누기: 뒤쪽 자막·전환은 새 클립으로', () => {
    let newClip = '';
    const p = produce(start, (d) => {
      newClip = splitClip(d, a, 5)!;
    });
    expect(p.videoTrack.length).toBe(3);
    expect([p.videoTrack[0].inPoint, p.videoTrack[0].outPoint]).toEqual([0, 5]);
    expect([p.videoTrack[1].inPoint, p.videoTrack[1].outPoint]).toEqual([5, 10]);
    expect(p.subtitles[0]).toMatchObject({ anchorClipId: a, offset: 4 });
    expect(p.subtitles[1]).toMatchObject({ anchorClipId: newClip, offset: 2 });
    expect(p.transitions[0].afterClipId).toBe(newClip);
    // 나눈 뒤에도 자막 절대 위치는 그대로
    const before = layoutTimeline(start.videoTrack, start.transitions);
    const after = layoutTimeline(p.videoTrack, p.transitions);
    expect(subtitleRange(after, p.subtitles[1]).start).toBeCloseTo(subtitleRange(before, start.subtitles[1]).start);
  });

  it('나누기: 끝에 너무 가까우면 안 함', () => {
    const p = produce(start, (d) => {
      expect(splitClip(d, a, 0.2)).toBeNull();
    });
    expect(p.videoTrack.length).toBe(2);
  });

  it('사진 나누기', () => {
    const p = produce(base(), (d) => {
      insertMedia(d, ['img']);
      splitClip(d, d.videoTrack[0].id, 1);
    });
    expect(p.videoTrack.map((c) => c.imageDuration)).toEqual([1, 2]);
  });
});

describe('음악 길이 맞추기', () => {
  it('영상보다 짧으면 반복', () => {
    const p = produce(base(), (d) => {
      insertMedia(d, ['v1', 'v1', 'v1', 'v1', 'v1', 'v1', 'v1']); // 70초
      insertMedia(d, ['mus']); // 30초
      fitMusicToVideo(d);
    });
    const l = layoutMusic(p.musicTrack);
    expect(p.musicTrack.map((m) => m.loop)).toEqual([false, true, true]);
    expect(l[l.length - 1].end).toBeCloseTo(70);
  });
  it('영상보다 길면 끝을 자름, 다시 눌러도 같은 결과', () => {
    const once = produce(base(), (d) => {
      insertMedia(d, ['v1']);
      insertMedia(d, ['mus']);
      fitMusicToVideo(d);
    });
    expect(once.musicTrack.length).toBe(1);
    expect(once.musicTrack[0].outPoint).toBe(10);
    const twice = produce(once, (d) => fitMusicToVideo(d));
    expect(twice.musicTrack).toEqual(once.musicTrack);
  });
});

describe('자막 배치', () => {
  it('추가 시 재생 위치 아래 클립이 anchor', () => {
    const p = produce(base(), (d) => {
      insertMedia(d, ['v1', 'v2']);
      addSubtitle(d, 12, 3, '하이');
    });
    expect(p.subtitles[0]).toMatchObject({ anchorClipId: p.videoTrack[1].id, offset: 2 });
  });
  it('다른 클립 구간으로 옮기면 anchor 재계산', () => {
    const p = produce(base(), (d) => {
      insertMedia(d, ['v1', 'v2']);
      const s = addSubtitle(d, 12, 3)!;
      moveSubtitle(d, s.id, 3);
    });
    expect(p.subtitles[0]).toMatchObject({ anchorClipId: p.videoTrack[0].id, offset: 3 });
  });
  it('겹치지 않게 막음', () => {
    const ranges = [
      { id: 'a', start: 0, end: 3 },
      { id: 'b', start: 5, end: 8 }
    ];
    expect(clampSubtitleSpan(ranges, 'new', 1, 3, 20)).toEqual({ start: 3, duration: 2 });
    expect(clampSubtitleSpan(ranges, 'new', 8, 3, 20)).toEqual({ start: 8, duration: 3 });
    expect(clampSubtitleSpan(ranges, 'new', 4.9, 3, 20)).toBeNull();
  });
});

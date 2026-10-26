import { describe, expect, it } from 'vitest';
import { buildClipCommand, buildConcatList, buildFinalCommand, fitFilter } from '../../src/main/ffmpeg/commands';
import { clipFrameCounts, layoutTimeline } from '../../src/shared/timeline';
import type { MediaItem, VideoClip } from '../../src/shared/types';

const video: MediaItem = {
  id: 'm1',
  type: 'video',
  path: 'D:\\여행 영상\\IMG_0001.MOV',
  fileName: 'IMG_0001.MOV',
  fileSize: 1,
  fileMtime: 1,
  duration: 10,
  width: 1080,
  height: 1920,
  rotation: 90,
  fps: 60,
  hasAudio: true,
  proxyStatus: 'ready'
};
const photo: MediaItem = { ...video, id: 'p1', type: 'image', path: 'D:\\사진\\a.jpg', duration: 0, hasAudio: false };

const clip = (over: Partial<VideoClip> = {}): VideoClip => ({
  id: 'c1',
  mediaId: 'm1',
  inPoint: 1.5,
  outPoint: 6,
  speed: 1,
  muted: false,
  volume: 1,
  fitMode: 'blur',
  filter: 'none',
  filterStrength: 1,
  adjust: { brightness: 0, contrast: 0, saturation: 0 },
  ...over
});

const fmt = { width: 1920, height: 1080, fps: 30 };
const filterOf = (args: string[]): string => args[args.indexOf('-filter_complex') + 1];

describe('렌더 명령 (PRD 9.1)', () => {
  it('기본: 구간 자르기 + 흐린 배경 + 고정 30fps + PCM 소리 (스냅샷)', () => {
    expect(buildClipCommand(clip(), video, fmt, 135, 'D:\\cache\\clip_0000.mov')).toMatchSnapshot();
  });

  it('fitMode 별 화면 맞춤', () => {
    expect(fitFilter('fill', 1920, 1080)).toMatchSnapshot();
    expect(fitFilter('black', 1920, 1080)).toMatchSnapshot();
    expect(fitFilter('blur', 1280, 720)).toContain('boxblur=13');
  });

  it('2배속: 영상 setpts, 소리 atempo (음높이 유지), 볼륨', () => {
    const f = filterOf(buildClipCommand(clip({ speed: 2, volume: 1.5 }), video, fmt, 68, 'o.mov'));
    expect(f).toContain('setpts=(PTS-STARTPTS)/2');
    expect(f).toContain('atempo=2');
    expect(f).toContain('volume=1.5');
    expect(f).toContain('trim=end_frame=68');
    // 68프레임 = 2.2667초 = 108800 샘플
    expect(f).toContain('atrim=end_sample=108800');
  });

  it('소리 끔·소리 없는 영상·사진은 무음 트랙 (모든 중간 파일에 소리 필수)', () => {
    for (const [c, m] of [
      [clip({ muted: true }), video],
      [clip(), { ...video, hasAudio: false }],
      [clip({ mediaId: 'p1', inPoint: 0, outPoint: 3, imageDuration: 3 }), photo]
    ] as const) {
      const args = buildClipCommand(c, m, fmt, 90, 'o.mov');
      expect(args).toContain('anullsrc=r=48000:cl=stereo');
      expect(filterOf(args)).toContain('[1:a]');
    }
  });

  it('사진: 반복 입력으로 길이만큼', () => {
    const args = buildClipCommand(clip({ mediaId: 'p1', inPoint: 0, outPoint: 3, imageDuration: 3 }), photo, fmt, 90, 'o.mov');
    expect(args.slice(0, 8)).toEqual(['-loop', '1', '-framerate', '30', '-t', '3.000000', '-i', 'D:\\사진\\a.jpg']);
  });

  it('HDR 은 SDR 로 톤매핑', () => {
    expect(filterOf(buildClipCommand(clip(), { ...video, isHdr: true }, fmt, 135, 'o.mov'))).toContain('tonemap=tonemap=hable');
  });

  it('최종 인코딩: H.264 High + AAC 192k + faststart (스냅샷)', () => {
    expect(buildFinalCommand('D:\\cache\\list.txt', 'D:\\내 동영상\\여행.mp4', fmt)).toMatchSnapshot();
  });

  it('이어 붙이기 목록: 한글·공백·작은따옴표 경로', () => {
    expect(buildConcatList(["D:\\캐시 폴더\\clip_0000.mov", "D:\\it's\\clip_0001.mov"])).toBe(
      "file 'D:\\캐시 폴더\\clip_0000.mov'\nfile 'D:\\it'\\''s\\clip_0001.mov'\n"
    );
  });
});

describe('장면별 프레임 수', () => {
  it('장면이 많아도 전체 프레임 = 전체 길이 (누적 오차 없음)', () => {
    // 1.01초 장면 40개: 장면마다 반올림하면 30프레임 × 40 = 1200 (실제 1212)
    const clips = Array.from({ length: 40 }, (_, i) => clip({ id: `c${i}`, inPoint: 0, outPoint: 1.01 }));
    const layout = layoutTimeline(clips, []);
    const frames = clipFrameCounts(layout, 30);
    expect(frames.reduce((a, b) => a + b, 0)).toBe(Math.round(layout.total * 30));
    expect(new Set(frames)).toEqual(new Set([30, 31]));
  });
});

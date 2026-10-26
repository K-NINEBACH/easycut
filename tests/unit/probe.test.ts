import { describe, expect, it } from 'vitest';
import { parseProbe, rotationOf } from '../../src/main/ffmpeg/probe';

describe('rotationOf', () => {
  it('아이폰 세로 (display matrix -90) → 90', () => {
    expect(rotationOf({ side_data_list: [{ side_data_type: 'Display Matrix', rotation: -90 }] })).toBe(90);
  });
  it('옛 rotate 태그', () => {
    expect(rotationOf({ tags: { rotate: '270' } })).toBe(270);
  });
  it('display matrix 180', () => {
    expect(rotationOf({ side_data_list: [{ rotation: 180 }] })).toBe(180);
  });
  it('없으면 0', () => {
    expect(rotationOf({})).toBe(0);
  });
});

describe('parseProbe', () => {
  const portrait = {
    streams: [
      {
        codec_type: 'video',
        codec_name: 'hevc',
        width: 1920,
        height: 1080,
        r_frame_rate: '60/1',
        avg_frame_rate: '60/1',
        color_transfer: 'arib-std-b67',
        side_data_list: [{ rotation: -90 }]
      },
      { codec_type: 'audio', codec_name: 'aac' }
    ],
    format: { duration: '5.000', tags: { 'com.apple.quicktime.creationdate': '2026-08-01T18:00:00+0900' } }
  };

  it('세로 HEVC HDR 영상: 회전 반영한 크기, HDR, 촬영 시각', () => {
    const r = parseProbe(portrait, 'video')!;
    expect(r.width).toBe(1080);
    expect(r.height).toBe(1920);
    expect(r.rotation).toBe(90);
    expect(r.fps).toBe(60);
    expect(r.isVfr).toBe(false);
    expect(r.isHdr).toBe(true);
    expect(r.hasAudio).toBe(true);
    expect(r.codec).toBe('hevc');
    expect(r.createdAt).toBe('2026-08-01T09:00:00.000Z');
  });

  it('가변 프레임 감지', () => {
    const r = parseProbe(
      {
        streams: [{ codec_type: 'video', width: 1280, height: 720, r_frame_rate: '30/1', avg_frame_rate: '1185/74' }],
        format: { duration: '5' }
      },
      'video'
    )!;
    expect(r.isVfr).toBe(true);
    expect(r.hasAudio).toBe(false);
  });

  it('촬영 시각이 없으면 대체값 사용', () => {
    const r = parseProbe(
      { streams: [{ codec_type: 'video', width: 10, height: 10 }], format: {} },
      'image',
      '2020-01-01T00:00:00.000Z'
    )!;
    expect(r.duration).toBe(0);
    expect(r.createdAt).toBe('2020-01-01T00:00:00.000Z');
  });

  it('음악에 앨범 아트(attached_pic)만 있는 영상 스트림은 무시', () => {
    const r = parseProbe(
      {
        streams: [
          { codec_type: 'video', width: 500, height: 500, disposition: { attached_pic: 1 } },
          { codec_type: 'audio', codec_name: 'mp3' }
        ],
        format: { duration: '30.1' }
      },
      'audio'
    )!;
    expect(r.duration).toBeCloseTo(30.1);
  });

  it('열 수 없는 파일 → null', () => {
    expect(parseProbe({ streams: [] }, 'video')).toBeNull();
    expect(parseProbe({ streams: [{ codec_type: 'audio' }], format: { duration: '3' } }, 'video')).toBeNull();
  });
});

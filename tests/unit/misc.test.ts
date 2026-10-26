import { describe, expect, it } from 'vitest';
import { parseProgressLine, weightedProgress } from '../../src/main/ffmpeg/progress';
import { proxySize } from '../../src/main/ffmpeg/commands';
import { mediaUrl, parseMediaUrl, resourceUrl } from '../../src/shared/mediaUrl';
import { mediaTypeFromPath } from '../../src/shared/mediaFormats';
import { safeFolderName, defaultProjectName } from '../../src/shared/project';
import { cacheKey } from '../../src/main/services/MediaService';

describe('progress', () => {
  it('out_time_us 파싱', () => {
    expect(parseProgressLine('out_time_us=2500000')).toEqual({ outTimeSec: 2.5 });
    expect(parseProgressLine('out_time_ms=1000000')).toEqual({ outTimeSec: 1 });
    expect(parseProgressLine('progress=end')).toEqual({ end: true });
    expect(parseProgressLine('out_time_us=N/A')).toEqual({});
  });
  it('단계별 가중치 60/20/20', () => {
    expect(weightedProgress([60, 20, 20], 0, 0.5)).toBeCloseTo(0.3);
    expect(weightedProgress([60, 20, 20], 1, 0.5)).toBeCloseTo(0.7);
    expect(weightedProgress([60, 20, 20], 2, 1)).toBeCloseTo(1);
  });
});

describe('proxySize', () => {
  it('짧은 변 720, 짝수', () => {
    expect(proxySize(1920, 1080)).toEqual({ w: 1280, h: 720 });
    expect(proxySize(1080, 1920)).toEqual({ w: 720, h: 1280 });
    expect(proxySize(3840, 2160)).toEqual({ w: 1280, h: 720 });
  });
  it('작은 원본은 키우지 않음', () => {
    expect(proxySize(640, 480)).toEqual({ w: 640, h: 480 });
  });
});

describe('mediaUrl', () => {
  it('한글·공백·Windows 경로 왕복', () => {
    const p = 'C:\\Users\\김 철수\\Videos\\여행 #1 (제주).mp4';
    expect(parseMediaUrl(mediaUrl(p))).toEqual({ kind: 'local', path: p });
  });
  it('resources 상대 경로', () => {
    expect(parseMediaUrl(resourceUrl('fonts/나눔 펜.ttf'))).toEqual({ kind: 'res', path: 'fonts/나눔 펜.ttf' });
  });
});

describe('형식', () => {
  it('확장자로 종류 판단 (대소문자 무시)', () => {
    expect(mediaTypeFromPath('a/IMG_0001.HEIC')).toBe('image');
    expect(mediaTypeFromPath('a/b.MOV')).toBe('video');
    expect(mediaTypeFromPath('a/b.m4a')).toBe('audio');
    expect(mediaTypeFromPath('a/b.txt')).toBeNull();
  });
  it('폴더 이름 정리', () => {
    expect(safeFolderName('제주: 1일차?')).toBe('제주_ 1일차_');
    expect(safeFolderName('con')).toBe('새 영상');
    expect(safeFolderName('여행.')).toBe('여행');
  });
  it('기본 프로젝트 이름', () => {
    expect(defaultProjectName(new Date(2026, 9, 27))).toBe('2026-10-27 여행 영상');
  });
  it('캐시 키는 경로가 아니라 이름+크기+수정 시각 기준', () => {
    expect(cacheKey('a.mp4', 10, 1000.7)).toBe(cacheKey('a.mp4', 10, 1000));
    expect(cacheKey('a.mp4', 10, 1000)).not.toBe(cacheKey('a.mp4', 11, 1000));
  });
});

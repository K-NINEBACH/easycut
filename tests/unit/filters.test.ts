import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { FILTERS, bakeLut, isIdentityLook, lookFunction, lutToCube, LUT_SIZE } from '../../src/shared/filters';
import { buildClipCommand } from '../../src/main/ffmpeg/commands';
import { insertMedia, setFitMode, setLook } from '../../src/shared/ops';
import { newProject } from '../../src/shared/project';
import type { MediaItem } from '../../src/shared/types';

const zero = { brightness: 0, contrast: 0, saturation: 0 };
const samples: [number, number, number][] = [
  [0, 0, 0],
  [1, 1, 1],
  [0.2, 0.5, 0.8],
  [0.9, 0.3, 0.1],
  [0.5, 0.5, 0.5]
];

describe('필터 색 함수 (PRD F7)', () => {
  it('19종 (원본 + PRD 8개 + 추가 10개, PRD 13장 #12)', () => {
    expect(FILTERS.map((f) => f.name)).toEqual([
      '원본', '선명하게', '따뜻하게', '시원하게', '필름', '흑백', '밝게', '감성', '초록 숲',
      '노을', '푸른 바다', '벚꽃', '단풍', '맛있게', '뽀얗게', '영화처럼', '야경', '레트로', '세피아'
    ]);
    expect(new Set(FILTERS.map((f) => f.id)).size).toBe(FILTERS.length);
  });

  it('추가 필터는 서로 다르고 원본과도 다름', () => {
    const probe: [number, number, number][] = [[0.8, 0.5, 0.3], [0.2, 0.4, 0.8], [0.3, 0.6, 0.2], [0.5, 0.5, 0.5]];
    const sig = (id: (typeof FILTERS)[number]['id']): number[] =>
      probe.flatMap((c) => lookFunction({ filter: id, filterStrength: 1, adjust: zero })(c));
    const sigs = FILTERS.map((f) => sig(f.id));
    for (let i = 0; i < sigs.length; i++)
      for (let j = i + 1; j < sigs.length; j++) {
        const diff = Math.max(...sigs[i].map((v, k) => Math.abs(v - sigs[j][k])));
        expect(diff, `${FILTERS[i].name} ↔ ${FILTERS[j].name}`).toBeGreaterThan(0.02);
      }
  });

  it('푸른 바다는 파랑을 진하게, 회색은 그대로 둠', () => {
    const ocean = lookFunction({ filter: 'ocean', filterStrength: 1, adjust: zero });
    const sky = ocean([0.3, 0.55, 0.85]);
    expect(sky[2] - sky[0]).toBeGreaterThan(0.85 - 0.3);
    const gray = ocean([0.5, 0.5, 0.5]);
    expect(Math.abs(gray[0] - gray[1])).toBeLessThan(0.06);
  });

  it('강도 0% 는 원본과 같음 → LUT 를 쓰지 않음', () => {
    for (const f of FILTERS) {
      const look = { filter: f.id, filterStrength: 0, adjust: zero };
      expect(isIdentityLook(look)).toBe(true);
      const fn = lookFunction(look);
      for (const c of samples) expect(fn(c)).toEqual(c);
    }
    expect(isIdentityLook({ filter: 'none', filterStrength: 1, adjust: { ...zero, contrast: 5 } })).toBe(false);
  });

  it('흑백은 회색, 강도 50% 는 원본과 필터의 중간', () => {
    const mono = lookFunction({ filter: 'mono', filterStrength: 1, adjust: zero });
    const [r, g, b] = mono([0.9, 0.3, 0.1]);
    expect(r).toBeCloseTo(g, 6);
    expect(g).toBeCloseTo(b, 6);
    const half = lookFunction({ filter: 'mono', filterStrength: 0.5, adjust: zero })([0.9, 0.3, 0.1]);
    expect(half[0]).toBeCloseTo((0.9 + r) / 2, 6);
  });

  it('따뜻하게는 빨강↑ 파랑↓, 시원하게는 반대', () => {
    const c: [number, number, number] = [0.5, 0.5, 0.5];
    const warm = lookFunction({ filter: 'warm', filterStrength: 1, adjust: zero })(c);
    const cool = lookFunction({ filter: 'cool', filterStrength: 1, adjust: zero })(c);
    expect(warm[0]).toBeGreaterThan(warm[2]);
    expect(cool[2]).toBeGreaterThan(cool[0]);
  });

  it('기본 보정: 밝기 +50 은 밝게, 채도 -50 은 회색 쪽으로', () => {
    const bright = lookFunction({ filter: 'none', filterStrength: 1, adjust: { ...zero, brightness: 50 } })([0.4, 0.4, 0.4]);
    expect(bright[0]).toBeGreaterThan(0.4);
    const dull = lookFunction({ filter: 'none', filterStrength: 1, adjust: { ...zero, saturation: -50 } })([0.9, 0.3, 0.1]);
    expect(dull[0] - dull[2]).toBeLessThan(0.9 - 0.1);
  });

  it('모든 값은 0~1', () => {
    for (const f of FILTERS) {
      const lut = bakeLut({ filter: f.id, filterStrength: 1, adjust: { brightness: 50, contrast: 50, saturation: 50 } }, 9);
      expect(lut.every((v) => v >= 0 && v <= 1)).toBe(true);
    }
  });

  it('.cube 파일: 크기 머리줄 + R 이 가장 빨리 변하는 순서', () => {
    const cube = lutToCube(bakeLut({ filter: 'none', filterStrength: 1, adjust: { ...zero, contrast: 1 } }, 2), 2).split('\n');
    expect(cube[0]).toBe('LUT_3D_SIZE 2');
    expect(cube.length).toBe(1 + 8 + 1);
    // 두 번째 줄 = (r=1, g=0, b=0) 근처
    const [r, g, b] = cube[2].split(' ').map(Number);
    expect(r).toBeGreaterThan(0.9);
    expect(g + b).toBeLessThan(0.2);
    expect(LUT_SIZE).toBe(33);
  });
});

describe('렌더에 필터 적용', () => {
  const media: MediaItem = {
    id: 'm', type: 'video', path: 'D:\\a.mp4', fileName: 'a.mp4', fileSize: 1, fileMtime: 1, duration: 5,
    width: 1920, height: 1080, hasAudio: false, proxyStatus: 'ready'
  };
  const p = produce(newProject('p', 'x'), (d) => {
    d.media = [media];
    insertMedia(d, ['m', 'm']);
  });
  const [a, b] = p.videoTrack;

  it('LUT 파일이 있으면 화면 맞춤 뒤 lut3d (미리보기와 같은 삼선형 보간)', () => {
    const args = buildClipCommand(a, media, { width: 1920, height: 1080, fps: 30 }, 150, 'o.mov', { lutFile: 'lut_0000.cube' });
    const f = args[args.indexOf('-filter_complex') + 1];
    expect(f).toContain('[out]lut3d=file=lut_0000.cube:interp=trilinear,fps=30');
  });

  it('setLook: 범위 제한, 여러 장면에 한 번에', () => {
    const q = produce(p, (d) => {
      setLook(d, [a.id, b.id], { filter: 'film', filterStrength: 1.7, adjust: { brightness: 80, saturation: -3.4 } });
      setFitMode(d, b.id, 'fill');
    });
    expect(q.videoTrack.map((c) => [c.filter, c.filterStrength, c.adjust.brightness, c.adjust.saturation])).toEqual([
      ['film', 1, 50, -3],
      ['film', 1, 50, -3]
    ]);
    expect(q.videoTrack[1].fitMode).toBe('fill');
  });
});

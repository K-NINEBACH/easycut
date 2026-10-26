// 장면 전환 정의 단일화 (PRD F6, 11장): UI 이름 + FFmpeg xfade 이름 + 미리보기 셰이더 번호
import type { TransitionId } from './types';

export interface TransitionDef {
  id: TransitionId;
  label: string;
  /** FFmpeg xfade transition 이름 (none 은 컷) */
  xfade: string | null;
  /** 미리보기 셰이더 번호 (shaders.ts 의 TRANSITION_GLSL 과 맞춤) */
  shader: number;
  /** 미리보기가 실제 결과와 똑같지 않음 → "실제 결과와 조금 달라요" 표시 */
  approximate: boolean;
}

export const TRANSITIONS: TransitionDef[] = [
  { id: 'none', label: '없음', xfade: null, shader: 0, approximate: false },
  { id: 'fade', label: '부드럽게 겹치기', xfade: 'fade', shader: 1, approximate: false },
  { id: 'fadeblack', label: '검은 화면 거치기', xfade: 'fadeblack', shader: 2, approximate: false },
  { id: 'fadewhite', label: '흰 화면 거치기', xfade: 'fadewhite', shader: 3, approximate: false },
  { id: 'slideleft', label: '왼쪽으로 밀기', xfade: 'slideleft', shader: 4, approximate: false },
  { id: 'slideright', label: '오른쪽으로 밀기', xfade: 'slideright', shader: 5, approximate: false },
  { id: 'slideup', label: '위로 밀기', xfade: 'slideup', shader: 6, approximate: false },
  { id: 'circleopen', label: '동그랗게 열기', xfade: 'circleopen', shader: 7, approximate: false },
  { id: 'hblur', label: '흐려지며 바뀌기', xfade: 'hblur', shader: 8, approximate: true },
  { id: 'zoomin', label: '확대되며 바뀌기', xfade: 'zoomin', shader: 9, approximate: false }
];

export const TRANSITION_BY_ID = Object.fromEntries(TRANSITIONS.map((t) => [t.id, t])) as Record<
  TransitionId,
  TransitionDef
>;

/** 전환 길이: 짧게 / 보통 / 길게 (PRD F6) */
export const TRANSITION_DURATIONS = [
  { label: '짧게', value: 0.3 },
  { label: '보통', value: 0.6 },
  { label: '길게', value: 1.0 }
] as const;

export const DEFAULT_TRANSITION_DURATION = 0.6;

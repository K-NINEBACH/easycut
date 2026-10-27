import { useRef } from 'react';
import type { Draft } from 'immer';
import type { Project } from '@shared/types';
import { liveEdit } from '../../store/project';

/** 끄는 동안은 바로 반영, 손을 떼면 되돌리기 1단계 */
export default function LiveSlider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  editLabel: string;
  apply: (p: Draft<Project>, v: number) => void;
  disabled?: boolean;
  testId?: string;
}): JSX.Element {
  const live = useRef<ReturnType<typeof liveEdit> | null>(null);
  const finish = (): void => {
    live.current?.end();
    live.current = null;
  };
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex justify-between text-xs font-medium text-gray-500">
        {props.label}
        <span className="font-semibold text-brand-600 tabular-nums">{props.format(props.value)}</span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        style={{ '--fill': `${((props.value - props.min) / (props.max - props.min)) * 100}%` } as React.CSSProperties}
        onChange={(e) => {
          const v = Number(e.target.value);
          live.current ??= liveEdit(props.editLabel);
          live.current.update((p) => props.apply(p, v));
        }}
        onPointerUp={finish}
        onKeyUp={finish}
        onBlur={finish}
        data-testid={props.testId}
      />
    </label>
  );
}

// 꾸미기 패널 > 전환 탭 (PRD F6)
import { useEffect, useRef, useState } from 'react';
import * as ops from '@shared/ops';
import { TRANSITIONS, TRANSITION_DURATIONS, DEFAULT_TRANSITION_DURATION, TRANSITION_BY_ID } from '@shared/transitions';
import type { TransitionId } from '@shared/types';
import { edit, getProject, useProjectStore } from '../../store/project';
import { useUiStore, toast } from '../../store/ui';
import { useTimelineLayout } from '../../hooks/useTimelineLayout';

export default function TransitionPanel(): JSX.Element {
  const selId = useUiStore((s) => (s.selection?.kind === 'transition' ? s.selection.id : null));
  const clips = useProjectStore((s) => s.project?.videoTrack);
  const current = useProjectStore((s) => s.project?.transitions.find((t) => t.afterClipId === selId));
  const layout = useTimelineLayout();
  const index = clips?.findIndex((c) => c.id === selId) ?? -1;

  if (!selId || index < 0 || index >= (clips?.length ?? 0) - 1) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-gray-400">
        타임라인의 장면 사이 ◆ 를 누르면
        <br />
        여기서 장면 전환을 고를 수 있어요
      </div>
    );
  }

  const type: TransitionId = current?.type ?? 'none';
  const duration = current?.duration ?? DEFAULT_TRANSITION_DURATION;
  const info = layout.transitions[index];

  const apply = (ids: string[], t: TransitionId, d: number, label: string): number => {
    let failed = 0;
    edit(label, (p) => {
      failed = ops.setTransition(p, ids, t, d);
    });
    return failed;
  };
  const pick = (t: TransitionId): void => {
    if (apply([selId], t, duration, '장면 전환 바꾸기') > 0) toast('장면이 너무 짧아서 전환을 넣을 수 없어요', 'error');
  };
  const applyAll = (): void => {
    const ids = getProject()?.videoTrack.map((c) => c.id) ?? [];
    const failed = apply(ids, type, duration, '모든 장면에 전환 적용');
    toast(failed > 0 ? `모든 장면에 적용했어요 (너무 짧은 ${failed}곳은 빼고)` : '모든 장면 사이에 같은 전환을 넣었어요');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 text-sm [&>*]:shrink-0" data-testid="transition-panel">
      <p className="text-xs text-gray-500">
        장면 {index + 1} → 장면 {index + 2}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {TRANSITIONS.map((t) => (
          <button
            key={t.id}
            className={`overflow-hidden rounded-xl border-2 bg-white text-xs transition-colors ${
              type === t.id ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700' : 'border-line text-gray-600 hover:border-brand-300'
            }`}
            onClick={() => pick(t.id)}
            aria-pressed={type === t.id}
            data-testid={`transition-${t.id}`}
          >
            <TransitionPreview id={t.id} />
            <div className="py-1">{t.label}</div>
          </button>
        ))}
      </div>

      {type !== 'none' && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-gray-500">전환 길이</span>
          <div className="flex gap-1">
            {TRANSITION_DURATIONS.map((d) => (
              <button
                key={d.value}
                className={`flex-1 rounded-lg border py-1.5 transition-colors ${
                  duration === d.value ? 'border-brand-300 bg-brand-100 font-semibold text-brand-700' : 'border-line bg-white text-gray-600 hover:bg-gray-50'
                }`}
                onClick={() => apply([selId], type, d.value, '전환 길이 바꾸기')}
                aria-pressed={duration === d.value}
                data-testid={`transition-duration-${d.value}`}
              >
                {d.label}
              </button>
            ))}
          </div>
          {info?.tooShort ? (
            <p className="text-xs text-amber-600" data-testid="transition-too-short">
              장면이 너무 짧아서 전환을 넣을 수 없어요
            </p>
          ) : info && info.duration < info.requested - 1e-6 ? (
            <p className="text-xs text-gray-500">장면이 짧아서 {info.duration.toFixed(1)}초로 줄였어요</p>
          ) : null}
        </div>
      )}

      <button className="ez-btn-secondary py-2.5" onClick={applyAll} data-testid="transition-apply-all">
        모든 장면에 적용
      </button>
    </div>
  );
}

/** 카드 그림: 마우스를 올리면 A → B 로 바뀌는 짧은 움직임 */
function TransitionPreview({ id }: { id: TransitionId }): JSX.Element {
  const [p, setP] = useState(0);
  const [hover, setHover] = useState(false);
  const raf = useRef(0);
  useEffect(() => {
    if (!hover) {
      setP(0);
      return;
    }
    const start = performance.now();
    const tick = (now: number): void => {
      // 0.3초 멈춤 → 0.8초 전환 → 0.5초 멈춤, 반복
      const t = ((now - start) / 1000) % 1.6;
      setP(Math.min(1, Math.max(0, (t - 0.3) / 0.8)));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [hover]);

  const a = 'absolute inset-0 flex items-center justify-center bg-sky-500 text-lg font-bold text-white';
  const b = 'absolute inset-0 flex items-center justify-center bg-orange-400 text-lg font-bold text-white';
  let sa: React.CSSProperties = {};
  let sb: React.CSSProperties = { opacity: p };
  let overlay: React.CSSProperties | null = null;
  switch (TRANSITION_BY_ID[id].xfade) {
    case null:
      sb = { opacity: p >= 0.5 ? 1 : 0 };
      break;
    case 'fadeblack':
    case 'fadewhite':
      sa = { opacity: p < 0.5 ? 1 : 0 };
      sb = { opacity: p >= 0.5 ? 1 : 0 };
      overlay = { background: id === 'fadeblack' ? '#000' : '#fff', opacity: 1 - Math.abs(p - 0.5) * 2 };
      break;
    case 'slideleft':
      sa = { transform: `translateX(${-p * 100}%)` };
      sb = { transform: `translateX(${(1 - p) * 100}%)` };
      break;
    case 'slideright':
      sa = { transform: `translateX(${p * 100}%)` };
      sb = { transform: `translateX(${-(1 - p) * 100}%)` };
      break;
    case 'slideup':
      sa = { transform: `translateY(${-p * 100}%)` };
      sb = { transform: `translateY(${(1 - p) * 100}%)` };
      break;
    case 'circleopen':
      sb = { clipPath: `circle(${p * 75}% at 50% 50%)` };
      break;
    case 'hblur':
      sa = { filter: `blur(${Math.sin(p * Math.PI) * 4}px)` };
      sb = { opacity: p, filter: `blur(${Math.sin(p * Math.PI) * 4}px)` };
      break;
    case 'zoomin':
      sa = { transform: `scale(${1 + p * 0.8})`, opacity: 1 - p };
      sb = { opacity: p };
      break;
  }
  return (
    <div className="relative aspect-video w-full overflow-hidden bg-gray-800" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className={a} style={sa}>
        A
      </div>
      <div className={b} style={sb}>
        B
      </div>
      {overlay && <div className="absolute inset-0" style={overlay} />}
    </div>
  );
}

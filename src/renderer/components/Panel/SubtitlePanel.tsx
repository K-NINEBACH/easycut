// 꾸미기 패널 > 자막 탭 (PRD F4)
import { useEffect, useMemo, useRef, useState } from 'react';
import * as ops from '@shared/ops';
import { formatTimePrecise } from '@shared/format';
import {
  POSITION_LABELS,
  SIZE_LABELS,
  SIZE_SCALE,
  SUBTITLE_PRESETS,
  COLOR_SWATCHES,
  FONTS,
  FONT_IDS,
  type PresetDef,
  buildSrt,
  effectiveStyle,
  resolveStyle
} from '@shared/subtitles';
import { subtitleRange } from '@shared/timeline';
import type { Project, SubtitleStyle } from '@shared/types';
import { edit, getProject, liveEdit, useProjectStore } from '../../store/project';
import { useUiStore, toast } from '../../store/ui';
import { useTimelineLayout } from '../../hooks/useTimelineLayout';
import { player } from '../Preview/player';
import { SubtitleText, ensureSubtitleFonts, subtitleCssFamily } from '../Preview/SubtitleOverlay';
import SpeechDialog from './SpeechDialog';
import LiveSlider from './LiveSlider';

/** 모양 카드용: 글자를 약 6배로, 테두리·상자 여백도 같은 비율로 */
const CARD_ZOOM = 6.5;
const cardStyle = (pr: PresetDef): ReturnType<typeof resolveStyle> => {
  const r = resolveStyle({ presetId: pr.id, size: 'M', position: 'middle' });
  return { ...r, size: Math.round(r.size * CARD_ZOOM), preset: { ...pr, outline: pr.outline * CARD_ZOOM * 0.6 } };
};

const focusEditor = (): void => {
  setTimeout(() => document.querySelector<HTMLTextAreaElement>('[data-testid=subtitle-text]')?.focus(), 0);
};

export default function SubtitlePanel(): JSX.Element {
  ensureSubtitleFonts();
  const subs = useProjectStore((s) => s.project?.subtitles) ?? [];
  const def = useProjectStore((s) => s.project?.defaultSubtitleStyle);
  const name = useProjectStore((s) => s.project?.name ?? '');
  const hasClips = useProjectStore((s) => (s.project?.videoTrack.length ?? 0) > 0);
  const selId = useUiStore((s) => (s.selection?.kind === 'subtitle' ? s.selection.id : null));
  const selected = subs.find((s) => s.id === selId);
  const layout = useTimelineLayout();
  const [onlyThis, setOnlyThis] = useState(false);
  const [speechOpen, setSpeechOpen] = useState(false);
  // 선택한 자막이 바뀌면, 그 자막에 따로 정한 모양이 있는지로 "이 자막만" 을 맞춘다
  useEffect(() => setOnlyThis(!!selected?.styleOverride), [selId]);

  const list = useMemo(
    () =>
      subs
        .map((s) => ({ s, r: subtitleRange(layout, s) }))
        .sort((a, b) => a.r.start - b.r.start),
    [subs, layout]
  );

  const add = (): void => {
    let id: string | null = null;
    edit('자막 추가', (p) => {
      id = ops.addSubtitleAt(p, useUiStore.getState().playhead)?.id ?? null;
    });
    if (!id) {
      toast('여기에는 자막을 넣을 자리가 없어요. 재생 위치를 옮겨 보세요', 'error');
      return;
    }
    useUiStore.getState().select({ kind: 'subtitle', id });
    focusEditor();
  };

  const saveSrt = async (): Promise<void> => {
    const p = getProject();
    if (!p) return;
    const path = await window.api.subtitle.saveSrt(name, buildSrt(layout, p.subtitles));
    if (path) toast('자막 파일을 저장했어요');
  };

  if (!def) return <div />;
  const target = selected && onlyThis ? selected.id : 'all';
  const shown = target === 'all' ? def : effectiveStyle(def, selected);
  const free = typeof shown.x === 'number' && typeof shown.y === 'number';
  const resolved = resolveStyle(shown);
  const shownFont = resolved.preset.font.family;
  const isBox = resolved.preset.boxAlpha !== undefined;
  const setStyle = (st: Partial<SubtitleStyle>): void =>
    edit(target === 'all' ? '자막 모양 바꾸기' : '이 자막 모양 바꾸기', (p) => ops.setSubtitleStyle(p, target, st));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 text-sm [&>*]:shrink-0" data-testid="subtitle-panel">
      <button
        className="ez-btn-primary py-2.5 disabled:opacity-50"
        onClick={add}
        disabled={!hasClips}
        data-testid="subtitle-add"
      >
        ＋ 자막 추가
      </button>
      <button
        className="ez-btn-secondary py-2.5 disabled:opacity-50"
        onClick={() => setSpeechOpen(true)}
        disabled={!hasClips}
        data-testid="speech-open"
      >
        🎤 말소리로 자막 만들기
      </button>
      {speechOpen && <SpeechDialog onClose={() => setSpeechOpen(false)} />}

      {selected && <SubtitleEditor key={selected.id} id={selected.id} text={selected.text} />}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500">자막 모양</span>
          {selected && (
            <label className="flex items-center gap-1 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={onlyThis}
                onChange={(e) => {
                  setOnlyThis(e.target.checked);
                  if (!e.target.checked) edit('이 자막 모양 되돌리기', (p) => ops.clearSubtitleStyle(p, selected.id));
                }}
                data-testid="subtitle-only-this"
              />
              이 자막만
            </label>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {SUBTITLE_PRESETS.map((pr) => (
            <button
              key={pr.id}
              className={`overflow-hidden rounded-xl border-2 bg-white text-xs transition-colors ${
                shown.presetId === pr.id ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700' : 'border-line text-gray-600 hover:border-brand-300'
              }`}
              onClick={() => setStyle({ presetId: pr.id })}
              aria-pressed={shown.presetId === pr.id}
              data-testid={`subtitle-style-${pr.id}`}
            >
              <div className="relative aspect-video w-full bg-gradient-to-br from-sky-700 to-emerald-600 [container-type:inline-size]">
                {/* 카드가 작아 실제 비율로는 안 보이므로 글자만 크게 (테두리·상자 비율도 같이 키움) */}
                <SubtitleText text="안녕" style={cardStyle(pr)} />
              </div>
              <div className="py-1">{pr.label}</div>
            </button>
          ))}
        </div>
        {/* 글꼴: 이름을 그 글꼴로 보여 준다 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-gray-500">글꼴</span>
          <div className="grid h-56 shrink-0 auto-rows-max grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-line p-1" data-testid="subtitle-fonts">
            {FONT_IDS.map((id) => {
              const f = FONTS[id];
              const on = shownFont === f.family;
              return (
                <button
                  key={id}
                  className={`overflow-hidden whitespace-nowrap rounded-md px-2 py-0.5 text-left text-[15px] leading-[2] transition-colors ${
                    on ? 'bg-brand-100 text-brand-700 ring-1 ring-brand-300' : 'text-ink hover:bg-gray-50'
                  }`}
                  style={{ fontFamily: `"${subtitleCssFamily(f.family)}"`, fontWeight: f.bold ? 700 : 400 }}
                  onClick={() => setStyle({ fontId: id })}
                  aria-pressed={on}
                  title={f.label}
                  data-testid={`subtitle-font-${id}`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
        <ColorRow
          label="글자 색"
          value={resolved.preset.color}
          custom={!!shown.color}
          editLabel={target === 'all' ? '자막 글자 색 바꾸기' : '이 자막 글자 색 바꾸기'}
          apply={(p, color) => ops.setSubtitleStyle(p, target, { color })}
          testId="subtitle-color"
        />
        <ColorRow
          label={isBox ? '상자 색' : '테두리 색'}
          value={(isBox ? resolved.preset.boxColor : resolved.preset.outlineColor) ?? '#000000'}
          custom={!!shown.outlineColor}
          editLabel={target === 'all' ? '자막 테두리 색 바꾸기' : '이 자막 테두리 색 바꾸기'}
          apply={(p, outlineColor) => ops.setSubtitleStyle(p, target, { outlineColor })}
          testId="subtitle-outline-color"
        />
        {/* 크기: "가" 글자 크기로 단계를 보여 준다 */}
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-xs text-gray-500">글자 크기</span>
          <div className="flex flex-1 gap-1">
            {SIZE_LABELS.map((o, i) => (
              <button
                key={o.id}
                className={`flex h-8 flex-1 items-center justify-center rounded-lg border font-semibold transition-colors ${
                  shown.size === o.id ? 'border-brand-300 bg-brand-100 text-brand-700' : 'border-line bg-white text-gray-600 hover:bg-gray-50'
                }`}
                style={{ fontSize: 10 + i * 2.5 }}
                onClick={() => setStyle({ size: o.id, sizeScale: 1 })}
                aria-pressed={shown.size === o.id}
                aria-label={o.label}
                title={o.label}
                data-testid={`subtitle-size-${o.id}`}
              >
                가
              </button>
            ))}
          </div>
        </div>
        <LiveSlider
          label="크기 세밀 조절"
          value={Math.round((shown.sizeScale ?? 1) * 100)}
          min={SIZE_SCALE.min * 100}
          max={SIZE_SCALE.max * 100}
          step={5}
          format={(v) => `${v}%`}
          editLabel={target === 'all' ? '자막 크기 바꾸기' : '이 자막 크기 바꾸기'}
          apply={(p, v) => ops.setSubtitleStyle(p, target, { sizeScale: v / 100 })}
          testId="subtitle-size-scale"
        />
        <Choice
          label="위치"
          options={POSITION_LABELS}
          value={free ? null : shown.position}
          onChange={(position) => setStyle({ position })}
          testId="subtitle-position"
        />
        <p className="text-xs text-gray-500" data-testid="subtitle-move-hint">
          {free
            ? '미리보기에서 옮긴 자리에 나와요. 위·가운데·아래를 누르면 원래 자리로 돌아가요.'
            : '미리보기 화면에서 자막을 끌어 원하는 곳으로 옮길 수 있어요.'}
        </p>
      </div>

      {list.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="subtitle-list">
          <span className="text-xs font-medium text-gray-500">자막 목록 ({list.length}개)</span>
          {list.map(({ s, r }, i) => (
            <div
              key={s.id}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 ${
                s.id === selId ? 'border-brand-300 bg-brand-50' : 'border-line'
              } ${r.hidden ? 'opacity-50' : ''}`}
              data-testid="subtitle-row"
            >
              <button
                className="w-14 shrink-0 text-left text-[11px] text-brand-600 tabular-nums hover:underline"
                onClick={() => {
                  useUiStore.getState().select({ kind: 'subtitle', id: s.id });
                  player.play({ from: r.start, to: r.end });
                }}
                title="이 자막 위치로 가서 재생"
              >
                {formatTimePrecise(r.start)}
              </button>
              <RowText id={s.id} text={s.text} />
              {i < list.length - 1 && (
                <button
                  className="shrink-0 rounded px-1 text-[11px] text-gray-500 hover:bg-gray-100"
                  onClick={() => edit('자막 합치기', (p) => void ops.mergeWithNextSubtitle(p, s.id))}
                  title="다음 자막과 합치기"
                  data-testid="subtitle-merge"
                >
                  합치기
                </button>
              )}
              <button
                className="shrink-0 rounded px-1 text-[11px] text-gray-500 hover:bg-red-50 hover:text-red-600"
                onClick={() => edit('자막 삭제', (p) => ops.deleteSubtitles(p, [s.id]))}
                title="삭제"
                aria-label="자막 삭제"
                data-testid="subtitle-delete"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            className="mt-1 ez-btn-secondary py-2.5"
            onClick={() => void saveSrt()}
            data-testid="subtitle-save-srt"
          >
            자막 파일로 저장 (.srt)
          </button>
        </div>
      )}
    </div>
  );
}

/** 글을 고치는 동안은 바로 반영, 다 고치면(초점이 빠지면) 되돌리기 1단계 */
function useLiveText(id: string): { change: (v: string) => void; finish: () => void } {
  const live = useRef<ReturnType<typeof liveEdit> | null>(null);
  useEffect(() => () => live.current?.end(), []);
  return {
    change: (v) => {
      live.current ??= liveEdit('자막 글 고치기');
      live.current.update((p) => ops.setSubtitleText(p, id, v));
    },
    finish: () => {
      live.current?.end();
      live.current = null;
    }
  };
}

function SubtitleEditor({ id, text }: { id: string; text: string }): JSX.Element {
  const { change, finish } = useLiveText(id);
  return (
    <textarea
      className="min-h-16 w-full resize-y rounded-lg border border-line p-2.5 text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
      value={text}
      placeholder="자막 내용을 입력하세요"
      onChange={(e) => change(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
      }}
      data-testid="subtitle-text"
    />
  );
}

function RowText({ id, text }: { id: string; text: string }): JSX.Element {
  const { change, finish } = useLiveText(id);
  return (
    <input
      className="min-w-0 flex-1 rounded-md border border-transparent px-1 text-xs hover:border-line focus:border-brand-500 focus:outline-none"
      value={text}
      placeholder="(빈 자막)"
      onChange={(e) => change(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
      }}
      data-testid="subtitle-row-text"
    />
  );
}

function Choice<T extends string>(props: {
  label: string;
  options: { id: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  testId: string;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-xs text-gray-500">{props.label}</span>
      <div className="flex flex-1 gap-1">
        {props.options.map((o) => (
          <button
            key={o.id}
            className={`flex-1 rounded-lg border transition-colors py-1 text-xs ${
              props.value === o.id ? 'border-brand-300 bg-brand-100 font-semibold text-brand-700' : 'border-line bg-white text-gray-600 hover:bg-gray-50'
            }`}
            onClick={() => props.onChange(o.id)}
            aria-pressed={props.value === o.id}
            data-testid={`${props.testId}-${o.id}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 색 고르기: 자주 쓰는 색 + [직접 고르기] (끄는 동안 바로 반영, 다 고르면 되돌리기 1단계) + 모양대로 */
function ColorRow(props: {
  label: string;
  value: string;
  custom: boolean;
  editLabel: string;
  apply: (p: Project, color: string | null) => void;
  testId: string;
}): JSX.Element {
  const live = useRef<ReturnType<typeof liveEdit> | null>(null);
  const finish = (): void => {
    live.current?.end();
    live.current = null;
  };
  const cur = props.value.toUpperCase();
  return (
    <div className="flex flex-col gap-1.5" data-testid={props.testId}>
      <span className="flex items-center justify-between text-xs text-gray-500">
        {props.label}
        {props.custom && (
          <button className="text-brand-600 hover:underline" onClick={() => edit(props.editLabel, (p) => props.apply(p, null))} data-testid={`${props.testId}-reset`}>
            모양대로
          </button>
        )}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {COLOR_SWATCHES.map((c) => (
          <button
            key={c}
            className={`h-6 w-6 rounded-full border transition-transform hover:scale-110 ${
              cur === c ? 'border-brand-500 ring-2 ring-brand-300 ring-offset-1' : 'border-line'
            }`}
            style={{ background: c }}
            onClick={() => edit(props.editLabel, (p) => props.apply(p, c))}
            aria-label={c}
            aria-pressed={cur === c}
            data-testid={`${props.testId}-${c.slice(1)}`}
          />
        ))}
        <label
          className="relative flex h-6 cursor-pointer items-center gap-1 rounded-full border border-line bg-white pl-0.5 pr-2 text-xs text-gray-600 hover:bg-gray-50"
          title="직접 고르기"
        >
          <span className="h-5 w-5 rounded-full border border-line" style={{ background: cur }} />
          직접
          <input
            type="color"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={cur.toLowerCase()}
            onChange={(e) => {
              const v = e.target.value;
              live.current ??= liveEdit(props.editLabel);
              live.current.update((p) => props.apply(p as Project, v));
            }}
            onBlur={finish}
            ref={(el) => {
              // 색 고르기 창을 닫으면(change) 되돌리기 1단계로 마무리
              if (el && !el.dataset.bound) {
                el.dataset.bound = '1';
                el.addEventListener('change', finish);
              }
            }}
            data-testid={`${props.testId}-custom`}
          />
        </label>
      </div>
    </div>
  );
}

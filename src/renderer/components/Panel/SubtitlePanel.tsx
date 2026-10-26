// 꾸미기 패널 > 자막 탭 (PRD F4)
import { useEffect, useMemo, useRef, useState } from 'react';
import * as ops from '@shared/ops';
import { formatTimePrecise } from '@shared/format';
import {
  POSITION_LABELS,
  SIZE_LABELS,
  SUBTITLE_PRESETS,
  buildSrt,
  effectiveStyle,
  resolveStyle
} from '@shared/subtitles';
import { subtitleRange } from '@shared/timeline';
import type { SubtitleStyle } from '@shared/types';
import { edit, getProject, liveEdit, useProjectStore } from '../../store/project';
import { useUiStore, toast } from '../../store/ui';
import { useTimelineLayout } from '../../hooks/useTimelineLayout';
import { player } from '../Preview/player';
import { SubtitleText, ensureSubtitleFonts } from '../Preview/SubtitleOverlay';
import SpeechDialog from './SpeechDialog';

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
  const setStyle = (st: Partial<SubtitleStyle>): void =>
    edit(target === 'all' ? '자막 모양 바꾸기' : '이 자막 모양 바꾸기', (p) => ops.setSubtitleStyle(p, target, st));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 text-sm [&>*]:shrink-0" data-testid="subtitle-panel">
      <button
        className="rounded-md bg-brand-600 py-2 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        onClick={add}
        disabled={!hasClips}
        data-testid="subtitle-add"
      >
        ＋ 자막 추가
      </button>
      <button
        className="rounded-md border border-gray-200 py-2 hover:bg-gray-50 disabled:opacity-50"
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
        <div className="grid grid-cols-2 gap-2">
          {SUBTITLE_PRESETS.map((pr) => (
            <button
              key={pr.id}
              className={`overflow-hidden rounded-md border-2 text-xs ${
                shown.presetId === pr.id ? 'border-brand-600 font-semibold text-brand-700' : 'border-transparent hover:border-gray-300'
              }`}
              onClick={() => setStyle({ presetId: pr.id })}
              aria-pressed={shown.presetId === pr.id}
              data-testid={`subtitle-style-${pr.id}`}
            >
              <div className="relative aspect-video w-full bg-gradient-to-br from-sky-700 to-emerald-600 [container-type:inline-size]">
                <SubtitleText text="안녕하세요" style={resolveStyle({ presetId: pr.id, size: 'L', position: 'middle' })} />
              </div>
              <div className="py-1">{pr.label}</div>
            </button>
          ))}
        </div>
        <Choice label="글자 크기" options={SIZE_LABELS} value={shown.size} onChange={(size) => setStyle({ size })} testId="subtitle-size" />
        <Choice
          label="위치"
          options={POSITION_LABELS}
          value={shown.position}
          onChange={(position) => setStyle({ position })}
          testId="subtitle-position"
        />
      </div>

      {list.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="subtitle-list">
          <span className="text-xs font-medium text-gray-500">자막 목록 ({list.length}개)</span>
          {list.map(({ s, r }, i) => (
            <div
              key={s.id}
              className={`flex items-center gap-1 rounded-md border px-1.5 py-1 ${
                s.id === selId ? 'border-yellow-400 bg-yellow-50' : 'border-gray-100'
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
            className="mt-1 rounded-md border border-gray-200 py-2 hover:bg-gray-50"
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
      className="min-h-16 w-full resize-y rounded-md border border-gray-200 p-2 focus:border-brand-500 focus:outline-none"
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
      className="min-w-0 flex-1 rounded border border-transparent px-1 text-xs hover:border-gray-200 focus:border-brand-500 focus:outline-none"
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
  value: T;
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
            className={`flex-1 rounded-md border py-1 text-xs ${
              props.value === o.id ? 'border-brand-600 bg-brand-50 font-semibold text-brand-700' : 'border-gray-200 hover:bg-gray-50'
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

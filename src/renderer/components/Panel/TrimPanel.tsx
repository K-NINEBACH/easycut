// 꾸미기 패널 > 자르기 탭 (PRD F3)
import { useRef } from 'react';
import * as ops from '@shared/ops';
import { formatTimePrecise } from '@shared/format';
import { mediaUrl } from '@shared/mediaUrl';
import { isImageClip } from '@shared/timeline';
import type { MediaItem, Speed, VideoClip } from '@shared/types';
import { edit, liveEdit, useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { useTimelineLayout } from '../../hooks/useTimelineLayout';
import { player } from '../Preview/player';
import { startTrimDrag, type TrimSide } from '../Timeline/trimDrag';
import { Empty } from './DecoratePanel';

const SPEEDS: Speed[] = [0.5, 1, 1.5, 2];

export default function TrimPanel(): JSX.Element {
  const selId = useUiStore((s) => (s.selection?.kind === 'clip' ? s.selection.id : null));
  const clip = useProjectStore((s) => (selId ? s.project?.videoTrack.find((c) => c.id === selId) : undefined));
  const media = useProjectStore((s) => (clip ? s.project?.media.find((m) => m.id === clip.mediaId) : undefined));
  if (!clip) return <Empty />;
  return <ClipTrim key={clip.id} clip={clip} media={media} />;
}

function ClipTrim({ clip, media }: { clip: VideoClip; media?: MediaItem }): JSX.Element {
  const layout = useTimelineLayout();
  const playing = useUiStore((s) => s.playing);
  const cl = layout.byId.get(clip.id);
  const image = isImageClip(clip);
  const length = cl?.length ?? 0;

  const playThis = (): void => {
    if (playing) player.pause();
    else if (cl) player.play({ from: cl.start, to: cl.end });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 text-sm [&>*]:shrink-0" data-testid="trim-panel">
      <BigPreview clip={clip} media={media} />

      {image ? (
        <LiveSlider
          label="사진 보여줄 시간"
          value={clip.imageDuration ?? 3}
          min={1}
          max={10}
          step={0.5}
          format={(v) => `${v}초`}
          editLabel="사진 길이 바꾸기"
          apply={(p, v) => ops.setImageDuration(p, clip.id, v)}
          testId="image-duration"
        />
      ) : (
        media && <RangeBar clip={clip} media={media} />
      )}

      <div className="flex items-center gap-2">
        <button
          className="flex-1 rounded-md bg-brand-600 py-2 font-semibold text-white hover:bg-brand-700"
          onClick={playThis}
          data-testid="play-clip"
        >
          {playing ? '■ 멈추기' : '▶ 이 장면만 재생'}
        </button>
        <span className="text-xs text-gray-500">길이 {formatTimePrecise(length)}</span>
      </div>

      {!image && (
        <Field label="속도">
          <div className="flex gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                className={`flex-1 rounded-md border py-1.5 ${
                  clip.speed === s ? 'border-brand-600 bg-brand-50 font-semibold text-brand-700' : 'border-gray-200 hover:bg-gray-50'
                }`}
                onClick={() => edit('속도 바꾸기', (p) => ops.setSpeed(p, clip.id, s))}
                aria-pressed={clip.speed === s}
                data-testid={`speed-${s}`}
              >
                {s}배
              </button>
            ))}
          </div>
        </Field>
      )}

      {!image &&
        (media?.hasAudio ? (
          <Field label="소리">
            <div className="flex items-center gap-2">
              <button
                className={`w-20 shrink-0 rounded-md border py-1.5 ${
                  clip.muted ? 'border-gray-200 text-gray-500' : 'border-brand-600 bg-brand-50 text-brand-700'
                }`}
                onClick={() =>
                  edit(clip.muted ? '소리 켜기' : '소리 끄기', (p) => ops.setClipAudio(p, clip.id, { muted: !clip.muted }))
                }
                aria-pressed={!clip.muted}
                data-testid="mute-toggle"
              >
                {clip.muted ? '🔇 꺼짐' : '🔊 켜짐'}
              </button>
              <div className="flex-1">
                <LiveSlider
                  label="소리 크기"
                  value={Math.round(clip.volume * 100)}
                  min={0}
                  max={200}
                  step={5}
                  format={(v) => `${v}%`}
                  editLabel="소리 크기 바꾸기"
                  apply={(p, v) => ops.setClipAudio(p, clip.id, { volume: v / 100 })}
                  disabled={clip.muted}
                  testId="volume"
                />
              </div>
            </div>
          </Field>
        ) : (
          <p className="text-xs text-gray-400">이 영상에는 소리가 없어요</p>
        ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      {children}
    </div>
  );
}

/** 선택한 장면의 큰 미리보기: 자르는 중이면 손잡이 위치, 아니면 시작 프레임 (필름스트립 1초 간격) */
function BigPreview({ clip, media }: { clip: VideoClip; media?: MediaItem }): JSX.Element {
  const scrubTime = useUiStore((s) => (s.scrub?.clipId === clip.id ? s.scrub.sourceTime : null));
  const t = scrubTime ?? clip.inPoint;
  let src: string | undefined;
  if (media?.filmstripDir && !isImageClip(clip)) {
    const frame = Math.min(Math.max(1, Math.floor(media.duration)), Math.floor(t) + 1);
    src = mediaUrl(`${media.filmstripDir}/${String(frame).padStart(5, '0')}.jpg`);
  } else if (media?.thumbnailPath) {
    src = mediaUrl(media.thumbnailPath);
  }
  return (
    <div className="relative h-32 w-full overflow-hidden rounded-md bg-black">
      {src && <img src={src} className="h-full w-full object-contain" alt="" />}
      <span className="absolute bottom-1 left-1 max-w-[90%] truncate rounded bg-black/60 px-1.5 text-[11px] text-white">
        {media?.fileName ?? '없는 파일'}
      </span>
    </div>
  );
}

/** 원본 전체 길이 위에 시작/끝 손잡이가 있는 바 */
function RangeBar({ clip, media }: { clip: VideoClip; media: MediaItem }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const dur = Math.max(media.duration, clip.outPoint, 0.01);
  const pct = (v: number): string => `${(v / dur) * 100}%`;
  const drag = (side: TrimSide) => (e: React.PointerEvent) => {
    const w = ref.current?.getBoundingClientRect().width ?? 1;
    startTrimDrag(e, clip, side, dur / w);
  };
  const handle = (side: TrimSide): JSX.Element => (
    <div
      className="absolute top-0 z-10 flex h-full w-3 -translate-x-1/2 cursor-ew-resize items-center justify-center rounded-sm bg-yellow-400 hover:bg-yellow-300"
      style={{ left: pct(side === 'in' ? clip.inPoint : clip.outPoint) }}
      onPointerDown={drag(side)}
      title={side === 'in' ? '시작 지점' : '끝 지점'}
      data-testid={side === 'in' ? 'range-in' : 'range-out'}
    >
      <div className="h-4 w-0.5 rounded bg-yellow-800/60" />
    </div>
  );
  return (
    <Field label="앞뒤 자르기">
      <div ref={ref} className="relative h-8 rounded-md bg-gray-200" data-testid="range-bar">
        <div
          className="absolute top-0 h-full rounded-sm bg-brand-500/40"
          style={{ left: pct(clip.inPoint), width: pct(clip.outPoint - clip.inPoint) }}
        />
        {handle('in')}
        {handle('out')}
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>시작 {formatTimePrecise(clip.inPoint)}</span>
        <span>끝 {formatTimePrecise(clip.outPoint)}</span>
      </div>
    </Field>
  );
}

/** 끄는 동안은 바로 반영, 손을 떼면 되돌리기 1단계 */
function LiveSlider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  editLabel: string;
  apply: (p: Parameters<Parameters<typeof edit>[1]>[0], v: number) => void;
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
        <span>{props.format(props.value)}</span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
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

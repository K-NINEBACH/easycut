// 꾸미기 패널 > 자르기 탭 (PRD F3)
import { useRef } from 'react';
import * as ops from '@shared/ops';
import { formatTimePrecise } from '@shared/format';
import { mediaUrl } from '@shared/mediaUrl';
import { isImageClip } from '@shared/timeline';
import type { FitMode, MediaItem, Speed, VideoClip } from '@shared/types';
import { edit, useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { useTimelineLayout } from '../../hooks/useTimelineLayout';
import LiveSlider from './LiveSlider';
import { player } from '../Preview/player';
import { startTrimDrag, type TrimSide } from '../Timeline/trimDrag';
import { Empty } from './DecoratePanel';

const SPEEDS: Speed[] = [0.5, 1, 1.5, 2];
const FITS: { id: FitMode; label: string }[] = [
  { id: 'blur', label: '흐린 배경' },
  { id: 'black', label: '검은 배경' },
  { id: 'fill', label: '꽉 채우기' }
];

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
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 text-sm [&>*]:shrink-0" data-testid="trim-panel">
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
          className="ez-btn-primary flex-1 py-2.5"
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
                className={`flex-1 rounded-lg border py-1.5 transition-colors ${
                  clip.speed === s ? 'border-brand-300 bg-brand-100 font-semibold text-brand-700' : 'border-line bg-white text-gray-600 hover:bg-gray-50'
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

      {!image && media && <StabilizeField clip={clip} media={media} />}

      {media?.width && media.height && Math.abs(media.width / media.height - 16 / 9) > 0.02 && (
        <Field label="화면 채우기">
          <div className="flex gap-1">
            {FITS.map((f) => (
              <button
                key={f.id}
                className={`flex-1 rounded-lg border py-1.5 transition-colors ${
                  clip.fitMode === f.id ? 'border-brand-300 bg-brand-100 font-semibold text-brand-700' : 'border-line bg-white text-gray-600 hover:bg-gray-50'
                }`}
                onClick={() => edit('화면 채우기 바꾸기', (p) => ops.setFitMode(p, clip.id, f.id))}
                aria-pressed={clip.fitMode === f.id}
                title={f.id === 'fill' ? '화면을 꽉 채워요 (위아래나 옆이 잘려요)' : undefined}
                data-testid={`fit-${f.id}`}
              >
                {f.label}
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
                className={`w-20 shrink-0 rounded-lg border py-1.5 transition-colors ${
                  clip.muted ? 'border-line bg-white text-gray-500' : 'border-brand-300 bg-brand-100 text-brand-700'
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

/** 흔들림 줄이기·영역 고정 (PRD 13장 #16) */
function StabilizeField({ clip, media }: { clip: VideoClip; media: MediaItem }): JSX.Element {
  const layout = useTimelineLayout();
  const setJob = useUiStore((s) => s.setStabilizeJob);
  const st = clip.stabilize;
  const ready = media.proxyStatus === 'ready' && !media.missing;
  const end = st ? st.from + (st.path.length / 2 - 1) / st.fps : 0;
  // 분석 뒤 앞뒤를 더 늘렸으면 늘린 곳에는 효과가 없다
  const stale = !!st && (clip.inPoint < st.from - 0.1 || clip.outPoint > end + 0.2);

  const pick = (): void => {
    const ui = useUiStore.getState();
    const cl = layout.byId.get(clip.id);
    if (!cl) return;
    player.pause();
    // 재생 위치가 이 장면 밖이면 장면 안으로 (전환으로 겹치는 곳도 피한다)
    const from = cl.start + cl.overlapIn;
    const to = Math.max(from, cl.end - cl.overlapOut - 0.05);
    if (ui.playhead < from || ui.playhead > to) player.seek(from);
    ui.setPickRegion(clip.id);
  };

  const btn = (on: boolean): string =>
    `flex-1 rounded-lg border py-1.5 transition-colors disabled:opacity-40 ${
      on ? 'border-brand-300 bg-brand-100 font-semibold text-brand-700' : 'border-line bg-white text-gray-600 hover:bg-gray-50'
    }`;

  return (
    <Field label="흔들림·화면 고정">
      <div className="flex gap-1">
        <button
          className={btn(st?.mode === 'shake')}
          disabled={!ready}
          title="화면 전체의 떨림을 줄여요. 조금 확대돼요"
          onClick={() => setJob({ clipId: clip.id, mode: 'shake' })}
          data-testid="stab-shake"
        >
          흔들림 줄이기
        </button>
        <button
          className={btn(st?.mode === 'lock')}
          disabled={!ready}
          title="고른 부분을 따라가며 화면 가운데에 고정해요. 대상이 많이 움직이면 많이 확대돼요"
          onClick={pick}
          data-testid="stab-lock"
        >
          영역 골라 고정
        </button>
      </div>
      {!ready && <p className="text-xs text-gray-400">영상을 준비하면 쓸 수 있어요</p>}
      {st && (
        <>
          <LiveSlider
            label="확대"
            value={Math.round(st.zoom * 100)}
            min={100}
            max={st.mode === 'lock' ? 250 : 150}
            step={1}
            format={(v) => `${v}%`}
            editLabel="확대 바꾸기"
            apply={(p, v) => ops.setStabilizeZoom(p, clip.id, v / 100)}
            testId="stab-zoom"
          />
          {stale && <p className="text-xs text-amber-600">장면 길이를 늘렸어요. 버튼을 다시 누르면 늘린 곳까지 적용돼요</p>}
          {(st.lost ?? 0) > 0.05 && (
            <p className="text-xs text-amber-600">대상을 놓친 구간이 {Math.round(st.lost! * 100)}% 있어요. 더 뚜렷한 곳을 골라 보세요</p>
          )}
          <button
            className="ez-btn-secondary py-1.5 text-xs"
            onClick={() => edit('흔들림·화면 고정 끄기', (p) => ops.setStabilize(p, clip.id, null))}
            data-testid="stab-off"
          >
            끄기
          </button>
        </>
      )}
    </Field>
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
    <div className="relative h-36 w-full overflow-hidden rounded-xl bg-gray-900">
      {src && <img src={src} className="h-full w-full object-contain" alt="" />}
      <span className="absolute bottom-1.5 left-1.5 max-w-[90%] truncate rounded-md bg-black/60 px-1.5 py-px text-[11px] text-white">
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
      className="absolute top-0 z-10 flex h-full w-3 -translate-x-1/2 cursor-ew-resize items-center justify-center rounded-md bg-brand-500 shadow-sm hover:bg-brand-400"
      style={{ left: pct(side === 'in' ? clip.inPoint : clip.outPoint) }}
      onPointerDown={drag(side)}
      title={side === 'in' ? '시작 지점' : '끝 지점'}
      data-testid={side === 'in' ? 'range-in' : 'range-out'}
    >
      <div className="h-4 w-0.5 rounded bg-white/90" />
    </div>
  );
  return (
    <Field label="앞뒤 자르기">
      <div ref={ref} className="relative h-9 rounded-lg bg-gray-100" data-testid="range-bar">
        <div
          className="absolute top-0 h-full bg-brand-200/80"
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

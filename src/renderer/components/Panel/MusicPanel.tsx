// 꾸미기 패널 > 음악 탭 (PRD F5). 배경음악 설정은 프로젝트 전체에 하나
import * as ops from '@shared/ops';
import { formatTimePrecise } from '@shared/format';
import { edit, useProjectStore } from '../../store/project';
import { useUiStore, toast } from '../../store/ui';
import { addMediaToTimeline } from '../../store/editActions';
import { importPaths } from '../../store/mediaActions';
import LiveSlider from './LiveSlider';

const DEFAULT_FADE_IN = 1;
const DEFAULT_FADE_OUT = 3;

export default function MusicPanel(): JSX.Element {
  const music = useProjectStore((s) => s.project?.music);
  const count = useProjectStore((s) => s.project?.musicTrack.length ?? 0);
  const hasVideo = useProjectStore((s) => (s.project?.videoTrack.length ?? 0) > 0);
  const selId = useUiStore((s) => (s.selection?.kind === 'music' ? s.selection.id : null));
  const selected = useProjectStore((s) => s.project?.musicTrack.find((m) => m.id === selId));
  const selName = useProjectStore((s) => s.project?.media.find((m) => m.id === selected?.mediaId)?.fileName);

  const addMusic = async (): Promise<void> => {
    const paths = await window.api.media.pickFiles();
    const items = await importPaths(paths);
    const audio = items.filter((m) => m.type === 'audio');
    if (items.length > 0 && audio.length === 0) toast('음악 파일(mp3, m4a, wav, aac)을 골라 주세요', 'error');
    addMediaToTimeline(audio.map((m) => m.id));
  };

  const fit = (): void => {
    edit('영상 길이에 맞추기', (p) => ops.fitMusicToVideo(p));
    toast('음악을 영상 길이에 맞췄어요');
  };

  if (!music) return <div />;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 text-sm [&>*]:shrink-0" data-testid="music-panel">
      <button
        className="rounded-md bg-brand-600 py-2 font-semibold text-white hover:bg-brand-700"
        onClick={() => void addMusic()}
        data-testid="music-add"
      >
        ♪ 음악 넣기
      </button>
      <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
        유튜브에 올릴 때는 저작권 없는 음악을 써주세요. 유튜브 오디오 보관함을 추천해요.
      </p>

      {count === 0 ? (
        <p className="text-xs text-gray-400">음악 파일을 타임라인의 음악 줄로 끌어다 놓아도 돼요.</p>
      ) : (
        <>
          {selected && (
            <p className="text-xs text-gray-500">
              ♪ {selName} · {formatTimePrecise(selected.outPoint - selected.inPoint)}
              {selected.loop ? ' (반복)' : ''}
            </p>
          )}
          <button
            className="rounded-md border border-gray-200 py-2 hover:bg-gray-50 disabled:opacity-50"
            onClick={fit}
            disabled={!hasVideo}
            title="영상보다 길면 끝을 자르고, 짧으면 처음부터 반복해요"
            data-testid="music-fit"
          >
            영상 길이에 맞추기
          </button>

          <LiveSlider
            label="음악 소리 크기"
            value={Math.round(music.volume * 100)}
            min={0}
            max={100}
            step={5}
            format={(v) => `${v}%`}
            editLabel="음악 소리 크기 바꾸기"
            apply={(p, v) => ops.setMusicSettings(p, { volume: v / 100 })}
            testId="music-volume"
          />

          <Toggle
            label="시작할 때 서서히 커지기"
            on={music.fadeIn > 0}
            onChange={(on) => edit('음악 페이드인', (p) => ops.setMusicSettings(p, { fadeIn: on ? DEFAULT_FADE_IN : 0 }))}
            testId="music-fadein"
          />
          <Toggle
            label="끝날 때 서서히 작아지기"
            on={music.fadeOut > 0}
            onChange={(on) => edit('음악 페이드아웃', (p) => ops.setMusicSettings(p, { fadeOut: on ? DEFAULT_FADE_OUT : 0 }))}
            testId="music-fadeout"
          />
          <Toggle
            label="말소리 있을 때 음악 줄이기"
            on={music.ducking}
            onChange={(on) => edit('말소리 있을 때 음악 줄이기', (p) => ops.setMusicSettings(p, { ducking: on }))}
            testId="music-ducking"
          />
        </>
      )}
    </div>
  );
}

function Toggle(props: { label: string; on: boolean; onChange: (on: boolean) => void; testId: string }): JSX.Element {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2">
      <span>{props.label}</span>
      <button
        role="switch"
        aria-checked={props.on}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${props.on ? 'bg-brand-600' : 'bg-gray-300'}`}
        onClick={() => props.onChange(!props.on)}
        data-testid={props.testId}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${props.on ? 'left-[22px]' : 'left-0.5'}`}
        />
      </button>
    </label>
  );
}

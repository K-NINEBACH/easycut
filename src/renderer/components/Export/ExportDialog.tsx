// 영상 만들기 창 (PRD F9): 설정 → 진행 → 완료/실패
import { useEffect, useMemo, useState } from 'react';
import type { ExportQuality, JobProgress } from '@shared/types';
import { formatTime } from '@shared/format';
import { mediaUrl } from '@shared/mediaUrl';
import { getProject, useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { player } from '../Preview/player';

type Phase =
  | { kind: 'setup' }
  | { kind: 'running'; jobId: string; progress: number; eta?: number; clipIndex?: number }
  | { kind: 'done'; outputPath: string }
  | { kind: 'error'; detail: string; logPath?: string };

const YOUTUBE_TIP = 'https://support.google.com/youtube/answer/57407?hl=ko';

export default function ExportDialog(): JSX.Element | null {
  const open = useUiStore((s) => s.exportOpen);
  if (!open) return null;
  return <Dialog />;
}

function Dialog(): JSX.Element {
  const setOpen = useUiStore((s) => s.setExportOpen);
  const setLocked = useUiStore((s) => s.setLocked);
  const name = useProjectStore((s) => s.project?.name ?? '');
  const media = useProjectStore((s) => s.project?.media);
  const clips = useProjectStore((s) => s.project?.videoTrack);
  const [phase, setPhase] = useState<Phase>({ kind: 'setup' });
  const [outputPath, setOutputPath] = useState('');
  const [more, setMore] = useState(false);
  const [quality, setQuality] = useState<ExportQuality>('1080p');
  const [fps, setFps] = useState<30 | 60>(30);

  // 4K 는 원본이 4K 일 때만 (PRD F9)
  const has4k = useMemo(() => {
    const used = new Set(clips?.map((c) => c.mediaId));
    return !!media?.some((m) => used.has(m.id) && m.type === 'video' && Math.min(m.width ?? 0, m.height ?? 0) >= 2160);
  }, [media, clips]);

  useEffect(() => {
    player.pause();
    void window.api.render.defaultPath(name).then(setOutputPath);
    // 창을 여는 동안 이름이 바뀌어도 처음 정한 위치를 쓴다
  }, []);

  // 진행 상황 구독
  const jobId = phase.kind === 'running' ? phase.jobId : null;
  useEffect(() => {
    if (!jobId) return;
    const offP = window.api.jobs.onProgress((e: JobProgress) => {
      if (e.jobId !== jobId) return;
      setPhase((p) => (p.kind === 'running' ? { ...p, progress: e.progress, eta: e.etaSeconds, clipIndex: e.clipIndex ?? p.clipIndex } : p));
    });
    const offD = window.api.jobs.onDone((e) => {
      if (e.jobId !== jobId) return;
      setLocked(false);
      if (e.status === 'done') setPhase({ kind: 'done', outputPath: (e.result as { outputPath: string }).outputPath });
      else if (e.status === 'canceled') setPhase({ kind: 'setup' });
      else setPhase({ kind: 'error', detail: e.error ?? '알 수 없는 오류', logPath: e.logPath });
    });
    return () => {
      offP();
      offD();
    };
  }, [jobId, setLocked]);

  const start = async (): Promise<void> => {
    const project = getProject();
    if (!project || !outputPath) return;
    setLocked(true);
    const { jobId } = await window.api.render.start({ project, outputPath, quality, fps, subtitleMode: 'burn' });
    setPhase({ kind: 'running', jobId, progress: 0 });
  };

  const changeLocation = async (): Promise<void> => {
    const p = await window.api.render.pickOutput(outputPath);
    if (p) setOutputPath(p);
  };

  const close = (): void => {
    if (phase.kind === 'running') return;
    setOpen(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" data-testid="export-dialog">
      <div className="w-[480px] rounded-xl bg-white p-6 shadow-2xl" role="dialog" aria-label="영상 만들기">
        {phase.kind === 'setup' && (
          <>
            <h3 className="text-lg font-semibold">영상 만들기</h3>
            <button
              className="mt-4 w-full rounded-xl bg-brand-600 py-4 text-lg font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={!outputPath}
              onClick={() => void start()}
              data-testid="export-start"
            >
              {more ? '이 설정으로 만들기' : '유튜브용으로 만들기'}
            </button>
            <p className="mt-2 text-center text-xs text-gray-500">
              {RES_LABEL[quality]} · {fps}fps · MP4
            </p>

            <div className="mt-4 rounded-md bg-gray-50 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-gray-500">저장 위치</span>
                <button className="text-xs text-brand-600 hover:underline" onClick={() => void changeLocation()}>
                  위치 바꾸기
                </button>
              </div>
              <p className="mt-1 break-all text-xs text-gray-700" data-testid="export-path">
                {outputPath || '…'}
              </p>
            </div>

            <button className="mt-3 text-xs text-gray-500 hover:text-gray-800" onClick={() => setMore((v) => !v)}>
              {more ? '▾ 접기' : '▸ 더 보기'}
            </button>
            {more && (
              <div className="mt-2 flex flex-col gap-3 text-sm">
                <Choice
                  label="화질"
                  value={quality}
                  onChange={setQuality}
                  options={[
                    { v: '720p', label: '720p' },
                    { v: '1080p', label: '1080p' },
                    { v: '4k', label: '4K', disabled: !has4k, title: has4k ? undefined : '원본이 4K 일 때만 고를 수 있어요' }
                  ]}
                />
                <Choice
                  label="프레임"
                  value={fps}
                  onChange={setFps}
                  options={[
                    { v: 30, label: '30fps' },
                    { v: 60, label: '60fps' }
                  ]}
                />
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100" onClick={close}>
                닫기
              </button>
            </div>
          </>
        )}

        {phase.kind === 'running' && (
          <Running
            progress={phase.progress}
            eta={phase.eta}
            clipIndex={phase.clipIndex}
            onCancel={() => void window.api.jobs.cancel(phase.jobId)}
          />
        )}

        {phase.kind === 'done' && (
          <>
            <h3 className="text-lg font-semibold">영상을 다 만들었어요 🎉</h3>
            <p className="mt-2 break-all rounded-md bg-gray-50 p-2 text-xs text-gray-600" data-testid="export-result">
              {phase.outputPath}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                className="flex-1 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
                onClick={() => void window.api.shell.openFile(phase.outputPath)}
              >
                ▶ 영상 재생하기
              </button>
              <button
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm hover:bg-gray-50"
                onClick={() => void window.api.shell.openFolder(phase.outputPath)}
              >
                폴더 열기
              </button>
            </div>
            <button
              className="mt-3 text-xs text-brand-600 hover:underline"
              onClick={() => void window.api.shell.openExternal(YOUTUBE_TIP)}
            >
              유튜브에 올리는 방법 보기
            </button>
            <div className="mt-4 flex justify-end">
              <button className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100" onClick={close}>
                닫기
              </button>
            </div>
          </>
        )}

        {phase.kind === 'error' && <Failed detail={phase.detail} logPath={phase.logPath} onBack={() => setPhase({ kind: 'setup' })} />}
      </div>
    </div>
  );
}

const RES_LABEL: Record<ExportQuality, string> = { '720p': '720p', '1080p': '1080p', '4k': '4K' };

function Choice<T extends string | number>(props: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { v: T; label: string; disabled?: boolean; title?: string }[];
}): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 text-xs font-medium text-gray-500">{props.label}</span>
      <div className="flex flex-1 gap-1">
        {props.options.map((o) => (
          <button
            key={String(o.v)}
            className={`flex-1 rounded-md border py-1.5 disabled:cursor-not-allowed disabled:opacity-40 ${
              props.value === o.v ? 'border-brand-600 bg-brand-50 font-semibold text-brand-700' : 'border-gray-200 hover:bg-gray-50'
            }`}
            disabled={o.disabled}
            title={o.title}
            aria-pressed={props.value === o.v}
            onClick={() => props.onChange(o.v)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Running(props: { progress: number; eta?: number; clipIndex?: number; onCancel: () => void }): JSX.Element {
  const clip = useProjectStore((s) => (props.clipIndex !== undefined ? s.project?.videoTrack[props.clipIndex] : undefined));
  const thumb = useProjectStore((s) => s.project?.media.find((m) => m.id === clip?.mediaId)?.thumbnailPath);
  const total = useProjectStore((s) => s.project?.videoTrack.length ?? 0);
  const pct = Math.round(props.progress * 100);
  return (
    <>
      <h3 className="text-lg font-semibold">영상을 만들고 있어요…</h3>
      <div className="mt-4 flex items-center gap-3">
        <div className="h-14 w-24 shrink-0 overflow-hidden rounded-md bg-gray-800">
          {thumb && <img src={mediaUrl(thumb)} className="h-full w-full object-cover" alt="" />}
        </div>
        <div className="flex-1 text-sm text-gray-600">
          {props.clipIndex !== undefined && props.progress < 0.6 ? (
            <p>
              장면 {props.clipIndex + 1} / {total} 준비 중
            </p>
          ) : (
            <p>하나의 영상으로 묶는 중</p>
          )}
          <p className="text-xs text-gray-400">
            {props.eta !== undefined ? `남은 시간 약 ${formatTime(Math.max(1, props.eta))}` : '남은 시간 계산 중…'}
          </p>
        </div>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${pct}%` }} data-testid="export-progress" />
      </div>
      <p className="mt-1 text-right text-xs text-gray-500">{pct}%</p>
      <p className="mt-3 text-xs text-gray-400">만드는 동안에는 편집할 수 없어요.</p>
      <div className="mt-4 flex justify-end">
        <button className="rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50" onClick={props.onCancel} data-testid="export-cancel">
          취소
        </button>
      </div>
    </>
  );
}

function Failed(props: { detail: string; logPath?: string; onBack: () => void }): JSX.Element {
  const [copied, setCopied] = useState(false);
  // 미리 정해 둔 안내(원본 없음 등)는 그대로 보여주고, 그 밖의 오류는 쉬운 말로
  const friendly = /^(원본 파일을|음악 파일을|타임라인에|프로젝트가)/.test(props.detail) ? props.detail.split('\n')[0] : null;
  const copy = async (): Promise<void> => {
    const text = `${props.detail}\n\n로그 파일: ${props.logPath ?? (await window.api.render.logPath()) ?? '없음'}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };
  return (
    <>
      <h3 className="text-lg font-semibold">영상을 만들지 못했어요</h3>
      <p className="mt-2 text-sm text-gray-600" data-testid="export-error">
        {friendly ?? '처리하는 중에 문제가 생겼어요. 아래 버튼으로 오류 내용을 복사해서 알려주시면 원인을 찾는 데 도움이 돼요.'}
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button className="rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50" onClick={() => void copy()}>
          {copied ? '복사했어요 ✓' : '오류 내용 복사'}
        </button>
        <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700" onClick={props.onBack}>
          돌아가기
        </button>
      </div>
    </>
  );
}

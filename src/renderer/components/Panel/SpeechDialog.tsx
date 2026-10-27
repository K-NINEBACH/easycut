// [🎤 말소리로 자막 만들기] (PRD 4-2): 범위 고르기 → (기존 자막 확인) → 진행 → 넣기
import { useEffect, useState } from 'react';
import * as ops from '@shared/ops';
import { isImageClip } from '@shared/timeline';
import type { JobDone, JobProgress, Subtitle } from '@shared/types';
import { edit, getProject, useProjectStore } from '../../store/project';
import { useUiStore, toast } from '../../store/ui';

type Phase =
  | { kind: 'choose' }
  | { kind: 'confirm' }
  | { kind: 'running'; jobId: string; progress: number }
  | { kind: 'error'; message: string };

export default function SpeechDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const selectedClip = useUiStore((s) => (s.selection?.kind === 'clip' ? s.selection.id : null));
  const clipNo = useProjectStore((s) => (selectedClip ? s.project!.videoTrack.findIndex((c) => c.id === selectedClip) + 1 : 0));
  const [range, setRange] = useState<'all' | 'selected'>(selectedClip ? 'selected' : 'all');
  const [phase, setPhase] = useState<Phase>({ kind: 'choose' });
  const setLocked = useUiStore((s) => s.setLocked);

  /** 대상: 소리가 나는 장면 */
  const targets = (): string[] => {
    const p = getProject()!;
    const media = new Map(p.media.map((m) => [m.id, m]));
    return p.videoTrack
      .filter((c) => (range === 'all' || c.id === selectedClip) && !isImageClip(c) && !c.muted && media.get(c.mediaId)?.hasAudio)
      .map((c) => c.id);
  };

  const start = async (): Promise<void> => {
    const ids = targets();
    if (ids.length === 0) {
      setPhase({ kind: 'error', message: '말소리가 들어 있는 장면이 없어요 (소리를 끈 장면은 빼요)' });
      return;
    }
    setLocked(true);
    const project = getProject()!;
    const { jobId } = await window.api.subtitle.generate({ project, clipIds: range === 'all' ? undefined : ids });
    setPhase({ kind: 'running', jobId, progress: 0 });
  };

  const begin = (): void => {
    const ids = new Set(targets());
    // 이미 자막이 있으면 덮어쓰기 전에 묻는다
    if (getProject()!.subtitles.some((s) => ids.has(s.anchorClipId))) setPhase({ kind: 'confirm' });
    else void start();
  };

  const jobId = phase.kind === 'running' ? phase.jobId : null;
  useEffect(() => {
    if (!jobId) return;
    const offP = window.api.jobs.onProgress((e: JobProgress) => {
      if (e.jobId === jobId) setPhase((p) => (p.kind === 'running' ? { ...p, progress: e.progress } : p));
    });
    const offD = window.api.jobs.onDone((e: JobDone) => {
      if (e.jobId !== jobId) return;
      setLocked(false);
      if (e.status === 'canceled') return setPhase({ kind: 'choose' });
      if (e.status === 'error') {
        const first = (e.error ?? '').split('\n')[0];
        return setPhase({
          kind: 'error',
          message: /없어요/.test(first) ? first : '말소리를 알아듣는 중에 문제가 생겼어요. 잠시 뒤 다시 해 주세요.'
        });
      }
      const subs = (e.result as Subtitle[]) ?? [];
      const ids = targets();
      edit('말소리로 자막 만들기', (p) => ops.replaceClipSubtitles(p, ids, subs));
      toast(subs.length ? `자막 ${subs.length}개를 만들었어요. 목록에서 고칠 수 있어요` : '말소리를 찾지 못했어요');
      onClose();
    });
    return () => {
      offP();
      offD();
    };
    // targets 는 범위가 바뀌지 않는 동안 같다
  }, [jobId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-[2px]" data-testid="speech-dialog">
      <div className="w-[420px] rounded-2xl border border-line bg-white p-6 shadow-lg" role="dialog" aria-label="말소리로 자막 만들기">
        <h3 className="text-xl font-semibold text-ink">🎤 말소리로 자막 만들기</h3>

        {phase.kind === 'choose' && (
          <>
            <p className="mt-2 text-sm text-gray-600">영상 속 말소리를 듣고 자막을 자동으로 만들어요. 만든 뒤에 목록에서 고칠 수 있어요.</p>
            <div className="mt-4 flex gap-2">
              {(
                [
                  ['all', '전체 영상'],
                  ['selected', selectedClip ? `선택한 장면만 (장면 ${clipNo})` : '선택한 장면만']
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  className={`flex-1 rounded-lg border transition-colors py-2 text-sm disabled:opacity-40 ${
                    range === v ? 'border-brand-300 bg-brand-100 font-semibold text-brand-700' : 'border-line bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                  disabled={v === 'selected' && !selectedClip}
                  title={v === 'selected' && !selectedClip ? '타임라인에서 장면을 먼저 눌러 주세요' : undefined}
                  onClick={() => setRange(v)}
                  data-testid={`speech-range-${v}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-xl px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100" onClick={onClose}>
                닫기
              </button>
              <button
                className="ez-btn-primary px-5 py-2.5 text-sm"
                onClick={begin}
                data-testid="speech-start"
              >
                자막 만들기
              </button>
            </div>
          </>
        )}

        {phase.kind === 'confirm' && (
          <>
            <p className="mt-3 text-sm text-gray-700" data-testid="speech-confirm">
              이 장면들에는 이미 자막이 있어요. 기존 자막을 지우고 새로 만들까요?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-xl px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100" onClick={() => setPhase({ kind: 'choose' })}>
                취소
              </button>
              <button
                className="ez-btn-primary px-5 py-2.5 text-sm"
                onClick={() => void start()}
                data-testid="speech-overwrite"
              >
                지우고 새로 만들기
              </button>
            </div>
          </>
        )}

        {phase.kind === 'running' && (
          <>
            <p className="mt-3 text-sm text-gray-700" data-testid="speech-progress">
              말소리를 듣고 있어요… {Math.round(phase.progress * 100)}%
            </p>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${phase.progress * 100}%` }} />
            </div>
            <div className="mt-5 flex justify-end">
              <button
                className="ez-btn-secondary px-5 py-2.5 text-sm"
                onClick={() => void window.api.jobs.cancel(phase.jobId)}
                data-testid="speech-cancel"
              >
                취소
              </button>
            </div>
          </>
        )}

        {phase.kind === 'error' && (
          <>
            <p className="mt-3 text-sm text-red-600" data-testid="speech-error">
              {phase.message}
            </p>
            <div className="mt-5 flex justify-end">
              <button className="rounded-xl px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100" onClick={() => setPhase({ kind: 'choose' })}>
                돌아가기
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

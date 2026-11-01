// 흔들림 줄이기·영역 고정 분석 진행 창 (PRD 13장 #16). ui.stabilizeJob 이 들어오면 분석하고 결과를 장면에 넣는다
import { useEffect, useState } from 'react';
import * as ops from '@shared/ops';
import type { JobDone, JobProgress, Stabilize } from '@shared/types';
import { edit, getProject } from '../../store/project';
import { toast, useUiStore } from '../../store/ui';

export default function StabilizeDialog(): JSX.Element | null {
  const job = useUiStore((s) => s.stabilizeJob);
  const setJob = useUiStore((s) => s.setStabilizeJob);
  const setLocked = useUiStore((s) => s.setLocked);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!job) return;
    const p = getProject();
    const clip = p?.videoTrack.find((c) => c.id === job.clipId);
    const media = p?.media.find((m) => m.id === clip?.mediaId);
    if (!clip || !media) return setJob(null);
    let id: string | null = null;
    // 끝 알림이 요청 응답보다 먼저 올 수 있어 모아 둔다
    let early: JobDone | null = null;
    const finish = (e: JobDone): void => {
      setLocked(false);
      setJobId(null);
      setJob(null);
      if (e.status === 'canceled') return;
      if (e.status === 'error') {
        const first = (e.error ?? '').split('\n')[0];
        toast(/요$/.test(first) ? first : '영상을 분석하는 중에 문제가 생겼어요. 잠시 뒤 다시 해 주세요.', 'error');
        return;
      }
      const st = e.result as Stabilize;
      edit(st.mode === 'lock' ? '영역 고정' : '흔들림 줄이기', (d) => ops.setStabilize(d, job.clipId, st));
      if ((st.lost ?? 0) > 0.05) toast(`대상을 놓친 구간이 ${Math.round(st.lost! * 100)}% 있어요. 결과를 확인해 주세요`);
      else toast(st.mode === 'lock' ? '고른 부분을 화면 가운데에 고정했어요' : '흔들림을 줄였어요');
    };
    const offP = window.api.jobs.onProgress((e: JobProgress) => {
      if (e.jobId === id) setProgress(e.progress);
    });
    const offD = window.api.jobs.onDone((e: JobDone) => {
      if (e.kind !== 'stabilize') return;
      if (id === null) early = e;
      else if (e.jobId === id) finish(e);
    });
    setLocked(true);
    setProgress(0);
    void window.api.stabilize.analyze({ media, clip, mode: job.mode, box: job.box, refTime: job.refTime }).then((r) => {
      id = r.jobId;
      setJobId(r.jobId);
      if (early?.jobId === id) finish(early);
    });
    return () => {
      offP();
      offD();
    };
  }, [job, setJob, setLocked]);

  if (!job) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-[2px]" data-testid="stabilize-dialog">
      <div className="w-[380px] rounded-2xl border border-line bg-white p-6 shadow-lg" role="dialog" aria-label="영상 분석">
        <h3 className="text-lg font-semibold text-ink">{job.mode === 'lock' ? '고른 부분을 따라가는 중이에요' : '흔들림을 찾는 중이에요'}</h3>
        <p className="mt-3 text-sm text-gray-700" data-testid="stabilize-progress">
          {Math.round(progress * 100)}%
        </p>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="mt-5 flex justify-end">
          <button
            className="ez-btn-secondary px-5 py-2.5 text-sm"
            disabled={!jobId}
            onClick={() => jobId && void window.api.jobs.cancel(jobId)}
            data-testid="stabilize-cancel"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

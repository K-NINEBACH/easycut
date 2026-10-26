import { useState } from 'react';

// 트랙은 고정 3줄: 영상 / 자막 / 음악 (PRD 5.1)
export default function Timeline(): JSX.Element {
  const [zoom, setZoom] = useState(50);

  return (
    <section className="h-56 shrink-0 border-t border-gray-200 bg-white">
      <div className="flex items-center justify-between px-3 py-1.5">
        <h2 className="text-sm font-semibold">타임라인</h2>
        <label className="flex items-center gap-2 text-xs text-gray-500">
          －
          <input
            type="range"
            min={0}
            max={100}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="확대/축소"
          />
          ＋
        </label>
      </div>
      <div className="flex flex-col gap-1.5 px-3 pb-3">
        <Track label="영상" height="h-20">
          <div className="flex h-full items-center justify-center rounded-md border-2 border-dashed border-gray-200 text-sm text-gray-400">
            여기로 영상을 끌어다 놓으세요
          </div>
        </Track>
        <Track label="자막" height="h-9" />
        <Track label="음악" height="h-9" />
      </div>
    </section>
  );
}

function Track({
  label,
  height,
  children
}: {
  label: string;
  height: string;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <div className={`flex ${height} items-stretch gap-2`}>
      <div className="flex w-12 shrink-0 items-center text-xs font-medium text-gray-500">{label}</div>
      <div className="flex-1 rounded-md bg-gray-50">{children}</div>
    </div>
  );
}

export default function PreviewArea(): JSX.Element {
  return (
    <section className="flex min-w-0 flex-1 flex-col rounded-lg border border-gray-200 bg-white">
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        {/* 16:9 미리보기 캔버스 자리 (M3) */}
        <div className="aspect-video max-h-full w-full max-w-full bg-black" />
      </div>
      <div className="flex items-center justify-center gap-4 border-t border-gray-100 py-2 text-sm">
        <button className="rounded px-2 py-1 hover:bg-gray-100" title="처음으로">
          ◀◀
        </button>
        <button className="rounded-full bg-gray-900 px-4 py-1.5 text-white" title="재생 (Space)">
          ▶
        </button>
        <button className="rounded px-2 py-1 hover:bg-gray-100" title="끝으로">
          ▶▶
        </button>
        <span className="font-mono text-gray-500 tabular-nums">00:00 / 00:00</span>
      </div>
    </section>
  );
}

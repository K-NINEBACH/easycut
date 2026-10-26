export default function MediaBin(): JSX.Element {
  return (
    <section className="flex w-64 shrink-0 flex-col rounded-lg border border-gray-200 bg-white">
      <h2 className="border-b border-gray-100 px-3 py-2 text-sm font-semibold">내 영상/사진</h2>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center text-sm text-gray-400">
        <p>아직 불러온 파일이 없어요</p>
      </div>
      <div className="p-3">
        <button className="w-full rounded-lg bg-brand-50 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-100">
          + 불러오기
        </button>
      </div>
    </section>
  );
}

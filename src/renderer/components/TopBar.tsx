import { useState } from 'react';
import { useAppInfo } from '../hooks/useAppInfo';

export default function TopBar(): JSX.Element {
  const [name, setName] = useState('2026-10-27 여행 영상');
  const [menuOpen, setMenuOpen] = useState(false);
  const info = useAppInfo();
  const toolsReady = !!info?.ffmpeg.version && !!info?.ffprobe.version;

  return (
    <header className="relative flex h-12 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-3">
      <button
        className="rounded-md px-3 py-1.5 text-sm hover:bg-gray-100"
        onClick={() => setMenuOpen((v) => !v)}
      >
        ≡ 메뉴
      </button>
      {menuOpen && (
        <div className="absolute top-11 left-3 z-10 w-80 rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-lg">
          <p className="mb-2 font-semibold">프로그램 정보</p>
          <p className="text-gray-600">쉬운편집 {info?.appVersion ?? ''}</p>
          <p className="mt-2 break-all text-xs text-gray-500">
            {info?.ffmpeg.version ?? info?.ffmpeg.error ?? '확인 중…'}
          </p>
          <p className="mt-1 break-all text-xs text-gray-500">
            {info?.ffprobe.version ?? info?.ffprobe.error ?? '확인 중…'}
          </p>
        </div>
      )}

      <input
        className="w-72 rounded-md border border-transparent px-2 py-1 font-semibold hover:border-gray-200 focus:border-brand-500 focus:outline-none"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="프로젝트 이름"
      />

      <div className="flex-1" />

      {info && (
        <span
          className={`text-xs ${toolsReady ? 'text-gray-400' : 'text-red-600'}`}
          title={toolsReady ? `${info.ffmpeg.version}` : info.ffmpeg.error}
        >
          {toolsReady ? '영상 도구 준비됨 ✓' : '영상 도구를 찾을 수 없어요'}
        </span>
      )}

      <div className="flex gap-1">
        <button className="rounded-md px-2 py-1.5 text-lg text-gray-400" title="되돌리기 (Ctrl+Z)" disabled>
          ↶
        </button>
        <button className="rounded-md px-2 py-1.5 text-lg text-gray-400" title="다시 하기 (Ctrl+Y)" disabled>
          ↷
        </button>
      </div>

      <button
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        disabled
      >
        ▶ 영상 만들기
      </button>
    </header>
  );
}

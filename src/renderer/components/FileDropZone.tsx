import { useEffect, useState } from 'react';
import { importPaths } from '../store/mediaActions';

function hasFiles(e: DragEvent): boolean {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
}

/**
 * 탐색기에서 파일·폴더를 창 어디에 끌어다 놓아도 불러온다 (PRD F1).
 * 타임라인 위에 놓은 경우는 타임라인이 먼저 처리한다 (defaultPrevented).
 */
export default function FileDropZone(): JSX.Element | null {
  const [over, setOver] = useState(false);

  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      depth++;
      setOver(true);
    };
    const leave = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const overHandler = (e: DragEvent): void => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent): void => {
      depth = 0;
      setOver(false);
      if (!hasFiles(e)) return;
      e.preventDefault();
      if ((e as DragEvent & { ezcutHandled?: boolean }).ezcutHandled) return;
      const paths = Array.from(e.dataTransfer?.files ?? []).map((f) => window.api.media.pathForFile(f));
      void importPaths(paths.filter(Boolean));
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overHandler);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overHandler);
      window.removeEventListener('drop', drop);
    };
  }, []);

  if (!over) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-brand-500/10 backdrop-blur-[2px]">
      <div className="rounded-2xl border-[3px] border-dashed border-brand-400 bg-white/95 px-12 py-10 text-xl font-semibold text-brand-700 shadow-lg">
        여기에 놓으면 불러와요
      </div>
    </div>
  );
}

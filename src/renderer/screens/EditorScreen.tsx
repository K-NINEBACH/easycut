import TopBar from '../components/TopBar';
import MediaBin from '../components/MediaBin/MediaBin';
import PreviewArea from '../components/Preview/PreviewArea';
import DecoratePanel from '../components/Panel/DecoratePanel';
import Timeline from '../components/Timeline/Timeline';
import FileDropZone from '../components/FileDropZone';
import MissingMediaDialog from '../components/MissingMediaDialog';
import ExportDialog from '../components/Export/ExportDialog';
import ShortcutsDialog from '../components/Help/ShortcutsDialog';
import Tour, { useFirstRunTour } from '../components/Help/Tour';
import { getProject } from '../store/project';
import { useUiStore } from '../store/ui';
import { useShortcuts } from '../hooks/useShortcuts';

// PRD 5.1 메인 편집 화면: 상단바 / (보관함 | 미리보기 | 꾸미기 패널) / 타임라인
export default function EditorScreen(): JSX.Element {
  useFirstRunTour();
  useShortcuts({
    onExport: () => {
      if (getProject()?.videoTrack.length) useUiStore.getState().setExportOpen(true);
    }
  });
  return (
    <div className="flex h-full flex-col bg-canvas">
      <TopBar />
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <MediaBin />
        <PreviewArea />
        <DecoratePanel />
      </div>
      <Timeline />
      <FileDropZone />
      <MissingMediaDialog />
      <ExportDialog />
      <ShortcutsDialog />
      <Tour />
    </div>
  );
}

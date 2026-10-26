// PRD 7장 데이터 모델. 시간 단위는 전부 초(number).

export type MediaType = 'video' | 'image' | 'audio';

export type ProxyStatus = 'pending' | 'processing' | 'ready' | 'error';

export interface MediaItem {
  id: string; // uuid
  type: MediaType;
  path: string; // 원본 절대 경로
  fileName: string;
  fileSize: number;
  fileMtime: number; // 캐시 검증용 (ms)
  duration: number; // 사진은 0
  width?: number; // 회전 반영 후 값
  height?: number;
  rotation?: number; // 0 | 90 | 180 | 270
  fps?: number;
  isVfr?: boolean; // 가변 프레임
  isHdr?: boolean;
  hasAudio: boolean;
  codec?: string;
  createdAt?: string; // 촬영 시각 (ISO)
  proxyPath?: string;
  proxyStatus: ProxyStatus;
  proxyProgress?: number; // 0~1, 화면 표시용
  thumbnailPath?: string;
  filmstripDir?: string;
  waveformPath?: string;
  /** 원본 파일을 찾을 수 없음 (프로젝트 열 때 확인) */
  missing?: boolean;
}

export type FitMode = 'blur' | 'black' | 'fill';

export type FilterId =
  | 'none'
  | 'vivid'
  | 'warm'
  | 'cool'
  | 'film'
  | 'mono'
  | 'bright'
  | 'mood'
  | 'forest';

export interface ColorAdjust {
  brightness: number; // -50 ~ 50
  contrast: number; // -50 ~ 50
  saturation: number; // -50 ~ 50
}

export type Speed = 0.5 | 1 | 1.5 | 2;

export interface VideoClip {
  id: string;
  mediaId: string;
  inPoint: number; // 원본 기준 시작 (초)
  outPoint: number; // 원본 기준 끝 (초). 사진은 imageDuration 사용
  imageDuration?: number;
  speed: Speed;
  muted: boolean;
  volume: number; // 0 ~ 2
  fitMode: FitMode;
  filter: FilterId;
  filterStrength: number; // 0 ~ 1
  adjust: ColorAdjust;
}

export type TransitionId =
  | 'none'
  | 'fade'
  | 'fadeblack'
  | 'fadewhite'
  | 'slideleft'
  | 'slideright'
  | 'slideup'
  | 'circleopen'
  | 'hblur'
  | 'zoomin';

export interface Transition {
  // 영상 트랙의 clips[i]와 clips[i+1] 사이 전환
  afterClipId: string;
  type: TransitionId;
  duration: number; // 0.3 | 0.6 | 1.0 (실제 적용 길이는 timeline.ts 에서 자동 축소)
}

export type SubtitleStyleId = 'basic' | 'box' | 'yellow' | 'hand' | 'title';

export interface SubtitleStyle {
  presetId: SubtitleStyleId;
  size: 'S' | 'M' | 'L';
  position: 'top' | 'middle' | 'bottom';
}

export interface Subtitle {
  id: string;
  text: string;
  // 자막은 클립에 붙는다: 클립 시작 기준 상대 시간
  anchorClipId: string;
  offset: number; // anchor 클립 타임라인 시작점 기준 (초)
  duration: number;
  styleOverride?: Partial<SubtitleStyle>;
}

export interface MusicClip {
  id: string;
  mediaId: string;
  inPoint: number;
  outPoint: number;
  loop: boolean; // "영상 길이에 맞추기"로 생성된 반복 여부
}

export interface MusicSettings {
  volume: number; // 0 ~ 1, 기본 0.3
  fadeIn: number; // 초, 기본 1 (0이면 끔)
  fadeOut: number; // 초, 기본 3 (0이면 끔)
  ducking: boolean; // 기본 true
}

export interface Project {
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  output: { width: 1920; height: 1080; fps: 30 | 60 };
  media: MediaItem[];
  videoTrack: VideoClip[]; // 순서 = 재생 순서
  transitions: Transition[];
  subtitles: Subtitle[];
  defaultSubtitleStyle: SubtitleStyle;
  musicTrack: MusicClip[];
  music: MusicSettings;
}

export interface RecentProject {
  path: string; // project.ezcut 경로
  name: string;
  updatedAt: string;
  thumbnailPath?: string;
}

export type JobKind = 'media' | 'subtitle' | 'render';

export interface JobProgress {
  jobId: string;
  kind: JobKind;
  /** 0~1 */
  progress: number;
  /** media job 이면 mediaId */
  targetId?: string;
  message?: string;
  /** 남은 시간 예상 (초) */
  etaSeconds?: number;
  /** 렌더 중 처리 중인 장면 index */
  clipIndex?: number;
}

export interface JobDone {
  jobId: string;
  kind: JobKind;
  targetId?: string;
  status: 'done' | 'error' | 'canceled';
  error?: string;
  /** 작업별 결과 (media: Partial<MediaItem>, subtitle: Subtitle[], render: {outputPath}) */
  result?: unknown;
  logPath?: string;
}

export type ExportQuality = '720p' | '1080p' | '4k';
export type SubtitleExportMode = 'burn' | 'srt' | 'both';

export interface RenderOptions {
  project: Project;
  outputPath: string;
  quality: ExportQuality;
  fps: 30 | 60;
  subtitleMode: SubtitleExportMode;
}

export const IMAGE_DEFAULT_DURATION = 3;
export const MIN_CLIP_LENGTH = 0.5;

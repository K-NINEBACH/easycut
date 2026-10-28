# 쉬운편집 (EasyCut) — Claude Code 지침

기능 범위의 기준은 `PRD.md`. 아래는 요약.

## 작업 규칙 (PRD 0장)
- PRD에 없는 기능은 추가하지 않는다. 10장 마일스톤 순서대로, 동작 확인 후 다음 단계로.
- UI 문구는 한국어 + 쉬운 말 (PRD 5.3 용어표).
- 영상 처리(FFmpeg)는 반드시 메인 프로세스에서. 렌더러는 `window.api.*` 로만 통신.
- 사용자 원본 파일은 읽기만. 중간 파일은 프로젝트 `cache/` 에만.
- 시간 계산은 `src/shared/timeline.ts` 한 곳에만 구현 (중복 금지).
- FFmpeg 명령 생성은 순수 함수 + 스냅샷 테스트. `spawn` 에 인자 배열로 전달 (셸 문자열 금지).
- 애매한 결정은 PRD 13장 "미결 사항"에 적고 가장 단순한 방법으로 진행.

## 명령어
```
npm install              # 의존성 (electron 바이너리가 안 받아지면: node node_modules/electron/install.js)
npm run fetch:ffmpeg     # resources/bin 에 Windows ffmpeg.exe/ffprobe.exe (BtbN 8.1 GPL) 받기
node scripts/fetch-fonts.mjs  # 자막 글꼴 (저장소에 이미 있음, 다시 받을 때만)
node scripts/fetch-whisper.mjs   # resources/bin/whisper-cli.exe + dll, resources/models/ggml-small.bin (약 490MB)
npm run check:ffmpeg     # 앱이 쓸 ffmpeg/ffprobe 버전 출력
npm run dev              # 개발 실행
npm run typecheck
npm test                 # vitest (tests/unit)
npm run dist:win         # NSIS 설치 파일 dist/EasyCut-Setup-버전.exe (Windows에서 실행, 올리기는 "## 배포")
```

## 구조 메모
- `src/shared` 공용 순수 TS (`@shared/*` 별칭), `src/main`, `src/preload`, `src/renderer` (`@renderer/*`).
- 바이너리 경로: `src/main/ffmpeg/binaries.ts` — Windows는 항상 `resources/bin/*.exe`,
  다른 OS(개발용)는 `resources/bin/<name>` 이 없으면 PATH 의 ffmpeg 사용.
- 배포 시 `resources/*` 는 electron-builder `extraResources` 로 `process.resourcesPath` 아래에 복사.
- `resources/bin/*`, `resources/models/*.bin` 은 git 에 넣지 않는다.

## 속도 (2026-10 최적화)
- 중간 파일은 `ultrafast crf14` (PRD 9.1 "무손실에 가깝게", veryfast crf16 보다 약 1.9배 빠르고 화질↑, 파일은 약 2.7배).
- 장면 처리·프록시 필터 순서: 프레임 줄이기(fps) → 크기 줄이기(화면 덮을 만큼) → HDR 변환 → 화면 맞춤 → 필터.
  흐린 배경은 1/4 크기에서 흐리게. 사진은 한 번만 처리하고 loop 로 반복.
- 전환이 있으면 잇기를 최종 인코딩 안에서 한다 (`buildFinalCommand` 가 조각 목록도 받음). 16개 넘으면 묶음만 먼저 이음.
- 장면 동시 처리 수 = CPU 코어 3개당 1개 (2~4).
- 재기: `PATH=resources/bin:$PATH BENCH_CLIPS=12 npx vitest run --config vitest.bench.config.mts --silent=false`
  (i5-8500 6코어, 장면 12개+전환: 61.5초 → 35.7초)

## 배포·자동 업데이트 (PRD 13장 #11)
- 설치한 앱은 실행할 때 `K-NINEBACH/easycut` 의 최신 GitHub 릴리스를 확인한다 (`src/main/updater.ts`,
  안내 창 `components/UpdateBanner.tsx`). 개발 실행·EASYCUT_TEST 에서는 확인하지 않는다.
- 새 버전 올리는 법:
  1. `package.json` 의 version 올리기 (예: 0.1.1 → 0.1.2). 버전이 같으면 업데이트가 안 된다.
  2. 커밋 → `git push`, `npm run dist:win`
  3. `gh release create v0.1.2 dist/EasyCut-Setup-0.1.2.exe dist/EasyCut-Setup-0.1.2.exe.blockmap dist/latest.yml --title "0.1.2" --notes "바뀐 점"`
     (세 파일 모두 필요. 태그는 v+버전. 이전 릴리스의 blockmap 은 지우지 않는다 — 바뀐 부분만 받는 데 씀)
- 시험: `node tests/e2e/x-update.mjs <옛 설치 파일> <새 버전 폴더>` — 옛 버전을 임시 폴더에 설치하고 내 PC 안 시험 서버
  (`EASYCUT_UPDATE_URL`)로 업데이트 → 버전·프로젝트 유지·받은 양 확인 후 지움. 새 버전 폴더에는 새 exe·blockmap·latest.yml
  과 옛 blockmap. 업데이트 임시 폴더 `%LOCALAPPDATA%\easycut-updater` 를 비우고 시작한다.
  시험용 새 버전은 `npx electron-builder --win --publish never '--config.directories.output=dist-test'` (version 만 잠깐 올려서)

## 디자인
- 색·모서리·그림자 토큰과 공통 부품 클래스(`ez-panel`, `ez-btn-primary/secondary/soft`, `ez-icon-btn`, `ez-seg`, `ez-input`)는
  `src/renderer/index.css` 한 곳. 회색 단계(gray-50~900)도 시안 색으로 덮어써 있음. 아이콘은 lucide-react.
- 타임라인 색: 영상 `clip-video`, 자막 `clip-sub`, 음악 `clip-music`, 전환 ◆ `clip-fade`, 재생 위치 `playhead`.
- 슬라이더 채움은 `style={{ '--fill': '40%' }}` 로 넘긴다 (`LiveSlider` 참고).
- 앱 아이콘: `build/icon.svg` 고친 뒤 `npx electron scripts/make-icon.mjs` → `build/icon.png`.

## 테스트
```
npm test                       # 단위 테스트 (vitest)
node scripts/make-fixtures.mjs # 테스트 샘플 생성 (시스템 ffmpeg 필요)
npm run test:integration       # 실제 ffmpeg 통합 테스트
node scripts/make-speech-fixture.mjs  # 한국어 말소리 샘플 tests/speech/ (Windows 음성 합성 Heami)
npx electron-vite build && node tests/e2e/m2-timeline.mjs   # E2E (Playwright, 리눅스는 xvfb-run)
```
- Windows: 시스템 ffmpeg 가 없으면 `PATH="$PWD/resources/bin:$PATH"` 를 붙여 샘플 생성·통합 테스트 실행.
- E2E 는 `playwright` 모듈이 필요 (`npm i --no-save playwright`, 브라우저 다운로드는 필요 없음).
- E2E 파일: m1-import, m2-timeline, m3-preview, m4-trim, m5-export, m6-filter, m7-transition, m8-music, m9-subtitle, m9b-speech, m10-start. 강제 종료 흉내는 `launch.mjs` 의 `forceKill`
  (Windows 는 `kill` 이 자식 프로세스를 남겨 테스트가 안 끝남).
- 버그 찾기용 추가 시험 (x- 로 시작):
  - `x-monkey.mjs [횟수=300] [씨앗=1]` 무작위 조작 → 자료 규칙·되돌리기 1단계·다시 열기 검사
    (`MONKEY_DEBUG=1` 이면 기록 없이 바뀐 자료를 찍음. 되돌리기는 100단계 한도라 처음 상태 비교는 그 안에서만)
  - `x-edge.mjs` 특수문자 경로·금지 문자 이름·모든 기능 섞은 영상 만들기·깨진 프로젝트·빈 타임라인
  - `x-stress.mjs [장면 수=40]` 대량 장면 + 화면 프레임 간격·영상 만들기(16개 묶음)
  - `x-packaged.mjs` 배포판(dist/win-unpacked)에서 동봉 ffmpeg·글꼴·whisper 확인
    (먼저 `npx electron-vite build && npx electron-builder --win --dir`)
  - `x-update.mjs` 실제 설치 → 자동 업데이트 (아래 "## 배포·자동 업데이트")

## 진행 상황
- [x] M0 프로젝트 셋업
- [x] M1 미디어 불러오기
- [x] M2 타임라인 기본 (timeline.ts, ops.ts, Undo/Redo, 자동 저장, 재연결)
- [x] M3 미리보기 (경계 멈춤은 <video> currentTime 진행 기준으로 측정)
- [x] M4 자르기·나누기·속도 (타임라인 손잡이 `Timeline/trimDrag.ts`, 꾸미기 패널 `Panel/TrimPanel.tsx`,
      드래그·슬라이더는 `store/project.ts` 의 `liveEdit` 로 되돌리기 1단계)
- [x] M5 최소 렌더 (`services/RenderService.ts`, 명령은 `ffmpeg/commands.ts` 의 buildClipCommand/buildFinalCommand,
      창은 `Export/ExportDialog.tsx`). 중간 파일은 .mov + PCM 소리(AAC 지연으로 싱크 밀림 방지),
      장면별 프레임 수는 `timeline.clipFrameCounts` (누적 오차 없음).
      내보내기 창의 자막 선택은 M9 에서 추가. `EZ_KEEP=1` 이면 렌더 통합 테스트 결과물을 남김
- [x] M6 필터 — 색 변환은 `src/shared/filters.ts` 한 곳. 33³ LUT 로 구워 미리보기(3D 텍스처)와
      렌더(`lut3d=...:interp=trilinear`, 작업 폴더 cwd 기준 파일명)가 같은 표를 씀. m6-filter E2E 가 필터별
      미리보기↔결과 프레임 색 차이를 잼 (현재 평균 3/255 이하). 화면 채우기 선택은 자르기 탭(16:9 아닌 장면만)
- [x] M7 전환 — 렌더 2단계 `buildChainCommand` (컷=concat, 전환=xfade+acrossfade, 매 단계 뒤 fps 로 시간 단위 맞춤),
      장면 16개 넘으면 묶음별로 잇고 묶음끼리 다시 이음. 전환이 하나도 없으면 다시 인코딩 없이 concat 복사.
      ◆ 는 장면 아래쪽(가운데는 자르기 손잡이 자리). 전환 탭 `Panel/TransitionPanel.tsx`
- [x] M8 배경음악 — 미리보기 `Preview/music.ts` (<audio> 2개, 페이드는 `timeline.musicFade` = 렌더 afade,
      덕킹은 말소리 장면에서 50% 근사). 렌더는 최종 인코딩에서 음악 concat → apad/atrim → afade → volume →
      sidechaincompress(PRD 값) → amix. 테스트용 전역 `__ezcut.preview()` 로 엔진 접근
- [x] M9 자막
  - [x] M9a 직접 입력·모양·미리보기·굽기·.srt — 모양·줄바꿈·ASS·SRT 는 `src/shared/subtitles.ts` 한 곳.
        글꼴(OFL): Pretendard Bold / 나눔손글씨 펜("Nanum Pen") / 검은고딕("Black Han Sans"), resources/fonts 에 포함.
        CSS 글자 크기 = ASS 크기 × unitsPerEm/(winAscent+winDescent) (libass 기준). 미리보기 CSS 이름은 "EzSub …"
        (앱 화면 글꼴 Pretendard 와 섞이지 않게). 렌더는 작업 폴더에 글꼴·subs.ass 복사 후 상대 경로로 ass 필터.
        m9-subtitle E2E 가 미리보기↔결과 자막 글자 영역을 비교 (현재 차이 1% 미만)
  - [x] M9b 말소리 자동 생성 — `services/SubtitleService.ts`: 대상 장면 소리를 타임라인 순서로 16kHz WAV 하나로 →
        whisper-cli(-l ko -oj -pp) → `subtitles.segmentsToSubtitles` (시작 장면에 붙이고 두 줄씩 나눔).
        whisper.cpp v1.9.5(b5454) CPU 빌드. 17초 샘플 small 모델로 약 6초
- [x] M10 마감 — 시작 화면 `screens/StartScreen.tsx`, 비정상 종료 복구는 settings.json 의 sessionOpen
      (프로젝트 열 때 true, before-quit 에 false → 다음 실행 때 true 면 project:startup 이 바로 엶),
      첫 실행 안내 `Help/Tour.tsx` (테스트에서는 EASYCUT_TEST_TOUR=1 일 때만), 메뉴·단축키 표, 오류 경계.
      E2E launch.mjs 는 시작 화면을 지나감(start:'none' 으로 멈출 수 있음). dist:win 설치 파일 약 660MB (small 모델 포함)

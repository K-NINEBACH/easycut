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
npm run dist:win         # NSIS 설치 파일 (Windows에서 실행)
```

## 구조 메모
- `src/shared` 공용 순수 TS (`@shared/*` 별칭), `src/main`, `src/preload`, `src/renderer` (`@renderer/*`).
- 바이너리 경로: `src/main/ffmpeg/binaries.ts` — Windows는 항상 `resources/bin/*.exe`,
  다른 OS(개발용)는 `resources/bin/<name>` 이 없으면 PATH 의 ffmpeg 사용.
- 배포 시 `resources/*` 는 electron-builder `extraResources` 로 `process.resourcesPath` 아래에 복사.
- `resources/bin/*`, `resources/models/*.bin` 은 git 에 넣지 않는다.

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
- E2E 파일: m1-import, m2-timeline, m3-preview, m4-trim, m5-export, m6-filter, m7-transition, m8-music, m9-subtitle, m9b-speech. 강제 종료 흉내는 `launch.mjs` 의 `forceKill`
  (Windows 는 `kill` 이 자식 프로세스를 남겨 테스트가 안 끝남).

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
- [ ] M10 마감

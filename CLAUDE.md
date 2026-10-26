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
npx electron-vite build && node tests/e2e/m2-timeline.mjs   # E2E (Playwright, 리눅스는 xvfb-run)
```

## 진행 상황
- [x] M0 프로젝트 셋업
- [x] M1 미디어 불러오기
- [x] M2 타임라인 기본 (timeline.ts, ops.ts, Undo/Redo, 자동 저장, 재연결)
- [ ] M3 미리보기 — 엔진·WebGL·재생 구현됨. 남은 일: tests/e2e/m3-preview.mjs 의 클립 경계 멈춤 측정을
      <video> currentTime 진행 기준으로 바꾸기 (GPU 없는 환경은 화면 갱신이 느려 캔버스 비교가 부정확)
- [ ] M4 자르기·나누기·속도 (TrimHandles.tsx 는 아직 빈 자리)
- [ ] M5 최소 렌더
- [ ] M6 필터 (Preview/luts.ts 자리 있음) / M7 전환 (shaders.ts 에 xfade 수식 구현됨) / M8 음악 / M9 자막
- [ ] M10 마감

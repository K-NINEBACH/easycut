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

## 진행 상황
- [x] M0 프로젝트 셋업
- [ ] M1 미디어 불러오기

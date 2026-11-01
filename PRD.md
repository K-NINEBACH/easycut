# 초보자용 영상 편집기 — 1차 버전 기능 명세서 (PRD)

> 작성일: 2026-10-27
> 대상 플랫폼: Windows 10/11 (64bit)
> 용도: Claude Code에서 이어서 개발하기 위한 기준 문서
> 가칭: **쉬운편집 (EasyCut)** — 이름은 나중에 바꿔도 됨

---

## 0. Claude Code 작업 지침 (먼저 읽을 것)

- 이 문서가 기능 범위의 기준이다. 여기에 없는 기능은 임의로 추가하지 않는다.
- 작업은 **10장 마일스톤 순서대로** 진행한다. 한 마일스톤이 동작 확인되기 전에 다음으로 넘어가지 않는다.
- 각 기능의 "완료 조건"을 모두 만족해야 완료로 본다.
- UI 문구는 전부 **한국어**, 전문 용어 대신 쉬운 말을 쓴다 (5.3 용어표 참고).
- 영상 처리(디코딩·인코딩·필터)는 **반드시 메인 프로세스에서 FFmpeg로** 한다. 렌더러(React)에서 무거운 연산을 하지 않는다.
- 사용자 원본 파일은 절대 수정·삭제하지 않는다. 모든 중간 파일은 프로젝트 캐시 폴더에만 만든다.
- 애매한 결정이 필요하면 13장 "미결 사항"에 적고 가장 단순한 방법으로 진행한다.

---

## 1. 배경과 목표

### 1.1 배경
- 사용자는 여행 영상을 휴대폰으로 촬영해 유튜브에 가끔 올리는 **편집 초보자**다.
- 현재 휴대폰 유료 편집 앱을 쓰고 있다.
- PC에서 큰 화면으로, 어렵지 않게, 구독료 없이 편집하고 싶다.

### 1.2 목표
- 처음 켜는 사람도 **설명서 없이 10분 안에** 첫 영상을 유튜브용으로 내보낼 수 있다.
- 여행 브이로그에 필요한 기능(자르기, 순서, 자막, 음악, 전환, 필터)만 제공한다.
- 무료, 오프라인 동작 (인터넷 없이 자막 생성까지 가능).

### 1.3 비목표 (1차에서 하지 않는 것)
- 다중 비디오 트랙 / 레이어 / PIP(화면 속 화면)
- 키프레임 애니메이션, 크로마키, 마스크
- 색보정 커브·휠 같은 전문 색보정
- 유튜브 직접 업로드 (파일로 내보내기까지만)
- Mac / 모바일 지원
- 클라우드 저장, 계정, 협업

---

## 2. 대상 사용자

| 항목 | 내용 |
|---|---|
| 편집 경험 | 휴대폰 앱으로 간단한 컷·자막·음악 정도 해봄 |
| 촬영 기기 | 스마트폰 (가로/세로 혼합, HEVC/H.264, 30/60fps, 일부 HDR) |
| 결과물 | 유튜브 가로 영상 (16:9, 1080p), 길이 5~20분 |
| 원하는 것 | 쉬움, 빠름, 예쁜 결과 |
| 싫어하는 것 | 버튼이 많은 화면, 영어 용어, 설정 고르기 |

---

## 3. 핵심 설계 원칙

1. **한 화면, 한 흐름**: 왼쪽에서 오른쪽, 위에서 아래로 "불러오기 → 배치 → 꾸미기 → 내보내기" 흐름이 보이게 한다.
2. **기본값이 정답**: 모든 설정은 기본값만으로 좋은 결과가 나와야 한다. 고급 설정은 숨긴다.
3. **되돌리기 무제한**: 모든 편집은 Ctrl+Z로 되돌릴 수 있다. 실수해도 괜찮다는 느낌을 준다.
4. **자동 저장**: 저장 버튼을 눌러야 한다는 개념을 없앤다.
5. **원본 보호**: 원본 영상은 읽기만 한다 (비파괴 편집).
6. **쉬운 말**: "트랜지션" 대신 "장면 전환", "렌더링" 대신 "영상 만들기".

---

## 4. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 앱 프레임워크 | Electron (최신 안정판) | Windows 배포 쉬움, 자료 많음 |
| UI | React 18 + TypeScript | |
| 번들러 | Vite (electron-vite 템플릿) | 빠른 개발 서버, main/preload/renderer 구조 기본 제공 |
| 상태 관리 | Zustand + Immer | 단순함, Undo/Redo 구현 쉬움 |
| 스타일 | Tailwind CSS | |
| 드래그 앤 드롭 | dnd-kit | 클립 순서 변경 |
| 영상 처리 | FFmpeg / FFprobe 바이너리 동봉 | 디코딩, 프록시 생성, 썸네일, 최종 렌더 |
| 음성 인식(자막) | whisper.cpp Windows 바이너리 + 모델 파일 | 오프라인 한국어 음성 인식 |
| 미리보기 | HTML5 `<video>` + Canvas(WebGL) | 프록시 파일 재생, 필터·전환 실시간 근사 표시 |
| 저장 형식 | JSON 프로젝트 파일 (`.ezcut`) | |
| 패키징 | electron-builder (NSIS 설치 파일) | |
| 테스트 | Vitest (단위), Playwright (E2E, 선택) | |

### 4.1 FFmpeg 관련 주의
- FFmpeg 바이너리는 앱 안에 동봉 (`resources/bin/ffmpeg.exe`, `ffprobe.exe`).
- **라이선스**: GPL 빌드를 쓰면 앱 배포 시 GPL 의무가 생긴다. 개인용·지인용이면 문제없지만, 공개 배포 시 LGPL 빌드 사용 또는 소스 공개 여부를 결정해야 한다 (13장).
- 하드웨어 인코딩(NVENC/QSV/AMF)은 1차에서는 **선택 사항**. 기본은 `libx264` 소프트웨어 인코딩으로 안정성 우선.

### 4.2 whisper.cpp 관련
- 모델: 기본 `ggml-small` (정확도·속도 균형). 설정에서 `base`(빠름) / `medium`(정확) 선택 가능하게 하되 숨김 메뉴.
- 모델 파일은 첫 자막 생성 시 다운로드하거나 설치 파일에 포함 (13장 결정 필요). 1차 구현은 **앱 폴더 내 `resources/models/`에 미리 넣어두는 방식**으로 시작.

---

## 5. 화면 구성

### 5.1 메인 편집 화면 레이아웃

```
┌─────────────────────────────────────────────────────────────────┐
│ [≡ 메뉴]  프로젝트 이름(클릭해서 수정)      [↶][↷]  [▶ 영상 만들기] │  ← 상단바
├───────────────┬─────────────────────────────┬───────────────────┤
│               │                             │                   │
│  내 영상/사진   │        미리보기 화면           │   꾸미기 패널        │
│  (미디어 보관함) │       (16:9 캔버스)          │  [자르기][자막]     │
│               │                             │  [음악][전환][필터]  │
│  [+ 불러오기]   │   ◀◀  ▶  ▶▶   00:12 / 05:40  │  (선택한 탭 내용)    │
│               │                             │                   │
├───────────────┴─────────────────────────────┴───────────────────┤
│ 타임라인                                       [－ 확대/축소 ＋]   │
│  영상  [클립1]◆[클립2]◆[클립3]◆[클립4]                            │
│  자막     [자막1]   [자막2]        [자막3]                         │
│  음악  [~~~~~~~~~~~~ 배경음악 ~~~~~~~~~~~~~~]                     │
└─────────────────────────────────────────────────────────────────┘
◆ = 장면 전환 아이콘 (클립 사이)
```

- 최소 창 크기: 1280×720
- 트랙은 **고정 3줄**: 영상 / 자막 / 음악. 사용자가 트랙을 추가할 수 없다.
- 라이트 테마 기본, 다크 테마는 설정에서 선택 (2차여도 됨).

### 5.2 시작 화면
- 큰 버튼 2개: **[새 영상 만들기]**, **[이어서 만들기]**
- 아래에 최근 프로젝트 목록 (썸네일, 이름, 수정 날짜) 최대 8개
- 새 영상 만들기 → 프로젝트 이름 입력(기본값 "2026-10-27 여행 영상") → 편집 화면으로 이동 → 바로 파일 선택 창 열림

### 5.3 용어표 (UI에 쓸 말)

| 전문 용어 | UI 표기 |
|---|---|
| Import | 불러오기 |
| Media bin | 내 영상/사진 |
| Clip | 장면 |
| Trim | 앞뒤 자르기 |
| Split | 나누기 |
| Transition | 장면 전환 |
| Filter / LUT | 필터 |
| Subtitle / Caption | 자막 |
| BGM | 배경음악 |
| Render / Export | 영상 만들기 |
| Timeline | 타임라인 (예외적으로 그대로 사용) |
| Playhead | 재생 위치 |
| Undo / Redo | 되돌리기 / 다시 하기 |

### 5.4 첫 실행 안내
- 첫 실행 시 4단계 말풍선 안내 (불러오기 → 타임라인에 놓기 → 꾸미기 → 영상 만들기)
- "다시 보지 않기" 체크, 메뉴 > 도움말에서 다시 보기 가능

---

## 6. 기능 명세

각 기능은 **ID / 설명 / 상세 동작 / 완료 조건**으로 구성한다.

### F1. 미디어 불러오기

**설명**: 휴대폰에서 옮긴 영상·사진·음악 파일을 앱으로 가져온다.

**상세 동작**
- 방법 3가지: [+ 불러오기] 버튼, 파일을 창에 드래그 앤 드롭, 폴더 통째로 드래그
- 지원 형식
  - 영상: `.mp4`, `.mov`, `.m4v`, `.mkv` (HEVC, H.264 코덱)
  - 사진: `.jpg`, `.jpeg`, `.png`, `.heic`
  - 음악: `.mp3`, `.m4a`, `.wav`, `.aac`
- 불러올 때 FFprobe로 메타데이터 읽기: 길이, 해상도, 회전값(rotation), fps, 코덱, 오디오 유무, HDR 여부, 촬영 시각
- **프록시 생성** (백그라운드): 미리보기용으로 H.264 720p 30fps 파일을 캐시 폴더에 생성
  - 이유: 휴대폰 HEVC/HDR 영상은 Chromium에서 재생이 안 되거나 끊길 수 있음
  - 진행률을 미디어 썸네일 위에 표시 ("준비 중 45%")
  - 프록시 준비 전에도 타임라인에 놓을 수는 있게 하되, 미리보기에는 "준비 중" 표시
- 썸네일 생성: 영상 1초 지점 1장 (보관함용), 타임라인용 필름스트립은 1초 간격
- 오디오 파형 데이터 생성: 음악 파일 및 영상의 오디오 (타임라인 표시용)
- 보관함 정렬: 기본 **촬영 시각순** (여행 순서대로 정리되도록), 이름순 선택 가능
- 같은 파일 중복 불러오기 시 "이미 불러온 파일이에요" 안내 후 무시
- 지원하지 않는 파일은 "이 파일은 열 수 없어요: 파일명" 안내

**완료 조건**
- [ ] 아이폰·갤럭시 촬영 영상(HEVC, 세로, 60fps) 각각 불러와서 미리보기 재생 가능
- [ ] 세로 영상 회전값이 올바르게 반영됨
- [ ] 100개 파일을 한 번에 불러와도 UI가 멈추지 않음 (프록시 생성은 동시 2개씩 큐 처리)
- [ ] 앱을 껐다 켜도 프록시를 다시 만들지 않음 (캐시 재사용, 원본 파일 수정 시각+크기로 검증)

---

### F2. 타임라인 배치와 순서 변경

**설명**: 장면을 타임라인에 놓고 순서를 바꾼다.

**상세 동작**
- 영상 트랙은 **자석(magnetic) 방식**: 클립 사이 빈 공간이 생기지 않고 항상 붙어 있음
- 보관함에서 타임라인으로 드래그 → 놓은 위치에 삽입
- 보관함 항목 더블클릭 → 타임라인 맨 끝에 추가
- 보관함에서 여러 개 선택 후 [타임라인에 모두 넣기] → 선택 순서(또는 촬영 시각순)로 추가
- 타임라인 클립 드래그로 순서 변경 (dnd-kit)
- 사진 클립 기본 길이: 3초 (클립 선택 후 꾸미기 패널에서 1~10초 조절)
- 클립 선택 후 `Delete` → 삭제 (뒤 클립이 앞으로 당겨짐)
- 타임라인 확대/축소: 슬라이더, Ctrl+마우스 휠
- 재생 위치(playhead) 클릭·드래그로 이동, 미리보기와 동기화
- 영상 트랙이 비어 있으면 "여기로 영상을 끌어다 놓으세요" 안내 표시

**화면 비율 처리 (세로 영상 대응)**
- 프로젝트 출력은 1차에서 **16:9 고정** (1920×1080)
- 세로 영상/사진이 들어오면 기본값 **"흐린 배경 채우기"**: 같은 영상을 확대·블러한 배경 위에 원본을 가운데 배치
- 클립별로 선택 가능: [흐린 배경] / [검은 배경] / [꽉 채우기(잘림)]

**완료 조건**
- [ ] 클립 20개 이상에서 드래그 순서 변경이 부드럽게 동작
- [ ] 클립 삭제·이동 후 전환·자막 위치가 올바르게 따라감 (6.5, 6.3 참고)
- [ ] 세로 영상이 흐린 배경으로 미리보기·최종 결과 모두 동일하게 보임

---

### F3. 자르기와 나누기

**설명**: 필요 없는 앞뒤 부분을 잘라내고, 한 장면을 둘로 나눈다.

**상세 동작**
- **앞뒤 자르기 (트림)**
  - 타임라인 클립의 왼쪽/오른쪽 끝을 드래그
  - 드래그 중 미리보기 화면에 해당 프레임 표시
  - 원본 길이 이상으로 늘릴 수 없음
  - 최소 길이 0.5초
- **나누기 (분할)**
  - 재생 위치에서 `S` 키 또는 [✂ 나누기] 버튼
  - 선택된 클립(없으면 재생 위치 아래 클립)을 둘로 나눔
- **꾸미기 패널 > 자르기 탭**
  - 선택 클립의 큰 미리보기 + 시작/끝 핸들이 있는 바
  - [▶ 이 장면만 재생] 버튼
  - 속도 조절: 0.5배 / 1배 / 1.5배 / 2배 (버튼 4개, 슬라이더 아님)
  - 소리 켜기/끄기 토글, 볼륨 슬라이더 (0~200%)
- 클립 자르기는 원본을 건드리지 않고 `inPoint` / `outPoint` 값만 바꾼다

**완료 조건**
- [ ] 트림·분할 후 재생 시 잘린 구간이 정확히 빠짐 (프레임 단위 오차 ±1프레임 이내)
- [ ] 2배속 클립의 최종 결과에서 소리 음높이가 변하지 않음 (`atempo` 사용)
- [ ] 모든 동작 Ctrl+Z로 되돌리기 가능

---

### F4. 자막

**설명**: 직접 입력하거나 음성 인식으로 자동 생성한 자막을 넣는다.

**상세 동작**

**4-1. 직접 추가**
- 재생 위치에서 [＋ 자막 추가] → 자막 트랙에 3초짜리 자막 블록 생성 → 바로 입력 상태
- 자막 블록 드래그로 위치 이동, 양 끝 드래그로 길이 조절
- 자막 트랙은 자석 방식 아님 (자유 배치), 겹치지 않게 막음

**4-2. 자동 생성 (음성 인식)**
- [🎤 말소리로 자막 만들기] 버튼
- 범위 선택: [전체 영상] / [선택한 장면만]
- 처리 과정
  1. 타임라인 순서대로 오디오를 16kHz mono WAV로 추출 (FFmpeg)
  2. whisper.cpp 실행 (`-l ko`, 타임스탬프 포함 출력, JSON/SRT)
  3. 결과를 타임라인 시간으로 변환해 자막 블록 생성
  4. 한 줄 최대 20자, 블록 최대 2줄 규칙으로 자동 줄바꿈·분할
- 진행 창: "말소리를 듣고 있어요… 35%" + [취소] 버튼
- 이미 자막이 있는 구간은 덮어쓰지 않고 "기존 자막을 지우고 새로 만들까요?" 확인
- 생성 후 **자막 목록 편집 화면** (꾸미기 패널 > 자막 탭)
  - 시간 / 내용 목록 형태, 항목 클릭 시 해당 위치로 이동·재생
  - 내용 직접 수정, 항목 삭제, 두 항목 합치기

**4-3. 자막 스타일**
- 프리셋 5개 (카드 형태로 미리보기 표시)
  1. 기본 (흰 글씨 + 검은 테두리, 하단)
  2. 반투명 박스 (흰 글씨 + 반투명 검은 배경)
  3. 노랑 강조 (노란 글씨 + 검은 테두리)
  4. 손글씨 느낌
  5. 상단 제목형 (큰 글씨, 화면 위쪽)
- (2026-10-30 8개 추가, 13장 #12)
- 개별 조정: 글자 크기 (작게/보통/크게), 위치 (위/가운데/아래) — 2026-10-30 크기 5단계 + 세밀 조절, 미리보기에서 끌어 옮기기 (13장 #13)
- 기본 스타일은 전체 적용, 특정 자막만 다른 스타일 적용 가능
- 폰트: 무료 상업용 한글 폰트를 앱에 동봉 (예: Pretendard, 나눔스퀘어, 손글씨 계열 1종) — 라이선스 확인 후 포함
- 최종 렌더 시 **ASS 자막 파일로 변환 후 burn-in** (FFmpeg `subtitles`/`ass` 필터, 동봉 폰트 폴더 지정)
- 옵션: 자막을 영상에 굽지 않고 `.srt` 파일로 따로 내보내기 (유튜브 자막 업로드용)

**완료 조건**
- [ ] 5분짜리 한국어 대화 영상 자막 자동 생성이 일반 PC(4코어, 16GB RAM)에서 5분 이내 완료 (small 모델 기준, 목표치)
- [ ] 미리보기 자막 모양과 최종 결과 자막 모양이 사실상 동일
- [ ] 클립 순서를 바꾸거나 삭제하면 해당 클립에 붙은 자막이 같이 이동·삭제됨 (자막은 생성 시 소속 클립 ID를 가짐, 6장 데이터 모델 참고)
- [ ] `.srt` 내보내기 파일이 유튜브 스튜디오에서 정상 인식

---

### F5. 배경음악

**설명**: 배경음악을 넣고 영상 소리와 균형을 맞춘다.

**상세 동작**
- 음악 트랙에 음악 파일 드래그 또는 [♪ 음악 넣기]
- 음악 트랙도 여러 곡 순서대로 배치 가능 (자석 방식)
- 음악 클립도 앞뒤 자르기 가능
- **자동 길이 맞춤**: [영상 길이에 맞추기] 버튼 → 영상보다 길면 끝을 자르고, 짧으면 반복
- 끝부분 자동 페이드아웃 (기본 켜짐, 3초)
- 시작 페이드인 (기본 켜짐, 1초)
- 볼륨: 슬라이더 0~100%, 기본 30%
- **말소리 있을 때 음악 줄이기** (덕킹, 기본 켜짐)
  - 영상 오디오가 있는 구간에서 배경음악 자동 감소
  - 구현: FFmpeg `sidechaincompress` 필터 (영상 오디오를 사이드체인 입력으로)
  - 미리보기에서는 단순 근사 (영상 소리 켜진 클립 구간에서 음악 볼륨 50%로 낮춤)
- 무료 배경음악 샘플: 1차에서는 미포함. 사용자가 가진 파일만 사용 (저작권 안내 문구 표시: "유튜브에 올릴 때는 저작권 없는 음악을 써주세요. 유튜브 오디오 보관함을 추천해요.")

**완료 조건**
- [ ] 음악 반복·자르기·페이드가 최종 결과에서 끊김 없이 동작
- [ ] 덕킹 켰을 때 말소리 구간 음악이 확실히 작아짐
- [ ] 영상 소리 끈 클립에서는 덕킹이 일어나지 않음

---

### F6. 장면 전환

**설명**: 클립과 클립 사이에 전환 효과를 넣는다.

**상세 동작**
- 타임라인 클립 사이 ◆ 아이콘 클릭 → 꾸미기 패널 > 전환 탭 열림
- 전환 목록 (카드 + 마우스 올리면 짧은 애니메이션 미리보기)

| UI 이름 | FFmpeg xfade transition |
|---|---|
| 없음 | (컷) |
| 부드럽게 겹치기 | `fade` |
| 검은 화면 거치기 | `fadeblack` |
| 흰 화면 거치기 | `fadewhite` |
| 왼쪽으로 밀기 | `slideleft` |
| 오른쪽으로 밀기 | `slideright` |
| 위로 밀기 | `slideup` |
| 동그랗게 열기 | `circleopen` |
| 흐려지며 바뀌기 | `hblur` (또는 `fadegrays` 대체 검토) |
| 확대되며 바뀌기 | `zoomin` |

- 전환 길이: 짧게(0.3초) / 보통(0.6초) / 길게(1.0초) — 기본 보통
- [모든 장면에 적용] 버튼
- 전환은 **두 클립을 겹치게** 하므로 전체 길이가 전환 길이만큼 줄어든다. 타임라인에 겹침을 시각적으로 표시한다.
- 클립 길이가 (전환 길이 × 2)보다 짧으면 전환 길이 자동 축소, 그래도 불가하면 "장면이 너무 짧아서 전환을 넣을 수 없어요" 안내
- 오디오는 전환 구간에서 `acrossfade`로 자연스럽게 겹침
- 미리보기: 전환 구간은 WebGL 셰이더로 두 프록시 프레임을 섞어 근사 표시 (fade, slide, circle 정도는 동일하게 구현, 나머지는 fade로 대체 표시해도 됨 — 대체 시 미리보기에 "실제 결과와 조금 달라요" 작은 표시)

**완료 조건**
- [ ] 10개 전환 모두 최종 결과에 정확히 적용
- [ ] 해상도·fps가 다른 클립 사이 전환도 오류 없이 렌더 (xfade 전 정규화 필수, 9장 참고)
- [ ] 전환 추가·삭제 후 자막 위치가 전환으로 줄어든 시간만큼 올바르게 이동

---

### F7. 필터

**설명**: 장면 색감을 한 번에 바꾼다.

**상세 동작**
- 꾸미기 패널 > 필터 탭: 선택 클립에 적용할 필터 카드 목록 (해당 클립 썸네일에 필터를 적용한 미리보기)
- 프리셋 8개 + 원본 (2026-10-30 10개 추가, 13장 #12)

| UI 이름 | 느낌 | 구현 (FFmpeg) |
|---|---|---|
| 원본 | — | 없음 |
| 선명하게 | 채도·대비 약간 업 | `eq=contrast=1.1:saturation=1.25` |
| 따뜻하게 | 노을, 카페 | `colorbalance` 붉은·노란 쪽 + `eq` |
| 시원하게 | 바다, 하늘 | `colorbalance` 파란 쪽 |
| 필름 | 빈티지, 살짝 바랜 | `curves=preset=vintage` 또는 LUT |
| 흑백 | | `hue=s=0` + `eq=contrast=1.1` |
| 밝게 | 어두운 실내 보정 | `eq=brightness=0.06:gamma=1.1` |
| 감성 | 낮은 채도, 부드러운 톤 | LUT (`lut3d`) |
| 초록 숲 | 녹색 강조 | `colorbalance` + `eq` |

- 필터 강도 슬라이더 0~100% (기본 100%) — 구현: 원본과 필터 결과를 `blend`로 섞거나, 파라미터를 강도에 비례해 보간
- **기본 보정** (필터와 별개, 숨김 펼치기 "더 조절하기")
  - 밝기, 대비, 채도 슬라이더 (-50 ~ +50)
- [모든 장면에 적용] 버튼
- LUT 파일(`.cube`)은 앱에 동봉, 직접 만들거나 무료 라이선스 LUT 사용
- 미리보기: 각 필터를 WebGL 셰이더로 같은 수식 구현 (eq·colorbalance·hue 계열은 셰이더로 정확히 재현 가능, LUT는 3D 텍스처로 적용)
- **HDR 원본 처리**: 아이폰 HDR(HLG/PQ) 영상은 프록시·최종 렌더 모두 `zscale`+`tonemap`으로 SDR 변환 후 필터 적용 (안 하면 색이 바래 보임)

**완료 조건**
- [ ] 미리보기와 최종 결과의 색 차이가 눈으로 거의 구별 안 됨 (각 필터별 같은 프레임 비교 캡처로 검증)
- [ ] 아이폰 HDR 영상이 바래거나 과포화되지 않음
- [ ] 필터 강도 0%는 원본과 동일

---

### F8. 미리보기 재생

**상세 동작**
- 미리보기는 **프록시 파일**을 `<video>` 2개(현재 클립, 다음 클립 미리 로딩)로 재생하고 그 결과를 WebGL 캔버스에 그린다
- 캔버스에서 처리: 필터 셰이더, 전환 셰이더, 세로 영상 흐린 배경, 자막 오버레이(Canvas 2D 또는 DOM 레이어)
- 단축키: `Space` 재생/정지, `←`/`→` 1프레임 이동, `Shift+←/→` 1초 이동, `Home`/`End` 처음/끝
- 미리보기 품질: [부드럽게(낮은 화질)] / [선명하게] — 기본 부드럽게
- 전체 화면 미리보기 버튼

**완료 조건**
- [ ] 일반 노트북(내장 그래픽)에서 필터 적용 상태 720p 미리보기 30fps 유지
- [ ] 클립 경계에서 0.2초 이상 멈춤 없이 이어서 재생

---

### F9. 영상 만들기 (내보내기)

**설명**: 최종 영상 파일을 만든다.

**상세 동작**
- 상단 [▶ 영상 만들기] 클릭 → 내보내기 창
- 기본 화면 (선택 없음, 버튼 하나)
  - **[유튜브용으로 만들기]** — 1080p, 30fps, H.264 High, AAC 192kbps, `.mp4`
  - 저장 위치: 기본 `내 동영상\쉬운편집\프로젝트이름.mp4`, [위치 바꾸기] 링크
- "더 보기" 펼치면
  - 화질: 720p / 1080p / 4K(원본이 4K일 때만 활성)
  - 프레임: 30fps / 60fps
  - 자막: [영상에 넣기] / [자막 파일(.srt)로 따로 저장] / [둘 다]
- 진행 창
  - 진행률 바, 남은 시간 예상, 현재 처리 중인 장면 썸네일
  - [취소] (취소 시 임시 파일 삭제)
  - 완료 후: [폴더 열기], [영상 재생하기], 유튜브 업로드 팁 링크
- 렌더 중에는 편집 화면 잠금 (1차 단순화)
- 렌더 실패 시: 쉬운 안내 문구 + [오류 내용 복사] 버튼 (FFmpeg 로그 저장 위치 포함)

**완료 조건**
- [ ] 15분, 클립 40개, 전환·필터·자막·음악 모두 포함한 프로젝트가 오류 없이 렌더
- [ ] 결과 파일이 유튜브 업로드 및 Windows 기본 플레이어에서 정상 재생
- [ ] 오디오·영상 싱크가 끝부분까지 어긋나지 않음 (VFR 원본 대응, 9장 참고)

---

### F10. 프로젝트 저장 / 불러오기 / 되돌리기

**상세 동작**
- 프로젝트 저장 위치: `%USERPROFILE%\Documents\쉬운편집\프로젝트이름\`
  - `project.ezcut` (JSON)
  - `cache\` (프록시, 썸네일, 파형, 자막 임시파일)
- **자동 저장**: 변경 후 2초 디바운스 저장 + 5분마다 백업본(`project.ezcut.bak`) 1개 유지
- 상단바에 "저장됨 ✓" / "저장 중…" 작은 표시
- 원본 파일 경로가 바뀌어 못 찾으면: "영상 파일을 찾을 수 없어요" 창 + [폴더에서 찾기] (같은 파일명으로 자동 재연결)
- **Undo/Redo**: 최대 100단계, 프로젝트 상태 스냅샷 방식 (Immer patches 사용 권장)
- 앱 비정상 종료 후 재시작 시 마지막 상태 복구

**완료 조건**
- [ ] 편집 중 작업 관리자로 강제 종료 후 재실행 → 직전 상태 복구
- [ ] 원본 폴더 이동 후 재연결 기능 동작
- [ ] 되돌리기/다시 하기가 모든 편집 동작(F2~F7)에서 동작

---

### F11. 단축키 요약

| 키 | 동작 |
|---|---|
| Space | 재생/정지 |
| S | 나누기 |
| Delete | 선택 삭제 |
| Ctrl+Z / Ctrl+Y | 되돌리기 / 다시 하기 |
| Ctrl+C / Ctrl+V | 장면 복사 / 붙여넣기 |
| ← / → | 1프레임 이동 |
| Shift+← / → | 1초 이동 |
| 휠 (타임라인 위) | 타임라인 좌우 이동 |
| Ctrl+휠 | 타임라인 확대/축소 |
| Ctrl+E | 영상 만들기 |

단축키는 메뉴 > 도움말 > 단축키 보기에서 표로 표시.

---

## 7. 데이터 모델

시간 단위는 전부 **초(number, 소수점)**. 내부 계산 시 프레임 단위 반올림은 렌더 단계에서만.

```ts
// src/shared/types.ts

export type MediaType = 'video' | 'image' | 'audio';

export interface MediaItem {
  id: string;                 // uuid
  type: MediaType;
  path: string;               // 원본 절대 경로
  fileName: string;
  fileSize: number;
  fileMtime: number;          // 캐시 검증용
  duration: number;           // 사진은 0
  width?: number;             // 회전 반영 후 값
  height?: number;
  rotation?: number;          // 0 | 90 | 180 | 270
  fps?: number;
  isVfr?: boolean;            // 가변 프레임
  isHdr?: boolean;
  hasAudio: boolean;
  codec?: string;
  createdAt?: string;         // 촬영 시각 (ISO)
  proxyPath?: string;
  proxyStatus: 'pending' | 'processing' | 'ready' | 'error';
  thumbnailPath?: string;
  filmstripDir?: string;
  waveformPath?: string;
}

export type FitMode = 'blur' | 'black' | 'fill';

export type FilterId =
  | 'none' | 'vivid' | 'warm' | 'cool' | 'film'
  | 'mono' | 'bright' | 'mood' | 'forest';

export interface ColorAdjust {
  brightness: number;   // -50 ~ 50
  contrast: number;     // -50 ~ 50
  saturation: number;   // -50 ~ 50
}

export interface VideoClip {
  id: string;
  mediaId: string;
  inPoint: number;      // 원본 기준 시작 (초)
  outPoint: number;     // 원본 기준 끝 (초). 사진은 imageDuration 사용
  imageDuration?: number;
  speed: 0.5 | 1 | 1.5 | 2;
  muted: boolean;
  volume: number;       // 0 ~ 2
  fitMode: FitMode;
  filter: FilterId;
  filterStrength: number; // 0 ~ 1
  adjust: ColorAdjust;
}

export type TransitionId =
  | 'none' | 'fade' | 'fadeblack' | 'fadewhite' | 'slideleft'
  | 'slideright' | 'slideup' | 'circleopen' | 'hblur' | 'zoomin';

export interface Transition {
  // 영상 트랙의 clips[i]와 clips[i+1] 사이 전환
  afterClipId: string;
  type: TransitionId;
  duration: number;     // 0.3 | 0.6 | 1.0 (자동 축소 시 다른 값 가능)
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
  offset: number;       // anchor 클립 타임라인 시작점 기준 (초)
  duration: number;
  styleOverride?: Partial<SubtitleStyle>;
}

export interface MusicClip {
  id: string;
  mediaId: string;
  inPoint: number;
  outPoint: number;
  loop: boolean;        // "영상 길이에 맞추기"로 생성된 반복 여부
}

export interface MusicSettings {
  volume: number;        // 0 ~ 1, 기본 0.3
  fadeIn: number;        // 초, 기본 1
  fadeOut: number;       // 초, 기본 3
  ducking: boolean;      // 기본 true
}

export interface Project {
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  output: { width: 1920; height: 1080; fps: 30 | 60 };
  media: MediaItem[];
  videoTrack: VideoClip[];          // 순서 = 재생 순서
  transitions: Transition[];
  subtitles: Subtitle[];
  defaultSubtitleStyle: SubtitleStyle;
  musicTrack: MusicClip[];
  music: MusicSettings;
}
```

### 7.1 타임라인 시간 계산 규칙
- 클립 실제 길이 `len(c) = (outPoint - inPoint) / speed` (사진은 `imageDuration`)
- 클립 i의 타임라인 시작 `start(i) = Σ len(0..i-1) − Σ (전환 길이 0..i-1)`
- 전체 길이 = `Σ len − Σ 전환 길이`
- 자막 절대 시간 = `start(anchorClip) + offset`
- 이 계산은 `src/shared/timeline.ts` 한 곳에만 구현하고 미리보기·렌더·UI가 모두 이 함수를 사용한다 (**중복 구현 금지**)
- 단위 테스트 필수 (전환 포함/미포함, 속도 변경, 사진 혼합 케이스)

### 7.2 자막 anchor 규칙
- 자동 생성 자막: 해당 말소리가 나온 클립을 anchor로
- 직접 추가 자막: 추가 시점의 재생 위치 아래 클립을 anchor로
- 자막 드래그로 다른 클립 구간으로 옮기면 anchor 재계산
- anchor 클립 삭제 시 자막도 삭제 (Undo로 복구 가능)
- 클립 트림으로 자막이 클립 밖으로 밀리면 클립 끝에 맞춰 잘라냄, 완전히 밖이면 숨김 처리(삭제 아님) — 13장 미결

---

## 8. 아키텍처

### 8.1 프로세스 구조

```
┌────────────── Renderer (React) ──────────────┐
│ UI, 상태(Zustand), 미리보기(WebGL/video)        │
│ window.api.* 로만 메인과 통신                    │
└───────────────────┬──────────────────────────┘
                    │ IPC (contextBridge, preload)
┌───────────────────▼──────────────────────────┐
│ Main (Node)                                   │
│  - MediaService: ffprobe, 프록시/썸네일/파형      │
│  - JobQueue: 동시 실행 제한, 진행률, 취소           │
│  - SubtitleService: 오디오 추출 + whisper.cpp    │
│  - RenderService: 프로젝트 → FFmpeg 명령 생성·실행  │
│  - ProjectService: 저장/불러오기/자동저장/백업      │
└───────────────────┬──────────────────────────┘
                    │ child_process.spawn
          ffmpeg.exe / ffprobe.exe / whisper-cli.exe
```

- `contextIsolation: true`, `nodeIntegration: false`
- 미리보기용 로컬 파일 접근은 커스텀 프로토콜 (`ezcut-media://`) 등록해서 제공 (file:// 직접 사용 지양)
- 모든 장시간 작업은 JobQueue를 거치며 `jobId`로 진행률 이벤트를 렌더러에 보냄

### 8.2 IPC API (preload에서 노출)

```ts
interface Api {
  project: {
    create(name: string): Promise<Project>;
    open(path: string): Promise<Project>;
    save(project: Project): Promise<void>;
    listRecent(): Promise<RecentProject[]>;
  };
  media: {
    pickFiles(): Promise<string[]>;
    import(paths: string[]): Promise<MediaItem[]>;   // 메타데이터만 즉시, 프록시는 job
    relink(mediaId: string, newPath: string): Promise<MediaItem>;
  };
  subtitle: {
    generate(args: { range: 'all' | { clipIds: string[] }; model?: string }): Promise<{ jobId: string }>;
    exportSrt(path: string): Promise<void>;
  };
  render: {
    start(args: RenderOptions): Promise<{ jobId: string }>;
  };
  jobs: {
    cancel(jobId: string): Promise<void>;
    onProgress(cb: (e: JobProgress) => void): () => void;  // 구독 해제 함수 반환
    onDone(cb: (e: JobDone) => void): () => void;
  };
  shell: {
    openFolder(path: string): Promise<void>;
    openFile(path: string): Promise<void>;
  };
}
```

---

## 9. 렌더 파이프라인 (가장 중요)

한 번의 거대한 `filter_complex`는 디버깅이 어렵고 클립이 많으면 불안정하다. **2단계 방식**으로 한다.

### 9.1 1단계 — 클립별 정규화 (중간 파일 생성)
각 VideoClip마다 FFmpeg 1회 실행 → `cache/render/clip_{i}.mp4`

- 입력 구간 자르기: `-ss inPoint -to outPoint` (입력 앞에 두되 정확도 위해 재인코딩)
- 회전 반영 (FFmpeg 기본 autorotate)
- HDR이면 `zscale=t=linear,tonemap=hable,zscale=t=bt709:m=bt709:r=tv,format=yuv420p`
- 속도: `setpts=PTS/speed`, 오디오 `atempo=speed`
- 화면 맞춤 (fitMode)
  - `blur`: `split` → 배경은 `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=20` / 전경은 `scale=1920:1080:force_original_aspect_ratio=decrease` → `overlay=(W-w)/2:(H-h)/2`
  - `black`: `scale ... decrease` + `pad=1920:1080:(ow-iw)/2:(oh-ih)/2`
  - `fill`: `scale ... increase` + `crop=1920:1080`
- 필터 + 기본 보정 적용 (F7 표, 강도는 파라미터 보간)
- **고정 프레임레이트**: `fps=30` (출력 설정값), `setsar=1`, `format=yuv420p`
- 오디오: `aresample=48000`, 스테레오, 볼륨 적용. 소리 끔/오디오 없음/사진이면 `anullsrc`로 무음 트랙 생성 (**모든 중간 파일은 반드시 오디오 트랙을 가져야 함** — xfade/acrossfade 연결 시 필수)
- 사진: `-loop 1 -t imageDuration` 입력, HEIC는 먼저 PNG 변환
- 중간 코덱: 빠른 인코딩 + 고화질 (`libx264 -preset veryfast -crf 16` 또는 무손실에 가깝게)
- 클립 단위라 **병렬 처리 가능** (동시 2개, CPU 코어 수 기준 조정)

### 9.2 2단계 — 연결 + 전환
- 전환이 없는 구간: concat demuxer로 빠르게 이어붙이기 가능
- 전환이 있는 경로: `xfade` / `acrossfade` 체인
  - `xfade=transition={type}:duration={d}:offset={누적시간 − d}`
  - offset은 7.1 timeline 함수 결과로 계산
- 클립이 많으면(예: 20개 초과) 묶음 단위로 나눠 중간 파일 생성 후 다시 연결 (명령어 길이·메모리 문제 방지)

### 9.3 3단계 — 자막·음악 합성 + 최종 인코딩
- 자막: 프로젝트 자막 → ASS 파일 생성 (스타일 프리셋을 ASS Style로 정의) → `ass=subs.ass:fontsdir=resources/fonts`
- 음악
  - 음악 클립 이어붙이기 + loop 처리 + 전체 길이에 맞춰 `atrim`
  - `afade=t=in:d=fadeIn`, `afade=t=out:st=(전체길이-fadeOut):d=fadeOut`
  - `volume=music.volume`
  - 덕킹 on: `[music][voice]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=400` → 결과와 voice를 `amix`
  - 덕킹 off: `amix=inputs=2:normalize=0`
- 최종 인코딩: `libx264 -preset medium -crf 20 -profile:v high -pix_fmt yuv420p`, `aac -b:a 192k`, `-movflags +faststart`
- 진행률: FFmpeg `-progress pipe:1` 출력의 `out_time_ms`를 전체 길이로 나눠 계산. 3단계 전체 진행률은 단계별 가중치(1단계 60%, 2단계 20%, 3단계 20%)로 합산

### 9.4 렌더 명령 생성 원칙
- 명령 생성은 **순수 함수**로: `buildClipCommand(clip, media, output) => string[]`, `buildConcatCommand(...)`, `buildFinalCommand(...)`
- 순수 함수라 실행 없이 단위 테스트 가능 → 스냅샷 테스트 작성
- 경로에 한글·공백이 많으므로 인자는 배열로 `spawn`에 전달 (셸 문자열 조합 금지)
- ASS/concat 리스트 파일 경로의 특수문자 이스케이프 주의 (Windows 경로 `\`, `:` 처리)

---

## 10. 개발 마일스톤

각 단계 끝에 실제 여행 영상 샘플로 확인한다.

| 단계 | 내용 | 결과물 |
|---|---|---|
| M0 | 프로젝트 셋업 | electron-vite + React + TS + Tailwind, FFmpeg 바이너리 동봉 및 버전 출력 확인, 기본 레이아웃 빈 화면 |
| M1 | 미디어 불러오기 | F1 전체 (ffprobe, 프록시, 썸네일, 보관함 UI, JobQueue) |
| M2 | 타임라인 기본 | 데이터 모델, `timeline.ts` + 테스트, F2 배치/순서/삭제, Undo/Redo, 자동 저장(F10) |
| M3 | 미리보기 | F8 (video 2개 교차 재생, WebGL 캔버스, 재생 위치 동기화) |
| M4 | 자르기·나누기·속도 | F3 |
| M5 | **최소 렌더** | 9장 1~3단계를 전환·필터·자막·음악 없이 구현 → 컷 편집 영상 내보내기 성공 |
| M6 | 필터 | F7 (셰이더 미리보기 + 렌더), 세로 영상 fitMode 포함 |
| M7 | 장면 전환 | F6 (xfade 렌더 + 미리보기 셰이더) |
| M8 | 배경음악 | F5 (덕킹 포함) |
| M9 | 자막 | F4 (직접 입력 → 스타일 → whisper 자동 생성 → srt 내보내기 순서) |
| M10 | 마감 | 시작 화면, 첫 실행 안내, 오류 처리, 단축키, NSIS 설치 파일 |

**M5를 일찍 두는 이유**: 렌더가 이 앱의 가장 큰 위험 요소라, 기능을 쌓기 전에 "끝까지 영상 파일이 나온다"를 먼저 확인한다.

---

## 11. 폴더 구조 (권장)

```
easycut/
├─ PRD.md                      ← 이 문서
├─ CLAUDE.md                   ← Claude Code용 요약 지침 (0장 내용 + 명령어)
├─ package.json
├─ electron.vite.config.ts
├─ electron-builder.yml
├─ resources/
│  ├─ bin/        ffmpeg.exe, ffprobe.exe, whisper-cli.exe
│  ├─ models/     ggml-small.bin
│  ├─ fonts/      자막 폰트들 + 라이선스 파일
│  └─ luts/       필터용 .cube
├─ src/
│  ├─ shared/                  ← main/renderer 공용 (순수 TS)
│  │  ├─ types.ts
│  │  ├─ timeline.ts           ← 시간 계산 단일 구현
│  │  ├─ filters.ts            ← 필터 정의 (FFmpeg 문자열 + 셰이더 파라미터 같이)
│  │  ├─ transitions.ts
│  │  └─ subtitleStyles.ts
│  ├─ main/
│  │  ├─ index.ts
│  │  ├─ ipc.ts
│  │  ├─ protocol.ts           ← ezcut-media://
│  │  ├─ services/
│  │  │  ├─ MediaService.ts
│  │  │  ├─ JobQueue.ts
│  │  │  ├─ SubtitleService.ts
│  │  │  ├─ RenderService.ts
│  │  │  └─ ProjectService.ts
│  │  └─ ffmpeg/
│  │     ├─ probe.ts
│  │     ├─ commands.ts        ← 명령 생성 순수 함수
│  │     ├─ ass.ts             ← 자막 → ASS 변환
│  │     └─ progress.ts
│  ├─ preload/
│  │  └─ index.ts
│  └─ renderer/
│     ├─ App.tsx
│     ├─ store/                ← Zustand (project, ui, history)
│     ├─ screens/              ← StartScreen, EditorScreen
│     ├─ components/
│     │  ├─ MediaBin/
│     │  ├─ Preview/           ← PreviewCanvas, shaders/
│     │  ├─ Timeline/
│     │  ├─ Panel/             ← TrimTab, SubtitleTab, MusicTab, TransitionTab, FilterTab
│     │  └─ Export/
│     └─ hooks/
└─ tests/
   ├─ unit/                    ← timeline, commands 스냅샷, ass
   └─ fixtures/                ← 짧은 샘플 영상 (가로, 세로, HEVC, HDR, VFR, 무음)
```

**필터·전환 정의 단일화**: `filters.ts`의 각 필터는 `{ id, label, ffmpeg(strength): string, shader: {...uniforms} }` 형태로 한 곳에 정의해서 미리보기와 렌더가 어긋나지 않게 한다.

---

## 12. 테스트 계획

### 12.1 테스트용 샘플 (tests/fixtures, 각 5~10초)
- 가로 H.264 30fps (갤럭시)
- 세로 HEVC 60fps (아이폰)
- 아이폰 HDR(HLG) 영상
- 가변 프레임(VFR) 영상
- 오디오 없는 영상
- 사진 (JPG, HEIC, 세로)
- 음악 MP3 (30초)
- 한국어 말소리가 있는 영상 (자막 테스트)

### 12.2 단위 테스트
- `timeline.ts`: 전환·속도·사진 조합별 시작 시간·전체 길이
- `commands.ts`: 각 fitMode/필터/속도 조합의 FFmpeg 인자 스냅샷
- `ass.ts`: 스타일·줄바꿈·특수문자 이스케이프
- 자막 anchor 재계산

### 12.3 통합 테스트 (실제 FFmpeg 실행)
- 샘플 전부 넣고 전환·필터·자막·음악 켠 상태로 렌더 → ffprobe로 결과 길이·해상도·fps·오디오 트랙 확인
- 결과 길이 = `timeline` 계산 길이 ±0.1초

### 12.4 수동 확인 체크리스트
- 처음 쓰는 사람에게 시켜보기: 설명 없이 3분짜리 영상 만들기 성공 여부, 막힌 지점 기록

---

## 13. 미결 사항 (결정 필요)

| # | 내용 | 기본 진행안 |
|---|---|---|
| 1 | FFmpeg 빌드 라이선스 (GPL vs LGPL) | 개인 사용이면 GPL 빌드로 진행, 공개 배포 시 재검토 |
| 2 | whisper 모델 포함 방식 (설치 파일 포함 vs 첫 사용 시 다운로드) | 설치 파일에 small 포함 |
| 3 | 트림으로 자막이 클립 밖으로 밀릴 때 처리 | 잘라내기 + 완전히 밖이면 숨김 |
| 4 | 4K 원본 대응 범위 | 1차는 1080p 출력만 확실히 지원, 4K 출력은 시간 되면 |
| 5 | 하드웨어 인코딩 사용 | 1차 미사용, 렌더 속도 불만 있으면 2차 |
| 6 | 동봉 폰트·LUT 선정 | 상업 이용 무료 폰트 3종, LUT는 직접 제작 |
| 7 | 앱 이름·아이콘 | 가칭 "쉬운편집". 아이콘은 블루→민트 둥근 네모 + 흰 재생 표시 (`build/icon.svg`) |
| 8 | 화면 디자인 | 2026-10 디자인 시스템 "따뜻한 크리에이터 스튜디오"(ChatGPT 시안 글의 색·크기 값)를 `src/renderer/index.css` 토큰으로 적용. 아이콘은 lucide-react |
| 10 | 중간 파일 인코딩 | 9.1 의 "무손실에 가깝게" 쪽: `libx264 -preset ultrafast -crf 14` (측정상 더 빠르고 화질↑, 임시 파일 약 2.7배). 최종 인코딩 설정은 그대로 |
| 9 | 보관함 편의 표시 (CapCut 참고) | 카드에 마우스를 올리면 [+] (두 번 누르기와 같은 "타임라인에 넣기"), 타임라인에 이미 넣은 파일은 "사용 중" 표시. 새 기능이 아니라 기존 동작의 지름길 |
| 11 | 자동 업데이트 (2026-10-28 운영자 요청: "매번 재설치하기 귀찮다") | electron-updater + 이 저장소의 GitHub 릴리스(공개). 실행할 때 확인해 뒤에서 받고, 다 받으면 오른쪽 아래 [지금 다시 시작] 안내. 그냥 꺼도 끌 때 설치. 바뀐 부분만 받음(blockmap). 코드 서명 없음 → 서명 검사 안 함. 설치 파일 이름은 영문 `EasyCut-Setup-버전.exe` (GitHub 이 한글 이름을 바꿔 버림) |
| 12 | 필터·자막 모양 늘리기 (2026-10-30 운영자 요청) | F7 의 8개에 10개 추가: 노을·푸른 바다·벚꽃·단풍·맛있게·뽀얗게·영화처럼·야경·레트로·세피아 (모두 `filters.ts` 색 함수 → 같은 LUT 로 미리보기·렌더). 4-3 의 5개에 8개 추가: 검은 글씨·분홍 테두리·민트 테두리·흰 상자·노란 상자·손글씨 노랑·손글씨 분홍·노랑 제목 (상자 색 `boxColor` 추가). 모양 카드는 3열, 카드 글자는 크게 |
| 13 | 자막 위치 자유 조정·크기 다양화 (2026-10-30 운영자 요청) | 미리보기에서 자막을 끌어 옮김 → `SubtitleStyle.x·y` (덩어리 가운데, 화면 비율), 렌더는 ASS `\an5\pos`. "이 자막만" 이 켜진 자막은 그 자막만, 아니면 모든 자막. 위·가운데·아래를 누르면 옮긴 자리 지움. 크기는 5단계(아주 작게~아주 크게) + 세밀 조절 70~150% (`sizeScale`). 가장자리 4% 안쪽으로만 (긴 자막이 화면 밖으로 나갈 수는 있음 — 미리보기에 그대로 보임) |
| 14 | 자막 색 자유 선택·글꼴 늘리기 (2026-10-30 운영자 요청) | 글자 색·테두리 색(상자 모양이면 상자 색)을 자주 쓰는 9색 + [직접] 색 고르기로. 글꼴은 3개 → 21개 (Google Fonts SIL OFL 18개 추가: 나눔고딕·도현·주아·고운돋움·해바라기·구기·나눔명조·고운바탕·송명·연성·개구쟁이·감자꽃·서툰이야기·싱글데이·귀여운 글꼴·동글·독도·동해 독도, 설치 파일 약 +60MB). 모양 위에 덮어쓰는 값(`fontId`·`color`·`outlineColor`), 모양 카드를 고르면 지워짐. 렌더는 쓰는 글꼴만 작업 폴더로 복사. 사용자가 PC 글꼴 파일을 직접 넣는 기능은 아직 없음 |
| 15 | 타임라인 휠 좌우 이동 (2026-11-01 운영자 요청) | 타임라인 위에서 휠 = 좌우 이동, Ctrl+휠 = 확대/축소 그대로. 터치패드 가로 쓸기는 브라우저 기본 동작 |
| 16 | 흔들림 줄이기·영역 고정 (2026-11-01 운영자 요청) | 자르기 탭 "흔들림·화면 고정". 얼굴 인식 없이 사용자가 미리보기에서 네모로 고른 영역을 템플릿 매칭으로 앞뒤로 따라가 화면 가운데에 고정. 흔들림 줄이기는 화면 격자 칸의 움직임 중앙값에서 떨림만 뺌 (앞뒤 약 1초 평균, 패닝은 남김). 결과는 둘 다 "프레임마다 자를 창" 경로 `VideoClip.stabilize` → 미리보기 셰이더 / 렌더 crop+sendcmd 가 같은 값. FFmpeg vidstab 은 쓰지 않음 (경로를 꺼낼 수 없어 미리보기와 결과가 달라짐). 평행 이동만: 회전·크기 변화는 보정하지 않음. 분석은 프록시로, 재분석 없이 확대만 조절 가능. 대상이 사라지면 놓친 비율을 알리고 앞뒤를 직선으로 이음. 분석 뒤 장면을 늘린 곳은 끝값 유지 + 패널 안내 |

---

## 14. 2차 이후 후보 (참고용, 지금 구현 금지)

- 세로(쇼츠) 9:16 출력 모드
- 오프닝/엔딩 템플릿, 제목 애니메이션
- 무음 구간 자동 컷
- 여러 장면 색감 자동 맞추기
- 스티커, 지도 경로 표시 (여행용)
- 하드웨어 인코딩, 렌더 중 편집 가능
- 다크 테마, 앱 자동 업데이트

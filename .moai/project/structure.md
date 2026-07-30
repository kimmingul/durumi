# Durumi — 구조 문서 (아키텍처·모듈 경계)

이 문서는 사용자가 최우선으로 지정한 문서다. Electron 3-프로세스 경계, IPC 계약, 신뢰 경계, 에디터 확장 계층, 그리고 `src/`/`shared/`의 조직을 다룬다.

## 1. 최상위 디렉터리 트리

```
electron/          메인 프로세스(Node) — 42개 파일, 약 6,891줄
├── ipc.ts          IPC 핸들러 조립 (39줄, 9개 등록 함수를 구성만 함)
├── ipc/            도메인 IPC 핸들러 9개 모듈 + 공통 헬퍼 재export 1개(`_shared.ts`) = 10개 (§3 참고)
├── main.ts         BrowserWindow 진입점 + before-quit/window-all-closed
├── pathGuard.ts    렌더러 신뢰 경계 4-tier 모델 (§4 참고)
├── assetProtocol.ts   durumi-asset:// 커스텀 프로토콜 핸들러
├── preload.ts      contextBridge IPC 브리지 (순수 타입 매핑)
├── menu.ts         네이티브 메뉴(390줄, prefs 변경 시 재빌드)
├── preferences.ts  JSON 기반 설정(290줄)
├── pandoc.ts        pandoc 탐지/실행/Homebrew 설치(310줄)
├── bibliography*.ts .bib 탐지/쓰기/원격 조회(bibliographyFetch.ts 792줄)
├── reference*.ts    reference/ 폴더 다운로드/가져오기
├── aiClient.ts / aiKeys.ts  LLM 클라이언트 + safeStorage 키 볼트
├── closeGuard.ts     종료 시 Save? 프롬프트 (30초 타임아웃)
├── git.ts             simple-git 상태
└── (fs.ts, macros.ts, customCss.ts, i18n.ts, autoUpdater.ts, search.ts, fileIndex.ts, contextMenu.ts, dialogDefaults.ts, images.ts, pdf.ts, pdfText.ts, pendingAssets.ts, fileOps.ts)

src/                렌더러(React 18 + CodeMirror 6) — 172개 `.ts`/`.tsx` 파일, 약 29,558줄
                     (CSS 3개 포함 시 175개 파일, 약 30,946줄)
├── App.tsx          얇은 셸 — 동작은 21개 훅으로 위임
├── main.tsx         React 루트
├── editor/           에디터 확장 계층 (§6 참고)
├── components/       UI 컴포넌트 (최상위 26개 .tsx + CSS/헬퍼 3개, sidebar/ 14개)
├── store/            zustand 스토어 8개
├── hooks/             21개
├── export/            HTML 내보내기 파이프라인 9개 모듈
├── i18n/              dict.ts(1,093줄, en/ko) + t.ts
├── styles/            global.css(1,121줄), applyStyles.ts(CSS 변수 50개), journalPresets.ts
└── utils/             5개

shared/              main/renderer 공유 타입·순수 로직 — 20개 파일, 약 4,530줄
├── ipc-contract.ts   IPC 계약 SSOT (810줄, §3 참고)
├── bibtex.ts / bibtexWriter.ts / ris.ts / citation*.ts   서지 파싱/포맷(서드파티 미사용)
├── comments.ts / memoSidecar.ts   메모 파서 + 사이드카 스키마
├── criticMarkup.ts    CriticMarkup 5-연산자 파서 + export 변환
├── manuscriptTemplates.ts(457줄)  IMRaD/CONSORT/PRISMA/CARE/STROBE
├── tableStyle.ts(376줄)  표 스타일 wire format 2종
├── menuLabels.ts      네이티브 메뉴 i18n SSOT
├── assetProtocol.ts   durumi-asset:// 스킴 상수
└── aiPrompts.ts / aiCitationSuggest.ts / aiCost.ts

tests/               Vitest 유닛 테스트 169개 파일 (§11)
e2e/                 Playwright Electron 테스트 31개 spec (§11)
docs/                사용자·엔지니어링 문서 최상위 14개(`ls docs/*.md | wc -l` 기준, 재귀 포함 시 15개) (§12)
build/               앱 아이콘 (icon.svg / icon.png)
```

새 기능을 추가할 때 어느 디렉터리를 건드려야 하는지는 §7(실용 가이드)를 참고하라.

## 2. 3-프로세스 경계

```
┌──────────────────────────────────┐        ┌─────────────────────────────────┐
│  MAIN (Node, electron/)          │  IPC   │  RENDERER (React, src/)          │
│  - 파일시스템 직접 접근            │◄──────►│  - Node API 접근 불가              │
│  - 모든 외부 HTTP (서지 API, LLM) │        │  - window.api로만 main과 통신      │
│  - safeStorage 키 볼트            │        │  - fetch()는 로컬 asset 인라인      │
│  - pathGuard 신뢰 판정             │        │    1건뿐 (src/export/inlineImages) │
│  - durumi-asset:// 핸들러          │        │  - file:// 직접 접근 없음           │
└──────────────────────────────────┘        └─────────────────────────────────┘
              ▲                                          │
              │  contextBridge (preload.ts, 순수 타입 매핑) │
              └──────────────────────────────────────────┘
```

`electron/main.ts:56-66`가 이 경계를 강제한다: `BrowserWindow`는 `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`로 생성된다. `preload.ts`는 `contextBridge` + `ipcRenderer`만 사용하며 `require()`/`node:*`/`Buffer`/`process`를 쓰지 않는다 — `CONTRIBUTING.md` 항목 7이 이 대비를 명시적 아키텍처 불변식으로 못박고 있다. 렌더러의 유일한 `fetch()` 호출은 `src/export/inlineImages.ts:82`(로컬 asset base64 인라인)뿐이며, 그 외 모든 외부 HTTP는 main 프로세스에 산다.

## 3. IPC 계약 경계

`shared/ipc-contract.ts`(810줄)가 IPC의 SSOT다. `IpcApi` 인터페이스를 정의하고, `declare global { interface Window { api: IpcApi } }`로 렌더러가 `window.api`를 타입 안전하게 쓰도록 만든다(`shared/ipc-contract.ts:805-810`). main과 renderer 양쪽이 이 파일을 `@shared` alias로 임포트하므로, 채널 시그니처가 어긋나면 컴파일 타임에 잡힌다.

- **채널 명명 규칙**: `domain:verb` (예: `file:open`, `bibliography:add`).
- **invoke 채널** — 렌더러가 요청하고 main이 응답하는 request/response 형태. `IpcApi`에 `Promise<...>`를 반환하는 메서드로 선언된다 — 실제 등록된 채널은 `ipcMain.handle` 기준 66개(`grep -rn 'ipcMain\.handle' electron/ | wc -l`), `IpcApi` 인터페이스(`shared/ipc-contract.ts:322-757`) 멤버 총 74개 중 push(`on*`) 8개를 제외한 비-push 멤버 수(66)와 정확히 일치한다.
- **push 채널** — main이 렌더러로 비동기 이벤트를 보내는 형태. `IpcApi`에 `on<Event>: (cb) => () => void` 형태로 선언되며, 반환값은 **구독 해제 클로저**다. 확인된 push 채널: `onMenuCommand`, `onThemeChanged`, `onFsChange`, `onCustomCssChanged`, `onMacrosChanged`, `onGitStatusChanged`, `onPandocInstallProgress` 등 약 8개(`shared/ipc-contract.ts:363-442` 근방).
- **패턴**: 모든 구독형 API가 unsubscribe 클로저를 반환하는 것이 preload의 일관된 계약이다 — 컴포넌트 unmount 시 리스너 누수를 막는다.

### electron/ipc/ 모듈 분할

`electron/ipc.ts`(39줄)는 로직을 담지 않고 아래 표 10개 모듈 중 등록 함수를 제공하는 9개를 조립만 한다(`electron/ipc.ts:25-33`; v0.2 하드닝 스펙에 따라 각 모듈은 200줄 이하를 목표로 함).

| 모듈 | 담당 도메인 |
|---|---|
| `_shared.ts` | 등록 함수 없음 — 공통 헬퍼(`findOwningRoot` 등)를 여러 도메인 모듈이 공유하도록 재export만 한다(`electron/ipc.ts:14-20`) |
| `files.ts` | 파일 열기/저장/워크스페이스 |
| `preferences.ts` | 설정 읽기/쓰기 |
| `bibliography.ts` | 로컬 `.bib` CRUD |
| `bibliographyFetch.ts` | 원격 서지 API 조회 |
| `reference.ts` | `reference/` 폴더 다운로드/가져오기 |
| `pandoc.ts` | pandoc 탐지/실행/설치 |
| `search.ts` | 워크스페이스 전체 검색 |
| `shell.ts` | OS 셸 연동(파일 열기 등) |
| `ai.ts` | AI 클라이언트 호출 |

## 4. 신뢰 경계 — pathGuard 4-tier 모델

`electron/pathGuard.ts`(215줄)는 렌더러가 신뢰할 수 없는 코드(XSS, 악성 의존성 등)라는 전제 아래, main이 IPC로 받은 경로를 검증하는 게이트다.

| Tier | 소스 | 신뢰 조건 |
|---|---|---|
| 1. 세션 allowlist | 다이얼로그가 반환한 경로(`file:open`, `file:saveAs`, `export:file`, `dialog:openFolder`, `dialog:pickFile`) | 다이얼로그 핸들러가 직접 등록. 프로세스 종료 시 소멸 |
| 2. 세션-신뢰 디렉터리 트리 | 신뢰된 파일의 부모 디렉터리 (형제 asset 접근용) | `allowSessionPath()`가 자동 등록; 시작 시 최근 파일들의 부모도 `bootstrapSessionTreesFromRecents()`로 부트스트랩 |
| 3. 워크스페이스 폴더 | `prefs.workspaceFolders` | 렌더러는 `dialog:openFolder`를 거쳐야만 추가 가능 |
| 4. 최근 파일/폴더 | `prefs.recentFiles` / `recentFolders` | 위와 동일하게 다이얼로그 경유만 허용 |

`assertPrefsPatchAllowed()`(`pathGuard.ts:183-215`)는 손상된 렌더러가 `prefs:set`으로 신뢰 범위를 스스로 넓히는 것을 막는다 — 패치에 포함된 새 워크스페이스/최근파일 항목이 이번 세션에서 실제로 다이얼로그를 거쳤는지(`sessionAllowed` 멤버십) 확인하고, 아니면 `PathNotAllowedError`를 던진다.

경로는 `path.resolve`로 정규화한 뒤 비교하므로 `..` 트래버설은 붕괴한다. 다만 **심볼릭 링크 해석(`fs.realpath`)은 의도적으로 수행하지 않는다** — 매 호출마다 비동기 디스크 접근을 추가하는 비용 대비, 사용자가 자기 워크스페이스 안에 `/etc/shadow`를 심볼릭 링크로 넣는 것은 수용 가능한 위험으로 문서화되어 있다(`pathGuard.ts:55-60`). `DURUMI_E2E=1`일 때는 `os.tmpdir()` 하위 경로가 전부 신뢰되는 테스트 전용 예외가 있다(`pathGuard.ts:6-19`).

## 5. 렌더러 네트워크 격리 + durumi-asset:// 프로토콜

렌더러는 `file://`을 직접 읽지 않는다. 로컬 이미지/asset은 커스텀 `durumi-asset://` 프로토콜을 통해서만 로드된다. 스킴은 `app.whenReady()` 이전에 `registerAssetProtocolSchemes()`로 등록되어야 하며(특권 선언은 ready 이전 필수), 실제 요청 핸들러는 ready 이후 `registerAssetProtocolHandler()`로 연결된다(`electron/main.ts:19, 106`). 스킴 상수는 `shared/assetProtocol.ts`에 있어 main/renderer 양쪽이 동일한 값을 참조한다. 이 프로토콜은 과거의 고질적인 이미지 렌더링 버그를 해결하기 위해 도입되었다(`docs/image-rendering.md`).

## 6. 에디터 확장 계층 (6단계)

`src/editor/MarkdownEditor.tsx`가 하나의 CodeMirror 6 `EditorState`를 아래 순서로 조립한다.

1. **파서** — `markdown({ base: markdownLanguage, codeLanguages: lezerLangs, extensions: [...] })`. Durumi 고유 문법(`[@key]` 인용, `%%memo%%`, CriticMarkup, `[toc]`, `==하이라이트==`/`~하첨자~`/`^상첨자^`, YAML front matter, 각주)은 전부 `src/editor/markdownExt/`의 커스텀 Lezer 확장(12개 파일)으로 구현된다. (`MarkdownEditor.tsx:88-101`)
2. **모드** — `editModeStateExtension()` + `Compartment`가 감싼 `decorationsForMode(mode)`. `markdown`(Source) 모드는 데코레이션을 전부 제거(`[]`)하고, `typora`(Live)/`wysiwyg`(Document) 모드는 동일한 `liveDecorations` 번들을 로드한다(`MarkdownEditor.tsx:46-52`).
3. **데코레이션** — `src/editor/decorations/`에 마크다운 구성요소마다 하나씩, 33개 모듈이 있고 `decorations/index.ts`가 집계한다.
4. **원자성(atomicity)** — `atomicMediaExtension()`(이미지/링크, v0.2.23)과 `atomicInlineMarksExtension()`(굵게/기울임/취소선/하이라이트/하첨자, v0.2.24~.28). `EditorView.atomicRanges` + `Prec.high` Backspace/Delete 키맵 조합으로 구현되며, `Prec.high`가 필수인 이유는 `@codemirror/commands`의 기본 `deleteCharBackward`가 우선순위를 이기기 때문이다.
5. **WYSIWYG-on-source** — `src/editor/wysiwygEscape.ts`(197줄). Document 모드에서 타이핑되는 마크다운 마커를 실시간 이스케이프하는 transaction filter — 버퍼는 항상 순수 마크다운이지만 화면은 Word처럼 보인다.
6. **인터랙션** — 인용 자동완성/호버 툴팁, AI 고스트텍스트, 맞춤법 검사 제외 영역, 뷰 모드(포커스/타이프라이터), 마크다운 키맵(`src/editor/keymap/` 17개 모듈), 매크로 Compartment, 붙여넣기/드롭 핸들러.

모드 전환 시 캐럿과 스크롤 위치를 스냅샷하고 2단계(동기 적용 + `requestMeasure` 재적용)로 복원한다 — 위젯 높이가 모드마다 달라 재배치가 필요하기 때문이다(`MarkdownEditor.tsx:170-210`).

## 7. src/ 하위 조직 — 새 코드는 어디에

| 디렉터리 | 담고 있는 것 | 새 코드 추가 위치 |
|---|---|---|
| `editor/decorations/` (33) | 마크다운 구성요소별 라이브 프리뷰 렌더링 | 새 인라인/블록 문법의 시각 렌더링 |
| `editor/markdownExt/` (12) | 커스텀 Lezer 파서 확장 | 새 마크다운 문법 자체의 파싱 규칙 |
| `editor/keymap/` (17) | 키보드 단축키/토글 헬퍼 + 매크로 | 새 단축키, 서식 토글 커맨드 |
| `editor/ai/`, `editor/autocomplete/`, `editor/math/`, `editor/mermaid/` | AI 고스트텍스트, 인용 자동완성, 수식 스캐너, Mermaid 렌더러 | 해당 도메인 확장 |
| `components/` (최상위 26개 .tsx) | 다이얼로그, 팔레트, 툴바 등 독립 UI 컴포넌트 | 새 다이얼로그/패널 |
| `components/sidebar/` (14) | 좌측 5탭 + 우측 2탭 사이드바 콘텐츠 | 새 사이드바 탭 |
| `store/` (8) | zustand 전역 상태 (§9 참고) | 새 전역 상태 슬라이스 |
| `hooks/` (21) | `App.tsx`에서 위임하는 동작 단위 | 새 최상위 커맨드/동작 |
| `export/` (9) | HTML 내보내기 파이프라인(markdown-it, KaTeX, Mermaid, base64 인라인) | 내보내기 포맷 확장 |
| `i18n/` | `dict.ts`(en/ko) + `t.ts` | 새 UI 문자열 |
| `styles/` | `global.css`, `applyStyles.ts`(CSS 변수 50개), `journalPresets.ts` | 새 저널 스타일 프리셋 |

**예시 — 새 마크다운 구문 하나를 추가하려면**: `markdownExt/`(파서) → `decorations/`(렌더링) → 필요시 `keymap/`(단축키) → `tests/editor/`(유닛) → IME에 영향을 준다면 `e2e/`에 `composeKorean` 기반 spec(§11 아래) 순으로 건드린다.

## 8. shared/의 역할

`shared/`는 main과 renderer 양쪽에서 `@shared` alias(`electron.vite.config.ts:17,27,35`)로 임포트되는 순수 타입/로직이다. Electron 프로세스 경계를 넘나드는 로직(서지 파싱, 인용 포맷팅, IPC 타입)은 반드시 여기에 둬야 한다 — main 전용 로직(`electron/`)이나 renderer 전용 로직(`src/`)에서 서로를 직접 import할 수 없기 때문이다(§10에서 이 규칙을 어긴 결과인 `StyleSet` 중복 사례를 다룬다).

## 9. 상태관리 경계 — zustand 8스토어

`App.tsx`는 얇은 셸이며, 동작 대부분은 21개 훅(`src/hooks/`)으로 분리되어 `useMenuCommandRouter`로 합류한다. 모든 다이얼로그는 `React.lazy`로 지연 로드되며 open 플래그에 게이트된다.

| 스토어 | 소유 영역 |
|---|---|
| `appStore.ts` | 편집 모드, 문서 상태 등 앱 전역 |
| `bibliographyStore.ts` | 서지 캐시 + add/remove/rename/import |
| `memoPanelStore.ts` | 메모 채팅 패널 UI 상태 |
| `memoSidecarStore.ts` | 메모 사이드카(`<doc>.md.comments.json`) 동기화 |
| `aiUsageStore.ts` | localStorage 백드 AI 사용량 로그 |
| `sidebarStore.ts` | 좌측 사이드바(가시성/활성탭/너비) |
| `rightSidebarStore.ts` | 우측 사이드바(v0.1.8.4, 독립 가시성/너비) |
| `toastStore.ts` | 토스트 알림 |

## 10. 알려진 모듈 경계 이슈 (복잡도 집중 지점)

문서화된 사실을 숨기지 않는다 — 다음은 코드 자체에 남아 있는 알려진 이슈다.

- **`atomicMedia.ts`의 Markdown-mode 게이트 누락**: `src/editor/atomicInlineMarks.ts:37-41`의 주석이 자기 자신을 이렇게 설명한다 — "atomicMedia is missing the Markdown-mode gate as a latent bug; this module adds it explicitly." 즉 이미지/링크 원자성 확장(`atomicMedia.ts`)이 나중에 추가된 인라인 마크 원자성 확장(`atomicInlineMarks.ts`)과 달리 Source 모드 게이트를 명시적으로 갖고 있지 않다.
- **`StyleSet` 정의 중복**: `electron/preferences.ts`가 `src/styles/journalPresets.ts`의 `StyleSet` 기본값을 복제해서 갖고 있다(main은 renderer 코드를 import할 수 없으므로). `electron/preferences.ts:8`의 주석이 이를 자인하며, `tests/styles/journalPresets.test.ts`가 두 정의의 lockstep을 지키는 유일한 안전장치다.
- **`Macro` 인터페이스 중복**: `shared/ipc-contract.ts:9-13`와 `electron/macros.ts:5` 양쪽에 별도로 `Macro` 인터페이스가 존재한다. `StyleSet`과 달리 이 쪽은 lockstep을 강제하는 테스트가 없다 — 향후 드리프트 위험이 있다(아래 findings 참고).
- **`RenderedSpan` 계약 부재**: `docs/DOCUMENT_MODE_PRINCIPLES.md` §7이 제안하는 양방향 소스맵 계약(`src/editor/renderedSpan.ts`)은 아직 존재하지 않는다. v0.3 로드맵 최우선 후보다(`product.md` §9 참고).
- **`InlineCode`는 원자적 마크가 아니라 코드섬 억제 대상이다**: `atomicInlineMarks.ts:90-98`의 `CODE_ISLAND_NODE_NAMES` 목록에 `InlineCode`가 등장하지만, 이는 마크다운 강조 파싱을 억제하는 "코드섬 조상" 목록이지 원자적 마크 후보 목록이 아니다 — `InlineMarkSpec`(L43-88) 5종(`StrongEmphasis`/`Emphasis`/`Strikethrough`/`Highlight`/`Subscript`, §6 참고)에는 포함되지 않는다. `Superscript`(`^sup^`)는 파일 전체에 이름조차 등장하지 않아 원자성 범위 밖이다.
- **`prefs:set`는 경로 필드만 가드하고 값 도메인은 검증하지 않는다**: `assertPrefsPatchAllowed()`(`electron/pathGuard.ts:183-215`, §4)는 `workspaceFolders`/`recentFiles`/`recentFolders` 3개 경로 필드만 검사한다. `electron/ipc/preferences.ts:11-21`의 `prefs:set` 핸들러는 그 외 필드를 그대로 `setPreferences()`에 넘기고, `setPreferences()`(`electron/preferences.ts:235-265`)는 1단계 얕은 병합만 수행할 뿐 숫자 범위나 enum 멤버십은 검증하지 않는다 — 형태 검사는 읽기 시점에 `editor.styles`/`editor.tableStyleFormat` 두 필드에 대해서만 지연 수행된다. 경로 트래버설 방어(신뢰 경계)와 값 도메인 검증(입력 검증)은 서로 다른 계층이며, 후자는 아직 없다.
- **렌더러 에러 경계·통합 에러 채널 부재**: `src/`/`electron/` 전체에서 `ErrorBoundary`/`componentDidCatch`/`unhandledrejection` 어느 것도 검색되지 않는다. 토스트 인프라(`toastStore.ts`)는 존재하지만 실제로는 단 하나의 에러 경로(`src/hooks/useAiPalette.ts:73`)에서만 쓰이며, 그 밖의 실패는 `window.alert` 또는 무음 삼킴으로 처리된다. `PathNotAllowedError` 같은 throw가 가드되지 않은 await 지점에서 unhandled rejection으로 새어나갈 수 있다.

## 11. 테스트 조직

```
tests/                 Vitest 유닛 — 169개 파일 (find tests -type f | wc -l 기준, tests/setup.ts 제외)
├── editor/    (74)     CodeMirror 확장, 데코레이션, 원자성
├── electron/  (32)     main 프로세스 로직
├── export/    (16)     내보내기 파이프라인
├── shared/    (16)     서지 파싱, 인용, 메모 등 순수 로직
├── sidebar/   (14)     사이드바 컴포넌트
├── store/     (7)      zustand 스토어 테스트
├── utils/     (5)
├── hooks/, components/, i18n/, styles/  (각 1개)
└── sanity.test.ts (root, 1개)

e2e/                    Playwright + 실제 Electron — 31개 spec
└── _helpers.ts (281줄)  공용 하네스:
    - launchClean() / shutdownClean() — 임시 --user-data-dir로 매 spec을 격리
    - 모드 setter 헬퍼
    - composeKorean(page, syllables, commitText) — CDP Input.imeSetComposition으로
      실제 한글 조합 이벤트를 합성. Input.insertText는 의도적으로 쓰지 않는다
      (그건 새 텍스트로 커밋되어 조합 흐름을 재현하지 못함, _helpers.ts:268-272).
      CDP IME를 지원하지 않는 미래 Electron 빌드에 대비한 graceful skip 포함.
```

`vitest.config.ts`는 jsdom 환경, `globals: false`, `setupFiles: tests/setup.ts`(ResizeObserver·Range.getBoundingClientRect 폴리필, `IS_REACT_ACT_ENVIRONMENT` 설정)를 쓴다. `playwright.config.ts`는 `fullyParallel: false`, `workers: 1`로 직렬 실행한다 — 각 spec이 실제 Electron 앱을 새로 띄우기 때문이다.

**IME 관련 파일명 드리프트**: `docs/DOCUMENT_MODE_PRINCIPLES.md:54`와 `CONTRIBUTING.md:209`는 `e2e/toolbar-ime-composition.spec.ts`를 참조하지만, 실제 파일명은 `e2e/ime-composition.spec.ts`다(검증 완료). 코드를 찾을 때는 실제 파일명을 사용하라.

## 12. 참고

- 마크다운 문법 상세는 `docs/durumi-markdown-reference.md`
- 3-모드 사용자 가이드는 `docs/editor-modes.md`
- 서지 워크플로 사용자 가이드는 `docs/reference-management.md`
- `docs/image-rendering.md`는 `durumi-asset://` 프로토콜이 왜 필요했는지의 포스트모템
- `docs/v0.2-hardening.md`(805줄)는 v0.2.x 보안/데이터 무결성 항목 11개의 기록(상태: Complete)
- `docs/v0.2-audit-prep.md`는 v0.3 진입 전 v0.2 기능 전수 검증을 위한 세션 간 핸드오프 문서
- 제품 관점의 기능 설명은 [product.md](product.md), 기술 스택 상세는 [tech.md](tech.md)

---

생성: `/moai project` · 기준 버전 v0.2.29 (HEAD `b3272fd`)

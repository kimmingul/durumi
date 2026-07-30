# Durumi — Modules 코드맵

각 최상위 디렉터리의 책임과 대표 public 인터페이스. 전체 목록은 [structure.md](../structure.md) §1/§7을 보라 — 이 문서는 파일별 export를 그래프 탐색 용도로 보강한다.

## electron/ (메인 프로세스, 42개 파일)

| 파일 | 책임 | 대표 export |
|---|---|---|
| `main.ts` | `BrowserWindow` 생성(§webPreferences), `app.whenReady`/`before-quit`/`window-all-closed`/`activate` 라이프사이클 | `createWindow`(`main.ts:46`, 내부 함수) |
| `ipc.ts` | 9개 도메인 등록 함수 조립(§entry-points.md) + `theme:changed` push 브로드캐스트 | `registerIpcHandlers()`(`ipc.ts:20`) |
| `ipc/*.ts` (10개) | 도메인별 `ipcMain.handle` 등록. `_shared.ts`는 등록 함수 없이 헬퍼만 재export(`ipc.ts:14-20`) | `registerFilesHandlers` 등 9개 |
| `pathGuard.ts`(215줄) | 4-tier 신뢰 경계(structure.md §4) | `assertAllowedPath`(`:171`), `assertPrefsPatchAllowed`(`:183-215`), `allowSessionPath`(`:81`), `PathNotAllowedError`(`:66`) |
| `preferences.ts`(290줄) | JSON 기반 설정 CRUD | `getPreferences`(`:224`), `setPreferences`(`:235-265`), `addRecentFile`(`:274`), `onPreferencesChanged`(`:137`) |
| `menu.ts`(390줄) | 네이티브 메뉴 트리 구성, `menu:command` 발신(§entry-points.md) | 모듈 스코프 함수(default export 없음, `buildMenu`류) |
| `assetProtocol.ts` | `durumi-asset://` 커스텀 프로토콜 핸들러 | `registerAssetProtocolSchemes`/`registerAssetProtocolHandler`(structure.md:118) |
| `closeGuard.ts`(73줄) | 종료 시 Save?/취소 30초 타임아웃 왕복 | `attachCloseGuard(win, ipc, opts)`(`:27-67`) |
| `git.ts` | 워크스페이스 git 상태 조회 | `getRepoStatus`(`:24`), `mapStatus`(`:79`), `StatusBucket`(`:3`) |
| `aiClient.ts` / `aiKeys.ts` | Anthropic/OpenAI 호환 HTTP 클라이언트 직접 구현 + `safeStorage` 키 볼트 | (tech.md §3, §12 참고) |
| `pandoc.ts`(310줄) | pandoc 탐지/실행/Homebrew 설치 진행률 스트리밍 | — |
| `bibliography.ts` / `bibliographyFetch.ts`(792줄) / `bibliographyWrite.ts` | `.bib` CRUD + 원격 서지 API 조회 + 원자적 쓰기 | — |
| `reference*.ts`(3개: `referenceDownload.ts`/`referenceFs.ts`/`referenceImport.ts`) | `reference/` 폴더 다운로드·가져오기 | — |
| `search.ts` | 워크스페이스 전체 검색(단일 채널 `search:workspace`) | — |
| `fs.ts` | 원자적 파일 쓰기(tmp+rename), 디렉터리 워치 | — |
| `preload.ts`(148줄) | `contextBridge.exposeInMainWorld('api', api)`가 유일한 진입 표면(`:148`) | 없음(bridge 자체가 export 표면) |
| 기타 | `macros.ts`(매크로 프리셋 12종), `customCss.ts`, `i18n.ts`(메인측 로케일), `autoUpdater.ts`, `fileIndex.ts`, `contextMenu.ts`, `dialogDefaults.ts`, `images.ts`, `pdf.ts`, `pdfText.ts`(PDF에서 DOI 추출), `pendingAssets.ts`, `fileOps.ts` | — |

## src/ (렌더러, 172개 `.ts`/`.tsx`)

| 디렉터리 | 책임 | 비고 |
|---|---|---|
| `App.tsx`(308줄) | 얇은 셸 — `useAppChromeEffects`/`usePreferencesInit`/`useCustomCss`/`useMemoEvents`/`useAppCloseGuard`/`useMemoCaretFocus` + 5개 기능 훅(`useFileMenuCommands`/`useExportFlow`/`useCitationInsertFlow`/`useAiPalette`/`useWorkspaceMenu`)을 `useMenuCommandRouter`로 합류(`App.tsx:99-117`) | 다이얼로그·팔레트 9개는 전부 `React.lazy`(`grep -c '^const.*= lazy(' src/App.tsx`) | |
| `editor/decorations/`(33) | 마크다운 구성요소별 라이브 프리뷰. `framework.ts`가 공용 `decorationPlugin(visitor)`(`:36`) 제공, `index.ts`가 `liveDecorations` 배열로 집계(`:32-76`) | 새 인라인/블록 문법의 시각 렌더링 |
| `editor/markdownExt/`(12) | 커스텀 Lezer 파서 확장(citation, comments, criticMarkup, footnote, frontMatter, inlineExtras, inlineMarkDetection, inlineMarkdownRenderer, tableEdit, tableStylePlugin, tableTransform, toc) | 새 마크다운 문법 자체의 파싱 규칙 |
| `editor/keymap/`(17) | 키보드 단축키/토글/매크로(`macros.ts`)/테이블 내비게이션 | 새 단축키, 서식 토글 커맨드 |
| `editor/ai/`(1: `ghostText.ts`) | AI 고스트텍스트 | — |
| `editor/autocomplete/`(1: `citationAutocomplete.ts`) | 인용 자동완성 | — |
| `editor/math/`(2: `katexLoader.ts`, `scan.ts`) | 수식 스캐너 + KaTeX 지연 로드 | — |
| `editor/mermaid/`(1: `renderer.ts`) | Mermaid 지연 로드 렌더러(`securityLevel: 'strict'`) | — |
| `editor/MarkdownEditor.tsx`(213줄) | 6단계 확장 계층 조립(overview.md §2, structure.md §6) | 편집기 composition root |
| `editor/editMode.ts` | 3-모드 상태 관리 | `EditMode`(`:18`), `EDIT_MODES`(`:20`), `editModeField`(`:28-38`), `editModeStateExtension`(`:64`) |
| `editor/atomicMedia.ts` / `atomicInlineMarks.ts` | 이미지·링크 / 굵게·기울임·취소선·하이라이트·하첨자의 원자적 삭제 경계 | `atomicMediaExtension`(`atomicMedia.ts:246`) |
| `editor/wysiwygEscape.ts`(197줄) | Document 모드 실시간 마커 이스케이프 transaction filter | — |
| `components/` (최상위 26개 .tsx) | 다이얼로그·팔레트·툴바(예: `SettingsDialog`, `AiCommandPalette`, `CitePalette`, `TableStylePopover`, `EditorToolbar`) | 새 다이얼로그/패널 |
| `components/sidebar/`(14) | 좌측 5탭 + 우측 2탭 사이드바 콘텐츠 | 새 사이드바 탭 |
| `store/`(8) | zustand 전역 상태([data-flow.md](data-flow.md) §2) | 새 전역 상태 슬라이스 |
| `hooks/`(21) | `App.tsx`가 위임하는 동작 단위(파일 21개: `useActiveHeading`/`useAiPalette`/`useAppChromeEffects`/`useAppCloseGuard`/`useCitationInsertFlow`/`useCustomCss`/`useDocComments`/`useDocCriticMarkup`/`useDocOutline`/`useExportFlow`/`useFileMenuCommands`/`useFolderTree`/`useMemoCaretFocus`/`useMemoEvents`/`useMemoMeta`/`useMemoSync`/`useMenuCommandRouter`/`usePickAndInsertImage`/`usePreferences`/`usePreferencesInit`/`useWorkspaceMenu`) | 새 최상위 커맨드/동작 |
| `export/`(9) | HTML 내보내기 파이프라인(`renderHtml`/`renderMath`/`renderMermaid`/`inlineImages`/`escapeHtml`/`exportStyles`/`highlightCode`/`slug`/`tokenStyle`) | 내보내기 포맷 확장 |
| `i18n/` | `dict.ts`(1,093줄, en/ko) + `t.ts` | 새 UI 문자열 |
| `styles/` | `global.css`(1,121줄), `applyStyles.ts`(CSS 변수 50개), `journalPresets.ts` | 새 저널 스타일 프리셋 |
| `utils/`(5) | 잡다한 순수 유틸 | — |

## shared/ (프로세스 무관 커널, 20개 파일)

| 파일 | 책임 |
|---|---|
| `ipc-contract.ts`(810줄) | IPC 계약 SSOT. `IpcApi` 인터페이스(`:322-757`), `MenuCommand` 유니온(`:271-308`), `Macro` 인터페이스(`:9-13`) |
| `bibtex.ts` / `bibtexWriter.ts` / `ris.ts` / `citation.ts` / `citationKey.ts` / `citationMerge.ts` | 서지 파싱/포맷(서드파티 미사용) |
| `comments.ts` / `memoSidecar.ts` | 메모 파서 + 사이드카(`<doc>.md.comments.json`) 스키마 |
| `criticMarkup.ts` | CriticMarkup 5-연산자 파서 + export 변환 |
| `manuscriptTemplates.ts`(457줄) | IMRaD/CONSORT/PRISMA/CARE/STROBE 등 원고 템플릿 6종 |
| `tableStyle.ts`(376줄) | 표 스타일 wire format 2종 |
| `menuLabels.ts` | 네이티브 메뉴 i18n SSOT(main+renderer 라벨 드리프트 종식) |
| `assetProtocol.ts` | `durumi-asset://` 스킴 상수 |
| `frontMatter.ts` / `frontMatterFenced.ts` | YAML front matter 파싱 |
| `aiPrompts.ts` / `aiCitationSuggest.ts` / `aiCost.ts` | AI 재작성 프롬프트(7개) / 인용 제안 / 비용 추정 |
| `escapeHtml.ts` | HTML 이스케이프 유틸(export 파이프라인 공유) |

## 새 코드 추가 위치 (structure.md §7과 동일 규약)

새 마크다운 구문 하나를 추가하려면: `markdownExt/`(파서) → `decorations/`(렌더링) → 필요시 `keymap/`(단축키) → `tests/editor/`(유닛) → IME 영향 시 `e2e/`에 `composeKorean` 기반 spec.

---

생성: `/moai project` Phase 9 (codemaps) · 기준 버전 v0.2.29 (HEAD `b3272fd`)

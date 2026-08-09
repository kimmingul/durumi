---
id: SPEC-V03-WORKSPACE-002
title: "코드베이스 조사 — 멀티패널 셸"
version: "0.3.6"
status: draft
created: 2026-08-08
updated: 2026-08-09
author: manager-spec
priority: P1
phase: "v0.3.0 target"
module: "src/, shared/, electron/"
lifecycle: spec-anchored
tier: L
tags: "research, multipanel, layout, editmode, menurouting, language, singleton"
---

# 코드베이스 조사 — SPEC-V03-WORKSPACE-002

> Tier L 산출물. 8개 영역 전부를 **실제로 읽은 코드**로 답하고, 모든 주장에 `path:line`을 붙인다.
> 기준: `package.json:4` v0.2.31, 브랜치 `feat/v0.3-workspace` HEAD `fd3d196`.
> SPEC-1의 `research.md`를 대체하지 않는다 — 그 문서는 감시·IME·메타데이터 계층을 다루고, 이 문서는 **패널화가 부딪히는 표면**을 다룬다.

**조사 방법**: `Grep`/`Read`로 소스를 직접 읽었다. 실행 검증(테스트 스위트 재실행, 앱 구동)은 하지 않았다 — plan 단계이므로 §10에 미검증 항목으로 명시한다.

---

## 1. 현재 단일 에디터 마운트 경로

### 1.1 체인

```
index.html #root
  └─ src/main.tsx:9           document.getElementById('root')  /  :23 createRoot(container).render
       └─ src/main.tsx:24-29  <React.StrictMode><ErrorBoundary><App/>
            └─ src/App.tsx:62 App()
                 └─ src/App.tsx:153-160  <MarkdownEditor …/>   ← 저장소 전체에서 유일한 JSX 인스턴스
                      └─ src/editor/MarkdownEditor.tsx:150      new EditorView({ state, parent: hostRef.current })
```

`new EditorView`는 **저장소 전체에 정확히 한 곳**뿐이다 — `grep -rn "new EditorView" src electron shared` → `src/editor/MarkdownEditor.tsx:150` 단 1건. 즉 오늘 존재 가능한 `EditorView` 인스턴스 수는 **창(window)당 1개**다.

### 1.2 각 계층이 소유하는 것

| 계층 | 소유물 | 근거 |
|---|---|---|
| `App` | `editorViewRef`(콜백용 SSOT) + `editorView` state(JSX용 SSOT) 이중 보관, `handleEditorReady` | `src/App.tsx:63-73` |
| `App` | 레이아웃 트리(사이드바–중앙–우사이드바 flex row) | `src/App.tsx:122-188` |
| `MarkdownEditor` | `hostRef` DOM 컨테이너(`<div className="cm-host">`) | `src/editor/MarkdownEditor.tsx:67, 234` |
| `MarkdownEditor` | `viewRef` (뷰 인스턴스), `macroCompartmentRef`, `editModeCompartmentRef`, `initialEditModeRef` | `src/editor/MarkdownEditor.tsx:68-72` |
| `MarkdownEditor` | **extension 목록 조립 지점 (단일)** — `EditorState.create({ extensions: [...] })` | `src/editor/MarkdownEditor.tsx:86-148` |
| `MarkdownEditor` | 조합 게이트 부착 + 조정 실행자 등록 + 해제 | `src/editor/MarkdownEditor.tsx:155-173` |

### 1.3 "인스턴스가 정확히 하나"를 가정하는 코드 (열거)

| # | 위치 | 가정의 형태 | 2개 이상이면 |
|---|---|---|---|
| A1 | `src/store/reconciliationStore.ts:35` `let effectHandler` | **모듈 수준 싱글턴** 핸들러 1개 | 두 번째 `MarkdownEditor` 마운트가 `registerReconciliationExecutor`(`MarkdownEditor.tsx:159-162`)로 첫 번째의 실행자를 **덮어쓴다**. 외부 변경이 엉뚱한 버퍼에 적용된다 |
| A2 | `src/store/reconciliationStore.ts:38-39` `state`/`policy` | 조정 상태가 **창 전역 1개** | N개 문서의 status/pending/isDirty/composing이 한 슬롯을 공유한다 (§7.2 상세) |
| A3 | `src/App.tsx:63,69` | `editorViewRef`/`editorView` 단수 | 하위 컴포넌트(툴바·사이드바·우사이드바)가 어느 뷰를 받아야 하는지 결정 불가 |
| A4 | `src/hooks/useMenuCommandRouter.ts:34, 98` | `editorViewRef` 단수 → `const view = editorViewRef.current` | 40여 개 뷰 의존 커맨드가 갈 곳이 없다 (§4) |
| A5 | `src/store/appStore.ts:8-10` `filePath`/`content`/`isDirty` | 열린 문서 **정확히 1개** | 문서 상태 전체가 패널 축을 갖지 않는다 |
| A6 | `src/components/StatusBar.tsx:32-37` | appStore 단수 읽기(경로·dirty·모드·힌트) | 어느 패널의 상태를 보여줄지 미정의 |
| A7 | `src/store/memoSidecarStore.ts:30` `docPath` | 메모 사이드카가 문서 1개에 결속 | 두 원고를 동시에 열면 한쪽 메모가 보이지 않거나 잘못 저장된다 |
| A8 | `src/store/bibliographyStore.ts:57` `filePath` + `bindToDocument` | 서지 해석이 문서 1개에 결속 | 동일 |
| A9 | `src/hooks/useExternalChangeWiring.ts:31-42` | `watchOpenFile`을 **단일** `filePath`로만 등록 | main은 이미 경로별인데(§7.1) 렌더러가 1건만 등록한다 |
| A10 | `src/components/EditorToolbar.tsx:388, 413` | `window` 수준 `durumi:edit-link` / `durumi:open-link-dialog` 리스너 | 툴바가 N개면 N개가 동시에 반응한다 |
| A11 | `src/editor/decorations/table.ts:121` `let pendingFocusCell` | 모듈 싱글턴 포커스 예약 | 두 뷰의 표 편집이 서로의 포커스 예약을 덮어쓴다 |
| A12 | `src/components/tableStylePopoverHost.ts:9-10, 22` | `mountedRoot`/`activeCleanup` 싱글턴 + `document.body` 부착 | 팝오버가 어느 뷰에 속하는지 DOM 상 알 수 없다 |
| A13 | `src/store/sidebarStore.ts:11` `activeHeadingLine` | "그 에디터"의 캐럿 줄 | 목차 하이라이트가 어느 패널을 따르는지 미정의 |
| A14 | `src/hooks/useMemoCaretFocus.ts` 호출부 `src/App.tsx:97` | `editorView` 단수 인자 | 동일 |

**창(window) 축은 이미 N이다**: `electron/main.ts:46` `createWindow()`, `:103` `onNewWindow`, `electron/menu.ts:93` `menu.file.newWindow`. 즉 위 A1~A14 중 **모듈 싱글턴이 아닌 것들(스토어·ref)** 은 창마다 별개 렌더러 컨텍스트라 오늘 문제가 되지 않는다. 반면 §7.2가 다루는 IPC 브로드캐스트는 창 축에서도 이미 문제다.

---

## 2. 사이드바 레이아웃 상태

### 2.1 `sidebarStore` (좌) — `src/store/sidebarStore.ts`

| 항목 | 값 | 근거 |
|---|---|---|
| state | `visible`, `activeTab`(`'files'\|'outline'\|'search'`), `width`(기본 240), `workspaceFolders`, `activeHeadingLine`, `gitStatus` | `:6-24, :30-36` |
| actions | `toggleVisible`, `showWith`, `setActiveTab`, `setWidth`(clamp), `setWorkspaceFolders`(순서 보존 dedupe), `addFolder`, `removeFolder`(gitStatus 동반 삭제), `setActiveHeadingLine`, `updateGitStatus`, `clearGitStatus` | `:37-77` |
| 폭 경계 SSOT | `WIDTH_BOUNDS.sidebar` — `@shared/prefsValidation`. main의 `setPreferences`도 같은 값으로 clamp | `:2, :26-28` |

### 2.2 `rightSidebarStore` (우) — `src/store/rightSidebarStore.ts`

| 항목 | 값 | 근거 |
|---|---|---|
| state | `visible`(기본 **false**), `activeTab`(`'references'\|'ai'\|'memo'\|'changes'`), `width`(기본 280) | `:10-21, :26-29` |
| actions | `toggleVisible`, `setVisible`, `showWith`, `setActiveTab`, `setWidth`(clamp) | `:30-34` |
| 독립성 선언 | 주석이 명시: 두 스토어는 **완전 독립**이며 탭 union이 겹치지 않고 폭도 별개 prefs 키에 persist | `:4-8` |

### 2.3 소비자 전체

| 소비자 | 무엇을 읽나 | 근거 |
|---|---|---|
| `Sidebar` | 좌 `visible`/`activeTab`/`width` + setter | `src/components/Sidebar.tsx:30-34` |
| `RightSidebar` | 우 전체 | `src/components/RightSidebar.tsx` |
| `useMenuCommandRouter` | 양쪽 토글·`showWith`·`setVisible` | `src/hooks/useMenuCommandRouter.ts:77-81, 87-94, 135-146` |
| `FileTree` / `WorkspaceRoot` | `workspaceFolders` | `src/components/sidebar/FileTree.tsx:46` |
| `useActiveHeading` | `setActiveHeadingLine` | `src/components/Sidebar.tsx:38` 경유 |
| 목차 | `activeHeadingLine` | `src/components/sidebar/Outline.tsx` |
| git 배지 | `gitStatus` | `src/components/sidebar/*` |

### 2.4 persist 방식

- 좌: `Sidebar.tsx:41-52` — 컴포넌트 내부 500ms 디바운스 후 `window.api.prefsSet({ sidebar: { visible, activeTab, width } })`
- 우: `RightSidebar.tsx` 동형 (별개 prefs 키)
- **스토어가 아니라 컴포넌트가 persist를 소유한다.** 사이드바를 언마운트하면 persist도 멈춘다.

### 2.5 레이아웃 CSS 조합 방식 — **flex, grid 아님**

컨테이너는 `App.tsx`의 **인라인 스타일**이다:

```
src/App.tsx:122  <div style={{ height:'100%', display:'flex', flexDirection:'column' }}>
src/App.tsx:123    <div style={{ flex:1, display:'flex', flexDirection:'row', minHeight:0 }}>
src/App.tsx:124      <Sidebar …/>                       ← .cm-sidebar + .cm-sidebar-resizer
src/App.tsx:145      <div style={{ flex:1, overflow:'auto', minWidth:0, display:'flex', flexDirection:'column' }}>
src/App.tsx:146        <EditorToolbar …/>
src/App.tsx:152        <div style={{ flex:1, overflow:'auto', minHeight:0 }}>
src/App.tsx:153          <MarkdownEditor …/>            ← .cm-host
src/App.tsx:163      <RightSidebar …/>
src/App.tsx:189    <ReconciliationSurface/>             ← 창 전역 1개 (§7.2)
src/App.tsx:190    <StatusBar/>
```

클래스 정의:

```
src/styles/global.css:30    .cm-host { display: flex; flex-direction: column; }
src/styles/global.css:31    .cm-editor { height: 100%; }
src/styles/global.css:345-354  .cm-sidebar { flex-shrink: 0; height: 100%; … }
src/styles/global.css:380-385  .cm-sidebar-resizer { width: 4px; cursor: col-resize; flex-shrink: 0; }
src/styles/global.css:1047+    .cm-right-sidebar { … }  /* "Mirrors .cm-sidebar*" 주석: :1043 */
```

즉 **1차원 flex row** 하나가 전체 가로 레이아웃이며, 사이드바는 `flex-shrink:0` + 인라인 `width:${width}px`, 중앙은 `flex:1 minWidth:0`. 중앙 영역을 분할하는 것은 이 flex row의 **한 자식 안에서** 끝난다(사이드바 CSS 무변경). 반대로 통합 그리드 재작성은 `.cm-sidebar`/`.cm-right-sidebar`의 `flex-shrink`/`height:100%` 전제를 모두 다시 써야 한다.

---

## 3. 편집 모드 모델 — 전역과 뷰별의 **이중 배치**

### 3.1 두 곳에 산다

| 축 | 위치 | 성격 |
|---|---|---|
| 전역(창) | `appStore.editMode` + `lastNonMarkdownMode` — `src/store/appStore.ts:19, 21, 50-51, 65-71` | 사용자 의도 + prefs persist 대상 |
| 뷰별 | `editModeField` StateField + `setEditMode` StateEffect — `src/editor/editMode.ts:26-38` | 데코레이션이 읽는 실제 모드 |

결선은 단방향이다: `App.tsx:78` `useAppStore(s=>s.editMode)` → `MarkdownEditor` prop → `MarkdownEditor.tsx:207-212` `editModeCompartmentRef.reconfigure(decorationsForMode(editMode))` + `setEditMode.of(editMode)`.

즉 **뷰별 저장소는 이미 존재하지만 값은 전역에서만 흘러 들어온다.**

### 3.2 모드를 읽는 모듈 (전수)

`currentEditMode` / `isWysiwygMode` / `isMarkdownMode` 소비자 — 전부 `state`(뷰별)에서 읽는다:

| 모듈 | 라인 |
|---|---|
| `src/editor/headingHint.ts` | `:63` (`!== 'typora'`) |
| `src/editor/wysiwygEscape.ts` | `:105` |
| `src/editor/atomicInlineMarks.ts` | `:157` (`=== 'markdown'`) |
| `src/editor/decorations/activeLine.ts` | `:33` |
| `src/editor/decorations/math.ts` | `:87, :150` |
| `src/editor/decorations/taskList.ts` | `:51` |
| `src/editor/decorations/mermaid.ts` | `:100` |
| `src/editor/decorations/footnote.ts` | `:87` |
| `src/editor/decorations/criticMarkup.ts` | `:228` |
| `src/editor/decorations/frontMatter.ts` | `:91` |
| `src/editor/decorations/comment.ts` | `:128` |

전역 `appStore.editMode` 읽는 곳: `src/App.tsx:78`(→ prop), `src/components/StatusBar.tsx:35`(모드 라디오 UI), `src/hooks/useMenuCommandRouter.ts:75-76, 123-133`, `src/hooks/usePreferencesInit.ts:58`(prefs 부트스트랩), `src/App.tsx:148`(`EditorToolbar visible={editMode === 'wysiwyg'}`).

### 3.3 두 패널이 서로 다른 모드를 요구하면 **정확히 무엇이 깨지는가**

데코레이션 계층은 **깨지지 않는다** — 전부 뷰별 `state`에서 읽으므로 두 뷰가 다른 `editModeField` 값을 갖는 것은 구조적으로 이미 가능하다. 깨지는 것은 그 위의 네 지점이다:

1. `src/store/appStore.ts:65-71` `setEditMode`가 **창 전역 1개 값**을 쓴다 → 패널 B의 모드 변경이 패널 A를 바꾼다.
2. `src/components/StatusBar.tsx:80-92` 모드 라디오가 전역 값을 표시·설정한다 → 어느 패널의 모드인지 표현할 수 없다.
3. `src/App.tsx:148` `EditorToolbar visible={editMode === 'wysiwyg'}` — 툴바 1개가 전역 모드에 결속된다.
4. `src/hooks/useMenuCommandRouter.ts:126, 131` — 모드 변경마다 `prefsSet({editor:{defaultMode}})`. 패널별 모드를 그대로 persist하면 마지막 패널이 이긴다.

`toggleSourceMode`(`appStore.ts:69-71`)의 `lastNonMarkdownMode`도 전역 1개이므로 패널별 토글 이력을 가질 수 없다.

---

## 4. 메뉴 커맨드 라우팅

### 4.1 Electron 메뉴 → 렌더러 흐름

```
electron/menu.ts:17     win?.webContents.send('menu:command', cmd)     ← 채널명 'menu:command'
electron/preload.ts:17-21  onMenuCommand(cb) → ipcRenderer.on('menu:command', …), 해제 클로저 반환
shared/ipc-contract.ts:402 onMenuCommand: (cb:(cmd:MenuCommand)=>void) => () => void
src/hooks/useMenuCommandRouter.ts:97  window.api.onMenuCommand(async (cmd) => { … })
```

`electron/menu.ts:17`은 **특정 창**(`win`)에 보낸다 — 창 축 라우팅은 main이 이미 한다. 창 **안의** 패널 라우팅은 존재하지 않는다.

### 4.2 커맨드 전체 목록

타입 SSOT: `shared/ipc-contract.ts:309-347` (`MenuCommand`). 라우터 처리부: `useMenuCommandRouter.ts:102-258`.

**뷰 비의존(전역) 커맨드** — 라우터가 스토어/플로우로 보낸다:
`refreshProjectTree`(`:102`), `new`/`open`/`save`/`saveAs`(`:107-110`), `exportHtml`/`exportPdf`/`exportDocx`/`exportLatex`/`importDocx`(`:111-115`), `toggleTheme`(`:116`), `toggleSourceMode`(`:123`), `{setEditMode}`(`:129`), `openFolder`(`:134`), `toggleSidebar`/`toggleRightSidebar`/`toggleMemoPanel`(`:135-137`), `showFiles`/`showOutline`/`showSearch`(`:138-140`), `showMemos`/`showChanges`/`showReferences`/`showAi`(`:143-146`), `openKeyboardShortcuts`(`:147`), `toggleExportIncludeComments`/`toggleExportPreserveAnnotations`(`:156-165`), `quickOpen`(`:166`), `openSettings`(`:167`), `insertCitationFromDoi`/`bulkInsertFromDoi`/`importReferences`(`:168-180`), `openCitePalette`(`:197`), `openAiPalette`(`:198`), `languageChanged`(`:209`), `{openRecent}`/`{openRecentFolder}`/`{closeFolder}`/`{newFromTemplate}`(`:249-257`).

**뷰 의존 커맨드** — `const view = editorViewRef.current` 필요:
`addMemo`(`:148`), `cmInsert`/`cmDelete`/`cmSubstitute`/`cmHighlight`/`cmComment`(`:149-153`), `nextMemo`/`prevMemo`(`:154-155`), `aiCitationSuggest`(`:181`), `toggleFocusMode`(`:199`), `toggleTypewriterMode`(`:204`), `bold`/`italic`/`code`/`strikethrough`(`:216-219`), `insertTable`/`toggleTask`/`codeBlock`(`:220-222`), `find`/`findAndReplace`/`findNext`/`findPrev`(`:223-226`), `link`(`:227`), `{heading}`(`:248`).

`MenuCommand`에 선언되었으나 라우터가 처리하지 않는 것: `newWindow`, `closeWindow`, `zoomIn`/`zoomOut`/`zoomReset`, `undo`/`redo`, `openMacrosConfig` — main이 role/`onNewWindow`로 처리한다(`electron/menu.ts:93, 151`).

### 4.3 "포커스된 에디터가 하나"라는 가정이 박힌 지점

| 위치 | 형태 |
|---|---|
| `useMenuCommandRouter.ts:34` | `editorViewRef: RefObject<EditorView \| null>` — 타입 자체가 단수 |
| `useMenuCommandRouter.ts:98` | 핸들러 진입 첫 줄에서 `const view = editorViewRef.current` 를 **한 번** 뽑는다 |
| `useMenuCommandRouter.ts:148-248` | 30여 개 분기가 `&& view` 가드 후 그 하나에 작동 |
| `useMenuCommandRouter.ts:104` | `refreshProjectTree`가 `useAppStore.getState().filePath` — "현재 파일" 전역 1개 |
| `useMenuCommandRouter.ts:243` | `link`가 `window.dispatchEvent(new CustomEvent('durumi:open-link-dialog'))` — **창 전역 브로드캐스트**, 수신자 `EditorToolbar.tsx:413` |
| `src/App.tsx:102-103` | `useCitationInsertFlow(editorViewRef)` / `useAiPalette(editorViewRef)` 가 단수 ref를 캡처 |
| `src/App.tsx:119` | `usePickAndInsertImage(editorViewRef)` 동일 |

즉 **패널 라우팅은 라우터 한 곳을 고쳐서 끝나지 않는다** — `editorViewRef`를 인자로 받는 4개 훅(`useCitationInsertFlow`, `useAiPalette`, `usePickAndInsertImage`, `useMemoCaretFocus`)까지 동일한 축을 갖는다.

`durumi:*` 창 전역 커스텀 이벤트 버스도 같은 계열이다: `durumi:edit-link`(`decorations/linkInteract.ts:104` 발신 / `EditorToolbar.tsx:388` 수신), `durumi:open-link-dialog`(`useMenuCommandRouter.ts:243` / `EditorToolbar.tsx:413`), `durumi:memo-focus`(`decorations/comment.ts:63` / `useMemoEvents.ts:85`), `durumi:cm-focus`(`decorations/criticMarkup.ts:96`), `durumi:reference-open`(`decorations/citationHover.ts:139` / `useMemoEvents.ts:87`), `durumi:memo-panel-toggle`(`keymap/index.ts:33` / `useMemoEvents.ts:86`). **어느 이벤트에도 발신 뷰 식별자가 없다.**

---

## 5. 언어 지원 — 의존성은 이미 있다

### 5.1 `package.json` 실측

```
package.json:35  "@codemirror/autocomplete": "^6.20.2"
package.json:37  "@codemirror/lang-markdown": "^6.2.5"
package.json:38  "@codemirror/language": "^6.10.2"
package.json:39  "@codemirror/language-data": "^6.5.2"     ← 있다
package.json:41  "@codemirror/state": "^6.4.1"
package.json:42  "@codemirror/view": "^6.28.4"
package.json:43-45 "@lezer/common" / "@lezer/highlight" / "@lezer/markdown"
```

**언어별 개별 패키지(`@codemirror/lang-python` 등)는 없다.** `@codemirror/language-data`가 지연 로드 기반 언어 description 카탈로그를 제공하므로 추가 의존성 없이 `.py`/`.csv`(→ plain)/`.json`/`.yaml` 등을 다룰 수 있다.

### 5.2 현재 배선

`@codemirror/language-data`의 유일한 사용처:

```
src/editor/MarkdownEditor.tsx:8    import { languages as lezerLangs } from '@codemirror/language-data';
src/editor/MarkdownEditor.tsx:93-95  markdown({ base: markdownLanguage, codeLanguages: lezerLangs, extensions: […] })
```

즉 **마크다운 펜스 코드블록의 하이라이팅 용도로만** 쓰인다. 파일 자체를 특정 언어로 여는 경로는 없다.

### 5.3 extension 목록 조립의 **단일 지점**

`src/editor/MarkdownEditor.tsx:86-148` — `EditorState.create({ doc: value, extensions: [ … ] })`. **실측 (판 0.3.6)**: `extensions:` 배열 자체는 `:88-147`이며 **최상위 24항목**, `markdown()` 중첩 **8항목**, 합 32. 세는 방법은 "8칸 들여쓰기로 시작하고 주석이 아닌 줄"이다. 초판의 "30여 항목"은 중첩까지 셀 때만 맞았고 세는 방법을 적지 않았다(§10.1 #8).

이 배열이 파일 종류에 따라 달라져야 하는 곳이다. 현재 배열은 **전부 마크다운 전제**다. 마크다운 전용 항목의 예:

| 항목 | 라인 |
|---|---|
`markdown({...})` + 7개 마크다운 확장(FrontMatter/Footnote/Toc/InlineExtras/Citation/Comments/CriticMarkup) | `:93-106` |
`editModeCompartmentRef.of(decorationsForMode(...))` → `liveDecorations` | `:109`, `:51-57` |
`atomicMediaExtension()` / `atomicInlineMarksExtension()` / `wysiwygEscapeFilter()` | `:115, 120, 121` |
`citationAutocomplete()` / `citationHoverTooltip()` | `:122-123` |
`headingHintPlugin(...)` | `:129` |
`markdownKeymap()` | `:131` |
`handlePaste`/`handleDrop`(이미지 붙여넣기) | `:136-138` |

파일 종류 무관 항목: `history()`(`:89`), 기본 keymap(`:90`), `autoPair()`(`:91`), `viewModes()`(`:130`), `makeTheme()`(`:133`), `highlightActiveLine()`(`:134`), `lineWrapping`(`:135`), `updateListener`(`:144`), `docPathStateExtension()`(`:108`), `editModeStateExtension()`(`:107`).

---

## 6. 파일 열기/저장 경로

### 6.1 열기

```
FileTreeNode.tsx:132  onClick → onOpenFile(entry.path)      ← 확장자 필터 없음
  └ App.tsx:128       onOpenFile={(p)=>fileCommands.doOpenPath(p)}
      └ useFileMenuCommands.ts:111-118  doOpenPath: maybeDiscard() → window.api.fileOpenPath(path) → setFile(r.path, r.content)
          └ preload → 'file:openPath'
              └ electron/ipc/files.ts:46-56  assertAllowedPath → fs.readFile(path,'utf8') → allowSessionPath → addRecentFile → {path, content}
```

다이얼로그 경유는 확장자가 **제한된다**: `electron/ipc/files.ts:34` `filters:[{ name:'Markdown', extensions:['md','markdown','txt'] }]`.
Quick Open 인덱스도 제한적이다: `electron/fileIndex.ts:28` `TEXT_EXT = /\.(md|markdown|txt|tex|csv|json|yaml|yml)$/i` — **`.py`·`.bib`·`.bibtex`·`.R`은 인덱스에 없다.**

**그러나 파일트리 클릭 경로는 필터가 전혀 없다.** 따라서 오늘 `analysis.py`를 파일트리에서 클릭하면 `file:openPath`가 UTF-8로 읽어 **마크다운 에디터 버퍼에 그대로 적재된다** — 마크다운 데코레이션·마크다운 keymap·이미지 붙여넣기 핸들러가 모두 걸린 상태로. 이것이 SPEC-2가 채워야 할 D-5 공백의 현재 모습이다.

### 6.2 저장

```
useFileMenuCommands.ts:50-77  doSave → window.api.fileSave(filePath, content) → r.content 반영 → 사이드카 flush → markClean
  └ electron/ipc/files.ts:58-76 'file:save'
       assertAllowedPath
       → migratePendingInContent(content, dirname(path))   ← 마크다운 문법 인식 변환
       → writeFileAtomic(path, finalContent)
       → allowSessionPath / addRecentFile / git 배지 무효화
```

**`migratePendingInContent`는 마크다운 전용 변환이다**: `electron/pendingAssets.ts:157` 정규식 `/!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g` 로 이미지 링크를 찾아 `:175-176`에서 문자열을 치환한다. 실제 치환은 `isPendingPath(decoded)`(`:162`) 통과분에만 일어나므로 `.py` 파일이 손상될 확률은 낮지만, **파일 종류와 무관하게 마크다운 문법 인식 재작성이 저장 경로에 상주한다**는 구조는 그대로다. `file:saveAs`(`:78-113`)도 동일 변환을 거치며 `:96` 필터가 `extensions:['md']`로 고정이다.

### 6.3 문서별로 키잉된 것 vs 전역인 것

| 상태 | 스코프 | 근거 |
|---|---|---|
| 현재 파일 경로 | **전역 1개** | `appStore.filePath` `src/store/appStore.ts:8` |
| 버퍼 내용 | **전역 1개** | `appStore.content` `:9` |
| dirty 플래그 | **전역 1개**, 게다가 sticky(`\|\| s.isDirty`) | `:10, :54` (issue #12) |
| undo 이력 | **뷰별** (CodeMirror `history()`) | `MarkdownEditor.tsx:89` |
| 캐럿·선택·스크롤 | **뷰별** (`EditorState.selection`, `view.scrollDOM`) | 구조상 |
| 편집 모드 | **이중** (전역 store + 뷰별 field) | §3.1 |
| 조합 상태 | 뷰별 게이트 인스턴스이나 싱크가 **전역 스토어** | `MarkdownEditor.tsx:155`, `compositionGate.ts:101-117` |
| 메모 사이드카 | **전역 1개** (`docPath`) | `memoSidecarStore.ts:30` |
| 서지 해석 | **전역 1개** (`filePath` + `bindToDocument`) | `bibliographyStore.ts:57, 80` |
| main의 열린 파일 감시 | **경로별 N개** | §7.1 |
| 조정 상태 | **전역 1개** | §7.2 |
| pathGuard 신뢰 | 프로세스 전역 Set 2개 | `electron/pathGuard.ts:63-64` |

---

## 7. SPEC-1이 출하한, 패널이 소비할 계약

### 7.1 감시 등록 — **이미 경로별(per-path)이다**

| 표면 | 스코프 | 근거 |
|---|---|---|
| `project:watchOpenFile(path, content)` | **per-path** | `electron/ipc/project.ts:151-154` |
| `project:unwatchOpenFile(path)` | **per-path** | `:156-159` |
| `project:noteOpenFileContent(path, content)` | **per-path** | `:161-164` |
| `ExternalWatchService.watchFile/unwatchFile/setOpenContent/noteSelfWrite` | **per-path** (`owned: Set<string>`, `decodeErrors: Map<string,string>`) | `electron/externalWatch.ts:40-51, 67, 76, 111-139` |
| 부모 디렉터리 감시 참조 카운트 | **per-dir** `Map<string, number>` | `electron/ipc/project.ts:38, 60-81` |
| `resolveWatchScope({ openFiles, project })` | `openFiles: readonly string[]` — **처음부터 복수형** | `electron/watchScope.ts:32-34, 37-54` |

즉 **main 계층은 멀티패널 준비가 끝나 있다.** 병목은 렌더러다: `useExternalChangeWiring.ts:31-42`가 `appStore.filePath` 하나만 등록하고, 파일이 바뀌면 이전 것을 해제한다.

**`resolveWatchScope`/`registerWatchScope`는 프로덕션 호출부가 0곳이다** — `grep -rn "resolveWatchScope\|registerWatchScope" electron src tests` 결과가 `electron/watchScope.ts` 정의부와 `tests/electron/watchScope.test.ts`뿐이다. 규약 폴더 감시(REQ-WS-045)는 계층은 있으나 **아직 배선되지 않았다.**

### 7.2 project discovery — 렌더러 호출부가 **0곳**이다

`grep -rn "projectDiscover\|project:discover" src electron tests e2e shared` 결과: `electron/ipc/project.ts:139`(핸들러), `electron/preload.ts:37`(브리지), `shared/ipc-contract.ts:412`(계약), `electron/bibliography.ts:3`(main 내부 사용), 테스트 3개. **`src/` 어디에도 `window.api.projectDiscover` 호출이 없다.**

`projectRefresh`는 배선되어 있다 — `useMenuCommandRouter.ts:102-105`(메뉴 커맨드 `refreshProjectTree`)가 유일한 렌더러 호출부이며, 시각적 어포던스는 SPEC-1 REQ-WS-047a가 명시적으로 SPEC-2에 넘겼다.

### 7.3 변경 확정 → 조정 — **여기가 window-scoped다**

| 표면 | 스코프 | 근거 |
|---|---|---|
| `project:externalFileChange` push | **모든 창에 브로드캐스트** | `electron/ipc/project.ts:40-44` `for (const w of BrowserWindow.getAllWindows()) w.webContents.send(...)` |
| `ExternalFileChange` | `path` 필드를 **담고 있다** | `shared/ipc-contract.ts:245-252` |
| `attachExternalChangeChannel` | **path를 보지 않고** 그대로 dispatch | `src/store/externalChangeChannel.ts:28-50` |
| `ConfirmedChange` | `path` 필드 있음 | `shared/reconciliation.ts:19-25` |
| `ReconciliationState` | `status`/`isDirty`/`composing`/`pending`/`errorMessage`/`deferReason` — **path 축 없음** | `shared/reconciliation.ts:54-62` |
| `reduceReconciliation` | 어느 분기에서도 `change.path`를 **비교하지 않는다** | `shared/reconciliation.ts:209-268` |
| `useReconciliationStore` | 창당 상태 1개 + **모듈 싱글턴** `effectHandler` | `src/store/reconciliationStore.ts:35, 38-39, 45` |
| `ReconciliationSurface` | 창 전역 1개, `App.tsx:189`에 마운트 | `src/components/ReconciliationSurface.tsx:36-40` |
| IME 게이트 | 뷰의 `contentDOM`에 부착되나 dispatch는 전역 스토어로 | `MarkdownEditor.tsx:155`, `compositionGate.ts:101-117` |
| 정책 주입 지점 (REQ-WS-029) | 창 전역 1개 (`setPolicy`) | `reconciliationStore.ts:29-30, 49` |
| 조정 실행자 등록 | **모듈 싱글턴** — 마지막 등록만 살아남는다 | `reconciliationStore.ts:35, 51-53`; `applyExternalChange.ts:123-132` |

### 7.3a 결함 A — 크로스-윈도 무성 버퍼 덮어쓰기 (**확인됨**, v0.2.31 출하 중)

> **판정 이력 (2단계)**: 이 문서 초판은 이 항목을 "소스 근거 기반 미검증 가설"로 표시했다. ① 오케스트레이터가 코드 직독으로 4단계 사슬을 독립 확인했고, ② 이어서 **실제 모듈을 구동해 기계적으로 재현했다** (2026-08-08). `verification-claim-integrity` §1.1 surface 3의 요구("결함 주장은 도메인 도구로 확인될 때까지 가설")를 실행 관측으로 충족하므로 가설 표시를 해제한다. REQ-PANEL-070이 소유하고 `plan.md` §C의 **M0**이 재현 우선으로 닫는다.

### 7.3a-1 기계적 재현 — 관측된 출력과 증거 경로

구동된 것: **실제 모듈 3개** `attachExternalChangeChannel`(`src/store/externalChangeChannel.ts`) + `useReconciliationStore`(`src/store/reconciliationStore.ts`) + `registerReconciliationExecutor`(`src/editor/applyExternalChange.ts`), 그리고 **실제 `EditorState`**(`@codemirror/state`). 대체된 것: preload 브리지(`onExternalFileChange`)와 `DispatchTarget` — 후자는 `src/editor/applyExternalChange.ts:63-67`이 테스트 seam으로 선언한 인터페이스다.

조건: 창이 `/w/b.md`를 버퍼 `"B의 내용\n"`으로 열고 미저장 편집 없음. 그 창이 **한 번도 열지 않았고 감시 등록도 하지 않은** 경로 `/w/a.md`에 대한 확정 `ExternalFileChange` 1건 투입.

관측 출력 (verbatim):

```
[OQ-8]       emit 후 b.md 버퍼 = "A의 내용\n"
[OQ-8]       조정 상태 = "idle"
[OQ-8/dirty] emit 후 b.md 버퍼 = "B의 내용\n"
[OQ-8/dirty] 조정 상태 = "held-notify"
```

증거 (디스크 보존, AC에서 인용):

| 항목 | 경로 |
|---|---|
| 실행 로그 | `.moai/state/verify/goal-spec12345/oq8-repro.log` |
| 재현 소스 | `.moai/state/verify/goal-spec12345/oq8-repro-source.ts.txt` |

**증거의 지속성 (정직한 한계)**: 위 두 경로는 `.gitignore:207`의 `.moai/state/` 규칙에 걸리는 **런타임 상태이며 커밋되지 않는다.** `agent-common-protocol.md` § Evidence persistence obligation가 지정한 위치이므로 배치는 맞지만, **새 클론에는 존재하지 않는다.** 따라서 이 SPEC의 결함 주장은 증거 파일이 아니라 (a) 위에 verbatim으로 옮긴 관측 출력과 (b) M0의 RED 단계가 재생산하는 영구 테스트에 근거한다 — 후자가 증거를 저장소 안으로 옮기는 수단이다.

세 가지 관측이 각각 요구사항을 규정한다:

| # | 관측 | 함의 | 반영 |
|---|---|---|---|
| 1 | 버퍼가 `"A의 내용\n"`으로 교체 | 열지도 않은 파일의 내용이 현재 버퍼에 적용된다 | AC-PANEL-080 |
| 2 | 조정 상태 `"idle"` | 앱이 오적용을 **정상 완료로 취급한다.** 배너도 표시도 남지 않아 사용자가 알 수단이 없다 — **손실을 무성으로 만드는 지점** | AC-PANEL-080b (별개 AC) |
| 3 | dirty 선행 시 버퍼 불변 + `"held-notify"` | `!state.isDirty`(`:193`)가 **즉시 적용만** 막는다. **유일한 보호막이 아니고 dirty 문서를 안전하게 만들지도 않는다** — §7.3a-3이 배너 경유 오염을 담는다. 이 관측이 확립한 것은 **emit 시점 버퍼 불변**뿐이다 | AC-PANEL-080(깨끗한 문서) + AC-PANEL-080c(dirty `pending`·배너) — **양쪽 모두** 필요하다 |

**초판이 놓쳤던 것 — 결함은 "크로스-윈도"보다 넓다**: 재현에서 창은 **하나**였고 문제의 파일을 **열지도 감시 등록하지도 않았다**. 즉 두 창의 경쟁이 필요 없고, **어떤 창이든 도착한 브로드캐스트를 무조건 자기 버퍼에 적용한다.** 초판이 이 결함을 창 축 문제로 좁혀 기술한 것은 부정확했다.

### 7.3a-2 검증 범위의 정직한 분할 — 엔드투엔드 실행은 하지 않았다

| 절반 | 검증 방식 | 근거 |
|---|---|---|
| **렌더러 절반** — 경로 미대조 → 무조건 적용 → `idle` 정착 | **기계적 실행 관측** | 위 증거 경로 2개 |
| **main 절반** — `broadcast()`가 그 경로를 등록하지 않은 창에도 전달 | **정적 소스 사실. 실행하지 않았다** | `electron/ipc/project.ts:40-44` `BrowserWindow.getAllWindows()` |

**두 절반을 합친 창 간 시나리오는 추론이다.** 미확인 고리는 정확히 하나 — "브로드캐스트가 실제로 그 창에 도착하는가". `getAllWindows()`가 그것을 보장하지만 실행 관측은 없다. `acceptance.md` AC-PANEL-084가 main 절반을 **소스 스캔으로만** 고정하고 엔드투엔드 전달을 주장하지 않는 것이 이 분할의 반영이다.

확인된 사슬:

| # | 지점 | 사실 |
|---|---|---|
| 1 | `electron/ipc/project.ts:40-44` | `broadcast()`가 `project:externalFileChange`를 `BrowserWindow.getAllWindows()` — **모든 창**에 보낸다 |
| 2 | `src/store/externalChangeChannel.ts:28-50` | 창 전역 조정 스토어로 dispatch하며 **`change.path`를 현재 문서와 대조하지 않는다** |
| 3 | `src/store/reconciliationStore.ts:39` | 기본 정책이 `autoApplyPolicy` |
| 4 | `shared/reconciliation.ts:192-197` | `decision.kind === 'apply' && !state.isDirty` → `effects: [{kind:'apply-to-buffer', content: change.content}]`. **경로 검사 없이** 내용이 버퍼로 직행 |

**전제 충족**: 다중 창은 이미 출하되어 있다 — `electron/main.ts:103` `onNewWindow`, `shared/ipc-contract.ts:310` `MenuCommand 'newWindow'`, `electron/menu.ts:93` 메뉴 항목(`CmdOrCtrl+Shift+N`).

**귀결**: 창 A가 `a.md`, 창 B가 `b.md`를 열고 창 B의 버퍼가 깨끗할 때, `a.md`에 외부 쓰기가 들어오면 `a.md`의 내용이 창 B의 `b.md` 버퍼에 적용된다. `appStore.filePath`는 여전히 `b.md`이므로 저장 시 **A의 내용이 B의 파일을 덮어쓴다 — 데이터 손실이다.**

**영향 범위 — 초판의 결론은 틀렸다 (감사 지적 D3, 정정)**: 초판은 `!state.isDirty`(`reconciliation.ts:193`)가 dirty 버퍼를 보호한다고 결론했다. **dirty 문서도 오염되며, 손실이 사용자 클릭 한 번만큼 지연될 뿐이다.** §7.3a-3이 그 사슬과 재현을 담는다.

**초판이 실제로 확립한 것의 정확한 범위**: 첫 재현(`[OQ-8/dirty]`)은 **emit 시점의 버퍼 불변**만 관측했고 `pending`을 관측하지 않았다. 그것으로 "dirty 보호"를 결론한 것은 **증거를 넘어선 주장**이었다 — 관측하지 않은 필드에 대해 안전을 주장했다.

### 7.3a-3 결함 A의 두 번째 얼굴 — dirty 문서는 **배너 경유로** 오염된다 (기계 재현)

| 문서 상태 | 오염 시점 | 사슬 |
|---|---|---|
| 깨끗한 문서 | **즉시** | `!state.isDirty` 통과 → `apply-to-buffer` → 버퍼 교체 |
| **dirty 문서** | **배너 동작 경유 (클릭 1회 후)** | notify 분기가 `pending: change`를 심는다(`shared/reconciliation.ts:206`) — 그 `change`는 **다른 경로의** 확정 변경이다. `user-load-from-disk`가 `state.pending.content`를 적용한다(`:251-257`) |

관측 출력 (verbatim):

```
[D3] 배너 상태 = "held-notify"
[D3] pending.path = "/w/a.md"          ← b.md 문서 상태에 a.md의 변경이 심겼다
[D3] emit 직후 버퍼 = "B의 내용\n"      ← 즉시 오염은 없다
[D3] 불러오기 후 버퍼 = "A의 내용\n"    ← 클릭 한 번 뒤 오염된다
```

증거: `.moai/state/verify/goal-spec12345/d3d4-repro.log`, `…/d3d4-repro-source.ts.txt` (§7.3a-1의 증거 지속성 한계가 동일하게 적용된다).

**dirty 경로가 더 나쁠 수 있는 이유**: 사용자에게 `b.md`의 배너가 보이고 사용자는 `b.md`를 불러오겠다고 **명시적으로 동의한다.** 적용되는 것은 `a.md`의 내용이다. SPEC-1 REQ-WS-028의 "사용자 확인"이 **형식적으로 충족된 채 대상이 틀린다** — 확인 없는 손실보다 나쁠 수 있다.

**AC 귀결**: AC-PANEL-080c가 이 사슬을 판정하며, 초판이 그 AC를 "dirty 경로는 오늘 이미 올바르게 동작한다"는 회귀 방어로 적은 것은 **거짓 진술이었다.**

### 7.3d 결함 C — `compositionGate.detach()`가 조합 보류를 영구 latch한다 (기계 재현)

`src/editor/compositionGate.ts:88-93`의 `detach()`는 리스너 2개를 제거하고 `clearPending()`으로 예약된 드레인을 **취소하지만 `sink.onCompositionEnd()`를 호출하지 않는다.** `src/editor/MarkdownEditor.tsx:168-176`의 정리 함수가 그 `detach()`를 호출한다.

```
[D4] 조합 시작 후 composing = true
[D4] detach 후 composing = true        ← 해제되지 않는다
[D4] 이후 조정 상태 = "held-composition"
[D4] 버퍼 = "B의 내용\n"                ← 이후 어떤 외부 변경도 적용되지 않는다
```

**영향 범위는 단계마다 커진다**: 오늘(전역 플래그 1개)은 조합 중 언마운트가 **세션의 모든 조정을 영구 동결**시킨다. M0의 문서별 키잉 후에는 그 문서가, §6.3의 OR 합류가 얹히면 **한 패널의 언마운트가 그 문서를** 동결시킨다.

이것은 REQ-PANEL-055가 실행자에 대해 다루는 **언마운트 무장 해제의 대칭 형태**이며 초판의 어느 요구에도 없었다. REQ-PANEL-071에 detach 해제 의무를 추가하고 AC-PANEL-081b가 판정한다. `compositionGate.ts`의 스케줄러 로직은 PRESERVE 그대로다 — 고치는 것은 detach 시 해제다.

**§6.2c의 OR 방향과의 관계**: OR는 안전 축에서 옳지만 **liveness는 이 결함이 실제로 깨뜨린다** — 한 게이트가 latch되면 다른 게이트의 `compositionend`로는 OR가 결코 false로 떨어지지 않는다.

### 7.3b 결함 B — 전역 조합 플래그 공유 (**확인됨**, v0.2.31 출하 중)

`shared/reconciliation.ts:57`의 `composing`은 `ReconciliationState`의 **단일 boolean**이고 어느 뷰의 게이트든 그것을 쓴다: `src/editor/compositionGate.ts:109`(`composition-start` dispatch), `:112`(`composition-end` dispatch) ← `src/editor/MarkdownEditor.tsx:155`가 뷰의 `contentDOM`에 부착.

패널이 둘이면 **패널 B의 `compositionend`가 패널 A가 아직 조합 중인 동안 플래그를 지운다.** 그 순간 패널 A 문서의 보류가 풀려 조정이 조합 도중 문서를 건드린다.

이것은 `src/editor/compositionGate.ts:9-25`가 **막기 위해 작성된 실패 계열을 한 계층 위에서 재도입하는 것**이다. 그 주석은 `compositionend` 다음에 확정 텍스트를 담은 `input` 이벤트가 별도 태스크로 오므로 그 사이에 문서를 바꾸면 IME의 composing-range 추적이 어긋난다고 기록하고, 연속 조합의 틈을 막기 위해 드레인을 예약·취소하는 구조(`:66-82`)를 만들었다. 플래그가 공유되면 그 방어가 **다른 패널에 의해** 무효화된다. IME 안전 최우선 항목이다.

REQ-PANEL-071이 소유하고 M0이 닫는다. `design.md` §6.2b가 해법 위치를 확정한다 — 상태를 문서별로 키잉하면 `composing` 필드 정의도 전이 로직도 바뀌지 않는다.

### 7.3c 조정 코어의 경로 무지는 **의도된 설계이며 테스트로 고정되어 있다**

두 결함을 고칠 때 반드시 알아야 할 제약이다. `tests/electron/extensionIndependence.test.ts`:

| 위치 | 단언 |
|---|---|
| `:34-40` | `LAYER_FILES` = `electron/changeConfirmation.ts`, `electron/watchScope.ts`, `shared/reconciliation.ts`, `src/editor/minimalDiff.ts`, `src/editor/applyExternalChange.ts` |
| `:42-65` | 각 파일에서 확장자 판독 수단 6종(`extname` 호출 / `endsWith('.'` / 확장자 정규식 / `split('.')` / `isMarkdownFile` / 확장자 리터럴 비교)의 **부재**를 단언 (주석 줄 제외) |
| `:67-73` | 감지 정규식 자체의 감지력을 `electron/fs.ts`(실제 확장자 분기가 있는 파일)로 검증 — 정규식이 전부 오타여도 통과하는 것을 막는다 |
| `:171-174` | `expect(applyExternalChange.length).toBe(2)` — `(target, nextContent)` arity 고정 |
| `:162` 주석 | **"조정 계층은 경로를 아예 받지 않는다 — 그 자체가 확장자 독립의 증거다"** |

즉 SPEC-1은 코어를 의도적으로 경로 무지로 만들고 **경로 라우팅을 위 계층에 남겼다.** 그 계층이 만들어지지 않은 것이 §7.3a·§7.3b의 결함이다. 따라서 SPEC-2의 수정은 코어에 경로를 넣는 것이 아니라 **없는 계층을 만드는 것**이며, 위치는 `design.md` §6.2a가 확정한다(`src/store/` 계층의 `Map` 3종). 코어 5파일은 무변경이다(C-12).

### 7.4 SPEC-1이 남긴 미구현 표면

`docs/v0.3-signoff.md` §6이 SPEC-2에 넘긴 것:
- `open-diff` effect의 **표면 미구현** (`shared/reconciliation.ts:70` `{kind:'open-diff'}`는 방출되지만 `applyExternalChange.ts:128`이 무시)
- `BibliographyResolution.fallback`의 사용자 표시 미구현 (반환값에는 이미 실림 — REQ-WS-056)

### 7.5 pathGuard 신뢰 경계의 구체적 마찰 (D-6)

`electron/pathGuard.ts`:
- `allowSessionPath(absPath)`(`:81-87`): `sessionAllowed`에 파일 자체를, `sessionAllowedTrees`에 **부모 디렉터리 하나**를 넣는다.
- `isAllowedPath`(`:132-152`): `sessionAllowed` 정확 일치 → `sessionAllowedTrees` 하위 → `prefs.workspaceFolders` 하위 → `prefs.recentFiles` 정확 일치 → `prefs.recentFolders` 하위.
- `assertPrefsPatchAllowed`(`:183-`): 렌더러가 `prefs:set`으로 워크스페이스 폴더를 몰래 넣는 것을 막는다.

**따라서**: `X/manuscript/a.md`를 열면 신뢰되는 것은 `X/manuscript/**` 뿐이다. 형제 규약 폴더 `X/scripts/analysis.py`·`X/figures/*`·`X/data/*`·`X/reference/*`는 `X` 자체가 `workspaceFolders` 또는 `recentFolders`에 있어야 접근된다. `X`가 워크스페이스로 등록되는 유일한 경로는 `dialog:openFolder`(다이얼로그)다.

즉 **프로젝트 트리 UI가 다이얼로그 등록 없이는 형제 폴더의 파일을 열 수 없다.** 이것이 SPEC-1 plan.md D-6이 "실사용 마찰이 확인되면 재검토"라고 남긴 지점의 구체적 형태다.

---

## 8. 설계를 제약하는 기존 테스트

기준: `tests/` 199개 파일, `e2e/` 33개 spec (실측: `find tests -name '*.test.ts*' | wc -l` → 199, `ls e2e/*.spec.ts | wc -l` → 33).

| 파일 | 고정하는 불변식 | 다중 인스턴스 시 |
|---|---|---|
| `tests/store/sidebarStore.test.ts` (113줄) | 좌 사이드바 state/actions 전체 + 폭 clamp [180,480] + gitStatus 키잉 | 스토어를 흡수·재작성하면 **전면 깨진다** ⚠️ |
| `tests/store/rightSidebarStore.test.ts` (118줄) | 우 사이드바 기본값(hidden/references/280) + 폭 clamp [200,560] + setter 멱등성 | 동일 ⚠️ |
| `tests/sidebar/sidebarReorg.test.tsx` (317줄) | 좌=3탭(파일/목차/검색), 우=4탭(참고문헌/AI/메모/변경), 배지 표시 규칙 | 탭 구조를 패널로 흡수하면 깨진다 ⚠️ |
| `tests/sidebar/rightSidebar.test.tsx` (293줄) | `visible=false`면 아무것도 렌더하지 않음, 탭 전환 → 스토어 전이 | 동일 ⚠️ |
| `tests/editor/editMode.test.ts` (60줄) | 모드 정확히 3개, 기본 `wysiwyg`, field 부재 시 `typora` 폴백 | 모드 축을 늘리면 첫 케이스가 깨진다 ⚠️ |
| `tests/hooks/useExternalChangeWiring.test.tsx` (165줄) | **"파일이 바뀌면 이전 파일의 감시를 먼저 푼다"**(`:90`), 내용만 바뀌면 재등록 안 함, dirty 전달, 구독/해제 | **패널화의 정면 충돌 지점** — N개 파일 동시 감시는 "이전 것을 푼다"와 양립 불가 🔴 |
| `tests/components/reconciliationBanner.test.tsx` (213줄) | 배너 1개 표면, 모달 부재, 포커스 미이동, `idle`이면 렌더 없음 | 패널당 배너 N개면 "배너 1개" 단언이 깨진다 🔴 |
| `tests/editor/compositionGate.test.ts` (273줄) | 조합 경계 관찰, `compositionend` 지연 드레인, 연속 조합 취소, **전역 조정 스토어와의 배선**(`:170-258`) | 게이트 자체는 인스턴스별이나 배선 단언이 전역 스토어를 전제 🔴 |
| `tests/store/externalChangeChannel.test.ts` | 3갈래 분기(deleted/decodeError/content)가 전역 스토어로 dispatch | path 키잉 도입 시 재작성 ⚠️ |
| `tests/electron/refreshEntryPoint.test.ts` (61줄) | `projectRefresh`가 계약·핸들러·preload·라우터·메뉴 5계층에 존재, `project:*` 전부 `assertAllowedPath` 호출 | 새 IPC 채널도 같은 단언을 통과해야 한다 ✅(제약) |
| `tests/electron/watchScope.test.ts` | `openFiles` 복수 입력, data 역할 1개만 제외, 등록 전 전량 검증 | **이미 복수형** — 깨지지 않는다 ✅ |
| `tests/editor/applyExternalChange.test.ts` | 최소 diff, 캐럿·스크롤 보존, `isolateHistory:'full'` | 뷰별이므로 안전 ✅ |
| `e2e/reconciliation-ime.spec.ts` (6 test) | AC-WS-019/020/020b/021/022/023c — 창 전역 배너 표면 + 단일 에디터 | 셀렉터가 단일 에디터/단일 배너 전제 🔴 |
| `e2e/composition-primitive.spec.ts` | 조합 유지형 프리미티브 자기 검증 | 단일 에디터 전제 ⚠️ |
| `tests/electron/extensionIndependence.test.ts` | 조정 5파일의 확장자 판독 수단 부재(`:42-65`) + `applyExternalChange` arity 2(`:171-174`) | **하드 제약이다** — 라우팅 계층이 이 5파일을 건드리면 즉시 깨진다. 무변경 통과가 C-12의 증거이며 §7.3c가 상세를 담는다 🔒 |
| `tests/editor/reconcileIntegrity.test.ts` | 후행공백·탭·BOM·NFD·제로폭 보존 | 비마크다운 AC가 이 위에 얹힌다 ✅ |

🔴 = 멀티 인스턴스 도입 시 **재작성이 불가피**, ⚠️ = 설계 선택에 따라 깨질 수 있음, ✅ = 안전 또는 제약으로만 작용.

---

### 8.1 `.cm-content` 셀렉터 — 34파일 이관 (명시적 작업)

`grep -rl "cm-content" e2e/ | wc -l` → **34**. 이 파일들은 `.cm-content`를 **창 안 유일 요소로 가정**한다. 패널이 N개가 되면 그 가정이 깨지고, 전역 CSS 규칙(`src/styles/global.css:32`)을 패널 스코프로 좁히려는 어떤 시도도 이 34파일을 먼저 이관하게 만든다(`design.md` §3.2a의 순서 의존).

`plan.md` §B.8이 이것을 M4의 패널 지목 수단과 **같은 작업**으로 묶고, `acceptance.md` AC-PANEL-095가 "유일 요소 가정 셀렉터 0건"을 판정한다. 34는 파일 수 상한이며 실제 이관 대상은 §10 항목 4b의 이유로 그보다 적을 수 있다.

---

## 9. 멀티패널 위험 목록 (전역 싱글턴 / 모듈 변수 / DOM 전역 / window-scoped store)

### 9.1 모듈 수준 가변 변수 (`grep -rn "^let " src`)

| 위치 | 변수 | 멀티패널 충돌 |
|---|---|---|
| `src/store/reconciliationStore.ts:35` | `effectHandler` | **최상 위험.** 두 번째 뷰 등록이 첫 번째를 덮어쓴다 → 외부 변경이 엉뚱한 버퍼에 적용 |
| `src/editor/decorations/table.ts:121` | `pendingFocusCell` | 두 뷰의 표 셀 포커스 예약이 서로를 덮어쓴다 |
| `src/components/tableStylePopoverHost.ts:9-10` | `mountedRoot`, `activeCleanup` | 팝오버 1개만 존재 가능 + `document.body`(`:22`)에 부착되어 뷰 소속 불명 |
| `src/export/renderHtml.ts:188` | `pendingDurumiAttrs` | 두 패널 동시 내보내기 시 속성이 섞인다 |
| `src/store/memoSidecarStore.ts:52` | `saveTimer` | 문서 1개 전제의 자동저장 타이머 |
| `src/i18n/t.ts:15` | `currentLang` | 창 전역이 맞다 — 충돌 아님 |
| `src/editor/decorations/{math,mermaid,frontMatter,codeHighlight}.ts` | `tickCounter`/`seqCounter` | 단조 증가 카운터 — 충돌 아님 |
| `src/editor/math/katexLoader.ts:16`, `src/editor/mermaid/renderer.ts:10`, `src/export/renderMermaid.ts:18`, `src/editor/keymap/emojiAutocomplete.ts:12-13`, `src/editor/decorations/frontMatter.ts:13-14` | 지연 로드 캐시 | 멱등 — 충돌 아님 |
| `src/store/toastStore.ts:35` | `nextId` | 충돌 아님 |
| `src/editor/ai/ghostText.ts:95` | `sessionTriggerCount` | 세션 단위 — 충돌 아님 |

### 9.2 window-scoped zustand 스토어

| 스토어 | 문서/패널 축 | 위험 |
|---|---|---|
| `appStore` (`src/store/appStore.ts:7-37`) | 없음 — `filePath`/`content`/`isDirty`/`editMode` 전부 단수 | **최상.** 문서 상태 모델 전체가 재설계 대상 |
| `reconciliationStore` (`:24-33`) | 없음 | **최상.** §7.3 |
| `memoSidecarStore` (`:29-51`) | `docPath` 1개 | 두 원고 동시 열기 시 메모 오배치 |
| `bibliographyStore` (`:56-`) | `filePath` 1개 + `bindToDocument` | 두 원고가 서로 다른 `.bib`를 가리키면 표현 불가 |
| `sidebarStore` (`:6-24`) | `activeHeadingLine`이 "그 에디터"의 캐럿 | 목차 하이라이트 귀속 미정의 |
| `rightSidebarStore` (`:12-21`) | 없음 (탭 UI 전용) | 메모/변경/참고문헌 탭 내용이 활성 원고 패널에 종속되어야 한다 (EPIC §3) |
| `memoPanelStore`, `toastStore`, `aiUsageStore` | 없음 | 창 전역이 맞다 — 충돌 아님 |

### 9.3 DOM 전역 접근 (`document.*`)

| 위치 | 형태 | 위험 |
|---|---|---|
| `src/components/tableStylePopoverHost.ts:22` | `document.body.appendChild(root)` | 뷰 소속 불명 팝오버 |
| `src/editor/decorations/linkInteract.ts:253` | `document.querySelectorAll('.cm-link-context-menu').forEach(n=>n.remove())` | **모든 뷰의** 링크 컨텍스트 메뉴를 지운다 |
| `src/editor/decorations/linkInteract.ts:301` | `document.body.appendChild(menu)` | 동일 |
| `src/components/sidebar/ReferencesTab.tsx:79` | `document.querySelector<HTMLElement>(…)` | 사이드바 내부 — 낮음 |
| `src/components/ToolbarMenu.tsx:125`, `src/components/Toast.tsx:23`, `src/editor/decorations/table.ts:585` | `document.activeElement` 비교 | 패널 포커스 판정과 얽힌다 |
| `src/hooks/useCustomCss.ts:30` | `document.getElementById('custom-css')` | 창 전역 스타일 — 충돌 아님 |
| `src/main.tsx:9` | `document.getElementById('root')` | 충돌 아님 |

### 9.4 window 전역 이벤트 버스 (발신자 식별 없음)

`durumi:edit-link`, `durumi:open-link-dialog`, `durumi:memo-focus`, `durumi:cm-focus`, `durumi:reference-open`, `durumi:memo-panel-toggle` — 발신·수신 위치는 §4.3 표. **6개 이벤트 전부 payload에 발신 뷰 식별자가 없다.**

### 9.5 main 프로세스 측

| 위치 | 형태 | 위험 |
|---|---|---|
| `electron/ipc/project.ts:36` | `let service` — 프로세스 전역 `ExternalWatchService` 1개 | 창이 여러 개면 하나의 서비스가 모든 창의 파일을 소유한다. `owned` Set이 경로 기준이라 **창 귀속 정보가 없다** |
| `electron/ipc/project.ts:40-44` | 모든 창에 브로드캐스트 | §7.3a 확인된 결함 A의 1단계. M0은 이 범위를 **바꾸지 않고** 렌더러 측 경로 대조로 닫는다 (`design.md` §6.2a 기각 대안 3) |
| `electron/pathGuard.ts:63-64` | `sessionAllowed`/`sessionAllowedTrees` 프로세스 전역 Set | 의도된 설계 — 충돌 아님 |

---

## 9.6 SPEC-2 범위 밖 — SPEC-3이 고쳐야 할 신뢰 경계 위험 (기록만)

> 오케스트레이터가 코드 직독으로 확인한 항목이며 **SPEC-2로 범위화하지 않는다.** SPEC-3(CLI 에이전트 어댑터)이 프로세스 실행 경로의 신뢰 경계를 다룰 때 함께 고쳐야 하므로 여기 기록한다.

`electron/ipc/pandoc.ts:38-42` `pandoc:setCustomPath`:

```
ipcMain.handle('pandoc:setCustomPath', async (_e, customPath: string) => {
  await setPreferences({ pandocPath: customPath });   // ← prefs:set을 거치지 않는다
  clearPandocCache();
  return detectPandoc(customPath);                    // → probe → runProcess → spawn
});
```

두 가지가 겹친다:

1. **`assertPrefsPatchAllowed` 우회**: 렌더러가 준 문자열이 `setPreferences`로 **직접** 들어간다. `prefs:set` 채널을 거치지 않으므로 `electron/pathGuard.ts:183-215`의 패치 검증이 적용되지 않는다. 게다가 그 검증은 `workspaceFolders` / `recentFiles` / `recentFolders` **세 필드만** 검사하므로, `pandocPath`는 `prefs:set`을 거쳤더라도 검증 대상이 아니다.
2. **실행으로 이어진다**: 저장된 경로가 `detectPandoc` → `probe` → `runProcess` → `spawn`으로 흘러 **렌더러가 지정한 임의 바이너리가 실행 가능**해진다.

`EPIC-V03-WORKSPACE.md` §6의 불변식("모든 외부 프로세스 실행은 main에서만")은 지켜지고 있으나, **무엇을 실행할지를 렌더러가 정한다**는 축은 그 불변식이 다루지 않는다. SPEC-3이 에이전트 프로세스 spawn을 도입할 때 같은 계열의 경로를 여럿 만들게 되므로, 그 SPEC에서 (a) 실행 대상 경로의 신뢰 검증, (b) `pandocPath` 같은 실행 대상 prefs 필드를 `assertPrefsPatchAllowed`의 검사 범위에 넣을지, 두 가지를 함께 결정하는 것이 자연스럽다.

**SPEC-2가 이것을 고치지 않는 이유**: 패널 셸은 프로세스를 실행하지 않는다. 이 결함은 멀티패널로 악화되지도 완화되지도 않으므로 SPEC-2의 어느 요구사항에도 걸리지 않는다. 범위에 넣으면 `spec.md` C-4(신뢰 모델 완화 금지)와 무관한 표면을 SPEC-2가 재작성하게 된다.

---

## 9.7 오케스트레이터 확인 사실 — 설계에 직접 반영된 항목

독립 조사에서 확인되어 이 SPEC의 설계·제약에 반영된 항목이다. 재도출하지 않는다.

| 사실 | 근거 | 반영 위치 |
|---|---|---|
| 조정 코어 5파일의 경로 무지 + `applyExternalChange` arity 2가 테스트로 고정 | `tests/electron/extensionIndependence.test.ts:34-40, 42-65, 171-174, :162` | `spec.md` C-12 / REQ-PANEL-072, `design.md` §1 F6·§6.2a, `plan.md` §A.5 |
| 모드→extension 매핑이 6줄 함수 하나 (`mode === 'markdown' ? [] : liveDecorations`) | `src/editor/MarkdownEditor.tsx:51-57` | `design.md` §1 F7·§5.1 — 파일 종류 축의 자연스러운 확장 지점 |
| `liveDecorations`는 **43항목** 평면 배열 (오케스트레이터 브리핑의 44는 1 초과 — 배열 리터럴 `:32`, 닫는 `];` `:76`, 원소 줄 33~75) | `src/editor/decorations/index.ts:32-76` | `design.md` §5.1 — 통째로 넣거나 빼는 입도가 REQ-PANEL-042와 일치 |
| `@codemirror/language-data ^6.5.2`가 이미 직접 의존성이며 현재는 펜스 코드블록 중첩 파싱(`MarkdownEditor.tsx:8, 93-106`)과 지연 하이라이트 로딩(`src/editor/decorations/codeHighlight.ts:4, 31`)에만 쓰인다 | `package.json:39` | `spec.md` REQ-PANEL-041 / C-11 — 언어별 패키지 불필요 |
| `.cm-content`가 전역 CSS(`global.css:32`)와 뷰별 테마(`theme.ts:10-15`) 양쪽에서 스타일링되고 양쪽 모두 `padding:32px 64px; max-width:800px; margin:0 auto`. 전역이 문서 전체에 걸리므로 좁은 보조 패널이 원고 측정폭을 상속한다 | 위 두 위치 | `spec.md` C-13, `design.md` §1 F8·§3.2a |
| `.cm-content`를 참조하는 e2e 파일 **34개** (`grep -rl "cm-content" e2e/ \| wc -l` → 34) — 유일 요소 가정 | e2e 트리 | `spec.md` C-13, `plan.md` §B.8, `acceptance.md` AC-PANEL-095 — 명시적 작업 항목 |
| 레이아웃은 순수 flexbox 3형제 1행이고 패널 폭은 인라인 스타일, CSS는 `flex-shrink:0` + chrome만. grid·absolute 없음 | `src/App.tsx:122-188`, `src/components/Sidebar.tsx:83`, `src/components/RightSidebar.tsx:102`, `src/styles/global.css:345-388, 1047-1104` | `design.md` §1 F5·§3.3 — OQ-1 후보 1 권고의 근거 |
| `Preferences`에 `sidebar`(`:37`) / `rightSidebar`(`:53`) / `memoPanel`(`:65`) geometry 각 1개뿐. 패널 집합·분할 비율·패널별 경로 슬롯 **없음** | `shared/ipc-contract.ts` | `plan.md` §A.2 **OQ-9** (신규 미해결 결정) |
| `memoSidecarStore.loadFor`가 재바인딩 전에 이전 문서의 dirty 사이드카를 `await memoSidecarWrite(prev.docPath, prev.sidecar)`로 플러시 | `src/store/memoSidecarStore.ts:30, 70-84` | `spec.md` REQ-PANEL-062 후단, `acceptance.md` AC-PANEL-062b, `plan.md` §D |
| `useMenuCommandRouter.ts:98`의 `const view = editorViewRef.current`가 ~20개 분기의 유일한 에디터 해소 지점. 포커스 질의도 패널 정체성도 없다. `:243`은 `durumi:open-link-dialog`를 `window`에 브로드캐스트 | 해당 라인 | `research.md` §4.3, `plan.md` §A.2 OQ-4 |
| CodeMirror `StateField` 계열은 이미 패널별: `editModeField`(`editMode.ts:28`), `docPathField`(`docPath.ts:17`), `focusModeField`/`typewriterModeField`(`viewModes.ts:21, 33`), `history()`(`MarkdownEditor.tsx:89`)의 별개 undo 스택 | 각 위치 | `design.md` §2.1a — 보존 대상, `plan.md` §A.5 PRESERVE |
| `pandoc:setCustomPath`가 `prefs:set`을 우회해 `setPreferences({pandocPath})` 후 spawn까지 흐른다 | `electron/ipc/pandoc.ts:38-42`, `electron/pathGuard.ts:183-215` | **§9.6 — SPEC-3 소관, SPEC-2 범위 밖** |

---

## 9.8 외부 검토 결과 — **2인 수렴** (3인이 아니다)

codex와 grok이 독립적으로 read-only 검토했다. **gemini는 참여하지 못했다** — `IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals`(Antigravity로 리디렉트되며 CLI 없음). **3인 수렴으로 과장하지 않는다.**

### 9.8a 독립 확증된 것

| 항목 | 확증 내용 |
|---|---|
| 결함 A 사슬 형태 | 검토자 2인이 **독립적으로 소스에서 확인**했다 — `electron/ipc/project.ts:40-44` → `src/store/externalChangeChannel.ts:28-50` → `shared/reconciliation.ts:192-197` |
| **M0 순서** | 2인 모두 **라우팅 수정이 멀티패널이 그 도달 범위를 곱하기 전에 착륙해야 한다**고 진술. §7.3a의 M0 우선 배치가 독립 확증되었다 |
| dual-open 위험 | 2인 모두 `design.md:57`의 "1개 문서를 N개 뷰가 공유"가 CM6가 하지 않는 일이며, 오늘의 전파가 **문서 전체 교체**(`src/editor/MarkdownEditor.tsx:177-182`)이므로 동기화 프로토콜 없는 dual-open보다 **금지가 더 안전**하다고 결론 |
| 동의 배너 기각 | 2인 모두 렌더러 배너 경유 승격은 "자동 편입에 라벨을 붙인 것"이라고 같은 논거로 기각 |
| revision 파생 dirty | 2인 모두 또 하나의 가변 boolean 대신 `currentRevision !== savedRevision` 파생을 권고 |
| 읽기/쓰기 신뢰 축 분리 | 2인 모두 원리적으로 옳은 장기 모델이라고 진술 (SPEC-2 범위 밖 확정) |

### 9.8b 검토가 **내 논거를 정정**한 것 (결론은 유지, 근거 교체)

| 내 초판 주장 | 정정 | 반영 |
|---|---|---|
| "통합 그리드가 폭 SSOT를 스토어에서 CSS로 새어 나가게 한다" | **틀렸다.** grid track도 `WIDTH_BOUNDS` 파생 인라인 폭을 받을 수 있어 스토어 계약이 보존된다 | `design.md` §3.1 철회 표 + §3.3 표에 취소선 |
| "사이드바 테스트 841줄이 깨지므로 (1)이 옳다" | 위 잘못된 전제에서 파생된 수치이며 **아키텍처 논거가 아니다.** 테스트 개수는 설계 근거가 될 수 없다 | `design.md` §3.1 — 논거를 **소유권 분리**로 교체. C-10에 "회귀 검사이며 논거가 아니다" 명시 |
| "채널 분리만으로 오용이 표현 불가능해진다" | **틀렸다.** preload가 두 채널을 노출하는 동안 렌더러 버그가 잘못된 채널을 호출할 수 있다. 성질은 (분리 + main 검증 + import 부재) **3겹**이 만든다 | `design.md` §7.2, REQ-PANEL-044, AC-PANEL-044b |
| "(B)/(C)는 문서 좌표 접기 전제를 건드려 SPEC-1이 닫은 조정 AC를 재검증 대상으로 만든다" | **과장이었다.** `applyExternalChange.ts:51-52` 주석이 이미 이 모델을 기술하고, `tests/editor/reconcileIntegrity.test.ts:90-97`이 CRLF 호환성을 **이미 green으로** 증명한다 | `design.md` §7.2b, REQ-PANEL-048 |
| 후보 2(동의 배너)를 "기존 승격 경로 재사용"으로 판단 | **틀렸다.** 재사용되는 것은 승격의 *결과*이고 *트리거*는 렌더러가 통제하는 클릭이다 | `design.md` §8.3, REQ-PANEL-036b |

### 9.8c 검토가 **과소 산정을 지적**한 것

| 지적 | 내용 | 반영 |
|---|---|---|
| OQ-1의 실제 비용 | CSS가 아니라 **사이드바 데이터 재배선**이며 (1) 아래에서 **필수**다 — `Sidebar`/`RightSidebar`의 스칼라 `content`/`view`(`src/App.tsx:124-127`, `:163-166`), 목차·인용·검색 히트(`:129-142`) | REQ-PANEL-065, AC-PANEL-065, `plan.md` M2, `design.md` §3.1a |
| `RightSidebar` 귀속 (codex) | **"활성 원고 패널"이며 "가장 왼쪽 패널"이 아니다** — 레이아웃 순서가 데이터 소유권을 결정하면 재배치 시 서지·메모가 조용히 다른 원고를 가리킨다 | AC-PANEL-065가 패널 순서와 귀속을 **의도적으로 어긋나게** 배치해 판정 |
| 저장 경로 누락 3곳 | `file:saveAs`도 동일 migrate(`electron/ipc/files.ts:78-112`), Save As 마크다운 필터 하드코딩(`:92-97`), 닫기 시 저장 라우팅(`src/hooks/useAppCloseGuard.ts:26-33`) | REQ-PANEL-044a, AC-PANEL-044c, `plan.md` M6 |

### 9.8d 검토가 **발견한 신규 위험** (코드 직독 등급)

**저장의 await 창 — 낡은 내용 저장 + 무조건 clean 표시** (codex 발견, 오케스트레이터·내가 소스 확인):

| 진입점 | 형태 |
|---|---|
| `src/hooks/useFileMenuCommands.ts:51-64` | 클로저 `content` 캡처 → `await window.api.fileSave(...)` → `await useMemoSidecarStore…saveIfDirty()` → **무조건** `markClean()` |
| `src/hooks/useAppCloseGuard.ts:24-33` | `state.content` 캡처 → `await window.api.fileSave(...)` → `markClean()` |

**내가 소스를 읽어 추가로 확인한 것**: 진입점이 **둘**이다(codex는 첫 번째를 지적). 두 번째는 §9.7의 저장 채널 라우팅 대상과 **같은 함수**이므로 M6과 M1이 같은 함수를 손댄다 — 조율이 필요하다.

**검증 등급**: 코드 직독 확인이며 **재현하지 않았다.** 결함 A(기계 재현)와 등급이 다르고 조합 플래그(§7.3b)와 같은 등급이다. §10의 등급 표 참조.

**해소**: REQ-PANEL-015의 revision 파생 dirty가 **무료로 닫는다** — `markClean()`이라는 명령형 선언 자체가 사라지기 때문이다. 별개 SPEC으로 넘기지 않는다(`design.md` §2.3).

---

## 9.9 재바인딩 시 라우팅 키 미갱신 — M0 설계 공백 (감사 지적 D1, 코드 직독)

| 사실 | 근거 |
|---|---|
| 상위가 `key` prop을 주지 않는다 | `src/App.tsx:153-160` |
| 마운트 effect deps가 `[]`다 | `src/editor/MarkdownEditor.tsx:176` |
| `filePath`를 처리하는 **`[filePath]`-deps effect가 이미 존재한다** | `:74-81` (`[filePath]` deps) — 이 effect는 문서 전환마다 이미 재실행된다 |
| (주의) `:166`은 별개 effect가 **아니다** | `[]`-deps 마운트 effect 안의 마운트 시점 시드이며 `:165` 주석이 `Subsequent changes go through the filePath effect`라고 적는다 |

**따라서 하나의 `EditorView`가 문서를 갈아타며 재사용된다.** 라우팅 등록을 그 `[]`-deps effect에 두면 경로가 첫 마운트에 캡처되어 갱신되지 않고, 파일 전환 후 (a) 새 경로의 변경이 아무 데도 가지 않고 (b) **옛 경로의 변경이 그 패널로 들어온다** — M0이 닫으려는 결함이 다른 형태로 재발한다.

`design.md` §6.2a 초판은 Map의 **위치**만 정하고 **갱신 시점**을 말하지 않았다. REQ-PANEL-070a가 재키잉 의무를, AC-PANEL-080e가 판정을, §6.2a의 **주입된 setter 클로저**가 구현 형태를 담는다 — `registerReconciliationExecutor(view, (h) => setEffectHandlerFor(filePath, h))`는 시그니처를 바꾸지 않고 경로를 클로저에 담으므로 arity 2와 확장자 독립이 모두 유지된다.

**검증 등급**: 코드 직독. 재현하지 않았다 — M0의 RED(AC-PANEL-080e)가 처음 재현한다.

---

## 10. 미검증 항목 (정직한 공백)

### 10.0 검증 등급 표 — 세 등급을 혼동하지 않는다

| 등급 | 의미 | 이 SPEC의 해당 항목 |
|---|---|---|
| **기계 재현** | 실제 모듈을 구동해 결함을 관측했다 | 결함 A 즉시 오염(§7.3a-1), **결함 A dirty 경유 오염 + `pending` 오염(§7.3a-3)**, **게이트 detach latch(§7.3d)** |
| **코드 직독** | 소스를 읽어 형태를 확인했고 실행하지 않았다 | 조합 플래그 공유(§7.3b), 저장 await 창(§9.8d), 사이드카 재바인딩 플러시(§9.7), pandoc 신뢰 우회(§9.6), 재바인딩 시 라우팅 키 미갱신(§9.9) |
| **정적 소스 사실** | 코드에 그렇게 쓰여 있다는 것만 확인했고 그 결과를 관측하지 않았다 | `getAllWindows()` 브로드캐스트가 미등록 창에 전달(§7.3a-2 main 절반) |

AC 본문이 각 결함의 등급을 명시하며(`acceptance.md` 표기 규약), **등급을 올려 적지 않는다.**

1. **테스트 스위트 재실행을 하지 않았다.** 오케스트레이터가 제시한 baseline(199 파일 / 2191 테스트 전부 통과, typecheck·lint exit 0)을 그대로 전제했다. 파일 수 199와 e2e spec 33은 실측했으나 통과 여부·테스트 개수는 실행하지 않았다.
2. ~~**§7.3의 크로스-윈도 버퍼 오적용은 소스 근거 기반 가설이며 실행 재현하지 않았다.**~~ **정정 2 (2026-08-08, 기계 재현)**: 렌더러 절반이 **실제 모듈로 실행 재현되었다** — §7.3a-1의 관측 출력과 증거 경로 2개 참조. 이 항목은 더 이상 미검증 공백이 아니다. **여전히 남는 공백은 정확히 하나**: main 절반(`broadcast()`가 미등록 창에도 전달)의 실행 관측. 이것은 `getAllWindows()`라는 정적 소스 사실로만 확정되어 있고 엔드투엔드 다중 창 실행은 수행되지 않았다(§7.3a-2). `plan.md` OQ-8이 그 공백을 소스 단언(AC-PANEL-084)으로 갈음할 것을 권고하며, 근거는 재현이 **창 하나로** 결함을 실증해 창 축이 원인이 아님을 보였다는 점이다.

2a. **조합 플래그 공유(§7.3b)는 여전히 코드 직독 확정이며 실행 재현 미수행.** 근거는 `shared/reconciliation.ts:57`의 단일 boolean과 `src/editor/compositionGate.ts:109, 112`의 공유 dispatch라는 소스 사실이다. M0의 RED 단계(AC-PANEL-081)가 이 재현을 처음 수행한다. **주의**: 이것은 §7.3d(게이트 detach latch)와 **별개 결함**이다 — 후자는 기계 재현되었고 전자는 아니다. 등급을 함께 올리지 않는다.

2b. **정정 (2026-08-09)**: §7.3a-3(dirty 경유 오염)과 §7.3d(detach latch)는 **기계 재현되었다.** 초판 §10은 두 항목을 코드 직독 등급으로 기재했으나 감사 재현으로 승격되었다 — §10.0 등급 표에 반영했다. **등급을 올린 것은 이 둘뿐이며** 나머지 코드 직독 항목(저장 await 창 / 사이드카 플러시 / pandoc / 재바인딩)은 그대로다.
3. **`RightSidebar.tsx` 내부 구조는 표면만 읽었다** — 탭 렌더링·persist 패턴이 `Sidebar.tsx`와 동형이라는 주석(`global.css:1043`)과 테스트(`tests/sidebar/rightSidebar.test.tsx`) 근거로 판단했다.
4. **`@codemirror/language-data`의 지연 로드 동작을 실행 확인하지 않았다.** 카탈로그가 `LanguageDescription[]`을 제공한다는 것은 `MarkdownEditor.tsx:93-95`의 사용 형태와 `src/editor/decorations/codeHighlight.ts:4, 31`의 지연 하이라이트 로딩 사용에서 추론했다.

4a. **`.cm-content` 측정폭 상속을 브라우저에서 실측하지 않았다.** 전역 규칙(`global.css:32`)이 뷰별 테마(`theme.ts:10-15`)와 동일 값이라는 것과 전역 셀렉터가 문서 전체에 걸린다는 CSS 규칙에서 추론했다. 두 규칙이 같은 값이므로 오늘은 관측 차이가 없고, 문제는 **패널별로 다른 값을 주려 할 때** 드러난다.

4b. **e2e 34파일의 셀렉터가 실제로 어떤 형태인지 개별 확인하지 않았다.** `grep -rl`로 파일 목록만 얻었고 각 파일이 `.cm-content`를 어떻게 쓰는지(단일 가정 정도)는 열지 않았다. AC-PANEL-095가 "유일 요소 가정 셀렉터 0건"을 요구하므로 그 판정은 run 단계에서 파일별로 이루어진다 — 34는 **상한**이며 실제 이관 대상은 그보다 적을 수 있다.
5. **CRLF(issue #11)가 비마크다운 파일에서 더 심각해지는지 정량 확인하지 않았다.** `applyExternalChange.ts:54-58, 79-95`의 주석과 `docs/v0.3-signoff.md` §4의 구조 설명을 근거로 plan.md §A 미해결 결정으로 올렸다.
6. **Windows 경로에서의 패널 동작은 코드 읽기만 했다** — e2e가 macOS 전용이라는 SPEC-1 C-6 제약이 그대로 승계된다.

---

## 10.1 외부 메커니즘 주장 전수 확인 (판 0.3.6, 2026-08-09)

감사 Gap 1의 지적: 이 SPEC은 외부 메커니즘(제3자 패키지·기존 코드 상수·IPC 채널)의 능력을 여러 곳에서 인용하지만 **실제로 대조된 것은 두 건뿐**이었다(`@codemirror/language-data`, `durumi:*` 이벤트). 나머지를 전수 확인했다.

**확인 방법**: 각 주장을 (a) 설치된 패키지 런타임 조회 (b) 소스 직독 (c) 인용 라인 번호 대조 중 해당하는 것으로 검사. 아래 표의 "등급"은 §10.0의 세 등급 체계를 따른다.

| # | 주장 | 인용처 | 실측 결과 | 판정 |
|---|---|---|---|---|
| 1 | `@codemirror/language-data`가 `.py`/`.csv`/`.bib`/`.bibtex`/`.json`/`.yaml` 문법을 공급 | `spec.md` REQ-PANEL-041, `acceptance.md` AC-041 | `.py`→Python · `.json`→JSON · `.yaml`/`.yml`→YAML **존재**. `.csv` **부재**, `.bib`·`.bibtex` **부재**, 카탈로그 143개 언어 전체에서 "bib" 문자열 **0건**. `LaTeX = ["text","ltx","tex"]`, `sTeX = []` | **거짓 — R7.** 요구 자신의 `shall not` 아래서 충족 불가. 판 0.3.6이 `.csv`·`.bib`를 REQ-PANEL-045 폴백으로 이관 |
| 2 | `WIDTH_BOUNDS`가 폭 경계 SSOT이고 **main의 `setPreferences`도 같은 값으로 clamp** | `research.md` §2.1, `spec.md` REQ-PANEL-002, `acceptance.md` AC-PANEL-002c | `shared/prefsValidation.ts:22-26` 정의(`sidebar {180,480}` · `rightSidebar {200,560}` · `memoPanel {220,560}`). 렌더러 3개 스토어가 import(`sidebarStore.ts:2` · `rightSidebarStore.ts:2` · `memoPanelStore.ts:2`). **main 절반도 실재**: `prefsValidation.ts:59-62`의 `NESTED_NUMBERS`가 같은 상수를 쓰고 `sanitizePreferencesPatch`(`:87`)가 `clampInt`(`:76-80`)로 보정하며, `electron/preferences.ts:251`이 그것을 호출 | **참.** 다만 인용이 렌더러 절반에만 걸려 있었다 — main 절반의 근거(`electron/preferences.ts:251` + `sanitizePreferencesPatch`)를 이번에 보강했다 |
| 3 | 열기 다이얼로그 필터가 `['md','markdown','txt']` | `research.md` §4, `spec.md` REQ-PANEL-040 | `electron/ipc/files.ts:34` 축자 일치 | **참** |
| 4 | Save As 필터가 `[{name:'Markdown', extensions:['md']}]` 하드코딩 | `spec.md` §D 표, `plan.md` §B, `design.md` §7 | `electron/ipc/files.ts:96` 축자 일치(인용 범위 `:92-97` 안) | **참** |
| 5 | `project:refresh` 채널이 존재하고 렌더러가 호출 가능 | `acceptance.md` AC-PANEL-036 | 핸들러 `electron/ipc/project.ts:146`, preload 브리지 `electron/preload.ts:38`(`projectRefresh`), 기존 테스트 3파일이 이미 구동 | **참** |
| 6 | 보조 패널에서 배제할 마크다운 전용 확장 9종 | `acceptance.md` AC-PANEL-042, `spec.md` REQ-PANEL-042 | 9종 전부 `MarkdownEditor.tsx`에 실제 심볼로 존재: 라이브 데코레이션(`editModeCompartment`+`decorationsForMode`) · 3-모드(`viewModes`) · `atomicMediaExtension` · `wysiwygEscapeFilter` · `citationAutocomplete` · `citationHoverTooltip` · `headingHintPlugin` · `markdownKeymap` · `EditorView.domEventHandlers({paste,drop})` | **참 — 그러나 불완전.** 아래 #7 |
| 7 | (암묵) 위 9종 열거가 마크다운 결속 항목을 **덮는다** | AC-PANEL-042의 `Then` 형태 | 최상위 실측 **24항목** 중 9종 밖에 `atomicInlineMarksExtension()`(`:120`) · `spellcheckExclusion()`(`:125`) 등 마크다운 결속 항목이 있다. 열거 밖 항목은 **부재를 단언받지 않았다** | **불완전.** 판 0.3.6이 판정을 allowlist로 전환 |
| 8 | extension 배열이 "`:86-148` … 30여 항목" | `research.md` §1.2, §5.3 | `EditorState.create` 는 `:86-148`, **`extensions:` 배열 자체는 `:88-147`**. 최상위 항목 **24**, `markdown()` 중첩 **8**, 합 **32** | **부정확 — 이번에 정정.** "30여"는 중첩까지 셀 때만 맞고 세는 방법을 적지 않았다 |
| 9 | `@codemirror/*` 직접 의존성 목록 | `research.md` §5.2 | `package.json:35-42` 8개(`autocomplete` · `commands` · `lang-markdown` · `language` · `language-data` · `search` · `state` · `view`). **언어별 `lang-*` 패키지는 `lang-markdown` 하나뿐**이므로 C-11의 "개별 패키지 추가 금지"는 오늘 상태와 일관 | **참** |

**측정 기준선 — 워킹 트리가 아니라 커밋 `040df4a`다.** 이 확인을 수행하는 동안 **M0 구현이 같은 파일들을 수정 중이었다**(`src/editor/MarkdownEditor.tsx` 등 4파일 dirty). 첫 측정을 dirty 트리에서 뜨는 바람에 `atomicInlineMarksExtension`·`spellcheckExclusion`의 줄 번호를 각각 2줄·1줄 틀리게 적었고(`:118`/`:124` → 실제 `:120`/`:125`), `git show 040df4a:<path>` 로 재측정해 정정했다. **plan 아티팩트의 모든 인용은 커밋 기준이어야 한다** — 병행 구현이 있는 동안 워킹 트리는 안정된 기준선이 아니다. 이 사건 자체가 §10.1이 존재하는 이유의 실례다.

**측정 시점과 성격**: 위 전부 2026-08-09, 커밋 `040df4a` 기준. #1과 #9는 **설치된 버전에 대한 시점 측정**(`^6.5.2` 등 캐럿 범위이므로 재설치로 달라질 수 있다) — M5 진입 시 재측정한다. #2~#8은 소스 사실이며 코드 변경 시 드리프트한다.

**남는 공백 (이번 확인이 덮지 않은 것)**: `@codemirror/language-data`의 **지연 로드 동작**은 여전히 실행 확인하지 않았다(§10-4 유지) — 확인한 것은 카탈로그가 어떤 확장자를 **주장**하는가이지, 보조 패널을 열 때 실제로 청크가 지연 로드되는가가 아니다. `.bib → LaTeX` 매핑의 **가독성**도 측정하지 않았다(`design.md` §5.3 기각 표에 명시).

---

---

## 11. 참조

- `.moai/specs/SPEC-V03-WORKSPACE-001/{spec,plan,design,research,acceptance}.md`
- `.moai/specs/EPIC-V03-WORKSPACE.md` §2.1, §3, §6
- `docs/v0.3-signoff.md` §4(AC-WS-035 한계), §5(원칙 문서 공백), §6(SPEC-2 계약 표면)
- `docs/DOCUMENT_MODE_PRINCIPLES.md` §0(범위 선언 — 마크다운 문서모드 한정)
- `.moai/project/structure.md` §2(프로세스 경계), §3(IPC 계약), §4(pathGuard)
- `.moai/project/tech.md` §9(CI 커버리지), §13(알려진 결함)

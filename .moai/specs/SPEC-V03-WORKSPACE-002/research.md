---
id: SPEC-V03-WORKSPACE-002
title: "코드베이스 조사 — 멀티패널 셸"
version: "0.1.0"
status: draft
created: 2026-08-08
updated: 2026-08-08
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
  └─ src/main.tsx:9-11        document.getElementById('root') → createRoot
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
| A7 | `src/store/memoSidecarStore.ts:31` `docPath` | 메모 사이드카가 문서 1개에 결속 | 두 원고를 동시에 열면 한쪽 메모가 보이지 않거나 잘못 저장된다 |
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

`src/editor/MarkdownEditor.tsx:86-148` — `EditorState.create({ doc: value, extensions: [ … 30여 항목 … ] })`.

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
| 메모 사이드카 | **전역 1개** (`docPath`) | `memoSidecarStore.ts:31` |
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

**소스 읽기로 도출한 결함 가설 (미검증 — §10 참조)**: `ExternalFileChange`가 모든 창으로 브로드캐스트되고(`ipc/project.ts:40-44`) 렌더러가 `path`를 대조하지 않으므로(`externalChangeChannel.ts:28-50`, `reconciliation.ts` 전체), 창 B에서 깨끗한 버퍼를 들고 있을 때 창 A가 연 파일의 변경 이벤트가 도착하면 `autoApplyPolicy`(`reconciliation.ts:97-100`)가 `apply`를 반환해 창 B의 버퍼가 **창 A의 파일 내용으로 덮어써질 수 있다**. 이는 SPEC-2가 만드는 결함이 아니라 오늘의 다중 창 경로에 이미 존재하는 것으로 보이며, 멀티패널은 이 축을 창에서 패널로 곱한다. 실행 재현은 하지 않았다 — **소스 근거 기반 가설**이다.

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
| `tests/electron/extensionIndependence.test.ts` | 확장자 무관 확정·조정 | 강화될 뿐 깨지지 않는다 ✅ |
| `tests/editor/reconcileIntegrity.test.ts` | 후행공백·탭·BOM·NFD·제로폭 보존 | 비마크다운 AC가 이 위에 얹힌다 ✅ |

🔴 = 멀티 인스턴스 도입 시 **재작성이 불가피**, ⚠️ = 설계 선택에 따라 깨질 수 있음, ✅ = 안전 또는 제약으로만 작용.

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
| `electron/ipc/project.ts:40-44` | 모든 창에 브로드캐스트 | §7.3 결함 가설의 뿌리 |
| `electron/pathGuard.ts:63-64` | `sessionAllowed`/`sessionAllowedTrees` 프로세스 전역 Set | 의도된 설계 — 충돌 아님 |

---

## 10. 미검증 항목 (정직한 공백)

1. **테스트 스위트 재실행을 하지 않았다.** 오케스트레이터가 제시한 baseline(199 파일 / 2191 테스트 전부 통과, typecheck·lint exit 0)을 그대로 전제했다. 파일 수 199와 e2e spec 33은 실측했으나 통과 여부·테스트 개수는 실행하지 않았다.
2. **§7.3의 크로스-윈도 버퍼 오적용은 소스 근거 기반 가설이며 실행 재현하지 않았다.** 확정하려면 창 2개를 띄우고 한쪽 파일을 외부에서 수정하는 재현이 필요하다. plan.md §D에 위험으로 등록하고, 실제 결함이면 SPEC-2가 path 키잉으로 해소하는 것이 자연스럽다.
3. **`RightSidebar.tsx` 내부 구조는 표면만 읽었다** — 탭 렌더링·persist 패턴이 `Sidebar.tsx`와 동형이라는 주석(`global.css:1043`)과 테스트(`tests/sidebar/rightSidebar.test.tsx`) 근거로 판단했다.
4. **`@codemirror/language-data`의 지연 로드 동작을 실행 확인하지 않았다.** 카탈로그가 `LanguageDescription[]`을 제공한다는 것은 `MarkdownEditor.tsx:93-95`의 사용 형태에서 추론했다.
5. **CRLF(issue #11)가 비마크다운 파일에서 더 심각해지는지 정량 확인하지 않았다.** `applyExternalChange.ts:54-58, 79-95`의 주석과 `docs/v0.3-signoff.md` §4의 구조 설명을 근거로 plan.md §A 미해결 결정으로 올렸다.
6. **Windows 경로에서의 패널 동작은 코드 읽기만 했다** — e2e가 macOS 전용이라는 SPEC-1 C-6 제약이 그대로 승계된다.

---

## 11. 참조

- `.moai/specs/SPEC-V03-WORKSPACE-001/{spec,plan,design,research,acceptance}.md`
- `.moai/specs/EPIC-V03-WORKSPACE.md` §2.1, §3, §6
- `docs/v0.3-signoff.md` §4(AC-WS-035 한계), §5(원칙 문서 공백), §6(SPEC-2 계약 표면)
- `docs/DOCUMENT_MODE_PRINCIPLES.md` §0(범위 선언 — 마크다운 문서모드 한정)
- `.moai/project/structure.md` §2(프로세스 경계), §3(IPC 계약), §4(pathGuard)
- `.moai/project/tech.md` §9(CI 커버리지), §13(알려진 결함)

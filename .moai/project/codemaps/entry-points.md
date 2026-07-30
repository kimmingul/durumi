# Durumi — Entry Points 코드맵

애플리케이션이 시작되는 지점, IPC 채널 전량 인벤토리, 메뉴 커맨드, 이벤트 핸들러를 다룬다.

## 1. 프로세스 진입점

| 진입점 | 파일:라인 | 역할 |
|---|---|---|
| 메인 프로세스 부트스트랩 | `electron/main.ts:105` `void app.whenReady().then(async () => {...})` | `BrowserWindow` 생성, IPC 등록, close guard 부착 |
| 윈도우 생성 | `electron/main.ts:46` `async function createWindow(prefsOverride?)` | `webPreferences`(`sandbox: true`/`contextIsolation: true`/`nodeIntegration: false`) 적용 |
| 새 윈도우 | `electron/main.ts:103` `const onNewWindow = () => { void createWindow(); };` | Cmd+Shift+N |
| 앱 라이프사이클 | `electron/main.ts:132` `app.on('activate', ...)`, `:137` `app.on('before-quit', ...)`, `:141` `app.on('window-all-closed', ...)` | macOS dock 재활성화, 종료 훅 |
| 렌더러 부트스트랩 | `src/main.tsx` | React 루트 마운트 |
| 렌더러 셸 | `src/App.tsx:63` `export function App()` | 최상위 컴포넌트, 21개 훅 조립 |
| preload 브리지 | `electron/preload.ts:148` `contextBridge.exposeInMainWorld('api', api)` | 유일한 렌더러↔메인 진입 표면 |
| 에디터 composition root | `src/editor/MarkdownEditor.tsx:81-139` `EditorState.create({...})` | 6단계 확장 계층 조립 |

## 2. IPC invoke 채널 — 66개 전량 (도메인별)

`ipcMain.handle` 등록 총 66개(`grep -rn 'ipcMain\.handle' electron/ | wc -l` 실측, structure.md §3에서 이미 검증). 채널명 실측(`grep -rhozE "ipcMain\.handle\([[:space:]]*'[^']+'" electron/ipc/`) 기준 도메인별 인벤토리:

| 등록 함수(`electron/ipc.ts:2-11`) | 파일 | 채널 수 | 대표 채널 |
|---|---|---|---|
| `registerFilesHandlers` | `electron/ipc/files.ts` | 16 | `file:open`, `file:save`, `file:saveAs`, `file:openPath`, `files:create`, `files:createFolder`, `files:duplicate`, `files:index`, `files:rename`, `files:reveal`, `files:trash`, `fs:listDirectory`, `fs:watchRoot`, `fs:unwatchRoot`, `fs:unwatchAllRoots`, `dialog:pickFile` |
| `registerBibliographyHandlers` | `electron/ipc/bibliography.ts` | 10 | `bibliography:appendEntry`, `:autoSaveAbstract`, `:computePath`, `:ensureFile`, `:find`, `:importFile`, `:readEntries`, `:removeEntry`, `:renameKey`, `:upsertEntry` |
| `registerShellHandlers` | `electron/ipc/shell.ts` | 9 | `image:pickAndSave`, `image:save`, `shell:openExternal`, `window:setTitle`, `dialog:openFolder`, `dialog:confirmDiscard`, `export:file`, `customCss:get`, `ping` |
| `registerPandocHandlers` | `electron/ipc/pandoc.ts` | 7 | `pandoc:detect`, `:detectHomebrew`, `:export`, `:import`, `:installViaHomebrew`, `:pickCustomPath`, `:setCustomPath` |
| `registerAiHandlers` | `electron/ipc/ai.ts` | 6 | `ai:chat`, `:encryptionAvailable`, `:hasKey`, `:keyStatus`, `:setApiKey`, `:verify` |
| `registerPreferencesHandlers` | `electron/ipc/preferences.ts` | 6 | `prefs:get`, `prefs:set`, `macros:get`, `memoSidecar:read`, `memoSidecar:write`, `git:getStatus` |
| `registerReferenceHandlers` | `electron/ipc/reference.ts` | 6 | `reference:download`, `:extractDoi`, `:extractText`, `:open`, `:scan`, `:status` |
| `registerBibliographyFetchHandlers` | `electron/ipc/bibliographyFetch.ts` | 5 | `bibliography:resolveDoi`, `:resolveOrcid`, `:searchCrossref`, `:searchKoreamed`, `:searchPubmed` |
| `registerSearchHandlers` | `electron/ipc/search.ts` | 1 | `search:workspace` |
| (`_shared.ts` — 등록 함수 없음, 재export만) | `electron/ipc/_shared.ts` | 0 | `findOwningRoot`/`isExternalUrlAllowed`/`memoSidecarPathFor`/`readMemoSidecar`/`writeMemoSidecar` 재export(`electron/ipc.ts:13-19`) |

합계 16+10+9+7+6+6+6+5+1 = **66** — `IpcApi` 인터페이스(`shared/ipc-contract.ts:322-757`) 멤버 74개 중 push 8개를 뺀 수(66)와 정확히 일치(structure.md §3 재검증).

## 3. IPC push 채널 — 8개 전량

`IpcApi`의 `on*` 서브스크립션 멤버(`shared/ipc-contract.ts:363-442` 구간 실측):

| 채널(구독 API) | 페이로드 | 발신 트리거 |
|---|---|---|
| `onMenuCommand` | `MenuCommand` | `electron/menu.ts:17` `win?.webContents.send('menu:command', cmd)` — 67회 호출 지점(메뉴 아이템 클릭) |
| `onThemeChanged` | `'light' \| 'dark'` | `electron/ipc.ts:35-38` `nativeTheme.on('updated', ...)` |
| `onFsChange` | `changedPath: string` | 워크스페이스 파일시스템 워처(`electron/ipc/files.ts` `fs:watchRoot` 계열) |
| `onCustomCssChanged` | `css: string` | `electron/customCss.ts` |
| `onGitStatusChanged` | `rootPath: string` | `electron/ipc/files.ts:72` `broadcastGitStatusInvalidated(owningRoot)` (저장 후) |
| `onMacrosChanged` | `Macro[]` | `electron/macros.ts` 설정 변경 시 |
| `onAppRequestClose` | `decide: () => boolean \| Promise<boolean>` | `electron/closeGuard.ts:65` `win.webContents.send('app:requestClose', reqId)` — `app:closeResponse:<id>` 응답 채널과 짝을 이루는 핸드셰이크 |
| `onPandocInstallProgress` | `chunk: string` | `electron/pandoc.ts` Homebrew 설치 진행률 스트리밍 |

모든 구독형 API가 unsubscribe 클로저(`() => void`)를 반환하는 것이 preload의 일관된 계약이다(structure.md §3).

## 4. 네이티브 메뉴 → 렌더러 커맨드 라우팅

`electron/menu.ts`(390줄)가 메뉴 트리를 빌드하고, 모든 클릭이 `send()` 헬퍼(`electron/menu.ts:17`)를 거쳐 `menu:command` 채널로 나간다 — 파일 안에서 `send(`/`click: () => send(`류 호출이 **67건**(`grep -c "send(" electron/menu.ts` 실측).

렌더러 쪽 수신은 단일 지점: `src/hooks/useMenuCommandRouter.ts:58` `export function useMenuCommandRouter(deps): void` — "새 `MenuCommand`를 추가하면 여기에 분기를 추가하고 App.tsx로 되돌아가지 않는다"는 것이 이 훅 docstring의 명시적 계약(`useMenuCommandRouter.ts:46-56` JSDoc, 특히 `:55`)이다.

`MenuCommand` 유니온은 51개 이상의 variant를 갖는다(`shared/ipc-contract.ts:271-308`). 대표 그룹:

| 그룹 | 예시 |
|---|---|
| 파일 | `new`/`newWindow`/`open`/`save`/`saveAs`/`closeWindow`/`openFolder`/`importDocx`/`{type:'newFromTemplate', templateId}`/`{type:'openRecent', path}`/`{type:'openRecentFolder', path}`/`{type:'closeFolder', path}` |
| 편집 서식 | `bold`/`italic`/`code`/`link`/`strikethrough`/`insertTable`/`toggleTask`/`codeBlock`/`{type:'heading', level}` |
| 뷰/모드 | `toggleTheme`/`toggleSourceMode`/`{type:'setEditMode', mode}`/`zoomIn`/`zoomOut`/`zoomReset`/`toggleFocusMode`/`toggleTypewriterMode` |
| 사이드바 | `toggleSidebar`/`toggleRightSidebar`/`showFiles`/`showOutline`/`showSearch`/`quickOpen`/`showMemos`/`showChanges`/`showReferences`/`showAi` |
| CriticMarkup | `cmInsert`/`cmDelete`/`cmSubstitute`/`cmHighlight`/`cmComment` |
| 메모 | `toggleMemoPanel`/`addMemo`/`nextMemo`/`prevMemo` |
| 인용/서지 | `insertCitationFromDoi`/`bulkInsertFromDoi`/`importReferences`/`aiCitationSuggest`/`openCitePalette` |
| AI | `openAiPalette` |
| 내보내기 | `exportHtml`/`exportPdf`/`exportDocx`/`exportLatex`/`toggleExportIncludeComments`/`toggleExportPreserveAnnotations` |
| 설정/기타 | `openMacrosConfig`/`openSettings`/`languageChanged`/`openKeyboardShortcuts` |
| find | `find`/`findAndReplace`/`findNext`/`findPrev` |

## 5. 키보드 단축키 (accelerator 지정 항목)

`electron/menu.ts`의 `accelerator` 필드로 OS 네이티브 단축키가 등록된다. 대표 예(전량은 `menu.ts` 참고): `CmdOrCtrl+N`(new), `CmdOrCtrl+O`(open), `CmdOrCtrl+S`(save), `CmdOrCtrl+Shift+S`(saveAs), `CmdOrCtrl+F`(find), `CmdOrCtrl+B`(bold), `CmdOrCtrl+I`(italic), `CmdOrCtrl+Shift+K`(code), `CmdOrCtrl+K`(insertLink), `CmdOrCtrl+Shift+X`(strikethrough), `CmdOrCtrl+Shift+T`(insertTable), `CmdOrCtrl+Return`(toggleTask), `CmdOrCtrl+Shift+C`(codeBlock), `CmdOrCtrl+Shift+L`(toggleTheme), `CmdOrCtrl+/`(toggleSourceMode), `CommandOrControl+\`(toggleSidebar), `CommandOrControl+Shift+\`(toggleRightSidebar), `CommandOrControl+Shift+E`(showFiles), `CommandOrControl+Shift+O`(showOutline)(`electron/menu.ts:92-247` 구간 실측).

에디터 내부 키맵(단축키가 아닌 CodeMirror `keymap.of(...)` 바인딩)은 별도로 `src/editor/keymap/`(17개 파일)에서 관리되며, 네이티브 메뉴 accelerator와 겹치는 항목(bold/italic 등)은 메뉴 클릭과 CM 키맵 양쪽에서 동일한 헬퍼(`src/editor/keymap/pendingInlineFormat.ts`의 `applyInlineFormat`)로 수렴한다(`src/hooks/useMenuCommandRouter.ts:12` import, `:195-198` 사용례).

## 6. 외부 이벤트 핸들러

| 이벤트 | 파일:라인 | 처리 |
|---|---|---|
| `nativeTheme.on('updated', ...)` | `electron/ipc.ts:32-35` | OS 다크모드 변경 감지 → `theme:changed` 브로드캐스트 |
| `win.on('close', ...)` | `electron/closeGuard.ts:36-66` | `app:requestClose` 왕복, 30초 타임아웃(`:32` `timeoutMs = 30_000`) |
| `app.on('activate'/'before-quit'/'window-all-closed')` | `electron/main.ts:132,137,141` | macOS 표준 라이프사이클 |
| CodeMirror `EditorView.updateListener` | `src/editor/MarkdownEditor.tsx:135-137` | 문서 변경 → `onChange` → `useAppStore.setContent` |
| CodeMirror `EditorView.domEventHandlers({ paste, drop, dragover })` | `src/editor/MarkdownEditor.tsx:127-134` | 이미지 붙여넣기/드롭 처리(`handlePaste`/`handleDrop`) |

---

생성: `/moai project` Phase 9 (codemaps) · 기준 버전 v0.2.29 (HEAD `b3272fd`)

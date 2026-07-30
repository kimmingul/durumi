# Durumi — Data Flow 코드맵

문서 생명주기, 상태관리 경계, 저장 라운드트립, 3-모드 전환, 신뢰 경계 검증 흐름, 그리고 알려진 소스맵 공백을 다룬다.

## 1. 문서 콘텐츠는 두 곳에 산다 — 가드된 동기화

문서 내용은 `useAppStore.content`(`src/store/appStore.ts:9` state 필드, `:38` 초기값)와 CodeMirror `EditorState.doc` 양쪽에 존재하며, 양방향 동기화는 에코 가드로 무한루프를 막는다.

```
                editor → store                          store → editor
┌────────────────────────────────┐        ┌──────────────────────────────────┐
│ EditorView.updateListener       │        │ useEffect([value])                │
│ (MarkdownEditor.tsx:135-137)    │        │ (MarkdownEditor.tsx:155-160)       │
│                                  │        │                                    │
│ if (u.docChanged && onChange)   │        │ if (view.state.doc.toString()     │
│   onChange(u.state.doc          │───────►│     === value) return;  ← 에코 가드│
│     .toString())                │  Prop  │ view.dispatch({ changes: {...,     │
│                                  │        │   insert: value } });              │
└────────────────────────────────┘        └──────────────────────────────────┘
        │                                              ▲
        ▼                                              │
  App.tsx → useAppStore.setContent                appStore.content prop
  (src/store/appStore.ts:45 setContent)          (App.tsx → MarkdownEditor value)
```

`setContent`(`appStore.ts:45`)는 `content !== newContent`일 때만 `isDirty: true`로 마킹한다 — 에디터가 실제로 아무것도 바꾸지 않은 재조정(reconfigure) 호출에서 거짓 dirty를 만들지 않기 위함.

## 2. zustand 8-스토어 경계 (상태 소유권)

| 스토어 | 파일:라인 | 소유 상태 | 영속화 |
|---|---|---|---|
| `appStore` | `src/store/appStore.ts:36` | 편집 모드, 문서 콘텐츠/dirty, 테마 | 없음 |
| `bibliographyStore` | `src/store/bibliographyStore.ts` | 서지 캐시 + CRUD | 없음 |
| `aiUsageStore` | `src/store/aiUsageStore.ts` | AI 사용량 로그 | **유일한 localStorage 사용자**(`durumi.ai.usage.v1`) |
| `memoSidecarStore` | `src/store/memoSidecarStore.ts` | 메모 사이드카(`<doc>.md.comments.json`) 동기화 | 파일(사이드카 JSON), 스토어 자체는 미영속 |
| `sidebarStore` | `src/store/sidebarStore.ts` | 좌측 사이드바(가시성/활성탭/너비) | 없음 |
| `toastStore` | `src/store/toastStore.ts` | 토스트 알림 | 없음 |
| `memoPanelStore` | `src/store/memoPanelStore.ts` | 메모 채팅 패널 UI 상태 | 없음 |
| `rightSidebarStore` | `src/store/rightSidebarStore.ts` | 우측 사이드바(독립 가시성/너비) | 없음 |

8개 스토어 전부 zustand `create()`만 쓰고 `persist`/`devtools` 미들웨어를 쓰지 않는다 — `aiUsageStore`만 예외적으로 자체 로직으로 `localStorage`를 직접 읽고 쓴다. React Context는 i18n(`src/i18n/t.ts:54`)에만 쓰인다.

## 3. 저장 라운드트립 (파일 → 디스크 → 백)

```
사용자 Cmd+S
  │
  ▼
menu:command 'save'  ──► useMenuCommandRouter ──► fileCommands.doSave()
                                                    (src/hooks/useFileMenuCommands.ts:51)
                                                          │
                                                          ▼
                                          window.api.fileSave(filePath, content)
                                                          │  IPC invoke: file:save
                                                          ▼
                                          electron/ipc/files.ts:58-76
                                          ┌──────────────────────────────────┐
                                          │ assertAllowedPath(path)   (:59)  │──► pathGuard 신뢰 판정
                                          │ migratePendingInContent(  (:64)  │──► pending-assets 이미지 참조를
                                          │   content, dirname(path))        │    <docDir>/assets/ 로 재기입
                                          │ writeFileAtomic(path, ...) (:66) │──► tmp write + rename (원자적)
                                          │ allowSessionPath(path)     (:68) │──► 형제 asset 접근 신뢰 등록
                                          │ addRecentFile(path)        (:69) │
                                          │ broadcastGitStatusInvalidated(   │──► onGitStatusChanged push
                                          │   owningRoot)              (:72) │
                                          └──────────────────────────────────┘
                                                          │
                                                          ▼  (main이 재기입된 content를 반환할 수 있음)
                                          useFileMenuCommands.ts:58-60
                                          if (r.content !== undefined && r.content !== content)
                                            setContent(r.content)  ← 렌더러 버퍼 재동기화
                                                          │
                                                          ▼
                                          useMemoSidecarStore.getState().saveIfDirty()
                                          (useFileMenuCommands.ts:63) — 메모 사이드카 강제 플러시
                                                          │
                                                          ▼
                                                    markClean()
```

종료(닫기)는 별도 경로로 가드된다: `electron/closeGuard.ts:27` `attachCloseGuard(win, ipc, opts)`가 `win.on('close', ...)`(`:36`)를 가로채 `app:requestClose` 이벤트를 렌더러로 보내고(`:65`), 렌더러가 Save?/Discard/Cancel을 결정해 `app:closeResponse:<id>`로 응답한다. 응답이 30초(`:32` `timeoutMs = 30_000`) 내에 오지 않으면 `onCancel`이 호출되어 창이 영구 대기 상태에 빠지지 않는다.

## 4. 3-모드 전환 데이터 흐름

내부 3모드(`wysiwyg`/`typora`/`markdown`, `src/editor/editMode.ts:18`)는 UI에 Document/Live/Source로 노출된다(`src/i18n/dict.ts:269-271`). 상태는 두 곳에 이중 기록된다 — `useAppStore.editMode`(`appStore.ts:19,43`)와 CodeMirror `editModeField`(`editMode.ts:28-38`, `StateField`) — 전환은 `Compartment`(`MarkdownEditor.tsx:66` `editModeCompartmentRef`)를 통한다.

```
메뉴/단축키 'toggleSourceMode' or {type:'setEditMode', mode}
        │
        ▼
useMenuCommandRouter → useAppStore.setEditMode(mode)   (appStore.ts:56-59)
        │
        ▼  (React 재렌더, editMode prop 변경)
MarkdownEditor.tsx:170-210  useEffect([editMode])
  1. 캐럿 + 스크롤 스냅샷 (docLen 안전 클램프)         (:178-184)
  2. editModeCompartmentRef.reconfigure(               (:186-189)
       decorationsForMode(editMode))                    ← 'markdown'이면 []
  3. 캐럿 복원 (newDocLen 안전 클램프)                  (:191-196)
  4. 스크롤 동기 복원 + requestMeasure 재적용            (:197-209)
     (위젯 높이가 모드마다 달라 2단계 필요)
```

`decorationsForMode(mode)`(`MarkdownEditor.tsx:46-52`)는 `markdown` 모드에서 `liveDecorations` 전체를 제거해 순수 마크다운 소스만 보여주고, `typora`/`wysiwyg`는 동일한 33개 데코레이션 번들(`decorations/index.ts:32-76`)을 공유한다.

## 5. 신뢰 경계 검증 흐름 (렌더러 → 메인)

렌더러는 신뢰할 수 없는 코드로 취급된다(XSS, 악성 의존성 가능성). 세 가지 독립 검증 게이트가 있다:

### 5.1 경로 신뢰 — pathGuard 4-tier

```
렌더러 IPC 요청(예: durumi-asset://.../assets/img.png)
        │
        ▼
electron/assetProtocol.ts:108-137  registerAssetProtocolHandler()
  - URL에서 p 쿼리파라미터 추출 (percent-decoded)   (:114)
  - isAllowedPath(absPath) 호출                     (:124)
        │
        ▼
electron/pathGuard.ts — 4-tier 신뢰 판정 (:29-54 문서화된 우선순위)
  1. 세션 allowlist (다이얼로그 반환 경로)
  2. 세션-신뢰 디렉터리 트리 (신뢰 파일의 부모, 형제 asset용)
  3. 워크스페이스 폴더 (prefs.workspaceFolders)
  4. 최근 파일/폴더
        │
        ├─ 허용 ──► fs.readFile + MIME 추론 응답        (assetProtocol.ts:129-131)
        └─ 거부 ──► 403 Response + logAssetError        (assetProtocol.ts:124-126)
```

`path.resolve`로 정규화 후 비교하므로 `..` 트래버설은 붕괴하지만, **심볼릭 링크 해석은 의도적으로 생략**된다(비용 대비 수용 가능한 위험으로 문서화, `pathGuard.ts:55-60`).

### 5.2 설정 패치 경로 필드 검증

```
prefs:set IPC 핸들러 (electron/ipc/preferences.ts:11-22)
        │
        ▼ (:16)
assertPrefsPatchAllowed({ workspaceFolders, recentFiles, recentFolders })
  (electron/pathGuard.ts:183-215)
  - 패치에 포함된 workspaceFolders/recentFiles/recentFolders 항목이
    이번 세션 sessionAllowed 멤버십에 있는지 확인
  - 없으면 PathNotAllowedError throw
        │
        ▼ (검증 통과 시)
setPreferences(patch)  — 그 외 필드는 값 도메인 검증 없이 1단계 얕은 병합
  (electron/preferences.ts:235-265)
```

**공백(structure.md §10에서 이미 지적)**: 경로 트래버설 방어(위 흐름)와 값 도메인 검증(숫자 범위/enum 멤버십)은 다른 계층이며, 후자는 `prefs:get` 읽기 시점에 `editor.styles`/`editor.tableStyleFormat` 두 필드만 지연 검증된다.

### 5.3 외부 URL 허용목록

```
shell:openExternal IPC 핸들러 (electron/ipc/shell.ts)
        │
        ▼
isExternalUrlAllowed(rawUrl)  (electron/ipc/_shared.ts:35-56)
  1. javascript:/vbscript:/data:/file: 접두사 즉시 거부 (사전 방어)
  2. new URL(rawUrl) 파싱 실패 시 거부
  3. ALLOWED_PROTOCOLS = {http:, https:, mailto:} (:33) 멤버십 확인
```

### 5.4 CSP (렌더러 정적 방어)

`index.html:5`의 `Content-Security-Policy`: `default-src 'self'; img-src 'self' data: https: durumi-asset:; connect-src 'self' durumi-asset:; style-src 'self' 'unsafe-inline'; script-src 'self'` — 렌더러가 임의 origin에 연결/이미지를 로드하지 못하게 정적으로 제한.

## 6. 알려진 소스맵 계약 공백 (v0.3 최우선 후보)

`docs/DOCUMENT_MODE_PRINCIPLES.md:166-193` §7이 제안하는 양방향 소스맵 계약(`RenderedSpan`, 주석 처리된 경로 `src/editor/renderedSpan.ts (proposed)`)은 **저장소에 존재하지 않는다**(`ls src/editor/renderedSpan.ts` 결과 없음, 2026-07-29 실측). 오늘의 소스↔렌더 매핑은 구성요소별로 제각각이다:

| 구성요소 | 매핑 방식 | 근거 |
|---|---|---|
| 일반 인라인/블록 데코레이션(33개 모듈) | Lezer 구문 트리 노드 오프셋(`node.from`/`node.to`)을 소스 범위로 직접 사용 | `src/editor/decorations/framework.ts:68-92`(`build()` 함수) |
| 원자적 미디어(이미지/링크) | `EditorView.atomicRanges` + `Prec.high` Backspace/Delete 키맵으로 위젯 경계에서 원자적 삭제 강제 | `src/editor/atomicMedia.ts:246` `atomicMediaExtension()` |
| 표 | 유일한 진짜 2-레이어 사례 — `contentEditable` div가 편집 표면이고, 셀 동기화 후 마크다운 소스(EditorState)가 canonical하여 DOM이 그로부터 재도출됨(구조가 바뀌면 위젯 재생성 + 포커스 복원) | `src/editor/decorations/table.ts:27-72` 상단 아키텍처 주석 |

이 공백은 아키텍처적 사실이며, v0.3 진입 전 CodeMirror 6 유지 여부 결정(product.md §9, `.moai/project/db/` 메모리 참고)과 함께 재검토가 필요한 항목이다.

---

## Findings (SPEC 후보 — spec.md/plan.md/acceptance.md 미수정, 보고만)

이 섹션은 `.moai/specs/` 산출물이 아니라, 코드맵 작성 중 관찰된 SPEC-worthy 공백을 manager-spec/사용자에게 보고하기 위한 것이다.

1. **`@mixmark-io/domino`의 직접 소비자가 코드베이스에 없다**(dependencies.md §1). `tech.md:23`가 이를 능동적으로 쓰이는 패키지로 서술하지만 실측 결과 `electron/`·`src/`·`shared/` 어디에도 직접 import가 없다 — `turndown`의 내부 의존성으로 pin되어 있을 가능성이 높다. `tech.md` 표현을 "turndown이 내부적으로 요구하는 전이 의존성으로 추정, 직접 import 없음"으로 조정하거나, 실제로 미사용이라면 제거를 검토할 근거 조사가 필요하다.
2. **`Macro` 인터페이스 중복 드리프트 위험**(structure.md §10에서 이미 지적됨, 회귀 방지 테스트 부재). `shared/ipc-contract.ts:9-13`와 `electron/macros.ts:5` 양쪽 정의에 lockstep 테스트가 없다 — `tests/styles/journalPresets.test.ts`가 `StyleSet`에 대해 하는 것과 동일한 안전장치를 `Macro`에도 추가하는 SPEC을 고려할 만하다.
3. **렌더러 에러 경계 부재**(structure.md §10에서 이미 지적됨). `ErrorBoundary`/`componentDidCatch`/`unhandledrejection` 전무. `PathNotAllowedError` 같은 throw가 가드되지 않은 await 지점에서 unhandled rejection으로 샐 수 있다는 것이 §5.2 흐름에서도 재확인된다 — 저장/설정 패치 IPC 실패 시 사용자에게 보이는 에러 UI가 없을 가능성.
4. **CSP `style-src 'unsafe-inline'` 허용**(`index.html:5`). Mermaid/KaTeX가 인라인 스타일을 요구해 불가피할 수 있으나, 왜 필요한지 문서화된 근거가 코드 주석에 없다 — 보안 리뷰 시 근거를 명시하거나 nonce 기반으로 좁히는 것을 검토할 만하다.

---

생성: `/moai project` Phase 9 (codemaps) · 기준 버전 v0.2.29 (HEAD `b3272fd`)

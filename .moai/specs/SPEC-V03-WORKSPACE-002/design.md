---
id: SPEC-V03-WORKSPACE-002
title: "설계 — v0.3 멀티패널 셸"
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
depends_on: [SPEC-V03-WORKSPACE-001]
tags: "design, multipanel, layout, state-ownership, routing, extension-assembly"
---

# 설계 — SPEC-V03-WORKSPACE-002

> Tier L 산출물. 요구사항은 `spec.md`, 조사된 사실은 `research.md`, 마일스톤과 **미해결 결정**은 `plan.md`가 소유한다.
> 이 문서는 **구조적으로 강제된 것**과 **선택 가능한 것**을 분리한다. 강제된 것은 여기서 확정하고, 선택 가능한 것은 `plan.md` §A의 미해결 결정으로 넘긴 뒤 그 각각의 대가를 여기서 분석한다.
> §2(상태 소유 축)·§4(라우팅)·§6(조정의 문서 축)은 SPEC-3~5가 확장할 구조이므로 Epic 수준 기준선이다.

---

## 1. 이 설계를 강제하는 다섯 가지 사실

설계 자유도는 취향이 아니라 코드에서 나온다. `research.md`가 확인한 다섯 사실이 선택지를 좁힌다.

| # | 사실 | 근거 | 설계에 미치는 강제 |
|---|---|---|---|
| F1 | `new EditorView`는 저장소 전체에 1곳뿐이고 extension 조립도 그 안 1곳뿐이다 | `src/editor/MarkdownEditor.tsx:150`, `:86-148` | 패널화의 **유일한 물리적 지점**이 이 컴포넌트다. 여기를 인스턴스화 가능한 형태로 만들지 않으면 다른 어떤 설계도 성립하지 않는다 |
| F2 | main의 감시·확정은 **이미 경로별**이다 | `electron/ipc/project.ts:151-164`, `electron/externalWatch.ts:67, 76`, `electron/watchScope.ts:32-34` (`openFiles: readonly string[]`) | main 프로토콜을 바꿀 필요가 없다. 병목은 렌더러 한쪽이다 |
| F3 | 렌더러의 조정 계층은 **문서 축이 아예 없다** | `shared/reconciliation.ts:54-62`(state에 path 없음), `:209-268`(path 미비교), `src/store/reconciliationStore.ts:35`(모듈 싱글턴 핸들러) | 문서 축 도입은 선택이 아니라 **정확성 요구**다(REQ-PANEL-051~055) |
| F4 | 편집 모드는 이미 **뷰별 StateField**를 갖고 있고 값만 전역에서 흘러온다 | `src/editor/editMode.ts:26-38` vs `src/store/appStore.ts:19` → `src/App.tsx:78` → prop | 데코레이션 11개 모듈(`research.md` §3.2)은 **손대지 않아도** 패널별 모드가 성립한다. 고칠 곳은 값의 출처 4곳뿐 |
| F5 | 레이아웃은 1차원 flex row 하나이며 사이드바 CSS가 `flex-shrink:0` + 인라인 width를 전제한다 | `src/App.tsx:123-188`, `src/styles/global.css:345-354, 1047+` | 중앙 자식 안에서 분할하면 사이드바 CSS 무변경. 통합 그리드는 그 전제를 전부 다시 써야 한다 |

---

## 2. 상태 소유 축 — 문서와 패널의 분리

### 2.1 왜 분리가 강제되는가

두 가지 사용 흐름이 서로 다른 축을 요구한다:

1. **같은 파일을 두 패널에 열고 서로 다른 부분을 본다** (긴 원고의 서론과 고찰을 나란히) → 캐럿·스크롤은 패널별이어야 한다.
2. **같은 파일을 두 패널에 열고 한쪽에서 고친다** → 내용·미저장 여부는 하나여야 한다. 둘로 갈라지면 저장 시 어느 쪽을 쓸지 정의할 수 없고, 그것은 곧 데이터 손실이다.

두 흐름을 동시에 만족시키는 유일한 배치가 REQ-PANEL-010의 축 분리다:

```
문서(document) — 경로 하나에 하나
├─ 디스크 경로
├─ 버퍼 내용                  ← CodeMirror 문서 인스턴스 1개를 N개 뷰가 공유
├─ 미저장 여부(dirty)
├─ 파일 종류(마크다운 / 보조)
└─ 조정 상태 (status · pending · composing · errorMessage)

패널(panel) — 문서를 참조한다 (N:1 가능)
├─ 편집 표면 인스턴스 (EditorView)
├─ 캐럿 · 선택 · 스크롤
├─ 실행 취소 이력
├─ 표시 모드 (원고 패널만)
└─ 조정 배너 표면 (자기 문서의 조정 상태를 렌더)
```

### 2.2 실행 취소 이력이 패널별인 것은 결정이 아니라 CodeMirror의 성질이다

`history()`는 extension이며 `EditorState`에 붙는다(`MarkdownEditor.tsx:89`). 같은 문서를 두 뷰가 공유하는 CodeMirror 표준 형태에서 각 뷰는 자기 `EditorState`를 가지므로 이력은 자연히 갈라진다. 이를 하나로 합치려면 이력 계층을 문서로 끌어올려야 하는데, `applyExternalChange.ts:24-45`가 `isolateHistory: 'full'`로 조정 경계를 세운 설계가 그 위에 얹혀 있어 재작성 범위가 커진다. **패널별 이력을 수용하고 그 대가를 기록한다**: 패널 A에서 Cmd+Z를 누르면 패널 B에서 한 편집이 되돌아가지 않는다 — 사용자에게는 "각 창이 자기 되돌리기를 갖는다"는 익숙한 모델이다.

### 2.3 dirty를 문서에 매는 것의 함정 (issue #12)

오늘 `appStore.setContent`(`src/store/appStore.ts:54`)는 `isDirty: s.content !== content || s.isDirty` — **sticky**다. 한 번 true가 되면 내용이 원복돼도 false로 돌아오지 않는다. SPEC-1이 issue #12로 등록했고 AC-WS-020b를 재작성하게 만든 결함이다.

dirty를 문서 축으로 옮기면 이 sticky 성질이 **문서마다 복제된다**. 설계 지침: 문서 상태를 새로 만들 때 sticky를 그대로 베끼지 말고, 최소한 **새 구조에 sticky를 재도입하지 않는다**. issue #12 자체의 해소는 범위 밖(`spec.md` §D)이지만, 새 코드가 그 결함을 N배로 늘리는 것은 막는다.

### 2.4 기각된 대안

| 대안 | 기각 근거 |
|---|---|
| **모든 상태를 패널에 둔다** (문서 축 없음) | 같은 파일을 두 패널에 열면 버퍼가 복제되어 저장 시 한쪽이 소실된다. REQ-PANEL-011/012 위반 |
| **모든 상태를 문서에 둔다** (패널은 순수 뷰) | 캐럿·스크롤이 공유되어 두 패널이 같은 곳을 보게 된다. 분할의 목적 자체가 사라진다 |
| **같은 파일의 중복 열기를 금지한다** | 사용 흐름 1을 차단한다. 또한 "이미 열려 있음" 판정을 경로 정규화로 해야 하는데(대소문자·심볼릭 링크) `pathGuard.ts:55-60`이 심볼릭 링크를 의도적으로 해석하지 않으므로 판정이 불완전해진다 |

---

## 3. 레이아웃 모델 — 구조적으로 강제된 부분

### 3.1 확정: 사이드바 상태 모델은 보존된다

REQ-PANEL-002가 요구하는 것은 관측 동작 보존이며, 그 최소 형태는 `sidebarStore`/`rightSidebarStore`의 **state·action·폭 경계를 그대로 두는 것**이다. 근거는 세 가지:

1. 두 스토어의 독립성이 코드에 **선언**되어 있다(`src/store/rightSidebarStore.ts:4-8`).
2. 폭 경계 SSOT가 `@shared/prefsValidation`의 `WIDTH_BOUNDS`이고 main의 `setPreferences`도 같은 값으로 clamp한다(`sidebarStore.ts:26-28`). 스토어를 흡수하면 이 양방향 계약을 다시 세워야 한다.
3. 546줄의 테스트(`tests/store/sidebarStore.test.ts` 113 + `rightSidebarStore.test.ts` 118 + `tests/sidebar/sidebarReorg.test.tsx` 317)가 그 표면을 고정한다. C-10이 이를 깨는 설계를 REQ-PANEL-002 위반으로 규정한다.

### 3.2 확정: persist 소유자를 옮기지 않는다

persist는 오늘 컴포넌트가 소유한다(`src/components/Sidebar.tsx:41-52`, 500ms 디바운스). 패널 배치 persist(REQ-PANEL-006)는 **별개 prefs 키**로 추가하며, 사이드바 persist 경로를 건드리지 않는다. 두 축을 한 저장 경로로 합치면 패널 배치 변경이 사이드바 폭을 다시 쓰게 되어 REQ-PANEL-007을 위반할 여지가 생긴다.

### 3.3 미해결: 패널 컨테이너의 구조

세 후보의 구조적 대가는 `plan.md` §A의 미해결 결정 OQ-1이 소유한다. 여기서는 **F5가 각 후보에 부과하는 비용**만 기록한다:

| 후보 | F5(1차원 flex + `flex-shrink:0` 사이드바)와의 관계 |
|---|---|
| 중앙 영역 분할 | `App.tsx:145`의 `flex:1` 자식 **안**에서 끝난다. `.cm-sidebar`/`.cm-right-sidebar` CSS 무변경. `.cm-host { display:flex; flex-direction:column }`(`global.css:30`)이 패널마다 반복되므로 높이 계산이 각 패널 컨테이너 안에서 닫힌다 |
| 통합 그리드 재작성 | 사이드바의 `flex-shrink:0`·`height:100%`·인라인 `width` 전제와 리사이저의 `flex-shrink:0`(`global.css:380-385`)가 모두 grid track 정의로 이전되어야 한다. 리사이저의 마우스 드래그 로직(`Sidebar.tsx:57-73`)도 `setWidth` 대신 track 크기를 쓰게 되므로 폭 SSOT가 스토어에서 CSS로 새어 나간다 |
| 탭 + 분할 하이브리드 | 위 둘 중 하나를 고른 뒤 그 안에 문서 스택을 얹는 것이므로 **직교하는 결정**이다. 다만 탭을 도입하면 "패널 하나에 문서 N개"가 되어 §2.1의 문서:패널 관계가 1:N에서 M:N으로 바뀌고, REQ-PANEL-013(마지막 참조 패널)의 판정이 "마지막 참조 탭"으로 확장된다 |

**설계 판단**: 세 후보 중 어느 것도 요구사항을 위반하지 않으므로 이 문서가 임의로 고르지 않는다. 다만 F5 + C-10을 함께 보면 **중앙 영역 분할이 기존 계약 재작성을 가장 적게 요구한다**는 것이 구조적 사실이며, 이를 `plan.md` §A OQ-1의 잠정 권고 근거로 넘긴다.

---

## 4. 포커스와 라우팅 모델

### 4.1 확정: 활성 패널은 "마지막 편집 포커스"이며 패널 밖 포커스 이동으로 잃지 않는다

REQ-PANEL-030이 규정하는 형태다. 대안 검토:

| 대안 | 기각 근거 |
|---|---|
| `document.activeElement` 기반 실시간 판정 | 툴바 버튼을 누르는 순간 활성 패널이 사라진다. 오늘도 툴바가 `view.focus()`를 명시 호출해 복구하는 패턴(`useMenuCommandRouter.ts:148-226`의 `view.focus()`)이 있는데, 패널 N개에서는 어느 뷰로 복구할지 알 수 없다 |
| 명시 선택만 (사용자가 패널을 클릭해 "활성 지정") | 편집하려고 클릭하는 것과 활성 지정이 같은 동작이므로 실질적으로 "마지막 포커스"와 같아진다. 추가 UI만 늘고 얻는 것이 없다 |
| 마우스 호버 | 커서가 사이드바를 지나갈 때마다 활성이 바뀐다. 메뉴 커맨드가 예측 불가해진다 |

"마지막 편집 포커스 + 패널 밖 이동으로 불변"은 오늘의 `editorViewRef` 의미론을 **자연스럽게 일반화**한다 — 오늘 그 ref는 "그 하나뿐인 에디터"이고, 내일은 "마지막으로 편집한 에디터"다.

### 4.2 확정: 마크다운 전용 커맨드는 우회하지 않는다

REQ-PANEL-032가 "아무 일도 하지 않는다"를 택한 근거는 대안의 대가가 심각하다는 것이다:

| 대안 | 대가 |
|---|---|
| **아무 일도 하지 않음 + 컨트롤 비활성** (채택) | 사용자가 굵게 버튼을 눌렀는데 아무 일도 안 일어나는 경험. 컨트롤을 비활성화해 사전에 알린다 |
| 마지막 마크다운 패널로 우회 | **보이지 않는 문서를 바꾼다.** 사용자가 `.py`를 보면서 Cmd+B를 누르면 다른 패널의 원고가 조용히 변경된다. 이것은 발견하기 어려운 데이터 오염이며, 이 저장소가 v0.2.19~.28에서 반복한 "조용히 문서를 고치는" 결함 계열과 같다 |
| 오류 토스트 표시 | 정상 상황에 오류를 낸다. `.py`를 보는 중에 서식 커맨드가 없는 것은 정상이다 |

### 4.3 확정: 창 전역 이벤트 버스에 발신자 식별이 필요하다

`research.md` §4.3이 열거한 6개 `durumi:*` 이벤트는 payload에 발신 뷰 식별자가 없다. 패널 N개에서 수신자도 N개가 되면:

- `durumi:open-link-dialog`(`useMenuCommandRouter.ts:243` → `EditorToolbar.tsx:413`): 툴바 N개가 동시에 링크 대화상자를 연다.
- `durumi:edit-link`(`linkInteract.ts:104` → `EditorToolbar.tsx:388`): 어느 뷰의 링크를 고치는지 불명.
- `durumi:memo-focus`(`comment.ts:63` → `useMemoEvents.ts:85`): 어느 문서의 메모인지 불명 → REQ-PANEL-062 위반.

**설계 방향(구조 수준)**: 이벤트 payload에 발신 패널 식별자를 실어 수신 측이 자기 것만 처리하게 한다(REQ-PANEL-034). 대안으로 "이벤트 버스를 없애고 직접 호출로 바꾼다"가 있으나, 이 버스는 CodeMirror 데코레이션(비-React DOM)이 React 계층에 신호를 보내는 유일한 경로이므로 제거는 데코레이션 계층 재작성을 뜻한다 — 범위를 크게 넘는다. 식별자 추가가 최소 변경이다.

### 4.4 미해결: 라우팅 배선의 형태

`useMenuCommandRouter`가 단수 `editorViewRef`를 받는 것(`:34`)과 `useCitationInsertFlow`/`useAiPalette`/`usePickAndInsertImage`/`useMemoCaretFocus`가 같은 ref를 캡처하는 것(`App.tsx:97, 102-103, 119`)은 **5개 지점의 동일한 축**이다. "활성 패널의 뷰를 돌려주는 하나의 접근자"로 대체할지, 각 훅에 패널 인자를 추가할지는 `plan.md` §A OQ-4가 소유한다.

---

## 5. 파일 종류별 extension 조립

### 5.1 확정: 조립 지점은 하나로 유지한다

F1에 따라 조립은 `MarkdownEditor.tsx:86-148` 한 곳이다. 파일 종류가 늘어도 **조립 지점을 늘리지 않는다** — 두 곳에서 조립하면 공통 항목(`history`, `autoPair`, `viewModes`, `makeTheme`, `highlightActiveLine`, `lineWrapping`, `updateListener`, `docPathStateExtension`)이 드리프트한다. `structure.md` §10이 기록한 `StyleSet` 중복과 같은 함정이다.

### 5.2 조립의 3층 구조

`research.md` §5.3의 분류를 그대로 층으로 굳힌다:

```
공통층 (모든 패널)
  history() · 기본 keymap · autoPair() · viewModes() · makeTheme()
  highlightActiveLine() · lineWrapping · updateListener
  editModeStateExtension() · docPathStateExtension()
        │
        ├─ 마크다운층 (원고 패널만)
        │    markdown({base, codeLanguages, extensions:[GFM + 7개 확장]})
        │    editModeCompartment(liveDecorations)
        │    atomicMedia · atomicInlineMarks · wysiwygEscapeFilter
        │    citationAutocomplete · citationHoverTooltip
        │    headingHintPlugin · markdownKeymap
        │    emojiAutocomplete · handlePaste/handleDrop
        │
        └─ 보조층 (보조 패널만)
             언어 문법 (LanguageDescription → @codemirror/language-data)
             (그 외 없음 — REQ-PANEL-042가 마크다운층 전부를 배제)
```

`editModeStateExtension()`을 **공통층**에 두는 것이 미묘하지만 의도적이다: `currentEditMode(state)`(`src/editor/editMode.ts:40-48`)는 field 부재 시 `typora`로 폴백하고, 그 폴백은 레거시 테스트 호환용이다(`:41-47` 주석). 보조 패널에서 field를 빼면 폴백 값이 흘러들어 예측 불가해지므로, field는 항상 등록하고 **컴파트먼트(데코레이션)만** 빼는 것이 안전하다. REQ-PANEL-022가 요구하는 것은 "3-모드가 적용되지 않음"이며 그것은 데코레이션 부재로 달성된다.

### 5.3 언어 문법 조달 — `@codemirror/language-data` 재사용

이미 의존성이며(`package.json:39`) 오늘도 로드된다(`MarkdownEditor.tsx:8, 94` — 마크다운 펜스 코드블록용). 따라서:

- **새 의존성 0개**(C-11 만족).
- 카탈로그는 `LanguageDescription` 배열이므로 확장자로 조회 가능하고, 문법 본체는 지연 로드된다 — 보조 패널을 열 때만 해당 언어 청크를 받는다.
- `.csv`는 카탈로그에 문법이 없을 가능성이 높다. REQ-PANEL-045의 평문 폴백이 이 경우를 정상 경로로 규정한다.

기각된 대안:

| 대안 | 기각 근거 |
|---|---|
| 언어별 개별 패키지(`@codemirror/lang-python` 등) 추가 | C-11 위반. `language-data`가 이미 같은 문법을 지연 로드로 제공한다 |
| 자체 문법 정의 | 유지 비용이 기능 가치를 압도한다 |
| 보조 파일을 평문으로만 열기(하이라이팅 없음) | `EPIC-V03-WORKSPACE.md` §2.1의 (d) "비마크다운 파일 편집 — `@codemirror/language-data`로 즉시 지원"이 CodeMirror 유지 결정의 근거 중 하나였다. 하이라이팅을 포기하면 그 근거를 스스로 무효화한다 |

---

## 6. 조정 계약의 문서 축 — 이 설계의 정확성 핵심

### 6.1 문제의 형태

```
[오늘]
main: 경로별 확정 ──broadcast(모든 창)──► renderer
                                            │  path를 보지 않음
                                            ▼
                              ReconciliationState 1개 (창 전역)
                                            │
                              effectHandler 1개 (모듈 싱글턴)
                                            ▼
                                     EditorView 1개
```

`ExternalFileChange`에는 `path`가 있다(`shared/ipc-contract.ts:246`). `ConfirmedChange`에도 있다(`shared/reconciliation.ts:20`). **읽는 쪽이 없을 뿐이다.**

### 6.2 확정: path를 키로 삼는다

```
[목표]
main: 경로별 확정 ──broadcast──► renderer
                                    │  path로 문서 조회
                                    ├─ 열린 문서 아님 → 폐기 (REQ-PANEL-051)
                                    ▼
                    문서별 ReconciliationState  (path → state)
                                    │
                    문서별 실행자 (path → apply)  (REQ-PANEL-055)
                                    ▼
                        그 문서를 참조하는 패널들의 EditorView
```

세 가지가 함께 성립해야 한다:

1. **상태 키잉** — `ReconciliationState`를 경로별로 보관한다. `reduceReconciliation`은 순수 함수이므로(`shared/reconciliation.ts:209`) 상태 하나에 대한 전이 로직은 **그대로 재사용**할 수 있다. 바뀌는 것은 보관 구조와 라우팅뿐이며, 이는 M2가 상태 기계를 순수 함수로 분리해 둔 설계의 배당금이다.
2. **실행자 키잉** — 모듈 싱글턴(`reconciliationStore.ts:35`)을 경로별 등록으로 바꾼다. 같은 문서를 두 패널이 참조하면 실행자는 문서당 1개면 충분하다(버퍼가 하나이므로).
3. **표면 키잉** — `ReconciliationSurface`를 창 전역 1개(`App.tsx:189`)에서 패널별로 옮긴다(REQ-PANEL-053).

### 6.3 조합(IME) 축은 패널별, 조정 상태는 문서별 — 두 축이 다르다

미묘하지만 놓치면 IME 안전이 깨진다.

- **조합은 패널에서 일어난다.** 게이트는 뷰의 `contentDOM`에 붙는다(`MarkdownEditor.tsx:155`, `compositionGate.ts:101-104`).
- **조정 판정은 문서에 대해 일어난다.** 확정 이벤트는 경로로 온다.

같은 문서를 두 패널이 참조하고 그중 **한 패널에서만** 조합이 진행 중이면? 그 문서에 대한 조정은 **보류되어야 한다** — 조합 중인 뷰의 문서를 바꾸면 그 뷰의 IME가 깨진다(SPEC-1 REQ-WS-022, `pendingInlineFormat.ts:12-32`의 실증). 즉:

> **문서의 조합 여부 = 그 문서를 참조하는 패널 중 하나라도 조합 중이면 true** (논리적 OR)

이것이 REQ-PANEL-054가 "패널별 독립"이라고 말하면서도 문서 축 판정을 요구하는 이유다. 게이트 인스턴스는 패널마다 따로 있고, 그 결과가 문서 상태로 합류한다.

```
패널 A 게이트 ──┐
                ├─ OR ─► 문서 D의 composing
패널 B 게이트 ──┘
```

**기각된 대안**: "조합 중인 패널의 조정만 보류하고 다른 패널은 적용한다" — 같은 문서를 참조하므로 다른 패널에 적용하는 것이 곧 조합 중인 패널의 문서를 바꾸는 것이다. 성립 불가.

### 6.4 배너 N개 동시 표시의 근거

REQ-PANEL-053이 "동시 표시"를 요구하는 이유는 대안이 위험하기 때문이다:

| 대안 | 위험 |
|---|---|
| **패널별 동시 표시** (채택) | 화면이 시끄러워질 수 있다. 다만 배너는 `presentation: 'banner'`/`'status'` 두 형태뿐이고(`shared/reconciliation.ts:116`) 비침습이므로 편집을 막지 않는다 |
| 활성 패널의 배너만 표시, 나머지 대기 | 사용자가 **모르는 상태로 저장한다.** 패널 B에서 외부 변경이 있었는데 배너가 안 보이면 저장 시 그 변경을 덮어쓴다 — REQ-WS-028(사용자 확인 없이 편집 폐기 금지)의 거울상 결함 |
| 창 전역 하나로 합쳐 "N개 파일이 변경됨" | 어느 파일인지 표현하려면 목록 UI가 필요하고, 그 목록의 "차이 보기"는 다시 파일 선택을 요구한다. D-2가 요구한 "배너 + 두 동작"의 단순함이 사라지고, SPEC-4의 승인 표면이 확장할 기반(REQ-WS-029)도 흐려진다 |

**포커스 불변식**: 배너 등장이 활성 패널을 바꾸지 않아야 한다. 오늘의 `ReconciliationSurface`는 이를 이미 지킨다 — 자동 포커스 속성도 프로그램적 포커스 호출도 없고 `aria-live="polite"`만 쓴다(`ReconciliationSurface.tsx:6-13, 46-52`). 패널별로 옮길 때 이 성질을 잃지 않아야 한다.

### 6.5 정책 주입 지점(REQ-WS-029)의 보존

`setPolicy`(`reconciliationStore.ts:29-30, 49`)는 창 전역 1개다. 문서 키잉을 도입하면서 정책을 문서별로 만들면 SPEC-4가 "모든 문서에 승인 정책을 걸기" 위해 N번 주입해야 한다. **정책은 창 단위로 유지하고 상태만 문서별로 키잉한다** — `reduceReconciliation(state, event, policy)`의 시그니처가 이미 정책을 인자로 받으므로(`shared/reconciliation.ts:209-213`) 구조 변경이 필요 없다.

---

## 7. 비마크다운 저장 경로

### 7.1 문제

`file:save`(`electron/ipc/files.ts:58-76`)는 파일 종류와 무관하게 `migratePendingInContent`(`electron/pendingAssets.ts:150-181`)를 거친다. 그 함수는 마크다운 이미지 링크 정규식(`:157`)으로 문자열을 치환한다(`:175-176`). 실제 치환은 `isPendingPath` 통과분에만 일어나므로(`:162`) `.py` 파일이 손상될 확률은 낮지만, **적용 가능한 경로가 구조적으로 열려 있다**(REQ-PANEL-044).

### 7.2 미해결: 저장 경로 분리 vs 게이트 추가

`plan.md` §A OQ-6이 소유한다. 여기서는 두 축의 구조적 차이만 기록한다:

| 방향 | 구조적 성질 |
|---|---|
| 별도 채널(`file:saveRaw` 등) | 변환이 마크다운 채널에만 존재하므로 **표현 불가능성으로** REQ-PANEL-044를 보장한다. 대가: IPC 채널 추가(C-3에 따라 `shared/ipc-contract.ts` 선언 필요) + `tests/electron/refreshEntryPoint.test.ts:52-` 형태의 "모든 채널이 `assertAllowedPath`를 호출한다" 단언 통과 필요 |
| 기존 채널 + 종류 인자 게이트 | 채널 1개 유지. 대가: 게이트를 우회하는 호출이 나중에 추가될 수 있다(관례 의존). SPEC-1이 모달 금지를 타입 union으로 막은 것(`shared/reconciliation.ts:8-12, 116`)과 대조적으로 약한 보증 |

**설계 관찰**: SPEC-1은 반복적으로 "관례가 아니라 표현 불가능성으로 막는다"를 택했다(모달 금지, `NOTICE_PRESENTATIONS`에 `modal` 부재). 같은 원칙을 적용하면 채널 분리가 일관되나, IPC 표면 증가는 실제 비용이므로 사용자 결정에 맡긴다.

### 7.3 확정: 열기 경로의 디코드 실패는 열기를 거부한다

REQ-PANEL-046. `file:openPath`는 오늘 `fs.readFile(path, 'utf8')`(`electron/ipc/files.ts:48`)로 읽는다 — Node의 `utf8` 디코딩은 **잘못된 바이트를 U+FFFD로 대체한다**. 즉 바이너리를 열면 대체 문자로 가득한 버퍼가 만들어지고, 저장하면 **원본이 파괴된다**.

SPEC-1은 조정 경로에서 이미 이 문제를 해결했다: `decodeUtf8Strict`(`electron/externalWatch.ts:54-60`)가 `new TextDecoder('utf-8', { fatal: true })`로 실패를 실패로 남긴다. **열기 경로에도 같은 자세가 필요하다** — 조정은 막아 놓고 열기로 뚫리면 방어가 무의미하다.

기각된 대안: "대체 문자로 열되 읽기 전용으로 표시" — 읽기 전용 상태를 새로 도입해야 하고, 사용자가 실수로 저장 경로를 찾아낼 여지가 남는다. 열지 않는 것이 단순하고 안전하다.

---

## 8. pathGuard 마찰 — 구조 분석 (해소는 미해결 결정)

### 8.1 마찰의 정확한 형태

`allowSessionPath(p)`(`electron/pathGuard.ts:81-87`)는 `p`의 **부모 디렉터리 하나**를 세션 신뢰 트리에 넣는다. `isAllowedPath`(`:132-152`)는 그 트리의 하위를 통과시킨다.

```
X/                          ← 신뢰되지 않음
├─ durumi.project.yaml
├─ manuscript/              ← a.md 를 열면 여기가 신뢰 트리에 들어간다
│   └─ a.md                 ← 열린 파일
├─ scripts/analysis.py      ← ✗ assertAllowedPath 실패
├─ figures/f1.png           ← ✗
├─ data/raw.csv             ← ✗
└─ reference/references.bib ← ✗
```

즉 **프로젝트 트리 UI를 그려도 형제 규약 폴더의 파일을 열 수 없다.** `X`가 신뢰되는 유일한 경로는 `dialog:openFolder`를 통한 워크스페이스/최근 폴더 등록이다.

### 8.2 왜 매니페스트 발견으로 자동 신뢰하면 안 되는가 (D-6 재확인)

`assertPrefsPatchAllowed`(`electron/pathGuard.ts:183-`)는 손상된 렌더러가 `prefs:set`으로 워크스페이스 폴더를 몰래 넣는 것을 막는다. 매니페스트 발견을 신뢰 근거로 삼으면 렌더러가 **자기가 쓸 수 있는 디렉터리에 `durumi.project.yaml`을 심어** 그 트리 전체를 신뢰시킬 수 있다 — 정확히 그 방어가 막고 있는 공격 형태다. SPEC-1 D-6의 근거는 유효하며 이 SPEC은 완화하지 않는다(C-4).

### 8.3 확장 후보의 신뢰 모델 영향 (분석만)

`plan.md` §A OQ-5가 결정을 소유한다. 각 후보가 신뢰 모델에 주는 압력:

| 후보 | 신뢰 모델 압력 |
|---|---|
| 아무것도 하지 않음 (다이얼로그 등록에만 의존) | **0.** 대신 프로젝트 트리 UI가 실사용에서 반쪽이 된다 |
| 매니페스트 발견 시 "이 프로젝트를 워크스페이스로 추가할까요?" 확인 후 등록 | 사용자 동의가 개입하므로 §8.2의 자동 확장 경로가 열리지 않는다. 단 확인 대화상자가 **모달이면 IME 위험**(REQ-WS-049) — 비침습 표면이어야 한다 |
| 프로젝트 루트를 세션 신뢰 트리(Tier 2)에 자동 편입 | **가장 큼.** §8.2의 공격 형태가 성립한다. 이 SPEC의 C-4와 정면 충돌하므로 채택하려면 SPEC-1 D-6의 번복이 필요하다 |
| 열린 파일의 **조상 중 매니페스트가 있는 디렉터리**만 읽기 전용으로 신뢰 | 읽기/쓰기 분리를 pathGuard에 새로 도입해야 한다. `isAllowedPath`가 단일 boolean이므로(`:132`) 구조 변경 범위가 크다 |

---

## 9. 검증 가능성이 설계에 미치는 영향

SPEC-1이 "테스트 하네스 자체가 산출물"이라고 기록한 것과 같은 상황이 두 곳에서 반복된다.

### 9.1 다중 인스턴스 테스트 하네스

오늘 테스트는 단일 인스턴스를 전제한다. `tests/hooks/useExternalChangeWiring.test.tsx:90`이 **"파일이 바뀌면 이전 파일의 감시를 먼저 푼다"** 를 고정하는데, 이는 N개 문서 동시 감시와 양립 불가다. 이 단언은 REQ-PANEL-050에 따라 "**마지막 참조 패널이 닫힐 때** 푼다"로 재작성된다 — 단언을 지우는 것이 아니라 뒤집는 것이며, 그 재작성 자체가 마일스톤의 산출물이다.

### 9.2 IME e2e의 패널 셀렉터

`e2e/reconciliation-ime.spec.ts`의 6개 테스트는 단일 에디터·단일 배너 셀렉터를 쓴다. 패널별 배너(REQ-PANEL-053)를 도입하면 셀렉터가 패널을 지목해야 하고, 그 지목 수단(예: 패널별 테스트 식별자)이 **계약의 일부**가 된다. SPEC-1이 `observeCompositionEnd`를 프리미티브 계약에 포함시킨 것과 같은 이유다: 관측 수단 없이 요구만 쓰면 AC가 공허하게 통과한다.

### 9.3 Windows 검증 공백 (C-7 승계)

e2e는 macOS 전용이다. 패널 레이아웃은 CSS·flex 계산이므로 플랫폼 차이가 작지만, **경로 대조**(REQ-PANEL-051)는 Windows 대소문자·구분자 정규화에 걸린다. `electron/ipc/project.ts:90-93`의 `dirnameOf`가 `/`와 `\` 둘 다 보는 것이 선례다. 경로 대조 로직을 **순수 함수로 분리해 유닛에서 양 플랫폼을 재현**한다 — SPEC-1이 재검사 로직에 쓴 것과 같은 수단이다(`tests/electron/windowsPaths.test.ts` 선례).

---

## 10. 참조

- `spec.md` — 요구사항 46개 (REQ-PANEL-001~064)
- `plan.md` — §A 확정 결정 + **미해결 결정**, §C 마일스톤, §D 위험
- `acceptance.md` — 수용 기준
- `research.md` — 8개 영역 조사 + 멀티패널 위험 목록 + 미검증 항목
- `.moai/specs/SPEC-V03-WORKSPACE-001/design.md` §2(계층 배치), §4(IME 게이트 구조), §6(정책 seam)
- `.moai/specs/EPIC-V03-WORKSPACE.md` §2.1(CodeMirror 유지 4근거), §3(`:90` 활성 원고 패널 종속), §6(불변식)
- `docs/v0.3-signoff.md` §4~§6

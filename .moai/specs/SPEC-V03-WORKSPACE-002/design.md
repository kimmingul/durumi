---
id: SPEC-V03-WORKSPACE-002
title: "설계 — v0.3 멀티패널 셸"
version: "0.3.1"
status: draft
created: 2026-08-08
updated: 2026-08-09
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

## 1. 이 설계를 강제하는 여덟 가지 사실

설계 자유도는 취향이 아니라 코드에서 나온다. `research.md`가 확인한 여덟 사실이 선택지를 좁힌다. F1~F5는 초판, **F6~F8은 오케스트레이터의 독립 조사에서 확인되어 추가**되었다 (`research.md` §9.7).

| # | 사실 | 근거 | 설계에 미치는 강제 |
|---|---|---|---|
| F1 | `new EditorView`는 저장소 전체에 1곳뿐이고 extension 조립도 그 안 1곳뿐이다 | `src/editor/MarkdownEditor.tsx:150`, `:86-148` | 패널화의 **유일한 물리적 지점**이 이 컴포넌트다. 여기를 인스턴스화 가능한 형태로 만들지 않으면 다른 어떤 설계도 성립하지 않는다 |
| F2 | main의 감시·확정은 **이미 경로별**이다 | `electron/ipc/project.ts:151-164`, `electron/externalWatch.ts:67, 76`, `electron/watchScope.ts:32-34` (`openFiles: readonly string[]`) | main 프로토콜을 바꿀 필요가 없다. 병목은 렌더러 한쪽이다 |
| F3 | 렌더러의 조정 계층은 **문서 축이 아예 없다** | `shared/reconciliation.ts:54-62`(state에 path 없음), `:209-268`(path 미비교), `src/store/reconciliationStore.ts:35`(모듈 싱글턴 핸들러) | 문서 축 도입은 선택이 아니라 **정확성 요구**다(REQ-PANEL-051~055) |
| F4 | 편집 모드는 이미 **뷰별 StateField**를 갖고 있고 값만 전역에서 흘러온다 | `src/editor/editMode.ts:26-38` vs `src/store/appStore.ts:19` → `src/App.tsx:78` → prop | 데코레이션 11개 모듈(`research.md` §3.2)은 **손대지 않아도** 패널별 모드가 성립한다. 고칠 곳은 값의 출처 4곳뿐 |
| F5 | 레이아웃은 1차원 flex row 하나이며 사이드바 CSS가 `flex-shrink:0` + 인라인 width를 전제한다 | `src/App.tsx:123-188`, `src/styles/global.css:345-354, 1047+` | 중앙 자식 안에서 분할하면 사이드바 CSS 무변경. 통합 그리드는 그 전제를 전부 다시 써야 한다 |
| F6 | **조정 코어 5파일의 경로 무지는 테스트로 고정된 의도된 설계다** | `tests/electron/extensionIndependence.test.ts:34-40`(`LAYER_FILES`), `:42-65`(확장자 판독 수단 6종 부재 단언), `:171-174`(`applyExternalChange.length === 2`), `:162` 주석 | 라우팅 키를 **그 5파일 안에 넣을 수 없다.** 경로 라우팅은 반드시 위 계층에 산다 — §6.2a가 위치를 확정한다 |
| F7 | 모드→extension 매핑은 6줄 함수 하나이고 `liveDecorations`는 43항목 평면 배열이다 | `src/editor/MarkdownEditor.tsx:51-57` (`mode === 'markdown' ? [] : liveDecorations`), `src/editor/decorations/index.ts:32-76` | 파일 종류→extension 매핑의 **자연스러운 확장 지점이 이미 있다.** 새 아키텍처를 발명할 필요가 없다 |
| F8 | `.cm-content`가 전역 CSS와 뷰별 테마 양쪽에서 스타일링되고 전역이 문서 전체에 걸린다 | `src/styles/global.css:32`, `src/editor/theme.ts:10-15` (양쪽 `padding:32px 64px; max-width:800px; margin:0 auto`) | 좁은 보조 패널이 원고의 800px 중앙 정렬 측정폭을 상속한다. 고치려면 전역 규칙을 패널 스코프로 좁혀야 하고, 그것이 e2e 34파일의 셀렉터 이관을 부른다 |

---

## 2. 상태 소유 축 — 문서와 패널의 분리

### 2.1 왜 분리가 강제되는가

두 가지 사용 흐름이 서로 다른 축을 요구한다:

1. **서로 다른 파일을 나란히 본다** (원고와 분석 스크립트) → 캐럿·스크롤·모드는 패널별이어야 한다. **v0.3에 출하된다.**
2. **같은 파일을 두 패널에 열고 한쪽에서 고친다** → 내용·미저장 여부는 하나여야 한다. 둘로 갈라지면 저장 시 어느 쪽을 쓸지 정의할 수 없고, 그것은 곧 데이터 손실이다. **v0.3에서 금지되고 v0.4로 연기되었다**(REQ-PANEL-011, §2.5).

**흐름 2가 연기되었어도 축 분리는 유지한다.** 축을 합치면 v0.4의 dual-open이 재작성이 되기 때문이며, 이것이 OQ-2 확정의 명시적 조건이다. v0.3에서 문서:패널은 1:1로만 쓰이되 구조로는 1:N을 표현할 수 있게 남는다 — REQ-PANEL-010의 축 분리:

```
문서(document) — 경로 하나에 하나
├─ 디스크 경로
├─ 버퍼 내용                  ← 정본 텍스트 + revision. v0.3은 뷰 1개가 참조 (dual-open 금지)
├─ 미저장 여부 = currentRevision !== savedRevision  (파생값, 가변 플래그 아님 — §2.3)
├─ 파일 종류(마크다운 / 보조)
└─ 조정 상태 (status · pending · composing · errorMessage)

패널(panel) — 문서를 참조한다 (구조상 N:1 가능 / v0.3 사용은 1:1)
├─ 편집 표면 인스턴스 (EditorView)
├─ 캐럿 · 선택 · 스크롤
├─ 실행 취소 이력
├─ 표시 모드 (원고 패널만)
└─ 조정 배너 표면 (자기 문서의 조정 상태를 렌더)
```

### 2.1a 이미 패널 준비가 된 것 — 보존하고 재작성하지 않는다

CodeMirror의 `StateField`는 `EditorState`마다 하나이므로, 뷰를 늘리면 **그 필드들은 공짜로 패널별이 된다.** 다음은 손댈 필요가 없고 손대면 안 된다:

| 상태 | 위치 | 패널별인 이유 |
|---|---|---|
| 편집 모드 | `src/editor/editMode.ts:28` `editModeField` | `StateField` |
| 문서 경로 | `src/editor/docPath.ts:17` `docPathField` | `StateField` |
| 포커스 모드 / 타이프라이터 모드 | `src/editor/viewModes.ts:21, 33` | `StateField` 2개 |
| 실행 취소 이력 | `src/editor/MarkdownEditor.tsx:89` `history()` | extension이 `EditorState`에 붙는다 — **별개 undo 스택은 공짜다. 그러나 버퍼 일관성은 공짜가 아니다** (§2.4a) |
| 캐럿·선택·스크롤 | `EditorState.selection`, `view.scrollDOM` | 구조상 |

**설계 귀결**: 패널화 작업의 실제 표면은 이보다 훨씬 좁다. 고쳐야 하는 것은 **뷰 밖에 있는 것들** — zustand 스토어(문서 상태·조정 상태·메모·서지), 모듈 수준 싱글턴, 창 전역 이벤트 버스, 커맨드 라우터 — 이며 CodeMirror 내부는 이미 맞다. `design.md` §1 F4가 편집 모드에 대해 말한 것이 이 표 전체로 일반화된다.

### 2.2 실행 취소 이력이 패널별인 것은 결정이 아니라 CodeMirror의 성질이다

`history()`는 extension이며 `EditorState`에 붙는다(`MarkdownEditor.tsx:89`). 각 뷰가 자기 `EditorState`를 가지므로 이력은 자연히 갈라진다 — v0.4에서 같은 문서를 두 뷰가 참조하게 되면 그 갈라짐이 그대로 드러난다. 이를 하나로 합치려면 이력 계층을 문서로 끌어올려야 하는데, `applyExternalChange.ts:24-45`가 `isolateHistory: 'full'`로 조정 경계를 세운 설계가 그 위에 얹혀 있어 재작성 범위가 커진다. **패널별 이력을 수용하고 그 대가를 기록한다**: 패널 A에서 Cmd+Z를 누르면 패널 B에서 한 편집이 되돌아가지 않는다 — 사용자에게는 "각 창이 자기 되돌리기를 갖는다"는 익숙한 모델이다. **v0.3에서는 dual-open이 금지되어 이 상황 자체가 도달 불가하므로 대가가 실현되지 않는다**; v0.4의 §2.5 의무 3·4가 이 지점을 다룬다.

### 2.3 dirty를 문서에 매는 것의 함정 (issue #12)

오늘 `appStore.setContent`(`src/store/appStore.ts:54`)는 `isDirty: s.content !== content || s.isDirty` — **sticky**다. 한 번 true가 되면 내용이 원복돼도 false로 돌아오지 않는다. SPEC-1이 issue #12로 등록했고 AC-WS-020b를 재작성하게 만든 결함이다.

dirty를 문서 축으로 옮기면 이 sticky 성질이 **문서마다 복제된다**.

**확정 (OQ-2, 외부 검토 2인 권고 채택)**: 또 하나의 가변 boolean을 나르지 않고 **`currentRevision !== savedRevision`으로 파생한다**(REQ-PANEL-015). 파생값은 sticky일 수 없으므로 issue #12의 형태가 새 구조에 재도입될 여지가 구조적으로 사라진다.

**이 형태가 두 번째 결함도 무료로 닫는다.** 오늘 두 저장 진입점이 같은 형태를 갖는다:

| 진입점 | 형태 |
|---|---|
| `src/hooks/useFileMenuCommands.ts:51-64` | 클로저 `content` 캡처 → `await window.api.fileSave(...)` → `await useMemoSidecarStore…saveIfDirty()` → **무조건** `markClean()` |
| `src/hooks/useAppCloseGuard.ts:24-33` | `state.content` 캡처 → `await window.api.fileSave(...)` → `markClean()` |

**두 await를 건너는 동안 타이핑된 편집이 clean으로 표시된다.** codex가 첫 번째를 발견했고, 오케스트레이터와 내가 소스를 읽어 **진입점이 둘임**을 확인했다.

핵심은 `markClean()`이라는 **"지금을 clean으로 선언하는" 명령형 연산 자체가 결함의 형태**라는 것이다. revision 파생에서 저장은 `savedRevision = <저장을 시작한 시점의 revision>` 대입이 되고, await 창 안의 편집은 `currentRevision`을 올려 부등식이 참으로 남는다. **명령형 선언이 사라지면 낡은 선언도 사라진다.**

따라서 이 결함은 별개 SPEC으로 넘기지 않고 **SPEC-2가 REQ-PANEL-015를 구현하는 부수 효과로 닫는다** — 가장 저렴한 해소다. AC-PANEL-010b가 성질을 고정한다.

**검증 등급 (정직한 구분)**: 코드 직독 확인이며 **재현하지 않았다.** 결함 A(REQ-PANEL-070, 기계 재현)와 등급이 다르고 조합 플래그(REQ-PANEL-071)와 같은 등급이다. `research.md` §10이 세 등급을 표로 구분한다.

### 2.4a 별개 undo 스택은 공짜지만 **버퍼 일관성은 아니다** — 초판의 오류 정정

초판 §2.1a가 `history()`를 "별개 undo 스택이 공짜"로 적고 그 옆의 `design.md:57`이 "CodeMirror 문서 인스턴스 1개를 N개 뷰가 공유"라고 적었다. **두 문장을 나란히 읽으면 dual-open이 거의 공짜라는 인상을 준다. 그것이 외부 검토 2인이 설계를 불완전하다고 판단한 원인이며, 지적은 옳다.**

정정 두 건:

| 위치 | 초판 | 정정 |
|---|---|---|
| `design.md:57` | "CodeMirror 문서 인스턴스 1개를 N개 뷰가 공유" | **CM6는 그런 공유를 제공하지 않는다.** 각 뷰가 자기 `EditorState`를 갖는다 — §2.2가 처음부터 올바르게 적고 있었고 :57이 그것과 모순이었다. **틀린 쪽은 :57이다** |
| §2.1a `history()` 행 | "별개 undo 스택이 공짜" | 별개 **스택**은 공짜다. **버퍼 일관성은 공짜가 아니다** — 그것이 §2.5의 프로토콜을 요구한다 |

**오늘의 전파 경로가 왜 dual-open을 막는가**: `src/editor/MarkdownEditor.tsx:177-182`가 `value` prop 변화에 대해 `changes: {from: 0, to: view.state.doc.length, insert: value}` — **문서 전체 교체**를 dispatch한다. 그 경로 위에서 두 뷰가 같은 문서를 참조하면 패널 A의 키 입력 하나가 패널 B에서 전체 교체가 되어 (a) B의 선택 매핑이 파괴되고 (b) B의 undo에 거대한 항목 하나가 기록된다. **"공유 문서"처럼 보이는 것이 실제로는 "매 키 입력마다 서로를 덮어쓰는 두 문서"다.**

### 2.5 v0.4로 연기된 문서↔뷰 동기화 프로토콜 (다섯 의무)

사용자 결정으로 **v0.3은 dual-open을 금지한다**(REQ-PANEL-011). 이것은 검토자들의 반론을 **우회한 것이 아니라 해소한 것**이다 — 두 검토자 모두 독립적으로 "동기화 프로토콜 없이는 중복 뷰 금지가 더 안전하다"에 도달했다.

**그러나 "문제가 없다"가 아니라 "연기되었다"다.** v0.4가 다섯 의무를 재발견하지 않도록 이름 붙여 남긴다:

| # | 의무 | 없으면 |
|---|---|---|
| 1 | 패널 트랜잭션이 **정본 문서 revision**을 갱신한다 | 어느 쪽이 최신인지 판정 불가 |
| 2 | **정확한 변경**이 형제 뷰로 origin annotation과 함께 미러링되고, 그 뷰들의 **undo에서 제외**된다 | 전체 교체 문제 재발 + 남의 편집이 내 undo에 쌓임 |
| 3 | 각 패널의 자기 undo 항목이 **이후 형제 변경을 통해 매핑**된다 | undo가 엉뚱한 범위를 되돌림 |
| 4 | undo가 사적으로 발산하지 않고 **정본 문서 트랜잭션을 방출**한다 | 두 뷰의 문서가 조용히 갈라짐 |
| 5 | 저장이 정본 revision을 **한 번** clean으로 표시하고 참조 패널 전부가 **같은 전이를 관측**한다 | 한쪽만 clean이 되어 다른 쪽이 미저장으로 남음 |

**dual-open은 전용 interleaving 테스트 없이 출하되어서는 안 된다** — 다섯 의무는 순서 의존적이며, `A 편집 → B 편집 → A undo` 같은 교차 순서에서의 발산은 단일 시나리오 테스트로 잡히지 않는다.

**v0.3이 확장 지점을 열어 둔 방식**: REQ-PANEL-012가 저장을 "문서 단위"로, REQ-PANEL-013이 판정을 "마지막 참조 패널인가"로 표현한다. v0.3에서 두 표현은 1:1이라 자명하게 성립하지만, "패널 단위 저장" / "패널을 닫는가"로 적었다면 v0.4가 재작성이 된다.

### 2.4 기각된 대안

| 대안 | 기각 근거 |
|---|---|
| **모든 상태를 패널에 둔다** (문서 축 없음) | 같은 파일을 두 패널에 열면 버퍼가 복제되어 저장 시 한쪽이 소실된다. REQ-PANEL-011/012 위반 |
| **모든 상태를 문서에 둔다** (패널은 순수 뷰) | 캐럿·스크롤이 공유되어 두 패널이 같은 곳을 보게 된다. 분할의 목적 자체가 사라진다 |
| **같은 파일의 중복 열기를 금지한다** | 사용 흐름 1을 차단한다. 또한 "이미 열려 있음" 판정을 경로 정규화로 해야 하는데(대소문자·심볼릭 링크) `pathGuard.ts:55-60`이 심볼릭 링크를 의도적으로 해석하지 않으므로 판정이 불완전해진다 |

---

## 3. 레이아웃 모델 — 구조적으로 강제된 부분

### 3.1 확정: 중앙 영역 분할 — **논거는 소유권 분리이며 테스트 개수가 아니다**

**결정 (OQ-1, 사용자 승인 + 외부 검토 2인 수렴)**: 중앙 영역 분할. `sidebarStore`/`rightSidebarStore`의 state·action·폭 경계를 그대로 둔다.

**확정 논거**:

> **사이드바는 전역 저작 표면이고 패널은 문서 국소(document-local)다.** 둘을 한 그리드에 넣으면 도킹·재배치 소유권을 공유한다고 시각적으로 주장하게 되는데, 실제로는 공유하지 않는다.

이것이 지속되는 근거다. 사이드바의 탭(파일/목차/검색, 참고문헌/AI/메모/변경)은 **워크스페이스 전체 또는 활성 원고에 대한 작업**이고, 패널은 **특정 문서의 편집 표면**이다. 두 축은 생명주기도 다르다 — 사이드바는 문서가 없어도 존재하고(파일 트리), 패널은 문서 없이 존재할 이유가 없다.

**초판 논거 2건을 철회한다 (외부 검토 2인이 독립적으로 과장이라고 지적, 수용)**:

| 철회 | 왜 틀렸는가 |
|---|---|
| "통합 그리드가 폭 SSOT를 스토어에서 CSS로 새어 나가게 한다" | **틀렸다.** grid track도 `WIDTH_BOUNDS`에서 파생된 인라인 폭을 받을 수 있고, 그러면 스토어의 action·clamp와 main `setPreferences`의 양방향 계약이 그대로 보존된다. 그리드가 본질적으로 SSOT를 옮기지 않는다 |
| "테스트 546줄(또는 841줄)이 그 표면을 고정하므로" | 위 잘못된 전제에서 파생된 수치이며 **아키텍처 논거가 아니다.** 테스트 개수는 설계 선택의 근거가 될 수 없다 |

**유지되는 사실 하나**: 두 스토어의 독립성이 코드에 **선언**되어 있다(`src/store/rightSidebarStore.ts:4-8` — "State is fully independent from `sidebarStore`"). 이것은 논거가 아니라 **위 소유권 분리가 이미 코드에 표현되어 있다는 증거**다.

**사이드바 테스트 무변경 통과(C-10, AC-PANEL-002)는 회귀 검사로서 계속 유효하다** — 다만 그것은 (1)을 고른 *이유*가 아니라 (1)을 고른 뒤의 *검증*이다. 두 역할을 혼동했던 것이 초판의 오류다.

### 3.1a (1)이 공짜가 아닌 지점 — 사이드바 데이터 재배선

외부 검토 2인이 독립적으로 같은 과소 산정을 지적했다: **실제 비용은 CSS가 아니라 사이드바 데이터 재배선이며, (1) 아래에서 필수다.**

| 표면 | 오늘의 형태 |
|---|---|
| `Sidebar` | 스칼라 `content` / `view` prop — `src/App.tsx:124-127` |
| `RightSidebar` | 동일 — `src/App.tsx:163-166` |
| 목차 / 인용 / "검색 히트 → 줄 이동" | `editorViewRef.current` + 50ms `setTimeout` 후 dispatch — `src/App.tsx:129-142` |

CSS는 (1)에서 거의 변하지 않지만 **위 데이터 경로는 전부 "활성 원고 패널"을 향해 다시 배선되어야 한다.** REQ-PANEL-065가 이를 명시적 작업으로, AC-PANEL-065가 판정 기준으로 고정한다 — 패널화의 부수 결과로 처리하지 않는다.

**codex의 정밀 의무**: `RightSidebar`의 귀속은 **"활성 원고 패널"이며 "가장 왼쪽 패널"이 아니다.** 레이아웃 순서가 데이터 소유권을 결정하면 사용자가 패널을 재배치할 때 서지·메모가 조용히 다른 원고를 가리킨다. §7의 활성 원고 패널 축과 일치시킨다.

### 3.1b 번복 조건

(1)은 다음 중 하나가 요구되면 틀린 선택이 된다:

- 사이드바의 **패널 국소 도킹** (사이드바를 특정 패널에 붙이기)
- 사이드바의 **패널별 인스턴스** (패널마다 자기 목차)
- 사이드바까지 포함한 **edge-to-edge 통합 리사이즈** (IDE급 chrome)

**셋 다 SPEC-2의 범위에 없다.** 나중에 하나라도 요구되면 그때 통합 그리드를 재검토한다 — 그 시점에는 위 철회된 논거가 아니라 실제 요구가 근거가 된다.

### 3.2 확정: persist 소유자를 옮기지 않는다

persist는 오늘 컴포넌트가 소유한다(`src/components/Sidebar.tsx:41-52`, 500ms 디바운스). 패널 배치 persist(REQ-PANEL-006)는 **별개 prefs 키**로 추가하며, 사이드바 persist 경로를 건드리지 않는다. 두 축을 한 저장 경로로 합치면 패널 배치 변경이 사이드바 폭을 다시 쓰게 되어 REQ-PANEL-007을 위반할 여지가 생긴다.

### 3.2a `.cm-content` 이중 스타일링 — 좁은 보조 패널의 측정폭 문제 (F8)

`.cm-content`는 두 곳에서 스타일링된다:

```
src/styles/global.css:32   .cm-content { padding: 32px 64px; max-width: 800px; margin: 0 auto; … }
src/editor/theme.ts:10-15  '.cm-content': { caretColor: …, padding: '32px 64px', maxWidth: '800px', margin: '0 auto' }
```

전역 규칙은 문서 전체에 걸리므로, 폭 300px짜리 보조 패널의 `.cm-content`도 **원고용 800px 중앙 정렬 + 좌우 64px 패딩**을 상속한다. 결과는 코드가 좁은 기둥에 갇히는 것이며, `.py` 편집에 부적합하다.

고치는 방향은 전역 규칙을 **패널(또는 파일 종류) 스코프로 좁히는 것**이고, 그 순간 다음이 따라온다: `.cm-content`를 **유일 요소로 가정하는 e2e 파일이 34개**다(`grep -rl "cm-content" e2e/ | wc -l` → 34). 셀렉터를 패널 지목 형태로 이관해야 하며, 이는 부수 효과가 아니라 **명시적 작업 항목**이다(C-13, `plan.md` §C M4 + §B.8, `acceptance.md` AC-PANEL-095).

**설계 판단**: 이 SPEC이 측정폭을 반드시 바꿔야 하는지는 요구사항이 정하지 않는다 — REQ-PANEL-042는 마크다운 전용 *확장*의 부재만 요구하고 CSS 측정폭은 다루지 않는다. 따라서 두 단계로 나눈다: (i) 34파일 셀렉터 이관은 **패널 지목 수단 도입(M4의 계약 산출물)과 같은 작업**이므로 그때 함께 처리한다. (ii) 측정폭 조정 자체는 그 위에서 저비용이 되며, 하지 않아도 기능은 성립한다(좁은 기둥은 미관 문제이고 바이트 무결성과 무관하다). 순서를 뒤집어 측정폭부터 손대면 34파일 이관이 준비되기 전에 e2e가 깨진다.

### 3.3 ~~미해결~~ **확정된** 패널 컨테이너 구조 — F5가 각 후보에 부과한 비용 (기록)

**후보 1(중앙 영역 분할)이 확정되었다** — 논거는 §3.1, 비용은 §3.1a, 번복 조건은 §3.1b. 아래 표는 **기각된 후보들이 F5(1차원 flex + `flex-shrink:0` 사이드바)에 대해 지불해야 했던 비용**의 기록이며, 번복 검토 시 출발점으로 남긴다. **주의**: 이 표의 "폭 SSOT가 CSS로 새어 나간다"는 §3.1이 철회한 주장이므로 아래에서도 정정 표시했다.

| 후보 | F5(1차원 flex + `flex-shrink:0` 사이드바)와의 관계 |
|---|---|
| 중앙 영역 분할 | `App.tsx:145`의 `flex:1` 자식 **안**에서 끝난다. `.cm-sidebar`/`.cm-right-sidebar` CSS 무변경. `.cm-host { display:flex; flex-direction:column }`(`global.css:30`)이 패널마다 반복되므로 높이 계산이 각 패널 컨테이너 안에서 닫힌다 |
| 통합 그리드 재작성 | 사이드바의 `flex-shrink:0`·`height:100%`·인라인 `width` 전제와 리사이저의 `flex-shrink:0`(`global.css:380-385`)가 모두 grid track 정의로 이전되어야 한다. 리사이저의 마우스 드래그 로직(`Sidebar.tsx:57-73`)도 track 크기를 쓰도록 다시 써야 한다. ~~폭 SSOT가 스토어에서 CSS로 새어 나간다~~ — **철회(§3.1)**: track도 `WIDTH_BOUNDS` 파생 인라인 폭을 받을 수 있으므로 SSOT는 스토어에 남을 수 있다. 실제 비용은 리사이저 재작성이며 SSOT 이전이 아니다 |
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

### 5.1 확정: 조립 지점은 하나로 유지하고, 이미 있는 확장 지점을 쓴다

F1에 따라 조립은 `MarkdownEditor.tsx:86-148` 한 곳이다. 파일 종류가 늘어도 **조립 지점을 늘리지 않는다** — 두 곳에서 조립하면 공통 항목(`history`, `autoPair`, `viewModes`, `makeTheme`, `highlightActiveLine`, `lineWrapping`, `updateListener`, `docPathStateExtension`)이 드리프트한다. `structure.md` §10이 기록한 `StyleSet` 중복과 같은 함정이다.

**F7 — 확장 지점이 이미 있다.** 모드→extension 매핑 전체가 6줄 함수 하나다:

```
src/editor/MarkdownEditor.tsx:51-57
function decorationsForMode(mode: EditMode) {
  return mode === 'markdown' ? [] : liveDecorations;
}
```

그리고 `liveDecorations`(`src/editor/decorations/index.ts:32-76`)는 **43항목 평면 배열**이며 전부 마크다운 특화다. 즉 파일 종류 축은 이 함수의 형제로 들어가면 된다 — 종류를 받아 마크다운층 배열을 주거나 빈 배열/언어 문법을 주는 같은 형태의 매핑 함수 하나. **새 아키텍처를 발명할 필요가 없고, 43항목을 개별로 분해할 필요도 없다** (평면 배열 하나를 통째로 넣거나 빼는 입도가 REQ-PANEL-042의 요구와 정확히 일치한다).

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

### 6.2a 라우팅 키는 어디에 사는가 — F6이 강제하는 위치

**결론: 라우팅 키는 `src/store/` 계층에 산다. 조정 코어 5파일은 전혀 바뀌지 않는다.**

F6이 금지하는 것과 허용하는 것을 정확히 구분해야 한다:

| | 금지 (테스트가 고정) | 허용 |
|---|---|---|
`shared/reconciliation.ts` | 확장자 판독 수단 도입(`:42-65`) | **`ConfirmedChange.path`는 이미 존재한다**(`:20`) — 타입은 경로를 나르고 리듀서가 쓰지 않을 뿐이다. 리듀서 시그니처 `reduceReconciliation(state, event, policy)`는 그대로 둔다 |
`src/editor/applyExternalChange.ts` | arity 변경(`:171-174`가 2로 고정) | **`target`(첫 인자)이 이미 패널 식별자다** — `DispatchTarget`은 그 뷰/버퍼를 가리킨다. 어느 target에 적용할지 고르는 것이 곧 라우팅이며, 그 선택은 호출자의 몫이다 |
`electron/changeConfirmation.ts`, `electron/watchScope.ts`, `src/editor/minimalDiff.ts` | 확장자 판독 | 무변경 |

즉 **오늘의 API가 이미 라우팅을 지원한다.** 빠진 것은 호출자다:

```
                           ┌── 여기가 없다 (REQ-PANEL-070의 결함) ──┐
electron/ipc/project.ts:40 │                                        │
  broadcast(모든 창) ──────┼─► src/store/externalChangeChannel.ts   │
                           │     path로 문서 조회                    │
                           │       ├ 열린 문서 아님 → 폐기           │
                           │       ▼                                │
                           │   Map<path, ReconciliationState>       │
                           │       │                                │
                           │   reduceReconciliation(state[p], …)  ◄─┼── shared/reconciliation.ts 무변경
                           │       │                                │
                           │   Map<path, DispatchTarget>            │
                           │       ▼                                │
                           └─► applyExternalChange(target, content) ┘  ◄── arity 2 유지
```

세 개의 `Map`이 라우팅 키를 담고, 셋 다 `src/store/`에 있다 — `LAYER_FILES`에 포함되지 않는 계층이다. `applyExternalChange`는 여전히 "이 target에 이 내용을 적용하라"만 안다. **경로도 확장자도 모른다.**

#### 승인된 메커니즘 — 주입된 setter의 클로저 (감사 확인)

초판은 대안 3건을 기각했지만 **승인된 형태를 명명하지 않았다.** 그것이 구현자가 `path` 매개변수를 추가하려는 유혹을 남긴다. 형태는 이것이다:

```
registerReconciliationExecutor(view, (h) => setEffectHandlerFor(filePath, h))
```

`registerReconciliationExecutor(target, setEffectHandler)`의 **두 번째 인자가 주입된 setter**이고(`src/editor/applyExternalChange.ts:123-132`) 호출부에는 `filePath`가 스코프에 있으므로, **경로가 클로저에 담긴다.** 시그니처는 **하나도 바뀌지 않는다** — arity 2가 유지되고 확장자 판독 수단 6종 금지도 유지된다. 즉 `applyExternalChange.ts`는 **무변경일 수 있다**(그래서 §D11에 따라 AC-PANEL-082의 `git diff` 예외를 철회했다).

#### 등록·해제는 `filePath` 변화에 결속된다 — `[]`가 아니다 (감사 지적 D1)

**§6.2a 초판은 Map의 *위치*만 정하고 *갱신 시점*을 말하지 않았다.** 그것이 M0 정확성의 핵심이므로 여기서 확정한다.

오늘의 마운트 구조:

| 사실 | 근거 |
|---|---|
| 상위가 `key` prop을 주지 않는다 | `src/App.tsx:153-160` — `<MarkdownEditor value={…} onChange={…} onReady={…} filePath={filePath} …/>` |
| 마운트 effect의 deps가 `[]`다 | `src/editor/MarkdownEditor.tsx:176` |
| `filePath`는 prop으로 들어와 **별개 effect**가 처리한다 | `:166` |

**따라서 하나의 `EditorView`가 문서를 갈아타며 재사용된다.** 등록을 `[]`-deps effect에 두면 경로가 첫 마운트에 캡처되어 갱신되지 않고, 파일 전환 후 (a) 새 경로의 변경이 아무 데도 가지 않고 (b) **옛 경로의 변경이 그 패널로 들어온다.** M0이 닫으려는 결함이 다른 형태로 재발한다.

**확정**: 라우팅 등록·해제는 **`filePath` 변화에 결속된다.** 재바인딩 시 이전 경로의 항목을 해제하고 새 경로로 등록한다(REQ-PANEL-070a, AC-PANEL-080e). 위 클로저 형태가 이것을 자연스럽게 만든다 — `filePath`가 deps에 있는 effect 안에서 등록하면 클로저가 매번 새 경로를 담는다.

이 배치가 F6의 근거와 정합한다: `:162` 주석의 "조정 계층은 경로를 아예 받지 않는다 — 그 자체가 확장자 독립의 증거다"는 **코어를 두고 한 말**이고, 그 위에 라우팅 계층을 얹는 것은 그 증거를 약화시키지 않는다. 오히려 라우팅이 위에 있어야 코어가 계속 경로 무지일 수 있다.

**기각된 대안**

| 대안 | 기각 근거 |
|---|---|
`reduceReconciliation`에 `path` 대조 추가 | 확장자 정규식에 걸리지는 않지만 `:162`가 명시한 설계 근거("경로를 아예 받지 않는다")를 무효화한다. 그리고 한번 경로를 받으면 확장자 분기가 **한 줄 거리**가 되어 `:42-65`의 방어가 관례로 전락한다 |
`applyExternalChange(target, content, path)` | `:171-174`가 arity 2를 단언하므로 **테스트가 즉시 깨진다.** C-12 위반 |
`ExternalFileChange`를 창별로 필터링해 main에서 보낸다 | main이 어느 창이 어느 파일을 여는지 알아야 하는데 `electron/ipc/project.ts:36`의 `service`는 프로세스 전역 1개이고 `owned` Set이 경로 기준이라 **창 귀속 정보가 없다**. 그 정보를 넣는 것은 창 소유권 모델 도입이며 `spec.md` §D.4가 범위 밖으로 둔 작업이다. 렌더러 측 대조가 최소 변경이고, 브로드캐스트를 유지하면 같은 파일을 두 창이 열었을 때 둘 다 알림을 받는 것이 자연히 성립한다 |

### 6.2b 조합 플래그 — 리듀서 코어는 무변경, **게이트 dispatch 경로와 합류 계산이 추가된다**

`shared/reconciliation.ts:57`의 `composing`은 `ReconciliationState`의 필드다. 상태를 `Map<path, ReconciliationState>`로 키잉하면 `composing`도 문서별이 된다. **리듀서 코어(필드 정의 + 전이 로직 `:218-228`)는 바뀌지 않는다.**

**초판의 두 문장을 정정한다 (감사 지적 D5, 수용)**:

| 초판 | 정정 |
|---|---|
| "별도 조치가 필요 없다" | **틀렸다** — 자기 다음 두 문장(게이트 dispatch 변경 + OR 합류)과 모순이다. 정확히는 **리듀서 코어가 무변경이고, 게이트 dispatch 경로와 합류 계산이 스토어 계층에 추가된다** |
| "`reduceReconciliation`은 이미 계산된 boolean을 받는 이벤트만 본다" | **틀렸다.** `shared/reconciliation.ts:32-33`이 `composition-start` / `composition-end`를 **payload 없이** 선언하고, 리듀서가 boolean을 **스스로 계산한다**(`:219` `composing: true`, `:222` `composing: false`) |

**귀결 — 이것이 D5를 Blocking으로 만든 이유**: `composition-end`가 `composing`을 **무조건 false로 설정한다.** 따라서 OR 합류는 "리듀서 위에 얹히는" 것이 **아니다.** 스토어가 **다른 게이트가 아직 조합 중인 동안 `composition-end` dispatch를 억제하고, OR가 false로 떨어질 때만 방출해야 한다.**

그 억제를 빼면 패널 B의 `compositionend`가 패널 A의 보류를 해제한다 — **정확히 REQ-PANEL-071이 닫으려는 결함이다.** 즉 문서별 키잉만으로는 부족하고 억제 로직이 함께 필요하다.

```
패널 A 게이트 ──┐
                ├─ OR ─► 스토어가 판정
패널 B 게이트 ──┘         ├─ OR가 아직 true → composition-end dispatch 억제
                          └─ OR가 false로 떨어짐 → composition-end 1회 방출
```

### 6.2c OR 방향 — 안전 축에서는 옳고, **liveness는 D4가 담보한다**

감사가 이 질문에 답했고 결론을 기록한다.

**OR는 안전(safety) 축에서 옳다.** 대안 둘 다 IME를 깨뜨린다:

| 대안 | 왜 깨지는가 |
|---|---|
| AND (모든 게이트가 조합 중일 때만 보류) | 패널 A만 조합 중이면 보류하지 않고 적용한다 — **같은 문서**이므로 그것이 곧 A의 문서를 조합 도중 바꾸는 것이다 |
| "조합 중인 패널만 보류" | 같은 문서를 다른 패널에 적용하는 것이 곧 조합 중인 패널의 문서를 바꾸는 것이다. 성립 불가 |

**위험은 safety가 아니라 liveness다**: OR가 참인 동안 조정이 무한히 보류될 수 있다. 그리고 **D4가 그 liveness를 실제로 깨뜨리는 구체적 경로다** — `detach()`가 `composing`을 해제하지 않으므로(`compositionGate.ts:88-93`) 한 게이트가 latch되면 **다른 게이트의 `compositionend`로는 OR가 결코 false로 떨어지지 않는다.**

즉 **OR는 채택하되 liveness는 REQ-PANEL-071의 detach 해제 의무가 담보한다.** 둘을 함께 보아야 한다 — OR만 도입하고 D4를 방치하면 "한 패널이 latch되어 다른 패널이 아무리 조합을 끝내도 드레인되지 않는" 상태가 **실재한다**(기계 재현으로 확인됨).

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

### 7.2 확정: 채널 분리 — **세 겹이 함께 성질을 만든다** (초판 논거 정정)

**결정 (OQ-6(i))**: 마크다운 쓰기 경로와 raw 쓰기 경로를 별개 채널로 분리한다.

**초판의 논거는 과장이었다 (외부 검토 지적, 수용)**: 초판은 "변환이 마크다운 채널에만 존재하므로 **표현 불가능성으로** REQ-PANEL-044를 보장한다"고 적었다. **틀렸다** — preload가 두 채널을 모두 노출하는 동안 렌더러 버그가 `.py`에 대해 마크다운 채널을 호출할 수 있다. 채널 분리는 오용을 **어렵게** 만들지만 **표현 불가능하게** 만들지 않는다.

성질은 **세 겹이 함께** 만든다:

| # | 겹 | 무엇을 막는가 | 검증 |
|---|---|---|---|
| 1 | 별개 채널 | raw 저장이 실수로 마이그레이션을 거치는 기본 경로 | IPC 계약 선언 |
| 2 | **main이 마이그레이션 채널의 대상이 마크다운임을 검증**하고 아니면 거부 | 렌더러가 잘못된 채널을 호출하는 경우 | 런타임 거부 단언 |
| 3 | **raw 채널에 마이그레이션 import가 아예 없다** | 나중에 누군가 raw 경로에 변환을 추가하는 것 | 소스 스캔 단언 |

세 겹 중 **2번이 초판에 없던 것**이며, 그것이 "표현 불가능성" 주장을 실제로 성립시키는 조각이다. AC-PANEL-044b가 셋을 각각 고정한다.

**기각되었으나 기록하는 대안 (grok 제안)**: 단일 채널 + 타입된 `kind: 'markdown' | 'raw'` 판별 유니온을 main에서 **exhaustive switch**로 처리.

| | 채널 분리 (채택) | 단일 채널 + 판별 유니온 |
|---|---|---|
| 강도 | 3겹 | **exhaustiveness가 테스트로 강제되면** 거의 동등. 관례적 `if`에 머물면 약함 |
| 결정적 차이 | raw 채널에 마이그레이션 import가 **없음**을 소스 스캔으로 단언 가능 | 같은 파일 안에 import가 존재하므로 **그 단언이 불가능하다** |
| IPC 표면 | +1 채널 | 변화 없음 |

채널 분리를 택한 이유는 3번 겹(소스 스캔 단언)이 단일 채널에서 구조적으로 불가능하다는 것이다. IPC 표면 +1의 한계 비용은 낮다 — `shared/ipc-contract.ts`가 이미 66개 invoke 채널을 담는다.

### 7.2a 확정: 세 곳 누락 — 분리는 모든 쓰기 진입점에 적용된다

`file:save`만 분리하는 것은 불충분하다. 오케스트레이터가 확인한 세 곳:

| 지점 | 사실 | 귀결 |
|---|---|---|
| `electron/ipc/files.ts:78-112` `file:saveAs` | 같은 위치에서 `migratePendingInContent(content, dirname(result.filePath))` 호출 | **두 쓰기 경로 모두** 분리 필요 |
| `electron/ipc/files.ts:92-97` | `filters: [{ name: 'Markdown', extensions: ['md'] }]` 하드코딩 | `.py` 패널의 "다른 이름으로 저장"이 `.md`만 제시한다 — **보조 파일 필터가 이 결정의 일부** |
| `src/hooks/useAppCloseGuard.ts:26-33` | 닫기 시 저장 라우팅 | 갱신하지 않으면 **가장 나쁜 시점에** 보조 내용을 마크다운 경로로 보낸다 |

세 번째는 §2.3의 await-창 결함과 **같은 함수**다(`useAppCloseGuard.ts:24-33`). 즉 그 함수는 두 가지 이유로 손대야 한다 — 채널 라우팅과 revision 기반 저장. 한 번에 처리하는 것이 자연스럽다.

### 7.2b 확정: (B′) 보조 파일 EOL 복원 — 조정 수학은 손대지 않는다

**결정 (OQ-6(ii), 사용자)**: 문서 상태에 EOL을 보관하고 raw 직렬화 시 복원한다.

```
열기 (보조 파일만)  →  지배적 EOL 탐지  →  문서 상태 eol: '\n' | '\r\n' | '\r'
버퍼                →  내부적으로 LF 유지 (오늘의 CodeMirror 현실, 변경 없음)
raw 저장            →  LF → 보관된 eol 복원
조정 계층           →  손대지 않음 (toDocumentSpace 미변경, lineSeparator 미도입)
```

**내 Residual-risk("B/C는 문서 좌표 접기 전제를 건드려 SPEC-1이 닫은 조정 AC를 재검증 대상으로 만든다")는 과장이었다.** 증거 2건이 그것을 대체한다 — 내가 직접 읽어 확인했다:

| # | 증거 | 함의 |
|---|---|---|
| 1 | `src/editor/applyExternalChange.ts:51-52` 주석: **`구분자는 출력 시 직렬화에만 쓰인다`** | (B′)는 새 전제가 아니라 **기존 코드가 이미 문서화한 설계**다 |
| 2 | `tests/editor/reconcileIntegrity.test.ts:90-97` `'lineSeparator가 설정된 상태에서도 좌표가 어긋나지 않는다'` — `crlfEditor('a\r\nb\r\nc')`에 `applyExternalChange(editor, 'a\r\nCHANGED\r\nc')`가 던지지도 손상시키지도 않음을 단언, **통과 중** | 조정 계층의 CRLF 호환성이 **이미 green으로 증명되어 있다** |

같은 파일 `:99-107`의 특성화 테스트(`[기록] CRLF 파일은 열리는 시점에 LF로 접힌다`)도 **(B′) 아래에서 그대로 green이다** — (B′)는 읽기 방향의 접기를 유지하고 쓰기 방향만 복원하므로 그 테스트가 고정한 현재 동작을 바꾸지 않는다. 그 주석이 제시한 해소 경로("파일별 줄바꿈을 감지해 `lineSeparator`를 구성하고 저장 시 재직렬화")보다 (B′)가 좁은 이유가 여기 있다: **바이트 보존에 필요한 것은 쓰기 방향뿐이고, `lineSeparator`는 읽기 방향을 위한 장치다.**

**결정적 논거 (AC 부기보다 상위)**: `EPIC-V03-WORKSPACE.md:34`가 `.py`/`.bib`/`.csv`/`.json`의 바이트 무결성을 **end-state 요구**로 못박는다. 첫 저장에서 모든 줄 끝을 다시 쓰는 보조 편집 표면은 각주가 아니라 **Epic 위반**이다. "편집 없이 열었다 닫으면 바이트 보존"(REQ-PANEL-043, AC-PANEL-043b)은 참이지만 불충분하다 — **저장이 에디터의 목적이다.**

**메커니즘이 제공할 수 없는 것 (AC가 약속하지 않아야 하는 것)**: 파일당 EOL 하나로는 **혼합 줄 끝**을 바이트 보존할 수 없다. 혼합 파일에서 저장은 모든 줄 끝을 지배적 EOL로 정규화한다. REQ-PANEL-048a가 탐지 정책(동수 시 `\r\n` 우선, 줄 끝 없으면 LF)과 이 한계를 명시하고, AC-PANEL-048b가 한계를 **명시적으로** 판정한다 — 통과 조건이 "정규화된다"이지 "보존된다"가 아니다.

**동수 시 `\r\n` 우선의 비대칭 근거**: `\r\n`을 포함한 파일에서 LF를 택하면 **모든** CRLF 줄이 손상되는 반면, LF 파일에서 CRLF를 택하는 오판은 혼합 파일에서만 발생한다. 즉 두 오판의 피해 크기가 다르므로 큰 쪽을 피한다.

### 7.3 확정: 열기 경로의 디코드 실패는 열기를 거부한다

REQ-PANEL-046. `file:openPath`는 오늘 `fs.readFile(path, 'utf8')`(`electron/ipc/files.ts:48`)로 읽는다 — Node의 `utf8` 디코딩은 **잘못된 바이트를 U+FFFD로 대체한다**. 즉 바이너리를 열면 대체 문자로 가득한 버퍼가 만들어지고, 저장하면 **원본이 파괴된다**.

SPEC-1은 조정 경로에서 이미 이 문제를 해결했다: `decodeUtf8Strict`(`electron/externalWatch.ts:54-60`)가 `new TextDecoder('utf-8', { fatal: true })`로 실패를 실패로 남긴다. **열기 경로에도 같은 자세가 필요하다** — 조정은 막아 놓고 열기로 뚫리면 방어가 무의미하다.

기각된 대안: "대체 문자로 열되 읽기 전용으로 표시" — 읽기 전용 상태를 새로 도입해야 하고, 사용자가 실수로 저장 경로를 찾아낼 여지가 남는다. 열지 않는 것이 단순하고 안전하다.

---

## 8. pathGuard 마찰 — **확정: 신뢰 범위로 좁혀 표시** (동의 배너 기각)

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

### 8.3 확정: 후보 1 — 트리는 열 수 있는 것만 표시한다. **동의 배너는 기각되었다**

**결정 (OQ-5, 사용자)**: 프로젝트 트리는 실제로 열 수 있는 경로만 제시한다. **신뢰 IPC 없음, 동의 배너 없음, 다이얼로그 유도 힌트조차 없음.** SPEC-1 D-6은 쓰인 그대로 유지된다.

**내 잠정 권고(후보 2 = 동의 승격)는 기각되었다. 논거를 기록한다** (외부 검토 2인이 같은 논거로 독립 기각):

> 렌더러 배너가 클릭 시 신뢰 승격 IPC를 호출한다면 그것은 **후보 3(자동 편입)에 클릭 가능한 라벨을 붙인 것**이다. 손상된 렌더러는 이미 모든 클릭과 모든 preload API를 통제하며, 권한 대상(authority target)은 여전히 매니페스트가 공급한다.

**내가 어디서 틀렸는가**: 후보 2를 "기존 승격 경로 재사용"이라고 판단했다. 재사용되는 것은 승격의 **결과**(`allowSessionPath`)이고 승격의 **트리거**는 렌더러가 통제하는 클릭이다. 오늘 새 신뢰가 들어오는 유일한 경로는 **main이 소유한 OS 다이얼로그**다 — `electron/ipc/shell.ts:122-125`:

```
ipcMain.handle('dialog:openFolder', async () => {
  const picked = await openFolderDialog();   // ← main이 띄우고 main이 결과를 받는다
  if (picked) allowSessionPath(picked);
  return picked;
});
```

**main 프로세스 다이얼로그를 통과하지 않는 동의는 D-6 보존이 아니라 UX를 입힌 자동 승격이다.**

| 후보 | 판정 | 신뢰 모델 압력 |
|---|---|---|
| **1. 신뢰 범위로 좁혀 표시** | ✅ **확정** | **0.** 마찰은 수용된 비용이며 문서화된 사용자 경로다(§8.3a) |
| 2. 동의 배너 경유 승격 | ❌ 기각 | 위 논거 — 후보 3에 라벨을 붙인 것 |
| 3. 프로젝트 루트 자동 Tier 2 편입 | ❌ 기각 | **가장 큼.** §8.2의 공격 형태가 성립. C-4·D-6·REQ-WS-012 정면 위반 |
| 4. 읽기/쓰기 신뢰 축 분리 | 📅 **별개 향후 보안 SPEC** | 원리적으로 옳은 장기 모델(검토 2인 동의). 그러나 `isAllowedPath`가 단일 boolean(`:132`)이므로 모든 `assertAllowedPath` 호출부 **+ §8.3b의 asset 게이트**를 바꾼다 |

### 8.3a 마찰은 수용된 비용이며 결함이 아니다

트리는 **열 수 없는 대상을 제시하지 않는다**(REQ-PANEL-036b, AC-PANEL-036c). `X/scripts/`에 도달하려면 기존 폴더 열기 다이얼로그로 그 폴더나 프로젝트 루트를 등록한다 — 이것이 **정의된 사용자 경로**이며 그렇게 문서화한다.

초판이 후보 1의 대가로 적은 "프로젝트 트리 UI가 실사용에서 반쪽이 된다"는 표현은 **부정확했다**: 트리가 열 수 없는 것을 보여주면 반쪽이지만, 열 수 있는 것만 보여주면 **작지만 정직한 트리**다. 사용자는 등록되지 않은 폴더가 트리에 없는 것을 보고 등록이 필요함을 알게 된다.

### 8.3b 신뢰 확대는 쓰기만이 아니라 **렌더러 읽기**를 확대한다

향후 어떤 승격 제안도 파일 열기만이 아니라 이 읽기 표면을 함께 논증해야 한다(REQ-PANEL-036c). `electron/assetProtocol.ts:124-133` 실측:

```
if (!(await isAllowedPath(absPath))) { … 403 … }        // ← 같은 boolean 하나
const data = await fs.readFile(absPath);                 // ← 전체 읽기, 크기 제한 없음
const mime = MIME_BY_EXT[extname(absPath).toLowerCase()] ?? 'application/octet-stream';
return new Response(data, { headers: { 'Content-Type': mime } });
```

즉 신뢰 트리가 넓어지면 렌더러는 `durumi-asset://` 프로토콜로 **그 트리의 임의 파일 바이트를 크기 제한 없이 읽어낼 수 있다.** 후보 4가 원리적으로 옳은 이유가 여기 있다 — 파일 열기(쓰기 의도)와 asset 읽기가 같은 게이트를 공유하는 것이 실제 문제다. 그리고 그 분리가 SPEC-2 범위를 넘는 이유도 여기 있다: 게이트가 하나이므로 축을 나누면 **모든** 소비자가 바뀐다.

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

- `spec.md` — 요구사항 50개 (REQ-PANEL-070~073 + 001~064)
- `plan.md` — §A 확정 결정 + **미해결 결정**, §C 마일스톤, §D 위험
- `acceptance.md` — 수용 기준
- `research.md` — 8개 영역 조사 + 멀티패널 위험 목록 + 미검증 항목
- `.moai/specs/SPEC-V03-WORKSPACE-001/design.md` §2(계층 배치), §4(IME 게이트 구조), §6(정책 seam)
- `.moai/specs/EPIC-V03-WORKSPACE.md` §2.1(CodeMirror 유지 4근거), §3(`:90` 활성 원고 패널 종속), §6(불변식)
- `docs/v0.3-signoff.md` §4~§6

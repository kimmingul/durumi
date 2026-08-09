---
id: SPEC-V03-WORKSPACE-002
title: "구현 계획 — v0.3 멀티패널 셸"
version: "0.3.3"
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
tags: "plan, multipanel, milestones, open-decisions, preserve"
---

# 구현 계획 — SPEC-V03-WORKSPACE-002

> 마일스톤은 **결정 번복 가능성이 높은 순서**로 배열했다. 앞쪽일수록 데이터 모델·사용자 흐름 결정을 담아 검토 가치가 크고, 뒤쪽일수록 기계적이다.
>
> **미해결 결정 9건이 §A.2에 있다.** 이 SPEC은 혼자 확정하면 안 되는 아키텍처 결정을 갖고 있으므로, 그 9건은 임의 선택 없이 후보·대가·잠정 권고 형태로 남겨 두었다. 오케스트레이터의 외부 교차 검토와 사용자 승인이 선행 조건이다.
>
> **단 M0은 예외다.** §C의 M0(출하 중인 결함 두 건의 재현 우선 해소)은 어떤 미해결 결정에도 의존하지 않으므로 승인 대기 중에도 착수 가능하다 — 라우팅 계층의 위치가 C-12/F6에 의해 강제되어 선택지가 없고, 대상이 v0.2.31에 이미 출하된 데이터 손실 경로다.

---

## §A 결정

### §A.1 승계된 결정 (SPEC-1에서 확정 — 재론하지 않는다)

| SPEC-1 | 내용 | 이 SPEC에서의 귀결 |
|---|---|---|
| D-2 | 미저장 편집이 있으면 버퍼 교체 금지 + 해제 가능한 비침습 배너("차이 보기"/"디스크에서 불러오기"), **모달 금지**(REQ-WS-049) | 배너는 **패널당** 표면화(REQ-PANEL-053). 창 전역 단일 배너는 D-2 위반 |
| D-3 | 열린 파일 위치 무관 전부 감시 + 프로젝트 규약 폴더 추가 감시, **data 역할 경로 1개 제외**, 열려 있으면 감시(REQ-WS-057b) | 패널 수와 무관하게 승계(REQ-PANEL-057). data 역할 경로 안의 파일을 패널로 열면 그 순간 "열린 파일"이 되어 감시 대상 |
| D-4 | 메타데이터 정본 = 원고 front matter | 메타데이터 표면은 **활성 원고 패널 종속**(REQ-PANEL-060~061). `EPIC-V03-WORKSPACE.md:90`의 구속 |
| D-5 | 비마크다운 편집 표면은 SPEC-2 소관 | `spec.md` §B.5 전체가 이 공백을 채운다. AC-WS-034가 에디터 표면 없이 유닛에서 검증되도록 재작성된 것도 이 때문 |
| D-6 | pathGuard 신뢰 모델 완화 없음 (기존 Tier 2 `allowSessionPath`에만 의존) | 이 SPEC도 완화하지 않는다(C-4). **다만 마찰이 정면으로 드러나므로 OQ-5로 올린다** |
| D-7 #1 | 확정은 2단계 (전 경로 크기+수정시각 → 열린 파일만 내용 대조) | 열린 파일이 N개가 되어도 2단계 경계는 그대로. 2단계 비용은 이미 버퍼에 적재된 파일에만 든다 |
| — | CodeMirror 6 유지, 3-모드 모델 재설계 범위 밖, `RenderedSpan` 소스맵 범위 밖 | `EPIC-V03-WORKSPACE.md` §2.1·§7. C-5 |
| — | `docs/DOCUMENT_MODE_PRINCIPLES.md` 무변경 (AC-WS-037 불변식) | C-9. 비마크다운 편집 표면이 그 문서의 범위 공백을 실재화하지만 **기록만 한다**(REQ-PANEL-047) |

### §A.2 결정 로그 — **확정 4건 (OQ-1·2·5·6)** / 미해결 5건 (OQ-3·4·7·8·9)

> **확정 항목**은 `**확정:**` 표기를 제목에 달고, 결정·논거·번복 조건을 담는다. 초판의 잠정 권고가 기각되거나 논거가 교체된 경우 **그 사실과 이유를 함께 남긴다** — 다음 구현자가 읽는 것은 결론이 아니라 논거다.
> **미해결 항목**은 **(a) 질문 / (b) 후보 / (c) 후보별 대가 / (d) 잠정 권고와 근거** 형식을 유지한다.
>
> **외부 검토는 2인 수렴이다 (3인이 아니다).** codex와 grok이 독립적으로 read-only 검토했다. gemini는 참여하지 못했다 — `IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals`(Antigravity로 리디렉트되며 CLI 없음). **3인 수렴으로 과장하지 않는다.**
>
> `design.md`가 각 항목의 구조 분석을 담고 있으므로 근거는 그 절을 인용한다.

---

#### OQ-1 — 레이아웃 모델 · **확정: 후보 1 (중앙 영역 분할)** — 논거 교체됨

**결정**: 중앙 영역 분할. `src/App.tsx:145`의 `flex:1` 자식 안에 패널 컨테이너를 넣고 `sidebarStore`/`rightSidebarStore`를 **보존**한다. (사용자 승인 + 외부 검토 2인 수렴)

**확정 논거 — 의미론적 소유권 분리**:

> **사이드바는 전역 저작 표면이고 패널은 문서 국소(document-local)다.** 둘을 한 그리드에 넣으면 도킹·재배치 소유권을 공유한다고 시각적으로 주장하게 되는데, 실제로 공유하지 않는다.

이것이 (1)이 옳은 이유이며, 테스트 개수가 아니라 **지속되는 근거**다.

**초판 논거 2건은 철회한다 (외부 검토 2인이 독립적으로 과장이라고 지적, 수용)**:

| 철회된 주장 | 왜 틀렸는가 |
|---|---|
| "통합 그리드는 폭 SSOT를 스토어에서 CSS로 새어 나가게 한다" | **틀렸다.** grid track도 `WIDTH_BOUNDS`에서 파생된 인라인 폭을 받을 수 있고, 그러면 스토어의 action·clamp가 그대로 보존된다. 그리드가 본질적으로 SSOT를 옮기지 않는다 |
| "사이드바 테스트 841줄이 깨진다" | 위 잘못된 전제에서 파생된 수치이며 **아키텍처 논거가 아니다.** 테스트 개수는 설계 선택의 근거가 될 수 없다 |

> 사이드바 테스트 무변경 통과(C-10, AC-PANEL-002)는 **회귀 검사로서는 계속 유효하다** — 다만 그것은 (1)을 고른 *이유*가 아니라 (1)을 고른 뒤의 *검증*이다. 두 역할을 혼동했던 것이 초판의 오류다.

**(1)이 공짜가 아닌 지점 — 외부 검토 2인이 독립적으로 지적한 과소 산정**:

실제 비용은 **CSS가 아니라 사이드바 데이터 재배선**이다. 그리고 이것은 (1) 아래에서 **선택이 아니라 필수**다:

| 재배선 대상 | 오늘의 형태 |
|---|---|
| `Sidebar` | 스칼라 `content` / `view` prop을 받는다 — `src/App.tsx:124-127` |
| `RightSidebar` | 동일 — `src/App.tsx:163-166` |
| 목차 / 인용 / "검색 히트 → 줄 이동" | 전역 에디터 하나를 겨냥한다 — `src/App.tsx:129-142` (`editorViewRef.current` + `setTimeout` 50ms 후 dispatch) |

이 재배선은 **전용 AC를 가진 명시적 마일스톤 작업**이며(AC-PANEL-065), 패널화의 부수 결과로 처리하지 않는다.

codex의 정밀 의무: **`RightSidebar`는 "활성 원고 패널"에 속하는 것으로 정의되어야 하며, "가장 왼쪽 패널"에 속해서는 안 된다.** 레이아웃 순서가 데이터 소유권을 결정하면 사용자가 패널을 재배치할 때 서지·메모가 조용히 다른 원고를 가리킨다. REQ-PANEL-060~063이 이미 활성 원고 패널 종속을 규정하므로 그 축과 일치시킨다.

**번복 조건 (이 결정이 틀리게 되는 경우)**: 사이드바가 나중에 **패널 국소 도킹**, **패널별 인스턴스**, 또는 **사이드바까지 포함한 edge-to-edge 통합 리사이즈**(IDE급 chrome)를 요구하게 되면 (1)은 틀린 선택이 된다. **셋 다 SPEC-2의 범위에 없다.**
---

#### OQ-2 — 패널 상태 소유 · **확정: 후보 1 축 분리 + v0.3에서 dual-open 금지**

**결정 (사용자)**: `panelStore` / `documentStore` **축 분리는 설계대로 유지**한다. 그리고 **같은 파일을 두 패널에 여는 것(dual-open)은 v0.3에서 금지하고 v0.4로 연기한다.** 서로 다른 파일을 나란히 보는 것은 v0.3에 출하된다.

**축을 붕괴시키지 말 것**: dual-open을 연기하는 것이 축을 하나로 합칠 이유가 되지 **않는다.** 축을 합치면 v0.4가 비싸지는 것이 바로 이 결정이 피하려는 것이다. 문서 축(경로·내용·dirty·조정 상태)과 패널 축(캐럿·선택·스크롤·실행 취소·표시 모드)은 v0.3에서 1:1로 쓰이되 **구조로는 1:N을 표현할 수 있게** 남는다.

**이 결정은 외부 검토의 핵심 반론을 해소한다 (우회가 아니다)**. 검토자 2인이 독립적으로 같은 지적을 했다:

1. `design.md:57`의 "CodeMirror 문서 인스턴스 1개를 N개 뷰가 공유"는 **CM6가 하지 않는 일**을 기술한다.
2. 더 중요하게, 오늘의 전파 경로는 **문서 전체 교체**다 — `src/editor/MarkdownEditor.tsx:177-182`가 `value` prop이 바뀌면 `changes: {from: 0, to: doc.length, insert: value}`를 dispatch한다. 그 경로 위에서 dual-open을 하면 **패널 A의 키 입력 하나가 패널 B에서 전체 교체가 되어** B의 선택 매핑을 파괴하고 거대한 undo 항목 하나를 기록한다.

두 검토자 모두 같은 결론에 도달했다: **문서↔뷰 트랜잭션 동기화 프로토콜 없이는, 공유된 것처럼 보이면서 조용히 발산하는 두 에디터를 출하하는 것보다 중복 뷰를 금지하는 것이 더 안전하다.** 사용자 결정이 정확히 그것이다.

**필수 편집 5건**:

**(1) `design.md:57` 정정.** `design.md:86`이 "각 뷰가 자기 `EditorState`를 가진다"고 올바르게 적고 있으므로 :57과 모순이다 — **틀린 쪽은 :57이다.** 아울러 `design.md:79`를 완화한다: 별개 undo **스택**은 공짜지만 **버퍼 일관성은 공짜가 아니다.** "undo" 옆의 "공짜"가 검토자 2인이 설계를 불완전하다고 판단한 원인이므로 명시적으로 적는다.

**(2) 연기된 프로토콜을 v0.4 범위로 기록** (문제가 없는 것처럼 두지 않는다). v0.4가 재발견하지 않도록 5개 의무를 이름 붙여 남긴다 — `design.md` §2.5.

**(3) 중복 열기 검사는 불완전하며 그렇게 말해야 한다.** 경로 동일성이 필요하고, `electron/pathGuard.ts:55-60`이 **의도적으로 `fs.realpath`를 호출하지 않으므로** 같은 파일의 심볼릭/하드 링크 별칭은 탐지되지 않는다. 검사가 보장하는 것과 보장하지 않는 것을 명시하고 정직한 경계를 AC로 고정한다(AC-PANEL-011b). **바이트 수준 동일성 탐지를 주장하지 않는다.**

**(4) sticky dirty를 복제하지 않는다.** `src/store/appStore.ts:54`(`|| s.isDirty`, issue #12)를 `documentStore`로 베끼면 문서마다 결함이 복제된다. 검토자 2인 모두 **또 하나의 가변 boolean을 나르지 말고 `currentRevision !== savedRevision`으로 dirty를 파생**할 것을 권고했다. 그 형태를 채택한다.

**(5) 신규 위험 — codex 발견, 오케스트레이터 확인 (코드 직독 등급)**: `src/hooks/useFileMenuCommands.ts:51-64`가 클로저에서 `content`를 캡처한 뒤 **두 개의 await**(`await window.api.fileSave(...)`, 이어서 `await useMemoSidecarStore.getState().saveIfDirty()`)를 건너 `markClean()`을 **무조건** 호출한다. 그 창 안에서 타이핑된 편집이 clean으로 표시된다.

내가 소스를 직접 읽어 확인한 두 가지:
- 같은 형태가 `src/hooks/useAppCloseGuard.ts:24-33`에도 있다 — `state.content` 캡처 → `await window.api.fileSave(...)` → `markClean()`. **즉 진입점이 둘이다.**
- 이것은 단일 패널 앱에 **오늘 이미 존재하며** 패널화가 만드는 것이 아니다. 다만 문서 축 `isDirty`가 이것을 더 중대하게 만든다.

**검증 등급**: 코드 직독 확인이며 **재현하지 않았다.** 결함 A(기계 재현)와 등급이 다르고, `research.md` §10 항목 2a가 조합 플래그 결함에 대해 하는 구분과 같은 방식으로 구분한다.

**SPEC-2가 고치는가**: **(4)의 revision 기반 dirty 파생이 이 결함을 무료로 해소한다** — `markClean()`이라는 "지금을 clean으로 선언하는" 명령형 연산 자체가 사라지고, `savedRevision = <저장된 revision>` 대입으로 바뀌기 때문이다. 저장이 시작된 시점의 revision을 기록하면 await 창 안의 편집은 revision을 올려 `currentRevision !== savedRevision`이 참으로 남는다. **따라서 SPEC-2가 (4)를 구현하는 부수 효과로 닫는 것을 권고하며**(가장 저렴한 해소), 별개 SPEC으로 넘기지 않는다. AC-PANEL-010b가 이 성질을 고정한다.
---

#### OQ-3 — 모드 모델: 컨트롤 표면과 `defaultMode` 의미론

**(a) 질문**: 3-모드의 사용자 컨트롤 표면(상태바 라디오, 메뉴 모드 항목)을 어떻게 패널화하는가. `prefs.editor.defaultMode`를 언제 쓰는가. 보조 패널은 자기 표시 축(예: 줄바꿈 토글)을 갖는가.

**투명성 고지**: 오케스트레이터가 제시한 두 하위 질문 — "패널별로 독립시키는가" / "마크다운 패널에만 적용하고 비마크다운은 별도 축인가" — 는 **상호 배타적이지 않으므로** `spec.md`에서 둘 다 채택했다(REQ-PANEL-021 패널별 독립 + REQ-PANEL-022 마크다운 전용). 근거는 `design.md` §1 F4: 모드는 **이미 뷰별 StateField**(`src/editor/editMode.ts:26-38`)이고 데코레이션 11개 모듈이 전부 뷰의 `state`에서 읽으므로(`research.md` §3.2) 패널별 독립이 **추가 비용 없이** 성립한다. 고칠 곳은 값의 출처 4곳뿐이다. 이 판단을 뒤집고 싶으면 아래 후보 3을 고르면 된다.

**(b) 후보**

| # | 후보 |
|---|---|
| 1 | **활성 패널 종속 컨트롤 + `defaultMode`는 초기값만** — 상태바 라디오가 활성 패널의 모드를 표시·변경. 패널별 모드 변경은 prefs에 쓰지 않고, `defaultMode`는 새 원고 패널의 초기 모드로만 쓴다 |
| 2 | **활성 패널 종속 컨트롤 + 마지막 변경을 prefs에 반영** — 오늘 동작(`useMenuCommandRouter.ts:126, 131`)을 그대로 유지 |
| 3 | **전역 단일 모드 유지** — 모드는 창 전역 1개. 패널별 독립을 포기 |

**(c) 대가**

| | 후보 1 | 후보 2 | 후보 3 |
|---|---|---|---|
| 변경 파일 | `src/store/appStore.ts:65-71`(모드 필드 이관), `src/components/StatusBar.tsx:26-92`, `src/hooks/useMenuCommandRouter.ts:75-76, 123-133`, `src/hooks/usePreferencesInit.ts:58`, `src/App.tsx:78, 148` | 후보 1과 동일 파일, prefs 쓰기 유지 | `src/App.tsx:78, 148`만 (패널마다 같은 값 전달) |
| 깨질 테스트 | `tests/editor/editMode.test.ts`(60줄)는 **깨지지 않는다**(뷰별 field 계약 무변경). 상태바 모드 테스트가 있으면 재작성 | 동일 | 없음 |
| 압력받는 불변식 | 없음 | **REQ-PANEL-023 위반 소지** — 마지막으로 모드를 바꾼 패널이 전역 기본값을 결정해 다음 세션 모든 패널을 규정한다 | **REQ-PANEL-021 위반**. 스크립트 패널을 Source로 보려고 원고 패널까지 Source가 된다 |
| 얻는 것 | 의미론이 명확 | 오늘 코드 최소 변경 | 구현 최소 |

**(d) 잠정 권고**: **후보 1**.

근거: `defaultMode`라는 이름 자체가 "기본값"이며, 기본값을 마지막 사용값으로 덮어쓰는 것은 다중 패널에서 의미가 붕괴한다(`design.md` §3 취지와 동일 — 두 축을 한 저장 경로로 합치지 않는다). 보조 패널의 별도 표시 축(줄바꿈 등)은 **이 SPEC에서 도입하지 않기를 권고한다** — 어느 요구사항도 요구하지 않으며 `spec.md` §D.6이 비마크다운 고급 편집 기능을 범위 밖으로 두었다.

---

#### OQ-4 — 포커스·라우팅 배선의 형태

**(a) 질문**: `useMenuCommandRouter`와 그 형제 4개 훅이 캡처하는 단수 `editorViewRef`(`src/App.tsx:97, 102-103, 119`)를 어떤 형태로 대체하는가. 활성 패널의 정의는 `spec.md` REQ-PANEL-030이 확정했으므로 남은 것은 **배선 형태**다.

**(b) 후보**

| # | 후보 |
|---|---|
| 1 | **활성 뷰 접근자 1개** — `panelStore`가 `getActiveView(): EditorView \| null`을 제공하고 5개 훅이 그것을 쓴다. 훅 시그니처는 `RefObject` 대신 접근자를 받는다 |
| 2 | **ref 의미론 유지** — `editorViewRef`를 "활성 패널의 뷰를 가리키는 ref"로 재정의하고 활성 전환 시 `.current`를 갱신. 훅 시그니처 무변경 |
| 3 | **각 훅에 패널 ID 인자 추가** — 호출부가 어느 패널을 대상으로 하는지 명시 |

**(c) 대가**

| | 후보 1 | 후보 2 | 후보 3 |
|---|---|---|---|
| 변경 파일 | `src/hooks/{useMenuCommandRouter,useCitationInsertFlow,useAiPalette,usePickAndInsertImage,useMemoCaretFocus}.ts` 시그니처 + `src/App.tsx` 호출부 | `src/App.tsx`의 ref 갱신 로직만 + `panelStore` 구독 | 위 5개 훅 + 모든 호출부 + 패널 ID 전파 경로 |
| 깨질 테스트 | 해당 훅 테스트의 인자 형태 | 거의 없음 | 위 5개 훅 테스트 전부 |
| 압력받는 불변식 | 없음 | **미묘한 위험**: `useMenuCommandRouter.ts:98`이 핸들러 진입 시 `.current`를 한 번 뽑아 쓰므로, 비동기 커맨드 처리 중 활성 패널이 바뀌면 낡은 뷰에 작용한다. 오늘은 뷰가 하나라 무해했다 | 없음. 대신 "활성 패널"이라는 개념이 호출부마다 반복 표현되어 REQ-PANEL-030의 단일 정의가 흐려진다 |
| 얻는 것 | 활성 패널 판정이 한 곳 | 변경 최소 | 명시성 최대 |

**(d) 잠정 권고**: **후보 1**.

근거: 후보 2의 "낡은 ref" 위험이 실재한다 — `useMenuCommandRouter.ts:98`의 `const view = editorViewRef.current`는 `async` 핸들러 첫 줄이고, 그 아래 `await`가 있는 분기가 여럿이다(`:111-115, :156-165, :170-180, :181-196`). 접근자 형태면 사용 시점에 활성 패널을 읽으므로 이 창이 닫힌다. 후보 3은 명시적이지만 REQ-PANEL-030이 정의한 "활성 패널"을 호출부마다 다시 계산하게 만들어 정의가 분산된다.

**함께 결정할 것**: `research.md` §4.3의 6개 `durumi:*` 창 전역 이벤트에 발신 패널 식별자를 싣는 방식(REQ-PANEL-034). CustomEvent `detail`에 필드를 추가하는 것이 최소 변경이며, 이벤트 버스 제거는 CodeMirror 데코레이션 계층 재작성을 뜻해 범위를 넘는다(`design.md` §4.3).

---

#### OQ-5 — pathGuard 마찰 · **확정: 후보 1 (신뢰 범위로 좁혀 표시)** — 동의 배너 기각

**결정 (사용자)**: 프로젝트 트리는 **실제로 열 수 있는 경로만 표시한다.** 신뢰 IPC 없음, 동의 배너 없음, 다이얼로그 유도 힌트 변형조차 없음. 신뢰 모델은 손대지 않으며 **SPEC-1 D-6은 쓰인 그대로 유지된다.**

**내 잠정 권고(후보 2 = 사용자 동의 승격)는 기각되었다.** 검토자 2인이 같은 논거로 기각했고, 그 논거를 기록한다:

> 렌더러 배너가 클릭 시 `project:trustRoot(path)` 같은 것을 호출한다면 그것은 **후보 3(자동 편입)에 클릭 가능한 라벨을 붙인 것**이다. 손상된 렌더러는 이미 모든 클릭과 모든 preload API를 통제하며, 권한 대상(authority target)은 여전히 매니페스트가 공급한다.

오늘 새 신뢰가 들어오는 경로는 **main이 소유한 OS 다이얼로그 하나뿐**임을 실측으로 확인했다 — `electron/ipc/shell.ts:122-125`:

```
ipcMain.handle('dialog:openFolder', async () => {
  const picked = await openFolderDialog();
  if (picked) allowSessionPath(picked);
  return picked;
});
```

**main 프로세스 다이얼로그를 통과하지 않는 동의는 D-6 보존이 아니라 UX를 입힌 자동 승격이다.** 내가 후보 2를 "기존 승격 경로 재사용"이라고 판단한 것은 틀렸다 — 재사용되는 것은 승격의 *결과*이고 승격의 *트리거*는 렌더러가 통제하는 클릭이다.

**기록해야 할 귀결 2건**:

**(1) 신뢰 확대는 쓰기만이 아니라 렌더러 읽기를 확대한다.** `electron/assetProtocol.ts:124`가 `durumi-asset://`를 **같은 `isAllowedPath` boolean**으로 게이트하고, 통과하면 `fs.readFile(absPath)` 후 확장자 기반 MIME 추측으로 바이트를 그대로 응답한다 — **크기 제한 없음**(`:128-130` 실측). 즉 신뢰 트리가 넓어지면 렌더러가 그 트리의 임의 파일 바이트를 프로토콜로 읽어낼 수 있다. **향후 어떤 승격 제안도 파일 열기만이 아니라 이 읽기 표면을 함께 논증해야 한다.**

**(2) 마찰은 수용된 비용이며 정직하게 기술한다.** 트리는 열 수 없는 대상을 제시해서는 안 되고, `X/scripts/`에 도달하려면 기존 폴더 열기 다이얼로그를 거친다. 이것을 **결함이 아니라 문서화된 사용자 경로**로 적는다 — REQ-PANEL-036b가 어포던스 범위를, AC-PANEL-036c가 "열 수 없는 대상을 제시하지 않는다"를 고정한다.

**후보 4(읽기/쓰기 신뢰 축 분리)는 원리적으로 옳은 장기 모델이며 검토자 2인도 그렇게 말했다.** 그러나 `isAllowedPath`가 단일 boolean을 반환하므로(`electron/pathGuard.ts:132`) 모든 `assertAllowedPath` 호출부 **더하기 위 asset 게이트**를 바꾼다. **별개의 향후 보안 SPEC으로 기록하며 SPEC-2 범위에서 명시적으로 제외한다.**
---

#### OQ-6 — 비마크다운 저장 경로와 CRLF · **확정: (i) 채널 분리 + (ii) (B′) EOL 복원**

### (i) 확정: 채널 분리 — 단, 세 곳 누락과 검증 의무 포함

**결정**: 마크다운 저장 경로와 raw(비마크다운) 저장 경로를 **별개 채널로 분리**한다.

**`file:save`만 분리하는 것은 불충분하다.** 오케스트레이터가 직접 확인한 세 곳을 반드시 포함한다:

| # | 누락 지점 | 사실 |
|---|---|---|
| 1 | **`file:saveAs`도 동일하게 migrate한다** | `electron/ipc/files.ts:78-112`가 같은 위치에서 `migratePendingInContent(content, dirname(result.filePath))`를 호출한다. **두 쓰기 경로 모두** 분리가 필요하다 |
| 2 | **Save As가 마크다운 필터를 하드코딩한다** | `electron/ipc/files.ts:92-97` `filters: [{ name: 'Markdown', extensions: ['md'] }]`. `.py` 패널에서 "다른 이름으로 저장"하면 `.md`만 제시된다. **보조 파일에 맞는 필터가 이 결정의 일부다** |
| 3 | **닫기 시 저장 라우팅도 갱신해야 한다** | `src/hooks/useAppCloseGuard.ts:26-33`이 close 시 저장을 라우팅하며, 그대로 두면 **가장 나쁜 시점에** 보조 파일 내용을 마크다운 경로로 보낸다 |

**codex의 정정 — 내 논거를 약화시키므로 흡수한다**: 채널 분리 **하나만으로는 오용이 표현 불가능해지지 않는다.** preload가 두 채널을 모두 노출하는 동안 렌더러 버그가 `.py`에 대해 마크다운 채널을 호출할 수 있다. 성질이 성립하려면 **둘 다** 필요하다:

1. **main이 마이그레이션 채널의 대상이 마크다운임을 검증한다** — 채널 진입 시 파일 종류를 판정해 마크다운이 아니면 거부.
2. **raw 채널에는 마이그레이션 import가 아예 없다** — 소스 스캔으로 단언 가능.

즉 "표현 불가능성"은 채널 분리가 **아니라** (분리 + main 측 검증 + import 부재) 세 겹이 만든다. 초판이 분리만으로 SPEC-1의 모달 금지 수준 보증을 얻는다고 쓴 것은 과장이었다. AC-PANEL-044b가 세 겹을 각각 고정한다.

**기각되었으나 기록하는 대안 (grok)**: 단일 채널 + 타입된 `kind: 'markdown' | 'raw'` 판별 유니온을 main에서 **exhaustive switch**로 처리. **exhaustiveness가 테스트로 강제되면** 거의 동등하게 강하고, 관례적 `if`에 머물면 약하다. 채널 분리를 선호하는 이유는 raw 채널에 마이그레이션 import가 **없음**을 소스 스캔으로 단언할 수 있다는 것 — 단일 채널에서는 같은 파일 안에 import가 존재하므로 그 단언이 불가능하다.

### (ii) 확정: **(B′)** — 문서에 EOL 저장, 직렬화 시 복원. (A)는 기각

**결정 (사용자, grok 제안)**: (B′)는 내가 산정한 (B)보다 **실질적으로 좁다**:

| 단계 | 동작 |
|---|---|
| 열기 (**보조 파일만**) | 지배적 EOL을 탐지해 **문서** 상태에 `eol: '\n' \| '\r\n' \| '\r'`로 저장 |
| 버퍼 | **내부적으로 LF 유지** — 오늘의 CodeMirror 현실 그대로, 변경 없음 |
| raw 저장 | `content.replace(/\n/g, eol)` |
| 조정 수학 | **손대지 않는다.** `toDocumentSpace` 미변경. CM `lineSeparator` Compartment 도입 **없음** |

**내 Residual-risk("B/C는 문서 좌표 접기 전제를 건드려 SPEC-1이 닫은 조정 AC를 재검증 대상으로 만든다")는 과장이었다.** 오케스트레이터가 확인하고 내가 재확인한 증거 2건이 그것을 대체한다:

1. **`src/editor/applyExternalChange.ts:51-52`가 이 모델을 자기 주석으로 이미 기술한다**: `구분자는 출력 시 직렬화에만 쓰인다`. (B′)는 새 전제가 아니라 **기존 코드가 이미 문서화한 설계**다.
2. **`tests/editor/reconcileIntegrity.test.ts:90-97`에 통과 중인 테스트가 이미 있다** — `'lineSeparator가 설정된 상태에서도 좌표가 어긋나지 않는다'`가 `crlfEditor('a\r\nb\r\nc')`를 만들고 `applyExternalChange(editor, 'a\r\nCHANGED\r\nc')`가 던지지도 손상시키지도 않음을 단언한다. **조정 계층의 CRLF 호환성은 이미 green으로 증명되어 있다.**

같은 파일 `:99-107`의 특성화 테스트(`[기록] CRLF 파일은 열리는 시점에 LF로 접힌다`)는 (B′) 아래에서도 **그대로 green이다** — (B′)는 읽기 방향의 접기를 유지하고 쓰기 방향만 복원하므로 그 테스트가 고정한 현재 동작을 바꾸지 않는다. 그 주석이 제시한 해소 경로("lineSeparator를 구성하고 저장 시 재직렬화")보다 (B′)가 좁은 이유가 여기 있다 — 바이트 보존에 필요한 것은 **쓰기 방향뿐**이다.

**결정적 논거 (AC 부기보다 상위)**: **`EPIC-V03-WORKSPACE.md:34`가 `.py`/`.bib`/`.csv`/`.json`의 바이트 무결성을 end-state 요구로 못박는다.** 첫 저장에서 모든 줄 끝을 다시 쓰는 보조 편집 표면을 출하하는 것은 각주가 아니라 **Epic 위반**이다. "편집 없이 열었다 닫으면 바이트 보존"은 참이지만 불충분하다 — **저장이 에디터의 목적이다.**

**필수 한계 — AC에 명시할 것**: 파일당 EOL 하나로는 **혼합(mixed) 줄 끝**을 담은 파일을 바이트 보존할 수 없다. 다음을 정의·명시한다(REQ-PANEL-048, AC-PANEL-048/048b):
- **탐지 정책**: 지배적 EOL. **동수 처리 규칙**을 명시한다 — `\r\n`과 `\n`이 같은 수면 `\r\n`을 택한다(CRLF가 LF를 포함하므로 LF 우선 시 CRLF 파일이 항상 손상되는 반면 그 반대는 혼합 파일에서만 발생한다).
- **혼합 줄 끝 바이트 보존은 명시적으로 범위 밖**이다 — 메커니즘이 제공할 수 없는 것을 AC가 약속하지 않게 한다.
- **EOL 목적상 "보조"로 세는 확장자**를 명시한다. 마크다운은 **의도적으로 오늘 동작을 유지한다**(issue #11 범위 밖).
---

#### OQ-7 — 탭 축을 도입하는가 (문서:패널 1:N vs M:N)

**(a) 질문**: 패널 하나 안에 여러 문서를 탭으로 쌓는가. `spec.md` §D.4가 이를 범위 밖 후보로 남겼고 채택 여부는 사용자 결정이다.

**(b) 후보**

| # | 후보 |
|---|---|
| 1 | **탭 없음** — 패널 1개당 문서 1개. 문서를 더 보려면 패널을 늘린다 |
| 2 | **탭 도입** — 패널 1개가 문서 스택을 갖고 그중 하나를 표시 |

**(c) 대가**

| | 후보 1 | 후보 2 |
|---|---|---|
| 변경 파일 | 없음 (기본 설계) | 탭 바 컴포넌트, `panelStore`에 문서 스택, REQ-PANEL-013의 "마지막 참조 패널" 판정 확장 |
| 깨질 테스트 | 없음 | 신규 표면이므로 깨지는 것은 없으나 AC 수가 늘어난다 |
| 압력받는 불변식 | 화면이 좁을 때 3~4개 파일을 동시에 보면 각 패널이 좁아진다 | **REQ-PANEL-013**: "마지막 참조 패널"이 "마지막 참조 탭"이 되고, 안 보이는 탭의 미저장 편집을 사용자가 인지하지 못한 채 패널을 닫는 경로가 생긴다. REQ-PANEL-053의 배너도 안 보이는 탭에서는 표시되지 않아 §6.4에서 기각한 "대기 배너" 문제가 재발한다 |
| 얻는 것 | 모든 열린 문서가 항상 보인다 — REQ-PANEL-053의 동시 표시가 자연히 성립 | VS Code 유사 UX, 많은 파일 관리 |

**(d) 잠정 권고**: **후보 1 (탭 없음), v0.3에서는**.

근거: 후보 2가 `design.md` §6.4에서 기각한 "보이지 않는 배너" 문제를 되살린다. 외부 변경 배너가 안 보이는 탭에 붙으면 사용자가 모르는 상태로 저장하고, 그것이 REQ-WS-028(사용자 확인 없이 편집 폐기 금지)의 거울상 결함이다. 탭은 v0.4 이후 별개 SPEC에서, 조정 알림의 탭 표면화 규칙을 함께 설계하는 것이 안전하다.

---

#### OQ-8 — ~~미검증 가설~~ → **기계적으로 재현된 확정 결함** (범위 축소됨)

**갱신 2 (2026-08-08, 기계 재현)**: 이 항목의 원래 질문("결함이 실재하는가")은 **가설이 아니라 실행으로 해소되었다.** 오케스트레이터가 **실제 모듈**(`attachExternalChangeChannel` + `useReconciliationStore` + `registerReconciliationExecutor` + 실제 `EditorState`)을 구동해 재현했다.

**관측된 출력 (verbatim)**:

```
[OQ-8]       emit 후 b.md 버퍼 = "A의 내용\n"
[OQ-8]       조정 상태 = "idle"
[OQ-8/dirty] emit 후 b.md 버퍼 = "B의 내용\n"
[OQ-8/dirty] 조정 상태 = "held-notify"
```

**증거 경로** (둘 다 디스크에 보존, AC에서 인용 가능):
- 실행 로그: `.moai/state/verify/goal-spec12345/oq8-repro.log`
- 재현 소스: `.moai/state/verify/goal-spec12345/oq8-repro-source.ts.txt`

**재현 조건**: 창이 `/w/b.md`를 버퍼 `"B의 내용\n"`으로 열고 미저장 편집 없음. 그 창이 **한 번도 열지 않았고 감시 등록도 하지 않은** 경로 `/w/a.md`에 대한 확정 `ExternalFileChange` 1건을 투입.

**관측 결과 세 가지** — 각각이 요구사항을 규정한다:

| # | 관측 | 함의 |
|---|---|---|
| 1 | `b.md` 버퍼가 `"A의 내용\n"`으로 **교체됨** | 열지도 않은 파일의 내용이 현재 버퍼에 적용된다. 저장하면 디스크 손실 |
| 2 | 조정 상태가 **`idle`** 로 정착 | 앱이 오적용을 **정상 완료로 취급한다.** 배너도 표시도 남지 않으므로 사용자가 알 수단이 없다 — **이것이 손실을 무성(silent)으로 만드는 지점** |
| 3 | `dirty-changed → isDirty: true` 선행 시 버퍼 불변 + `held-notify` | `!state.isDirty`(`:193`)가 **즉시 적용만** 막는다. **dirty 문서가 안전하다는 뜻이 아니다** — `pending`에 다른 경로의 변경이 심기고 배너 동작이 그것을 적용한다(§C M0의 D3 재현). 이 관측이 확립한 것은 **emit 시점 버퍼 불변**뿐이다 |

**초판이 놓쳤던 것 — 결함은 "크로스-윈도"보다 넓다**: 재현에서 그 창은 `a.md`를 **열지도, 감시 등록하지도 않았다.** 즉 두 창이 경쟁하는 상황이 필요 없고, **어떤 창이든 도착한 브로드캐스트를 무조건 자기 버퍼에 적용한다.** 따라서 "열려 있지 않은 경로의 이벤트는 폐기"(AC-PANEL-080b)는 방어적 부가 단언이 아니라 **1급 단언**이다.

**검증 범위의 정직한 분할** (혼동하면 안 되는 지점):

| 절반 | 검증 방식 | 근거 |
|---|---|---|
| **렌더러 절반** — 경로 미대조 → 무조건 적용 → `idle` 정착 | **기계적 실행.** 실제 모듈 3개 + 실제 `EditorState`. 대체된 것은 preload 브리지(`onExternalFileChange`)와 `DispatchTarget`뿐이며, 후자는 `src/editor/applyExternalChange.ts:63-67`이 테스트 seam으로 선언한 인터페이스다 | 위 증거 경로 2개 |
| **main 절반** — `broadcast()`가 그 경로를 등록하지 않은 창에도 전달 | **정적 소스 사실.** 실행하지 않았다 | `electron/ipc/project.ts:40-44` `BrowserWindow.getAllWindows()` |

**즉 엔드투엔드 다중 창 실행은 수행되지 않았다.** 렌더러 절반이 실행으로 확정되었고 main 절반은 소스로 확정되었다. 두 절반을 합친 창 간 시나리오는 추론이며, 그 추론의 유일한 미확인 고리가 "브로드캐스트가 실제로 그 창에 도착하는가"다 — `getAllWindows()`가 그것을 보장하지만 실행 관측은 없다. 이 구분을 AC에도 반영했다(AC-PANEL-084가 main 절반을 소스 스캔으로만 고정한다).

**결함은 REQ-PANEL-070으로 승격되어 M0이 재현 우선으로 닫는다.** `research.md` §7.3a가 이 재현을 기록하고, 남은 질문은 아래로 좁혀진다.

**(a) 질문**: **실제 `BrowserWindow` 2개**를 띄우는 e2e AC를 추가로 두어야 하는가. (유닛 계층 재현은 이미 성립함이 실행으로 확인되었으므로 "어떻게 재현하는가"는 더 이상 질문이 아니다 — 남은 것은 main 절반의 실행 관측을 추가할지다.)

**(b) 후보**

| # | 후보 |
|---|---|
| 1 | **유닛 재현 + main 절반은 소스 스캔** — 오케스트레이터 재현과 같은 형태를 영구 테스트로 정착시키고, `getAllWindows()` 브로드캐스트는 AC-PANEL-084의 소스 단언으로 고정 |
| 2 | **유닛 + 창 2개 e2e** — 후보 1에 더해 실제 창 2개 + 외부 파일 쓰기 시나리오를 e2e로 고정 |
| 3 | **창 2개 e2e만** |

**(c) 대가**

| | 후보 1 | 후보 2 | 후보 3 |
|---|---|---|---|
| 변경 파일 | 영구 유닛 테스트 1건 (재현 소스가 형태를 이미 보여줌) | 후보 1 + e2e spec 1건 + **다중 창 e2e 하네스 신규**(현재 없음 — `e2e/_helpers.ts`의 `launchClean`이 창 1개 전제) | e2e + 하네스 |
| 깨질 테스트 | 없음 | 없음 | 없음 |
| 압력받는 불변식 | **main 절반의 회귀가 실행으로 잡히지 않는다** — 누군가 `getAllWindows()`를 창별 필터로 바꾸면 소스 단언은 깨지지만, 반대로 브로드캐스트 경로에 새 버그가 생겨도 유닛은 잡지 못한다 | 없음 | 결정성이 낮다 — 창 2개 + 외부 파일 쓰기 + 타이밍이 얽혀 flaky. C-7(Windows e2e 부재)도 그대로 |
| 얻는 것 | 결정적·저비용. 재현이 이미 실행으로 성립했으므로 **형태가 검증되어 있다** | 창 축까지 실행으로 고정 | — |

**(d) 잠정 권고**: **후보 1**.

근거가 재현으로 강화되었다. 결함의 원인은 창이 아니라 라우팅 계층의 부재이며, 재현이 그것을 **창 하나로** 실증했다 — 창 2개가 필요하지도 않았고, 그 창은 문제의 파일을 열지도 않았다. 즉 창 축은 이 결함의 원인이 아니라 **증상이 드러나는 여러 형태 중 하나**다. 원인을 겨누는 유닛 테스트가 증상 하나를 겨누는 e2e보다 회귀 방어력이 높다.

후보 2의 다중 창 e2e 하네스 신설은 이 SPEC의 어느 요구사항도 요구하지 않으며, 창 간 소유권 모델(`spec.md` §D.4가 범위 밖으로 둔 작업)을 다룰 때 함께 만드는 것이 자연스럽다.

**함께 결정할 것**: 창 간 소유권 모델(어느 창이 어느 파일 감시를 소유하는가)은 `spec.md` §D.4가 범위 밖으로 둔 채 남는다. M0이 데이터 손실은 닫지만, 두 창이 같은 파일을 열었을 때의 알림 중복 같은 표면 문제는 남는다 — v0.4 이후 별개 항목으로 둘 것인지 확인이 필요하다.

---

#### OQ-9 — 패널 배치 persist를 어디에 담는가 — *오케스트레이터 확인 사실에서 파생*

**(a) 질문**: `shared/ipc-contract.ts`의 `Preferences`는 `sidebar`(`:37`), `rightSidebar`(`:53`), `memoPanel`(`:65`) **각 1개**의 geometry 슬롯만 갖는다. 패널 집합·분할 비율·패널별 파일 경로를 담을 슬롯이 **존재하지 않는다**. REQ-PANEL-006이 요구하는 배치 복원을 어떤 형태로 담는가.

**(b) 후보**

| # | 후보 |
|---|---|
| 1 | **`Preferences`에 `panels` 배열 신설** — `panels: Array<{ path: string \| null; ratio: number }>` 형태를 prefs 스키마에 추가 |
| 2 | **`.moai`/앱 데이터의 별도 세션 파일** — prefs와 분리된 워크스페이스 세션 상태로 저장 |
| 3 | **persist하지 않음** — 매 세션 단일 패널로 시작. REQ-PANEL-006을 이 SPEC에서 삭제 |

**(c) 대가**

| | 후보 1 | 후보 2 | 후보 3 |
|---|---|---|---|
| 변경 파일 | `shared/ipc-contract.ts`(스키마), `shared/prefsValidation.ts`(검증·clamp), `electron/preferences.ts`(병합) | 신규 저장 경로 + IPC 채널 + main 측 읽기·쓰기 | 없음 |
| 깨질 테스트 | prefs 스키마·검증 테스트 | 없음 (신규 표면) | 없음 |
| 압력받는 불변식 | `PreferencesPatch`의 매핑 타입(`ipc-contract.ts:272-280`)이 배열을 `Preferences[K] extends unknown[] ? Preferences[K]` 로 통째 교체 처리하므로 부분 갱신이 안 된다 — 패널 하나 크기만 바꿔도 배열 전체를 보낸다. 또한 `assertPrefsPatchAllowed`(`pathGuard.ts:183-215`)는 `workspaceFolders`/`recentFiles`/`recentFolders`만 검사하므로 **패널 경로 배열이 신뢰 검증 없이 prefs에 들어간다** — 복원 시 `assertAllowedPath`가 막지만(REQ-PANEL-006b) prefs 자체는 임의 경로를 담게 된다 | 없음. 대신 저장 위치가 하나 늘어난다 | **REQ-PANEL-006 삭제.** 매 세션 배치를 다시 만들어야 한다 |
| 얻는 것 | 기존 persist 인프라 재사용 | 신뢰 경계와 prefs 스키마를 건드리지 않음 | 범위 최소 |

**(d) 잠정 권고**: **후보 1, 단 복원 시 검증을 REQ-PANEL-006b가 담당한다는 전제로**.

근거: 후보 2는 저장 위치를 하나 더 만들어 "설정은 어디에 있는가"를 흐린다. 후보 1의 두 대가는 관리 가능하다 — 배열 통째 교체는 패널 배치가 작은 데이터라 실질 비용이 없고, prefs에 미검증 경로가 담기는 것은 **복원 시점에** `assertAllowedPath`가 막으므로 신뢰 경계가 뚫리지 않는다(prefs는 신뢰의 근거가 아니라 후보 목록일 뿐이다 — `pathGuard.ts:145-150`이 `recentFiles`/`recentFolders`를 신뢰 소스로 쓰는 것과 달리 `panels`는 신뢰 소스로 쓰지 **않는다**는 것을 구현 시 명시해야 한다). 후보 3은 사용자가 매번 배치를 재구성하게 만들어 멀티패널의 실용성을 떨어뜨린다.

**결정 시 함께 확정할 것 — 후보 무관 조건 (D7)**: 어느 후보를 택하든 **패널 경로를 담는 저장 슬롯은 신뢰 판정에서 구조적으로 제외되어야 한다.** 즉 `pathGuard`의 신뢰 소스 집합에 추가되지 않고 `isAllowedPath`가 그 값을 참조하지 않는다. 이것은 후보 선택과 **독립적인 제약**이며 **REQ-PANEL-006이 `shall not`으로 담는다.**

**왜 후보 1에서 특히 위험한가**: `prefs:set` 가드(`assertPrefsPatchAllowed`)는 `workspaceFolders` / `recentFiles` / `recentFolders` **세 필드만** 검사한다(`electron/pathGuard.ts:188`). 신규 `panels` 필드는 **기본적으로 그 검사를 통과하므로**, 금지를 요구로 명시하지 않으면 구현이 자연스럽게 취약해진다. 렌더러가 임의 경로를 패널 배치에 심어 신뢰를 넓히는 것이 OQ-5에서 기각한 것과 **같은 공격 형태**다(D-6/C-4).

**후보 2(별도 세션 파일)도 면제되지 않는다**: prefs 밖에 저장하더라도 렌더러가 쓸 수 있는 경로라면 같은 형태가 성립한다. 조건은 저장 위치가 아니라 **"신뢰 판정의 입력이 되지 않는다"** 다.

---

### §A.3 결정되지 않았음에도 마일스톤이 진행 가능한 이유

**M0은 어떤 결정도 기다리지 않는다** — 라우팅 계층의 위치가 F6에 의해 강제되므로 선택지가 없고(`design.md` §6.2a), 대상이 출하 중인 결함이므로 미룰 이유도 없다. **즉 승인 대기 중에도 M0은 착수 가능하다.**

**M1~M2·M6~M7은 이제 차단 해제되었다** — OQ-1(레이아웃)·OQ-2(상태 소유)·OQ-5(pathGuard)·OQ-6(저장 경로 + EOL)이 확정되었다. 남은 미해결 5건의 시점은 아래와 같다.

| 결정 | 상태 | 시점 |
|---|---|---|
| — | — | **M0 — 결정 무의존, 즉시 착수 가능** |
| **OQ-1** 레이아웃 | ✅ 확정 (후보 1, 논거 교체) | M1~M2 차단 해제 |
| **OQ-2** 상태 소유 | ✅ 확정 (축 분리 + v0.3 dual-open 금지) | M1 차단 해제 |
| **OQ-5** pathGuard | ✅ 확정 (후보 1, 동의 배너 기각) | M2·M7 차단 해제 |
| **OQ-6** 저장 경로 + EOL | ✅ 확정 ((i) 채널 분리 + main 검증, (ii) B′) | M5~M6 차단 해제 |
| OQ-7 탭 축 | 미해결 | M2 착수 전 (레이아웃 형태를 규정). **OQ-2의 dual-open 금지가 이 결정에 압력을 준다** — 탭은 문서:패널을 M:N으로 만들어 금지 조건의 판정 대상을 늘린다 |
| OQ-3 모드 컨트롤, OQ-4 라우팅 배선 | 미해결 | M4 착수 전 |
| OQ-8 창 축 AC 범위 | 미해결 (범위 축소됨) | M3 착수 전. **핵 결함은 M0이 닫으므로 "창 2개 e2e를 추가할 것인가"만 남았다** |
| OQ-9 패널 배치 persist | 미해결 | M8 착수 전 |

### §A.4 조사에서 드러난, 이 SPEC이 처음 배선하는 것

SPEC-1이 계층은 만들었으나 **프로덕션 호출부가 0곳**인 표면 두 가지가 있다. 둘 다 이 SPEC의 산출물이다:

| 표면 | 현재 상태 | 근거 |
|---|---|---|
| `window.api.projectDiscover` | 렌더러 호출부 **0곳** — 계약(`shared/ipc-contract.ts:412`)·preload(`electron/preload.ts:37`)·핸들러(`electron/ipc/project.ts:139`)만 존재 | `research.md` §7.2 |
| `resolveWatchScope` / `registerWatchScope` | 프로덕션 호출부 **0곳** — 정의(`electron/watchScope.ts:37, 67`)와 테스트만 | `research.md` §7.1 |

즉 **규약 폴더 감시(REQ-WS-045)와 프로젝트 상태 표시가 아직 배선되지 않았다.** 이 SPEC이 프로젝트 트리·패널을 만들면서 처음 배선한다. `resolveWatchScope`의 `openFiles`가 이미 `readonly string[]`이므로 REQ-PANEL-050과 형태가 일치한다 — 재작성이 아니라 배선이다.

**여기에 세 번째가 있다 — 그리고 그것이 M0의 존재 이유다.** 확정 이벤트의 **경로 라우팅 계층**도 프로덕션에 없다. SPEC-1은 조정 코어를 의도적으로 경로 무지로 만들고(`tests/electron/extensionIndependence.test.ts:162` "조정 계층은 경로를 아예 받지 않는다 — 그 자체가 확장자 독립의 증거다") 라우팅을 위 계층에 남겼는데, 그 계층이 만들어지지 않았다. 위 두 항목은 **기능이 없는 것**이지만 이것은 **출하 중인 데이터 손실 경로**다(REQ-PANEL-070·071). 그래서 M0이 기능 마일스톤보다 앞선다.

### §A.5 PRESERVE — 이 SPEC이 건드리지 않는 파일

> 아래 목록의 파일은 **읽기만 한다.** 변경이 필요하다고 판단되면 blocker report로 되돌린다.

**절대 금지 (외부 불변식)**

| 경로 | 근거 |
|---|---|
| `docs/DOCUMENT_MODE_PRINCIPLES.md` | SPEC-1 AC-WS-037이 `git diff --quiet` exit 0을 불변식으로 요구. C-9, REQ-PANEL-047 |
| `.moai/specs/SPEC-V03-WORKSPACE-001/**` | `status: completed` (커밋 `3a51f72`). 완료된 SPEC 아티팩트는 불변 |
| `.moai/specs/EPIC-V03-WORKSPACE.md` | Epic 지도. 이 SPEC이 개정 대상이 아니다 |
| `docs/v0.3-signoff.md` | SPEC-1 sync 산출물 |

**보존 (REQ-PANEL-002 / C-10 — 관측 동작·계약 무변경)**

| 경로 | 보존 이유 |
|---|---|
| `src/store/sidebarStore.ts` | state·action·폭 경계 무변경 (OQ-1 후보 1 전제) |
| `src/store/rightSidebarStore.ts` | 동일 |
| `tests/store/sidebarStore.test.ts` (113줄) | 무변경 통과가 REQ-PANEL-002의 증거 |
| `tests/store/rightSidebarStore.test.ts` (118줄) | 동일 |
| `tests/sidebar/sidebarReorg.test.tsx` (317줄) | 동일 |
| `tests/sidebar/rightSidebar.test.tsx` (293줄) | 동일 |
| `shared/prefsValidation.ts` (`WIDTH_BOUNDS`) | 폭 경계 SSOT. main `setPreferences`와 양방향 계약 |
| `src/editor/editMode.ts` | 뷰별 모드 field 계약 무변경 (`design.md` §1 F4). 모드 **값의 출처**만 바뀐다 |
| `tests/editor/editMode.test.ts` | 무변경 통과 |

**절대 금지 — 조정 코어 5파일 (C-12 / REQ-PANEL-072, 테스트로 고정)**

`tests/electron/extensionIndependence.test.ts` `:34-40`이 열거하고 `:42-65`(확장자 판독 수단 부재) + `:171-174`(`applyExternalChange` arity 2)가 강제한다. **라우팅 키는 이 다섯 파일 밖 `src/store/` 계층에 산다** (`design.md` §6.2a).

| 경로 | 무변경 이유 |
|---|---|
| `electron/changeConfirmation.ts` | `LAYER_FILES`. 확장자 판독 수단 도입 금지 |
| `electron/watchScope.ts` | `LAYER_FILES`. `openFiles` 복수형이 이미 맞다 — **배선만** 추가 |
| `shared/reconciliation.ts` | `LAYER_FILES`. `reduceReconciliation(state, event, policy)` 시그니처 유지, `ReconciliationState` 필드 정의 유지. `composing`(`:57`)도 그대로 — 상태를 문서별로 키잉하면 자동으로 문서별이 된다 (`design.md` §6.2b) |
| `src/editor/minimalDiff.ts` | `LAYER_FILES`. 최소 diff 계산은 문서 축과 무관 |
| `src/editor/applyExternalChange.ts` | `LAYER_FILES`. `applyExternalChange(target, nextContent)` **arity 2 고정**(`:171-174`). `target`이 이미 패널 식별자이므로 라우팅은 호출자가 target을 고르는 것으로 성립한다. 단 `registerReconciliationExecutor`(`:123-132`)의 **등록 방식**은 REQ-PANEL-055에 따라 바뀐다 — 그 함수는 arity 단언 대상이 아니다 |
| `tests/electron/extensionIndependence.test.ts` | 무변경 통과가 C-12의 증거 |

**보존 — 이미 패널 준비가 된 CodeMirror `StateField` 계열 (`design.md` §2.1a)**

| 경로 | 보존 이유 |
|---|---|
| `src/editor/editMode.ts:28` `editModeField` | `StateField`이므로 `EditorState`마다 하나 — 패널별이 공짜다. 모드 **값의 출처**만 바뀐다 |
| `src/editor/docPath.ts:17` `docPathField` | 동일 |
| `src/editor/viewModes.ts:21, 33` `focusModeField` / `typewriterModeField` | 동일 |
| `src/editor/MarkdownEditor.tsx:89` `history()` | extension이 `EditorState`에 붙어 별개 undo 스택이 공짜 |
| `src/editor/compositionGate.ts`의 게이트 구현 (`attachCompositionGate`) | 지연 드레인·연속 조합 취소 로직은 정교하고 검증되어 있다. 바뀌는 것은 **어디로 dispatch하는가**(`:109, 112`)뿐이다 |
| `src/editor/decorations/index.ts:32-76` `liveDecorations` (43항목) | 평면 배열 통째로 넣거나 빼는 입도가 REQ-PANEL-042와 일치. 43항목을 개별 분해하지 않는다 |
| `electron/pathGuard.ts` | C-4 — OQ-5가 후보 2로 확정되어도 기존 다이얼로그 경로를 재사용하므로 이 파일은 무변경 |
| `electron/changeConfirmation.ts` | SPEC-1 확정 계층. 경로별이므로 무변경 |
| `electron/externalWatch.ts` | 경로별 서비스. 무변경 |
| `electron/watchScope.ts` | `openFiles` 복수형이 이미 맞다. **배선만** 추가 |
| `shared/projectFolders.ts` | 폴더 역할·기본값·제외 역할. REQ-PANEL-057이 승계 |
| `shared/manuscriptMetadata.ts` | SPEC-1 메타데이터 계산. 표면만 패널 종속으로 바뀐다 |
| `shared/manuscriptTemplates.ts` | front matter 키 출하 선례 |

**하네스 스캐폴딩 — 커밋 대상이 아님**

`.claudeignore`, `.git_hooks/`, `.github/actions/`, `.github/branch-protection.json.gtmpl`, `.github/labels.yml`, `.github/workflows/label-sync.yml`, `.moai/README.md`, `.moai/config/`, `.moai/decisions/`, `.moai/docs/`, `.moai/evolution/`, `.moai/learning/`, `.moai/logs/`, `.moai/manifest.json`, `.moai/project/db/`, `.moai/reports/`, `CLAUDE.md`, `docs/superpowers/` — moai-adk 하네스 스캐폴딩. `git add -A` / `git add .` **금지**.

---

## §B 기술 접근

### B.1 계층 배치

`EPIC-V03-WORKSPACE.md` §6의 배치를 변경하지 않고 새 책임을 얹는다.

| 책임 | 위치 | 근거 |
|---|---|---|
| 패널 목록·활성 패널·패널 배치 | `src/store/` 신규 | 레이아웃은 렌더러 전용 |
| 문서 맵(경로 → 내용·dirty·종류·조정 상태) | `src/store/` 신규 | 버퍼는 렌더러에만 있다 |
| 파일 종류 판정 (확장자 → 마크다운/보조/언어) | `shared/` 신규 순수 함수 | main(다이얼로그 필터·저장 분기)과 renderer(extension 조립) 양쪽이 같은 판정을 봐야 한다 |
| 경로 대조·정규화 (REQ-PANEL-051) | `shared/` 신규 순수 함수 | Windows e2e 부재(C-7) → 유닛에서 양 플랫폼 재현 |
| 조정 상태 보관·라우팅 | `src/store/` (기존 `reconciliationStore` 재구성) | 전이 로직은 `shared/reconciliation.ts` 재사용 |
| 패널별 배너 표면 | `src/components/` (기존 `ReconciliationSurface` 재배치) | — |
| 비마크다운 저장 채널 (OQ-6 후보 1 시) | `shared/ipc-contract.ts` + `electron/ipc/files.ts` | IPC 계약 SSOT (C-3) |
| 프로젝트 트리 표면 + 수동 새로고침 어포던스 | `src/components/` | REQ-WS-047a가 SPEC-2에 넘긴 소유권 |

### B.2 함정 — `shared/`는 `electron/`을 import할 수 없다 (SPEC-1이 실측)

`tsconfig.web.json`이 `composite: true` + `include: [src/**, shared/**]`이므로 `shared/` → `electron/` import는 TS6307로 실패한다(SPEC-1 `research.md` §6.2). 파일 종류 판정을 `shared/`에 두면 `electron/ipc/files.ts:34`의 다이얼로그 확장자 목록을 참조할 수 없다.

SPEC-1이 같은 문제를 `REFERENCE_DIR_NAME`에서 겪고 **방향을 뒤집어** 해결했다: 상수를 `shared/projectFolders.ts`로 옮기고 `electron/referenceFs.ts`가 재export한다(그 파일 헤더 주석). 같은 형태를 적용한다 — 확장자 집합을 `shared/`에 정의하고 `electron/ipc/files.ts`가 그것을 읽는다. 두 값의 동일성 단언은 `tsconfig.test.json`(비-composite + node 타입)에서 성립하므로 `tests/`에 둔다.

### B.3 조정 계층의 문서 축 — 전이 로직 재사용

`reduceReconciliation(state, event, policy)`는 순수 함수다(`shared/reconciliation.ts:209-213`). 문서 축 도입에서 바뀌는 것은 **보관 구조와 라우팅**이며 전이 로직 자체는 재사용한다.

**[HARD] 라우팅 키의 위치는 선택 사항이 아니다.** C-12 / REQ-PANEL-072에 따라 조정 코어 5파일은 무변경이며, 라우팅은 `src/store/` 계층의 `Map` 3종(`path → ReconciliationState`, `path → DispatchTarget`, `path → 문서`)이 담는다. `applyExternalChange(target, nextContent)`의 arity 2는 유지되고, **`target`이 이미 패널 식별자**이므로 "어느 target에 적용할지 고르는 것"이 곧 라우팅이다. 상세와 기각된 대안은 `design.md` §6.2a.

```
확정 이벤트 (path 포함)
   │
   ├─ path가 열린 문서인가? ── 아니오 → 폐기 (REQ-PANEL-051)
   │        예
   ▼
문서 D의 state 조회 → reduceReconciliation(state[D], event, policy) → state[D] 갱신
   │
   └─ effects → 문서 D의 실행자 (REQ-PANEL-055)
```

정책은 창 단위로 유지한다(REQ-PANEL-056, `design.md` §6.5) — 시그니처가 이미 정책을 인자로 받으므로 구조 변경이 없다.

**조합 여부의 합류**: 문서 D의 `composing`은 D를 참조하는 패널 게이트들의 **논리적 OR**이다(`design.md` §6.3). 이것이 REQ-PANEL-054가 "패널별 독립"이면서 문서 축 판정을 요구하는 이유다.

### B.4 extension 조립의 3층

`design.md` §5.2의 층 구조를 그대로 구현한다. 조립 지점은 `MarkdownEditor.tsx:86-148` **하나로 유지**한다 — 두 곳에서 조립하면 공통 항목 10개가 드리프트하고, 그것이 `structure.md` §10이 기록한 `StyleSet` 중복과 같은 함정이다.

`editModeStateExtension()`은 보조 패널에도 **등록한다**(데코레이션 컴파트먼트만 뺀다). 이유: `currentEditMode`가 field 부재 시 `typora`로 폴백하고(`src/editor/editMode.ts:41-47`) 그 폴백은 레거시 테스트 호환용이므로, 프로덕션에서 폴백 값이 흘러들면 예측 불가해진다.

### B.5 언어 문법 — 새 의존성 0개

`@codemirror/language-data`는 이미 의존성이고(`package.json:39`) 오늘도 로드된다(`MarkdownEditor.tsx:8, 94`). 카탈로그의 `LanguageDescription`은 문법 본체를 지연 로드하므로 보조 패널을 열 때만 해당 언어 청크를 받는다. `.csv`처럼 카탈로그에 문법이 없는 경우는 REQ-PANEL-045의 평문 폴백이 정상 경로로 규정한다.

### B.6 열기 경로의 엄격 디코드

`file:openPath`는 오늘 `fs.readFile(path, 'utf8')`(`electron/ipc/files.ts:48`)로 읽는다 — Node의 `utf8` 디코딩은 잘못된 바이트를 U+FFFD로 **대체한다**. 바이너리를 열면 대체 문자 버퍼가 만들어지고 저장 시 원본이 파괴된다.

SPEC-1이 조정 경로에서 이미 해결했다: `decodeUtf8Strict`(`electron/externalWatch.ts:54-60`)가 `TextDecoder('utf-8', { fatal: true })`로 실패를 실패로 남긴다. **열기 경로에 같은 함수를 적용한다**(REQ-PANEL-046). 조정을 막아 놓고 열기로 뚫리면 방어가 무의미하다.

### B.7 창 전역 이벤트에 발신 패널 식별자

`research.md` §4.3의 6개 `durumi:*` 이벤트 payload에 발신 패널 식별자를 추가한다(REQ-PANEL-034). 이벤트 버스 제거는 CodeMirror 데코레이션(비-React DOM)이 React 계층에 신호를 보내는 유일한 경로를 없애는 것이므로 범위를 크게 넘는다(`design.md` §4.3).

### B.8 다중 인스턴스 테스트 하네스가 산출물이다

SPEC-1이 "조합 유지형 e2e 프리미티브 자체가 산출물"이라고 기록한 것과 같은 상황이다(`design.md` §9):

- `tests/hooks/useExternalChangeWiring.test.tsx:90`의 **"파일이 바뀌면 이전 파일의 감시를 먼저 푼다"** 단언은 N개 문서 동시 감시와 양립 불가하다. REQ-PANEL-050에 따라 "**마지막 참조 패널이 닫힐 때** 푼다"로 **뒤집는다** — 지우는 것이 아니다.
- `e2e/reconciliation-ime.spec.ts`의 6개 테스트는 단일 에디터·단일 배너 셀렉터를 쓴다. 패널별 배너를 도입하면 셀렉터가 패널을 지목해야 하고, **그 지목 수단이 계약의 일부**가 된다. 관측 수단 없이 요구만 쓰면 AC가 공허하게 통과한다.
- **`.cm-content` 셀렉터 이관 — 34파일, 명시적 작업 항목.** `grep -rl "cm-content" e2e/ | wc -l` → 34. 이 파일들은 `.cm-content`를 **유일 요소로 가정**한다. 패널 지목 수단을 도입하면 이 34파일이 "활성 패널의 `.cm-content`" 또는 "N번 패널의 `.cm-content`"를 지목하도록 이관되어야 한다. 이는 부수 효과가 아니라 M4의 계약 산출물과 **같은 작업**이며, 별도로 계상한다. `design.md` §3.2a가 이 이관과 `.cm-content` 측정폭 문제의 순서 의존을 설명한다 — 이관 없이 전역 CSS를 좁히면 34파일이 먼저 깨진다.
- **M0의 재현 테스트는 신규 산출물이다.** 두 결함(경로 미대조·조합 플래그 공유) 모두 컴파일 오류를 내지 않고 조용히 실패하므로, 실패를 실증하는 테스트가 없으면 수정 여부를 확인할 방법이 없다. 재현은 **같은 렌더러에 문서 2개**로 구성한다(OQ-8 권고) — 결함의 뿌리가 창이 아니라 라우팅 부재이므로 등가이고 결정적이다.

---

## §C 마일스톤

> 우선순위 라벨만 사용한다. 기간 예측 없음.
> 각 마일스톤은 **자기 AC를 닫을 수 있게 밀폐적으로** 설계했다. SPEC-1의 AC-WS-023 분할 교훈(밀폐 가능한 부분과 후속 마일스톤 의존 부분을 분리)을 따라, 밀폐 불가한 AC는 해당 마일스톤에 **명시적으로 배정하지 않았다**.

### §C.0 배정 규약 — 모든 REQ와 AC는 최소 한 마일스톤에 배정된다

> **N1이 드러낸 축**: REQ↔AC 양방향 확인이 깨끗해도 **REQ→마일스톤 배정**은 검사되지 않을 수 있다. 판 0.3.2까지 AC 목록을 가진 마일스톤은 **M0 하나뿐**이었고 M1~M8은 배정 축이 아예 없었다. 판 0.3.3에서 전 항목을 기계 점검해 채웠다.

**규약**: 각 마일스톤은 `대상 요구:`와 `대상 AC:` **두 줄을 모두** 가진다. 요구나 AC를 새로 만들면 **선언과 동시에** 배정한다 — 배정 없는 항목은 승인된 실행 범위에서 조용히 누락된다.

**교차 마일스톤 항목** (특정 마일스톤에 배정되지 않는 것들, 의도된 예외):

| AC | 성격 | 적용 시점 |
|---|---|---|
| AC-PANEL-090 / 091 / 092 / 093 | 품질 게이트 (typecheck / lint·test / 커버리지 / 커밋 위생) | **모든 마일스톤의 완료 조건** — 특정 마일스톤 소유가 아니다 |
| AC-PANEL-094 | 릴리스 게이트 (수동 한글 IME 스모크) | v0.3 릴리스 사인오프. SPEC-1 AC-WS-024와 함께 |

`AC-PANEL-095`(e2e 셀렉터 이관)는 예외가 아니라 **M4 소속**이다 — 패널 지목 수단 도입과 같은 작업이기 때문이다(`design.md` §3.2a).

**점검 방법 (재현 가능)**: `spec.md`의 `^\*\*REQ-PANEL-` 와 `acceptance.md`의 `^### AC-PANEL-` 로 인벤토리를 만들고, `plan.md`의 `^대상 요구:` / `^대상 AC:` 줄을 파싱해 차집합을 구한다. 판 0.3.3 실행 결과는 `progress.md` §E.1c에 기록했다.

---

### M0 — 출하 중인 결함 두 건의 재현 우선 해소 (Priority: **Highest**, 기능 마일스톤보다 앞선다)

**선행 조건 없음.** OQ-1~OQ-9의 어느 결정도 이 마일스톤을 막지 않는다 — 라우팅 계층의 **위치**는 F6이 강제하므로(`design.md` §6.2a) 선택의 문제가 아니다.

두 결함은 v0.2.31에 **이미 출하되어 있고** 오케스트레이터가 코드 직독으로 확인했다. 멀티패널이 만드는 결함이 아니라 곱하는 결함이므로, 기능을 얹기 전에 닫는다.

**(1) 무성 버퍼 덮어쓰기 (REQ-PANEL-070) — 기계적으로 재현됨**
사슬: `electron/ipc/project.ts:40-44`(모든 창 브로드캐스트) → `src/store/externalChangeChannel.ts:28-50`(`change.path` 미대조) → `src/store/reconciliationStore.ts:39`(`autoApplyPolicy`) → `shared/reconciliation.ts:192-197`(경로 검사 없이 `apply-to-buffer`).

**렌더러 절반은 실제 모듈로 재현되었다** (`attachExternalChangeChannel` + `useReconciliationStore` + `registerReconciliationExecutor` + 실제 `EditorState`). 증거: `.moai/state/verify/goal-spec12345/oq8-repro.log`, 재현 소스 `.moai/state/verify/goal-spec12345/oq8-repro-source.ts.txt`. 관측 출력:

```
[OQ-8]       emit 후 b.md 버퍼 = "A의 내용\n"      ← 열지 않은 파일의 내용이 적용됨
[OQ-8]       조정 상태 = "idle"                    ← 오적용이 정상 완료로 정착
[OQ-8/dirty] emit 후 b.md 버퍼 = "B의 내용\n"      ← emit 시점만 불변 (배너 경유로는 오염됨 — D3)
[OQ-8/dirty] 조정 상태 = "held-notify"
```

세 가지가 M0의 목표를 규정한다:
- **버퍼 교체**: 그 창은 `/w/a.md`를 열지도 감시 등록하지도 않았는데 그 내용을 받았다. 즉 결함은 "두 창의 경쟁"이 아니라 **어떤 창이든 도착한 브로드캐스트를 무조건 적용한다**는 것이다.
- **`idle` 정착**: 배너도 상태 표시도 남지 않아 사용자가 알 수단이 없다 — **이것이 손실을 무성으로 만든다.** 버퍼 내용만 고치고 상태 의미론을 그대로 두면 결함의 절반만 닫는다.
- **dirty는 즉시 적용만 면한다**: `!state.isDirty`(`:193`)가 즉시 적용을 막지만 **dirty 문서를 안전하게 만들지 않는다** — `pending`에 다른 경로의 변경이 심겨(`:206`) 배너 동작이 그것을 적용한다(`:251-257`). 따라서 **AC는 깨끗한 문서 케이스(AC-PANEL-080)와 dirty 문서의 `pending`·배너 동작(AC-PANEL-080c)을 모두 다뤄야 한다** — 어느 한쪽만 검사하면 결함의 절반이 통과한다.

main 절반(`getAllWindows()` 브로드캐스트가 미등록 창에도 전달)은 **정적 소스 사실이며 실행하지 않았다.** 엔드투엔드 다중 창 실행은 수행되지 않았다 — OQ-8의 검증 범위 분할 표 참조.

**감사가 추가로 기계 재현한 두 얼굴 (판 0.3.1)**:

| 얼굴 | 관측 | 요구 |
|---|---|---|
| **dirty 문서도 오염된다** — 배너 클릭 1회 뒤 | `pending.path = "/w/a.md"`가 `b.md` 문서 상태에 심기고, 불러오기가 `a.md` 내용을 적용 | AC-PANEL-080c. 초판의 "dirty는 이미 올바르게 동작한다"는 **거짓이었다** |
| **`detach()`가 조합 보류를 영구 latch** | `detach 후 composing = true`, 이후 조정이 `held-composition`에 정착 | REQ-PANEL-071 detach 해제 의무 + AC-PANEL-081b |

증거: `.moai/state/verify/goal-spec12345/d3d4-repro.log`, `…/d3d4-repro-source.ts.txt`.

**설계 공백 1건 (코드 직독)**: 재바인딩 시 라우팅 키 미갱신 — REQ-PANEL-070a + AC-PANEL-080e. `design.md` §6.2a가 승인 메커니즘(주입된 setter 클로저)과 `filePath` 결속을 확정한다.

**(2) 전역 조합 플래그 공유 (REQ-PANEL-071)**
`shared/reconciliation.ts:57`의 `composing`이 창 전역 단일 boolean이고 어느 뷰의 게이트든 그것을 쓴다(`src/editor/compositionGate.ts:109, 112` ← `src/editor/MarkdownEditor.tsx:155`). 패널 B의 `compositionend`가 패널 A의 조합 보류를 해제해, `compositionGate.ts:9-25`가 막기 위해 작성된 실패 계열을 한 계층 위에서 재도입한다.

**작업 순서 (재현 우선 — REQ-PANEL-073)**

1. **RED**: 두 결함을 각각 실증하는 실패 테스트를 **영구 테스트로** 작성하고 실패를 확인한다.
   - (1)의 **형태는 이미 검증되어 있다** — 오케스트레이터의 재현 소스(`.moai/state/verify/goal-spec12345/oq8-repro-source.ts.txt`)가 실제 모듈 3개 + 실제 `EditorState`로 성립함을 보였다. 그 임시 파일은 삭제되었고 **영구 테스트의 형태는 이 SPEC이 정한다**: 대체하는 것은 preload 브리지(`onExternalFileChange`)와 `DispatchTarget`(테스트 seam — `src/editor/applyExternalChange.ts:63-67`)뿐이고, 채널·스토어·실행자·문서 상태는 실제 모듈을 쓴다. 검사 대상은 **버퍼 내용 + 조정 상태 + 미등록 경로 폐기 + 깨끗한 문서/dirty 문서 두 분기**다(AC-PANEL-080 / 080b / 080c).
   - (2)는 게이트 2개를 붙여 한쪽의 `compositionend`가 다른 쪽 보류를 푸는 것을 단언한다(AC-PANEL-081).
   - **(3) 재바인딩 재키잉** — 패널을 A→B로 재바인딩한 뒤 A의 변경이 도달하지 않고 B의 변경이 도달함을 단언한다(AC-PANEL-080e). 수정 전에는 **정확히 반대 결과**가 관측된다.
   - **(4) detach 해제** — 조합 중 게이트를 detach하면 보류가 해제되고 큐가 드레인됨을 단언한다(AC-PANEL-081b). 감사가 기계 재현했으므로 실패 형태가 이미 관측되어 있다.
   - **(5) dirty `pending` 오염** — dirty 문서의 `pending`이 다른 경로의 변경으로 설정되지 않고, 배너 동작이 그 문서의 내용만 적용함을 단언한다(AC-PANEL-080c). 감사가 기계 재현했다.
   - **(6) null-path 키잉** — 경로 없는 문서가 Map 항목을 갖지 않고(null·빈 문자열을 키로 쓰지 않음), 경로 획득 시 등록됨을 단언한다(AC-PANEL-080f / REQ-PANEL-070b).
   - **(7) teardown 순서** — 해제가 실행자 분리보다 먼저 일어나 드레인이 손실되지 않음을, 또는 "해제는 드레인하지 않는다"는 규정을 택했음을 단언한다(AC-PANEL-081c / REQ-PANEL-071a). **규정 없이 두는 것이 이 항목의 실패 조건이므로, M0에서 선택이 이루어져야 한다.**
   - 두 재현 모두 **창 2개가 필요 없다** — 재현이 창 하나로 결함을 실증했고, 원인은 창이 아니라 라우팅 부재다.
2. **GREEN**: `src/store/` 계층에 라우팅 키(`Map<path, …>` 3종)를 세운다. `design.md` §6.2a의 배치를 그대로 따른다.
3. **불변식 확인**: `tests/electron/extensionIndependence.test.ts` 무변경 통과 (C-12). 조정 코어 5파일의 `git diff --quiet` exit 0.

대상 요구: REQ-PANEL-070, **070a**(재키잉), **070b**(null-path 키잉), 071, **071a**(teardown 순서), 072, 073
대상 AC: AC-PANEL-080 / 080b / 080c / 080d / **080e** / **080f** / 081 / **081b** / **081c** / 082 / 083 / 084
**밀폐성**: 완전히 밀폐된다 — 상태 계층 유닛만으로 닫히고 편집 표면·레이아웃·패널 UI가 필요 없다. **이것이 M0을 맨 앞에 둘 수 있는 이유이며, 나머지 마일스톤 전부가 이 라우팅 계층 위에 선다.**

> **주의**: M0의 GREEN은 `shared/reconciliation.ts`·`src/editor/applyExternalChange.ts`를 **건드리지 않는다**. `reduceReconciliation(state, event, policy)` 시그니처와 `applyExternalChange(target, nextContent)` arity 2가 그대로 유지되며, 라우팅은 그 호출자에 생긴다. 코어를 고치려는 충동이 들면 C-12와 `design.md` §6.2a의 기각된 대안 표를 읽는다.

### M1 — 문서·패널 상태 모델 (Priority: High, 번복 가능성 최상)

**선행 조건: OQ-1·OQ-2 확정.**

`src/store/`에 문서 맵과 패널 목록을 정의한다. 문서: 경로·내용·dirty·파일 종류. 패널: 참조 문서·표시 모드·활성 여부. 같은 문서를 N개 패널이 참조하는 관계, 마지막 참조 패널 판정, 저장의 문서 단위 성립을 순수 상태 전이로 기술한다. `appStore`의 문서 필드를 이관하고 창 전역 필드(테마·언어)만 남긴다.

**확정 사항 3건이 이 마일스톤에 들어온다 (OQ-2)**:
1. **dirty는 `currentRevision !== savedRevision` 파생값**이다 — 가변 boolean을 두지 않는다(REQ-PANEL-015). sticky(issue #12)가 구조적으로 재도입될 수 없고, **저장의 await 창 결함도 무료로 닫힌다**(`design.md` §2.3). `markClean()` 호출부 2곳(`useFileMenuCommands.ts:51-64`, `useAppCloseGuard.ts:24-33`)이 revision 대입으로 바뀐다.
2. **dual-open은 금지된다** — 이미 열린 파일을 다시 열면 그 패널을 활성화한다(REQ-PANEL-011). 판정은 경로 동일성이며 **별칭(심볼릭/하드 링크)은 탐지하지 않음을 명시**한다(REQ-PANEL-011a).
3. **축은 붕괴시키지 않는다** — v0.3이 1:1로만 쓰더라도 저장은 "문서 단위", 폐기 확인은 "마지막 참조 패널인가"로 표현한다(REQ-PANEL-012/013). v0.4의 dual-open이 재작성이 되지 않게 하는 조건이다.

대상 요구: REQ-PANEL-001, 010, 011, 011a, 012, 013, 014, 015
대상 AC: AC-PANEL-001 / 010 / 010b / 011 / 011a / 011b / 012 / 013 / 013b / 014
**밀폐성**: 스토어 계층 유닛으로 전부 닫힌다. 편집 표면 없이 검증 가능.

### M2 — 레이아웃 셸과 단일 패널 축퇴 (Priority: High, 번복 가능성 상)

**선행 조건: OQ-1 확정, OQ-7 확정 권장.**

패널 컨테이너를 배치하고 분할·닫기·공간 재배분을 구현한다. **단일 패널 축퇴가 오늘의 동작과 관측상 구분되지 않음**을 회귀 테스트로 고정하는 것이 이 마일스톤의 1차 산출물이다. 사이드바 스토어·탭 구조·폭 경계 무변경을 단언한다. 프로젝트 트리 표면의 골격과 수동 새로고침 어포던스를 배치한다(REQ-WS-047a 인계).

`MarkdownEditor`를 인스턴스화 가능한 형태로 만드는 것이 여기 포함된다 — `design.md` §1 F1이 말하는 유일한 물리적 지점이다.

**확정 사항 2건이 이 마일스톤에 들어온다**:
1. **사이드바 데이터 재배선 (OQ-1의 필수 비용)** — `Sidebar`/`RightSidebar`의 스칼라 `content`/`view` prop(`src/App.tsx:124-127`, `:163-166`)과 목차·인용·검색 히트 경로(`:129-142`)를 **활성 원고 패널** 기준으로 다시 배선한다(REQ-PANEL-065). **`RightSidebar`는 "활성 원고 패널"에 속하며 "가장 왼쪽 패널"에 속하지 않는다** — AC-PANEL-065가 패널 순서와 데이터 귀속을 의도적으로 어긋나게 배치해 그 혼동을 잡는다. CSS는 거의 변하지 않지만 **이 재배선이 (1)의 실제 비용**이다(`design.md` §3.1a).
2. **프로젝트 트리는 신뢰 범위로 좁혀 표시한다 (OQ-5)** — 클릭 시 `PathNotAllowedError`가 날 대상을 제시하지 않는다(REQ-PANEL-036b, AC-PANEL-036c). 신뢰 IPC·동의 배너를 **추가하지 않는다**. 마찰은 수용된 비용이며 폴더 열기 다이얼로그가 문서화된 경로다.

대상 요구: REQ-PANEL-002, 003, 004, 005, 007, 036, 036b, 036c, 065
대상 AC: AC-PANEL-002 / 002b / 002c / 003 / 003b / 004 / 005 / 007 / 036 / 036b / 036c / 036d / 065
**밀폐성**: 레이아웃·사이드바 보존·축퇴·재배선·트리 범위는 컴포넌트 테스트로 닫힌다. REQ-PANEL-006(배치 persist)은 M8로 미룬다 — persist 형태가 최종 레이아웃과 OQ-9에 의존한다.

### M3 — 조정 계층의 문서 축 (Priority: High, 정확성 핵심)

**선행 조건: OQ-8 재현 결과 (재현은 이 마일스톤과 병행 가능).**

확정 이벤트를 경로로 라우팅하고 조정 상태를 문서별로 보관한다. 실행자를 모듈 싱글턴에서 문서별 등록으로 바꾼다. 정책 주입 지점을 창 단위로 보존한다. 감시 등록을 열린 문서 전부로 확장하고 참조 카운트로 등록·해제한다. 경로 대조를 순수 함수로 분리해 Windows/macOS 양 플랫폼을 유닛에서 재현한다(C-7).

`tests/hooks/useExternalChangeWiring.test.tsx`의 "이전 파일 감시를 먼저 푼다" 단언을 뒤집는 재작성이 이 마일스톤의 산출물이다(§B.8).

대상 요구: REQ-PANEL-050, 051, 052, 055, 056, 057
대상 AC: AC-PANEL-050 / 050b / 051 / 051b / 052 / 055 / 055b / 056 / 057 / 057b
**밀폐성**: 상태 기계·라우팅·감시 등록은 유닛으로 닫힌다. REQ-PANEL-053(패널별 배너 표면)과 REQ-PANEL-054(IME 게이트 합류)는 편집 표면과 조합 관찰이 필요하므로 M4로 미룬다.

### M4 — 포커스·라우팅과 패널별 배너·IME 게이트 (Priority: High, 위험 최상)

**선행 조건: OQ-3·OQ-4 확정.**

활성 패널 판정을 구현하고 뷰 의존 커맨드를 활성 패널로 라우팅한다. 마크다운 전용 커맨드가 보조 패널 활성 시 아무 일도 하지 않고 컨트롤이 비활성됨을 고정한다. `durumi:*` 이벤트에 발신 패널 식별자를 싣는다. 모드 컨트롤을 활성 패널 종속으로 바꾸고 `defaultMode` 의미론을 확정한다. 배너를 패널별로 옮기고 N개 동시 표시·포커스 불변식을 고정한다. IME 게이트의 문서 축 합류(논리적 OR)를 구현한다.

**e2e 패널 지목 수단이 이 마일스톤의 계약 산출물이다**(§B.8) — 없으면 IME·배너 AC가 공허하게 통과한다.

대상 요구: REQ-PANEL-020, 021, 022, 023, 024, 030, 031, 032, 033, 034, 035, 053, 054, 058
대상 AC: AC-PANEL-020 / 021 / 022 / 023 / 024 / 030 / 030b / 031 / 032 / 032b / 033 / 034 / 035 / 053 / 053b / 053c / 053d / 054 / 054b / 058 / **095**(e2e `.cm-content` 셀렉터 이관 — 패널 지목 수단과 같은 작업)
**밀폐성**: 라우팅·모드·게이트는 유닛으로, 배너 동시 표시와 포커스 불변식은 컴포넌트 테스트로 닫힌다. 실제 macOS 한글 IME 검증은 릴리스 게이트로 이관한다(C-8).

### M5 — 비마크다운 편집 표면: 열기와 extension 조립 (Priority: High)

파일 종류 판정을 `shared/`에 순수 함수로 정의한다(B.2의 방향 뒤집기 적용). extension 조립을 3층으로 재구성하고 보조 패널에서 마크다운 전용 확장 전부가 로드되지 않음을 단언한다. `@codemirror/language-data`로 `.py`/`.bib`/`.json`/`.yaml` 문법을 조달하고 `.csv`·미지 확장자는 평문 폴백한다. 열기 경로에 엄격 디코드를 적용해 바이너리를 편집 패널로 열지 않는다.

대상 요구: REQ-PANEL-040, 041, 042, 045, 046
대상 AC: AC-PANEL-040 / 041 / 042 / 045 / 046
**밀폐성**: 종류 판정·조립 목록·폴백·디코드는 유닛으로 닫힌다. REQ-PANEL-043/044(바이트 무결성·저장 변환 배제)는 저장 경로가 필요하므로 M6.

### M6 — 비마크다운 저장 경로와 바이트 무결성 (Priority: High)

**선행 조건: OQ-6 확정.**

비마크다운 저장 경로를 확정하고 마크다운 문법 인식 변환이 그 경로에 적용되지 않음을 고정한다. 열기→저장 왕복에서 바이트가 변하지 않음을 회귀 테스트로 고정한다(후행 공백·탭·BOM·NFD·제로폭·한글/이모지 — SPEC-1 `tests/editor/reconcileIntegrity.test.ts`의 대상 집합을 편집·저장 축으로 확장). CRLF 처리는 OQ-6 (ii)의 결정에 따르며, 어느 결정이든 **편집 없이 열었다 닫으면 바이트 불변**을 단언한다.

원칙 문서 범위 공백은 **기록만** 한다 — `docs/DOCUMENT_MODE_PRINCIPLES.md` 무변경을 `git diff --quiet`으로 단언한다.

**확정 사항 2건 (OQ-6)**:
1. **채널 분리 3겹** — (a) 별개 채널, (b) **main이 마이그레이션 채널의 대상이 마크다운임을 검증**하고 아니면 거부, (c) raw 채널에 마이그레이션 import 부재. 채널 분리만으로는 표현 불가능성이 성립하지 않는다(외부 검토 정정 수용). **세 쓰기 진입점 전부**에 적용한다 — `file:save`, `file:saveAs`(`electron/ipc/files.ts:78-112`), 닫기 시 저장(`src/hooks/useAppCloseGuard.ts:26-33`). Save As의 마크다운 필터 하드코딩(`:92-97`)도 보조 파일 필터로 확장한다.
2. **(B′) 보조 파일 EOL 복원** — 열기 시 지배적 EOL을 문서 상태에 보관하고 raw 저장 시 복원한다. **조정 계층은 손대지 않는다**(`toDocumentSpace` 미변경, `lineSeparator` 미도입). 탐지 정책(동수 시 `\r\n` 우선, 줄 끝 없으면 LF)과 **혼합 줄 끝 보존은 범위 밖**임을 AC로 고정한다. 마크다운은 오늘 동작 유지(issue #11 범위 밖).

`useAppCloseGuard.ts:24-33`은 채널 라우팅과 revision 기반 저장 **두 이유로** 손대야 하므로 M1의 revision 작업과 조율한다.

대상 요구: REQ-PANEL-043, 044, 044a, 047, 048, 048a
대상 AC: AC-PANEL-043 / 043b / 044 / 044b / 044c / 047 / 048 / 048a / 048b
**밀폐성**: 저장 경로·3겹 검증·왕복 무결성·EOL 복원·조정 계층 불변·문서 무변경은 유닛과 명령 종료 코드로 닫힌다.

### M7 — 메타데이터·보조 표면의 활성 원고 패널 종속 (Priority: Medium)

**선행 조건: OQ-5 확정 (프로젝트 트리 접근 범위에 영향).**

메타데이터·메모 사이드카·서지 해석을 활성 원고 패널 종속으로 바꾼다. 활성 패널이 보조 패널일 때 직전 활성 원고 패널을 유지한다. 목차·검색 히트의 패널 귀속을 정한다. SPEC-1이 남긴 두 표면을 처리한다 — `open-diff` effect의 문서 식별 가능화(표시 UI는 SPEC-4), `BibliographyResolution.fallback`의 활성 원고 패널 종속 표시. `projectDiscover`를 렌더러에 처음 배선한다(§A.4).

대상 요구: REQ-PANEL-060, 061, 062, 063, 064
대상 AC: AC-PANEL-060 / 061 / 062 / 062b / 063 / 064 / 064b
**밀폐성**: 활성 원고 패널 종속·유지·귀속은 스토어·컴포넌트 테스트로 닫힌다.

### M8 — 패널 배치 persist와 통합 (Priority: Medium, 기계적)

패널 배치(패널 수·상대 크기·바인딩 경로)를 별개 prefs 키로 persist하고 복원한다. 복원 시 신뢰 경계 검증 실패 경로는 빈 버퍼 + 오류 표시로 처리한다(조용히 건너뛰지 않는다). 신규 IPC 채널이 있으면 `shared/ipc-contract.ts` 선언 + 구독 해제 클로저 계약 + 전 채널 `assertAllowedPath` 단언을 통과시킨다(C-3).

대상 요구: REQ-PANEL-006, C-3 (전 요구 횡단)
대상 AC: AC-PANEL-006 / 006b / 006c
**밀폐성**: persist·복원·실패 경로·IPC 계약은 유닛으로 닫힌다.

---

## §D 위험과 완화

| 위험 | 완화 |
|---|---|
| **[출하 중] 확정 이벤트가 path 대조 없이 적용되어 창 B의 깨끗한 버퍼가 창 A 파일 내용으로 덮어써진다 → 저장 시 데이터 손실** | **M0**이 재현 우선으로 닫는다. REQ-PANEL-070 + 전용 AC. 4단계 사슬은 오케스트레이터가 코드 직독으로 확인했다(§C M0). 보호되는 것은 dirty 버퍼뿐이므로 **방금 열어 아무것도 안 한 문서가 가장 취약하다** |
| **[출하 중] 전역 `composing` 플래그 공유 — 패널 B의 `compositionend`가 패널 A의 조합 보류를 해제** (`shared/reconciliation.ts:57`) | **M0**. REQ-PANEL-071 + 전용 AC. `compositionGate.ts:9-25`가 막기 위해 작성된 실패 계열의 한 계층 위 재도입이며 IME 안전 최우선 |
| **라우팅 계층 구현이 조정 코어 5파일을 건드리려는 유혹** | C-12 + REQ-PANEL-072 + `design.md` §6.2a의 기각된 대안 표. `tests/electron/extensionIndependence.test.ts` 무변경 통과가 게이트다. 특히 `applyExternalChange`에 `path` 인자를 추가하면 `:171-174`가 즉시 깨진다 |
| **조정 실행자 싱글턴 — 마운트 탈취 + 언마운트 무장 해제 2경로** (`src/store/reconciliationStore.ts:35`, `src/editor/applyExternalChange.ts:131`) | M0/M3에서 문서별 등록으로 교체. REQ-PANEL-055가 두 경로를 각각 규정. 둘 다 컴파일 오류를 내지 않고 조용히 실패한다 |
| **패널별 배너의 IME 위험** — 배너 등장이 포커스를 옮기면 조합이 깨진다 | 오늘의 `ReconciliationSurface`가 이미 자동 포커스·프로그램적 포커스를 쓰지 않고 `aria-live="polite"`만 쓴다(`ReconciliationSurface.tsx:46-52`). 패널별로 옮길 때 이 성질을 잃지 않음을 M4의 AC로 고정 |
| **마크다운 전용 커맨드의 우회 적용** — 보이지 않는 문서를 조용히 바꾼다 | REQ-PANEL-032가 "아무 일도 하지 않음"을 규정. `design.md` §4.2가 우회 대안을 기각한 근거 기록 |
| **비마크다운 저장이 마크다운 변환을 거친다** (`electron/pendingAssets.ts:157, 175-176`) | OQ-6 (i). 채널 분리 권고 — 표현 불가능성으로 보장. REQ-PANEL-044 + M6의 왕복 무결성 AC |
| **바이너리 열기가 U+FFFD 대체로 원본을 파괴** (`electron/ipc/files.ts:48`) | M5에서 `decodeUtf8Strict`(`electron/externalWatch.ts:54-60`) 적용. REQ-PANEL-046 |
| **CRLF 손상이 `.py`에서 실질 피해** (issue #11) | OQ-6 (ii)로 사용자 판단을 구한다. 어느 결정이든 "편집 없이 열었다 닫으면 바이트 불변"은 성립 |
| **사이드바 계약 재작성으로 841줄 테스트가 깨진다** | OQ-1 후보 1 권고 + C-10 + §A.5 PRESERVE 목록. 후보 2를 택하면 이 위험이 실현되며 마일스톤 범위가 늘어난다 |
| **e2e가 단일 에디터·단일 배너 셀렉터 전제** | M4의 패널 지목 수단이 계약 산출물. 없으면 IME·배너 AC가 공허하게 통과한다(§B.8, `design.md` §9.2) |
| **`tests/hooks/useExternalChangeWiring.test.tsx:90`이 N개 감시와 양립 불가** | M3에서 단언을 뒤집는다(지우지 않는다). 재작성 자체가 산출물 |
| **Windows 경로 대조 회귀가 CI에서 안 잡힌다** (C-7) | 경로 대조를 순수 함수로 분리해 유닛에서 양 플랫폼 재현. `electron/ipc/project.ts:90-93`의 `dirnameOf`와 `tests/electron/windowsPaths.test.ts` 선례 |
| **pathGuard 마찰로 프로젝트 트리가 반쪽이 된다** | OQ-5. 후보 1(현행 유지)을 택하면 트리 어포던스 범위를 신뢰된 트리로 좁혀 표시하는 것이 정직하다 |
| **issue #12 sticky dirty가 문서마다 복제** | M1에서 새 구조에 sticky를 재도입하지 않는다(`design.md` §2.3). issue #12 해소 자체는 범위 밖 |
| **`appStore` 이관 범위가 넓다** — 소비자 7개 파일 | OQ-2 후보 1의 대가로 명시. M1이 이관을 단독 마일스톤으로 담아 다른 마일스톤과 섞지 않는다 |
| **`.cm-content` 전역 규칙이 좁은 보조 패널에 원고 측정폭(800px 중앙 정렬)을 상속시킨다** (`src/styles/global.css:32` + `src/editor/theme.ts:10-15`) | `design.md` §3.2a. 전역 규칙을 패널 스코프로 좁히는 작업은 **e2e 34파일의 `.cm-content` 셀렉터 이관**을 수반하므로 M4의 패널 지목 수단과 같은 작업으로 묶는다. 측정폭 조정 자체는 미관 문제이며 바이트 무결성과 무관하므로 미뤄도 기능은 성립한다. 순서를 뒤집으면 이관 준비 전에 e2e가 깨진다 |
| **패널 배치를 담을 prefs 슬롯이 없다** (`shared/ipc-contract.ts:37, 53, 65`에 `sidebar`/`rightSidebar`/`memoPanel` 각 1개뿐) | OQ-9. 후보 1(prefs `panels` 배열)을 권고하되 **`panels` 경로를 `pathGuard` 신뢰 소스로 쓰지 않는다**는 것을 함께 확정해야 한다 — 쓰면 렌더러가 임의 경로를 심어 신뢰를 넓히는 D-6/C-4 위반 경로가 열린다 |
| **활성 패널 전환마다 메모 사이드카가 디스크에 플러시된다** (`src/store/memoSidecarStore.ts:70-84`의 `loadFor`가 이전 문서 dirty 사이드카를 `await memoSidecarWrite`로 먼저 쓴다) | REQ-PANEL-062 후단. 패널 전환은 쓰기를 유발하지 않아야 한다 — 그 쓰기가 SPEC-1 감시 계층에 외부 변경으로 되돌아오는 순환도 만든다. M7에서 패널별 사이드카 보유 또는 편집 시점 쓰기로 전환 |
| **수동 한글 IME 스모크 미수행** | C-8. SPEC-1의 AC-WS-024와 함께 v0.3 릴리스 사인오프 게이트로 이관 |

---

## §E 자기 검증

구현 완료 시 다음이 관측 가능해야 한다:

1. `pnpm typecheck` — `tsc --build` **및** `tsc --noEmit -p tsconfig.test.json` 양쪽 exit 0 (루트 `tsconfig.json`은 컨테이너라 단독 `tsc --noEmit`은 아무것도 검사하지 않는다 — SPEC-1 `research.md` §6.3)
2. `pnpm lint` exit 0
3. `pnpm test` green — baseline(199 테스트 파일) 대비 **의도적으로 재작성한 테스트를 제외하고** 회귀 0
4. `pnpm test:e2e` green — 패널 지목 수단 기반 IME·배너 spec 포함
5. 커버리지 85% 목표 / 커밋당 80% 최소. `perFile: true`가 게이트를 실제로 작동하게 만드는 설정임에 유의 (SPEC-1 `research.md` §7.0)
6. **단일 패널 축퇴 회귀**: 패널 1개 상태에서 오늘의 레이아웃·툴바·상태바가 관측상 동일
7. **사이드바 무변경**: `tests/store/{sidebarStore,rightSidebarStore}.test.ts` + `tests/sidebar/*.test.tsx` (841줄) 무변경 통과
7a. **조정 코어 무변경 (C-12)**: `tests/electron/extensionIndependence.test.ts` 무변경 통과 + **다섯 파일 전부**에 대한 `git diff --quiet -- electron/changeConfirmation.ts electron/watchScope.ts shared/reconciliation.ts src/editor/minimalDiff.ts src/editor/applyExternalChange.ts` **exit 0**. **예외 없다** — `design.md` §6.2a의 주입된 setter 클로저 형태가 `applyExternalChange.ts`를 무변경으로 남기기 때문이다. 그 파일을 손대야 한다면 **예외가 아니라 설계 재검토 신호이며 blocker report로 되돌린다**(AC-PANEL-082와 동일 문구)
7b. **M0 재현 테스트가 수정 전에 실패했음이 기록됨** (REQ-PANEL-073) — 실패 출력과 통과 출력 양쪽을 증거로 남긴다
8. `git diff --quiet -- docs/DOCUMENT_MODE_PRINCIPLES.md` exit 0
9. `git status --porcelain`에 §A.5의 하네스 스캐폴딩 항목이 커밋되지 않았음
10. `acceptance.md`의 모든 AC가 PASS 증거와 함께 기록됨
11. 릴리스 전 수동 한글 IME 스모크 통과 (자동화 대체 불가)

---

## §F 참조

- `spec.md` — 요구사항 **61개** (REQ-PANEL-070~073 + 070a·070b·071a + 001~065)
- `acceptance.md` — 수용 기준 (모든 항목이 REQ ID 또는 제약 ID 인용)
- `design.md` — 설계 결정과 기각된 대안 (Tier L 산출물)
- `research.md` — 8개 영역 조사 + 멀티패널 위험 목록 + 미검증 항목 (Tier L 산출물)
- `.moai/specs/SPEC-V03-WORKSPACE-001/plan.md` §A — D-1~D-7, §B.1 tsconfig 함정, §B.5 감시 결함
- `.moai/specs/SPEC-V03-WORKSPACE-001/research.md` §6.2·§6.3(tsconfig), §7.0(커버리지 게이트)
- `.moai/specs/EPIC-V03-WORKSPACE.md` §2.1, §3(`:90`), §6, §7
- `docs/v0.3-signoff.md` §4(issue #11), §5(원칙 문서 공백), §6(SPEC-2 계약 표면)
- `.moai/config/sections/quality.yaml` — TDD 설정, 커버리지 임계
- 코드 앵커: `src/editor/MarkdownEditor.tsx:86-175`, `src/App.tsx:122-190`, `src/store/{appStore.ts:54, reconciliationStore.ts:35}`, `src/hooks/{useMenuCommandRouter.ts:34,98, useExternalChangeWiring.ts:31-42}`, `shared/reconciliation.ts:54-62,209-268`, `electron/{ipc/project.ts:40-44,151-164, ipc/files.ts:34,48,58-76, pendingAssets.ts:150-181, externalWatch.ts:54-60, watchScope.ts:32-54, pathGuard.ts:81-152}`

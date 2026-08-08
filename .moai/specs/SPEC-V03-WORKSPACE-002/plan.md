---
id: SPEC-V03-WORKSPACE-002
title: "구현 계획 — v0.3 멀티패널 셸"
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
tags: "plan, multipanel, milestones, open-decisions, preserve"
---

# 구현 계획 — SPEC-V03-WORKSPACE-002

> 마일스톤은 **결정 번복 가능성이 높은 순서**로 배열했다. 앞쪽일수록 데이터 모델·사용자 흐름 결정을 담아 검토 가치가 크고, 뒤쪽일수록 기계적이다.
>
> **미해결 결정 8건이 §A.2에 있다.** 이 SPEC은 혼자 확정하면 안 되는 아키텍처 결정을 갖고 있으므로, 그 8건은 임의 선택 없이 후보·대가·잠정 권고 형태로 남겨 두었다. 오케스트레이터의 외부 교차 검토와 사용자 승인이 선행 조건이다.

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

### §A.2 미해결 결정 (8건 — 사용자 승인 필요)

> 각 항목: **(a) 질문 / (b) 후보 / (c) 후보별 대가 — 변경 파일·깨질 테스트·압력받는 불변식 / (d) 잠정 권고와 근거**.
> `design.md`가 각 항목의 구조 분석을 담고 있으므로 근거는 그 절을 인용한다.

---

#### OQ-1 — 레이아웃 모델: 패널 컨테이너를 어디에 두는가

**(a) 질문**: 기존 좌/우 사이드바와 공존하는 패널 컨테이너의 구조는 무엇인가. `sidebarStore`/`rightSidebarStore`를 **보존**하는가 **흡수**하는가.

**(b) 후보**

| # | 후보 |
|---|---|
| 1 | **중앙 영역 분할** — `src/App.tsx:145`의 `flex:1` 자식 안에 패널 컨테이너를 넣는다. 사이드바는 손대지 않는다 |
| 2 | **통합 그리드 재작성** — `App.tsx:123`의 flex row를 CSS grid로 바꾸고 좌사이드바·패널들·우사이드바를 모두 track으로 표현한다 |
| 3 | **탭 + 분할 하이브리드** — 1 또는 2를 고른 뒤 패널 하나 안에 문서를 탭으로 쌓는다 (OQ-7과 결합) |

**(c) 대가**

| | 후보 1 | 후보 2 | 후보 3 |
|---|---|---|---|
| 변경 파일 | `src/App.tsx`(레이아웃 JSX), 패널 컨테이너 신규, `src/styles/global.css`에 패널 클래스 추가 | 위 전부 + `global.css:345-388`(`.cm-sidebar*`), `:1043-1102`(`.cm-right-sidebar*`), `src/components/Sidebar.tsx:57-73`·`RightSidebar.tsx`의 리사이저 드래그 로직 | 후보 1/2 + 탭 바 컴포넌트 + 문서 스택 상태 |
| 깨질 테스트 | 없음 (사이드바 계약 무변경) | `tests/store/sidebarStore.test.ts`(113줄), `tests/store/rightSidebarStore.test.ts`(118줄), `tests/sidebar/sidebarReorg.test.tsx`(317줄), `tests/sidebar/rightSidebar.test.tsx`(293줄) — **총 841줄이 폭 clamp·탭 구성·persist를 고정** | 후보 1과 동일 |
| 압력받는 불변식 | 없음 | **REQ-PANEL-002**(사이드바 관측 동작 보존), **C-10**(baseline 보호). 폭 SSOT가 `WIDTH_BOUNDS`(스토어)에서 grid track(CSS)으로 새어 나가며, main의 `setPreferences` clamp와의 양방향 계약(`sidebarStore.ts:26-28`)을 다시 세워야 한다 | 후보 1/2의 압력 + REQ-PANEL-013의 "마지막 참조 패널" 판정이 "마지막 참조 탭"으로 확장 |
| 얻는 것 | 최소 변경 | 사이드바를 패널과 동일한 리사이즈·재배치 모델로 통일할 수 있다 | VS Code 유사 UX. 패널 수를 적게 유지하며 문서를 많이 열 수 있다 |

**(d) 잠정 권고**: **후보 1 (중앙 영역 분할)**.

근거는 취향이 아니라 두 개의 구조적 사실이다. (i) `design.md` §1 F5 — 오늘 레이아웃은 1차원 flex row 하나이고 사이드바는 `flex-shrink:0` + 인라인 width를 전제하므로, 중앙 자식 안에서 분할하면 사이드바 CSS·스토어·persist 경로가 **전부 무변경**이다. (ii) `design.md` §3.1 — 사이드바 표면은 841줄의 테스트로 고정되어 있고 폭 경계 SSOT가 main과 공유된다. 후보 2는 이 두 계약을 동시에 재작성하면서 이 SPEC의 핵심(비마크다운 편집 표면 + 조정의 문서 축)과 무관한 위험을 들여온다. 후보 2가 주는 이점("통일된 리사이즈 모델")은 이 SPEC의 어느 요구사항도 요구하지 않는다.

---

#### OQ-2 — 패널 상태 소유: 새 스토어인가 기존 확장인가, 문서 축을 어디에 두는가

**(a) 질문**: 패널 상태를 담는 새 `panelStore`를 만드는가, `appStore`를 확장하는가. 그리고 문서 상태(경로·내용·dirty·조정 상태)를 **패널에 매는가, 문서에 매고 패널이 참조하는가**.

**(b) 후보**

| # | 후보 |
|---|---|
| 1 | **신규 `panelStore` + `documentStore` 2개** — 패널 목록/활성 패널은 `panelStore`, 문서 맵(`path → 상태`)은 `documentStore`. `appStore`는 테마·언어 등 창 전역만 남기고 문서 필드는 `documentStore`로 이관 |
| 2 | **`appStore`를 문서 맵으로 확장** — `appStore`에 `documents: Map`과 `panels: []`를 추가. 스토어 개수 유지 |
| 3 | **패널이 문서 상태를 소유** — 문서 축 없이 패널별 경로·내용·dirty. 같은 파일 중복 열기는 금지 |

**(c) 대가**

| | 후보 1 | 후보 2 | 후보 3 |
|---|---|---|---|
| 변경 파일 | `src/store/appStore.ts` 축소 + 신규 2개, `appStore` 소비자 전부: `src/App.tsx:74-78`, `src/components/StatusBar.tsx:32-37`, `src/hooks/{useMenuCommandRouter,useFileMenuCommands,useExternalChangeWiring,usePreferencesInit,useAppCloseGuard}.ts`, `src/editor/MarkdownEditor.tsx:129` | `appStore.ts` 확대 + 같은 소비자들(선택자 경로만 변경) | `appStore.ts` → 패널 배열화 + 같은 소비자들 |
| 깨질 테스트 | `appStore` 직접 조작 테스트 전부 + `tests/hooks/useExternalChangeWiring.test.tsx`(165줄) | 동일하지만 선택자 변경 수준 | 위 + REQ-PANEL-011 AC가 애초에 성립 불가 |
| 압력받는 불변식 | 없음 — 축이 요구사항과 일치 | `appStore`가 창 전역·문서·패널 3역할을 겸해 응집도가 떨어진다. 어떤 선택자가 어느 축을 읽는지 코드에서 불명확 | **REQ-PANEL-011/012 위반.** 중복 열기 금지는 사용 흐름을 차단하고, 판정에 경로 정규화가 필요한데 `pathGuard.ts:55-60`이 심볼릭 링크를 의도적으로 해석하지 않아 판정이 불완전하다 |
| 얻는 것 | 축이 명시적. SPEC-4가 문서별 승인 상태를 얹기 쉽다 | 스토어 개수 유지 | 구현 최소 |

**(d) 잠정 권고**: **후보 1 (신규 2개 스토어, 문서 축 명시)**.

근거: `design.md` §2.1이 보여주듯 두 사용 흐름(같은 파일 나란히 보기 / 같은 파일 편집)이 **서로 다른 축**을 요구하고, 후보 3은 두 번째를 데이터 손실로 만든다. 후보 1과 2의 차이는 응집도뿐이지만, `appStore`는 이미 테마·시스템 테마·편집 모드·제목 힌트까지 담고 있어(`appStore.ts:7-37`) 여기에 문서 맵과 패널 배열을 더하면 어느 필드가 어느 축인지 읽기 어려워진다. SPEC-3~5가 이 스토어들 위에 얹히므로 축을 명시하는 비용이 회수된다.

**주의 (issue #12)**: dirty를 문서 축으로 옮길 때 오늘의 sticky 성질(`appStore.ts:54` `|| s.isDirty`)을 그대로 베끼면 결함이 문서마다 복제된다. `design.md` §2.3 참조 — issue #12 해소는 범위 밖이지만 **새 구조에 sticky를 재도입하지 않는다**.

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

#### OQ-5 — pathGuard 마찰: 프로젝트 트리가 형제 폴더를 열 수 없다 (D-6 재검토)

**(a) 질문**: `X/manuscript/a.md`를 열면 신뢰되는 것은 `X/manuscript/**`뿐이므로(`electron/pathGuard.ts:81-87, 132-152`), 프로젝트 트리 UI에서 `X/scripts/analysis.py`를 클릭하면 `PathNotAllowedError`가 난다. 다이얼로그 경유 워크스페이스 등록에만 의존하는 현재 모델로 실사용이 성립하는가. 성립하지 않으면 **어떤 최소 확장이 신뢰 모델을 약화시키지 않는가**.

**(b) 후보**

| # | 후보 |
|---|---|
| 1 | **아무것도 하지 않음** — 사용자가 `폴더 열기`로 프로젝트 루트를 워크스페이스에 등록해야 형제 폴더가 열린다 |
| 2 | **사용자 동의 승격** — 매니페스트 발견 시 비침습 표면으로 "이 프로젝트를 워크스페이스로 추가할까요?"를 제시하고, 동의 시 기존 워크스페이스 등록 경로를 탄다 |
| 3 | **프로젝트 루트 자동 Tier 2 편입** — 매니페스트 발견을 근거로 루트를 세션 신뢰 트리에 넣는다 |
| 4 | **읽기 전용 신뢰 분리** — 매니페스트가 있는 조상 디렉터리를 **읽기 전용**으로만 신뢰한다 |

**(c) 대가**

| | 후보 1 | 후보 2 | 후보 3 | 후보 4 |
|---|---|---|---|---|
| 변경 파일 | 없음 | `electron/ipc/project.ts`(승격 제안 신호), 렌더러의 제안 표면, 기존 `dialog:openFolder` 경로 재사용 | `electron/pathGuard.ts` + `electron/ipc/project.ts` | `electron/pathGuard.ts:132-152`(`isAllowedPath`가 단일 boolean → 읽기/쓰기 분리), 모든 `assertAllowedPath` 호출부(project/files/bibliography/reference/search IPC 전부) |
| 깨질 테스트 | 없음 | `tests/electron/projectIpc.test.ts` 확장 | `tests/electron/projectIpc.test.ts:51`, SPEC-1 AC-WS-011("프로젝트 발견이 신뢰를 넓히지 않는다") | pathGuard 테스트 전부 + `tests/electron/refreshEntryPoint.test.ts:52-`("`project:*` 전부 `assertAllowedPath` 호출") |
| 압력받는 불변식 | 없음 — 대신 **프로젝트 트리 UI가 실사용에서 반쪽**이 되어 REQ-PANEL-036의 어포던스가 열 수 없는 파일들을 가리킨다 | 낮음. 사용자 동의가 개입하므로 자가 신뢰 확장 경로가 열리지 않는다. **단 제안 표면이 모달이면 REQ-WS-049/REQ-PANEL-058 위반** | **최대. C-4·SPEC-1 D-6·REQ-WS-012 정면 위반.** 손상된 렌더러가 자기가 쓸 수 있는 디렉터리에 `durumi.project.yaml`을 심어 트리 전체를 신뢰시킬 수 있다 — `assertPrefsPatchAllowed`(`pathGuard.ts:183-215`)가 막고 있는 바로 그 공격 형태 | 구조 변경 범위가 크다. `isAllowedPath`가 단일 boolean이라 읽기/쓰기 축을 새로 도입해야 하고, 신뢰 모델의 표면적이 2배가 된다 |

**(d) 잠정 권고**: **후보 2 (사용자 동의 승격), 비침습 표면으로**.

근거: 후보 3은 SPEC-1 D-6의 근거를 그대로 무효화하므로 이 SPEC 단독으로 택할 수 없다(택하려면 D-6 번복이 필요하고 그것은 사용자 결정이다). 후보 1은 안전하지만 REQ-PANEL-036이 제공하는 프로젝트 트리 어포던스가 열 수 없는 파일을 가리키는 상태를 남기며, 그것이 SPEC-1 plan.md D-6이 "실사용 마찰이 확인되면 재검토"라고 예고한 정확한 지점이다. 후보 4는 원리적으로 가장 정교하지만 pathGuard 표면을 2배로 만들며 이 SPEC의 핵심과 무관한 위험을 들여온다.

후보 2는 **기존 신뢰 승격 경로(다이얼로그)를 재사용**하므로 새 승격 경로를 만들지 않는다 — C-4의 문자와 정신을 모두 지킨다. 다만 제안 표면은 **모달이 아니어야 한다**(IME 위험). 사용자가 "이 SPEC에서는 UI를 늘리지 말라"고 판단하면 후보 1이 안전한 대안이며, 그 경우 프로젝트 트리 어포던스의 범위를 "신뢰된 트리 안"으로 좁혀 표시하는 것이 정직하다.

---

#### OQ-6 — 비마크다운 저장 경로와 CRLF (issue #11)

**(a) 질문 (두 갈래)**

- **(i)** 마크다운 저장 경로를 재사용하는가 분리하는가. `.py`/`.csv`/`.bib`의 바이트 무결성(줄바꿈·인코딩·후행공백)을 무엇이 보증하는가.
- **(ii)** SPEC-1 AC-WS-035의 CRLF 구조적 한계(CodeMirror 문서 좌표가 줄바꿈을 1 위치로 계산, issue #11)가 비마크다운 파일에서 **더 심각한 문제**인가. `.py`는 CRLF 손상이 실질 피해다.

**(b) 후보 — (i) 저장 경로**

| # | 후보 |
|---|---|
| 1 | **채널 분리** — `file:save`는 마크다운 전용으로 남기고 비마크다운용 채널을 신설. 마크다운 변환이 그 채널에 **존재하지 않는다** |
| 2 | **기존 채널 + 종류 인자 게이트** — `file:save(path, content, kind)`로 확장하고 `migratePendingInContent`를 마크다운일 때만 호출 |
| 3 | **현행 유지** — 변환이 `isPendingPath`(`electron/pendingAssets.ts:162`)에 걸려 실제 치환은 드물다는 이유로 그대로 둔다 |

**(b) 후보 — (ii) CRLF**

| # | 후보 |
|---|---|
| A | **범위 밖 유지 + AC로 한계 명시** — 비마크다운 패널도 CRLF가 LF로 접히며, 그 사실을 수용 기준에 기록한다 |
| B | **보조 패널만 줄바꿈 보존** — 보조 패널에 파일별 `lineSeparator`를 `Compartment`로 설정하고 저장 시 원래 줄바꿈으로 재직렬화 |
| C | **전체 해소** — 마크다운 패널까지 포함해 issue #11을 이 SPEC에서 해소 |

**(c) 대가**

(i):

| | 후보 1 | 후보 2 | 후보 3 |
|---|---|---|---|
| 변경 파일 | `shared/ipc-contract.ts`(채널 선언, C-3), `electron/ipc/files.ts`, `electron/preload.ts`, `src/hooks/useFileMenuCommands.ts` | `electron/ipc/files.ts:58-76`, 계약 시그니처, 호출부 | 없음 |
| 깨질 테스트 | 없음. 신규 채널이 `tests/electron/refreshEntryPoint.test.ts:52-` 형태의 "`assertAllowedPath` 호출" 단언을 통과해야 한다 | `file:save` 계약 테스트 | 없음 |
| 압력받는 불변식 | 없음 — **표현 불가능성으로** REQ-PANEL-044를 보장한다 | REQ-PANEL-044를 **관례로만** 보장한다. 나중에 게이트를 우회하는 호출이 추가될 수 있다 | **REQ-PANEL-044 위반** |

(ii):

| | 후보 A | 후보 B | 후보 C |
|---|---|---|---|
| 변경 파일 | 없음 (AC 문구만) | `src/editor/MarkdownEditor.tsx`(줄바꿈 Compartment), 열기·저장 경로의 줄바꿈 감지·재직렬화 | 후보 B + 마크다운 경로 + `src/editor/applyExternalChange.ts:54-58, 79-95`(문서 좌표 접기 전제) |
| 깨질 테스트 | 없음 | `tests/editor/applyExternalChange.test.ts`, `tests/editor/reconcileIntegrity.test.ts` 일부 | 위 + `e2e/reconciliation-ime.spec.ts` 계열 |
| 압력받는 불변식 | **`.py` 사용자에게 실질 피해**: Windows에서 작성된 스크립트를 열었다 저장하면 전 파일 줄바꿈이 바뀌어 git diff가 전체 변경으로 뜬다 | 마크다운 패널과 보조 패널의 줄바꿈 정책이 갈린다 — 설명해야 할 비대칭 | `spec.md` §D.2가 명시적으로 범위 밖으로 둔 항목. 이 SPEC의 범위가 크게 늘어난다 |

**(d) 잠정 권고**: **(i) 후보 1 (채널 분리)** + **(ii) 후보 A (범위 밖 유지 + AC로 명시), 단 사용자 판단을 구함**.

(i) 근거: SPEC-1은 반복적으로 "관례가 아니라 표현 불가능성으로 막는다"를 택했다 — 모달 금지를 `NOTICE_PRESENTATIONS` union에 `modal`을 두지 않는 것으로 강제했고(`shared/reconciliation.ts:8-12, 116`), 그 결정이 다섯 번 재발한 IME 결함 계열을 끊었다. 같은 원칙을 저장 경로에 적용하면 채널 분리다. IPC 표면 증가는 실제 비용이나, `shared/ipc-contract.ts`가 이미 66개 invoke 채널을 담고 있어 1개 추가의 한계 비용은 낮다.

(ii) 근거와 **명시적 유보**: 후보 A를 권고하는 것은 후보 B/C가 `spec.md` §D.2의 범위 밖 선언과 충돌하고 `applyExternalChange.ts`의 문서 좌표 접기 전제를 건드려 SPEC-1이 PASS로 닫은 조정 AC들을 재검증 대상으로 만들기 때문이다. **그러나 `.py` 파일의 CRLF 손상은 `.md`와 달리 실질 피해라는 지적은 타당하다** — Windows 개발자가 작성한 스크립트를 Durumi로 열었다 저장하면 전 파일이 변경된 것으로 보인다. 이것이 v0.3 출하를 막을 수준인지는 사용자 판단 사항이며, 막는다면 후보 B(보조 패널만)가 범위를 최소화한다. 어느 쪽이든 **비마크다운 파일을 열었다 편집 없이 닫으면 바이트가 변하지 않는다**(REQ-PANEL-043)는 후보 A에서도 성립한다 — 저장하지 않으면 접기가 디스크에 반영되지 않기 때문이다.

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

#### OQ-8 — 크로스-윈도 브로드캐스트 결함 가설의 처리

**(a) 질문**: `research.md` §7.3이 소스 근거로 도출한 가설 — 확정 이벤트가 모든 창에 브로드캐스트되고(`electron/ipc/project.ts:40-44`) 렌더러가 `path`를 대조하지 않으므로(`src/store/externalChangeChannel.ts:28-50`) 창 B의 깨끗한 버퍼가 창 A 파일의 내용으로 덮어써질 수 있다 — 를 이 SPEC이 흡수하는가, 별개 issue로 분리하는가.

**(b) 후보**

| # | 후보 |
|---|---|
| 1 | **흡수** — REQ-PANEL-051의 경로 대조가 부수적으로 이 결함도 막으므로, 이 SPEC의 AC로 크로스-윈도 케이스를 함께 고정한다 |
| 2 | **분리** — issue를 등록하고 이 SPEC은 창 안의 패널 축만 다룬다 |
| 3 | **먼저 재현** — 실행 재현으로 결함을 확정한 뒤 후보 1/2를 결정한다 |

**(c) 대가**

| | 후보 1 | 후보 2 | 후보 3 |
|---|---|---|---|
| 변경 파일 | 추가 없음 (REQ-PANEL-051 구현이 이미 경로 대조를 요구) + AC 1건 추가 | 없음 | 없음 (조사만) |
| 깨질 테스트 | 없음 | 없음 | 없음 |
| 압력받는 불변식 | 없음. 단 **미검증 가설을 근거로 AC를 만든다** — `verification-claim-integrity` §1.1의 "결함 주장은 도구로 확인될 때까지 가설"에 걸린다 | 알려진(가설) 데이터 손실 경로를 v0.3에 남긴다 | 없음 — 가장 정직하다. 대가는 재현 작업 1건 |
| 얻는 것 | 한 번에 해소 | 범위 최소 | 주장 무결성 |

**(d) 잠정 권고**: **후보 3 → 후보 1**.

근거: `verification-claim-integrity` §1.1 surface 3이 "결함 주장은 도메인 도구로 확인될 때까지 가설"이라고 규정한다. 재현은 저렴하다 — 창 2개를 띄우고 한쪽 파일을 외부에서 수정하면 된다. 재현되면 REQ-PANEL-051의 구현이 이미 그 축을 덮으므로 AC 1건 추가로 후보 1이 성립한다. 재현되지 않으면(어딘가에 내가 놓친 가드가 있으면) `research.md` §7.3의 가설을 정정하고 후보 2로 간다. **재현 전에 후보 1로 진행하는 것은 미검증 결함 주장 위에 AC를 세우는 것이므로 권고하지 않는다.**

---

### §A.3 결정되지 않았음에도 마일스톤이 진행 가능한 이유

OQ-1~OQ-8이 미결이어도 M1의 **상태 모델 형태**(문서 축 + 패널 축의 분리, `design.md` §2)는 요구사항에서 도출되므로 착수 가능하다. 다만 OQ-2가 스토어의 물리적 배치를 정하므로 **M1 착수 전에 최소한 OQ-1·OQ-2가 확정되어야 한다.** 나머지는 해당 마일스톤 착수 전까지 확정되면 된다:

| 미해결 결정 | 확정 필요 시점 |
|---|---|
| OQ-1 (레이아웃), OQ-2 (상태 소유) | **M1 착수 전** |
| OQ-8 (크로스-윈도 가설) | M3 착수 전 (재현은 M3와 병행 가능) |
| OQ-4 (라우팅 배선) | M4 착수 전 |
| OQ-3 (모드 컨트롤) | M4 착수 전 |
| OQ-6 (저장 경로 + CRLF) | M6 착수 전 |
| OQ-5 (pathGuard 마찰) | M7 착수 전 (M2의 프로젝트 트리 어포던스 범위에 영향 → 가능하면 M2 전) |
| OQ-7 (탭 축) | M2 착수 전 (레이아웃 형태를 규정) |

### §A.4 조사에서 드러난, 이 SPEC이 처음 배선하는 것

SPEC-1이 계층은 만들었으나 **프로덕션 호출부가 0곳**인 표면 두 가지가 있다. 둘 다 이 SPEC의 산출물이다:

| 표면 | 현재 상태 | 근거 |
|---|---|---|
| `window.api.projectDiscover` | 렌더러 호출부 **0곳** — 계약(`shared/ipc-contract.ts:412`)·preload(`electron/preload.ts:37`)·핸들러(`electron/ipc/project.ts:139`)만 존재 | `research.md` §7.2 |
| `resolveWatchScope` / `registerWatchScope` | 프로덕션 호출부 **0곳** — 정의(`electron/watchScope.ts:37, 67`)와 테스트만 | `research.md` §7.1 |

즉 **규약 폴더 감시(REQ-WS-045)와 프로젝트 상태 표시가 아직 배선되지 않았다.** 이 SPEC이 프로젝트 트리·패널을 만들면서 처음 배선한다. `resolveWatchScope`의 `openFiles`가 이미 `readonly string[]`이므로 REQ-PANEL-050과 형태가 일치한다 — 재작성이 아니라 배선이다.

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
| `shared/reconciliation.ts`의 `reduceReconciliation` 전이 로직 | 순수 함수 전이는 재사용한다. 바뀌는 것은 **보관 구조와 라우팅**이다 (`design.md` §6.2) |
| `src/editor/minimalDiff.ts` | 최소 diff 계산. 문서 축과 무관 |
| `src/editor/applyExternalChange.ts`의 `buildReconcileTransaction` / `toDocumentSpace` | 뷰별 적용 로직. 실행자 **등록 방식**만 바뀐다 (REQ-PANEL-055) |
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

`reduceReconciliation(state, event, policy)`는 순수 함수다(`shared/reconciliation.ts:209-213`). 문서 축 도입에서 바뀌는 것은 **보관 구조와 라우팅**이며 전이 로직 자체는 재사용한다:

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

---

## §C 마일스톤

> 우선순위 라벨만 사용한다. 기간 예측 없음.
> 각 마일스톤은 **자기 AC를 닫을 수 있게 밀폐적으로** 설계했다. SPEC-1의 AC-WS-023 분할 교훈(밀폐 가능한 부분과 후속 마일스톤 의존 부분을 분리)을 따라, 밀폐 불가한 AC는 해당 마일스톤에 **명시적으로 배정하지 않았다**.

### M1 — 문서·패널 상태 모델 (Priority: High, 번복 가능성 최상)

**선행 조건: OQ-1·OQ-2 확정.**

`src/store/`에 문서 맵과 패널 목록을 정의한다. 문서: 경로·내용·dirty·파일 종류. 패널: 참조 문서·표시 모드·활성 여부. 같은 문서를 N개 패널이 참조하는 관계, 마지막 참조 패널 판정, 저장의 문서 단위 성립을 순수 상태 전이로 기술한다. `appStore`의 문서 필드를 이관하고 창 전역 필드(테마·언어)만 남긴다.

sticky dirty(issue #12)를 새 구조에 재도입하지 않는다(`design.md` §2.3).

대상 요구: REQ-PANEL-001, 010, 011, 012, 013, 014
**밀폐성**: 스토어 계층 유닛으로 전부 닫힌다. 편집 표면 없이 검증 가능.

### M2 — 레이아웃 셸과 단일 패널 축퇴 (Priority: High, 번복 가능성 상)

**선행 조건: OQ-1 확정, OQ-7 확정 권장.**

패널 컨테이너를 배치하고 분할·닫기·공간 재배분을 구현한다. **단일 패널 축퇴가 오늘의 동작과 관측상 구분되지 않음**을 회귀 테스트로 고정하는 것이 이 마일스톤의 1차 산출물이다. 사이드바 스토어·탭 구조·폭 경계 무변경을 단언한다. 프로젝트 트리 표면의 골격과 수동 새로고침 어포던스를 배치한다(REQ-WS-047a 인계).

`MarkdownEditor`를 인스턴스화 가능한 형태로 만드는 것이 여기 포함된다 — `design.md` §1 F1이 말하는 유일한 물리적 지점이다.

대상 요구: REQ-PANEL-002, 003, 004, 005, 007, 036
**밀폐성**: 레이아웃·사이드바 보존·축퇴는 컴포넌트 테스트로 닫힌다. REQ-PANEL-006(배치 persist)은 M8로 미룬다 — persist 형태가 최종 레이아웃에 의존한다.

### M3 — 조정 계층의 문서 축 (Priority: High, 정확성 핵심)

**선행 조건: OQ-8 재현 결과 (재현은 이 마일스톤과 병행 가능).**

확정 이벤트를 경로로 라우팅하고 조정 상태를 문서별로 보관한다. 실행자를 모듈 싱글턴에서 문서별 등록으로 바꾼다. 정책 주입 지점을 창 단위로 보존한다. 감시 등록을 열린 문서 전부로 확장하고 참조 카운트로 등록·해제한다. 경로 대조를 순수 함수로 분리해 Windows/macOS 양 플랫폼을 유닛에서 재현한다(C-7).

`tests/hooks/useExternalChangeWiring.test.tsx`의 "이전 파일 감시를 먼저 푼다" 단언을 뒤집는 재작성이 이 마일스톤의 산출물이다(§B.8).

대상 요구: REQ-PANEL-050, 051, 052, 055, 056, 057
**밀폐성**: 상태 기계·라우팅·감시 등록은 유닛으로 닫힌다. REQ-PANEL-053(패널별 배너 표면)과 REQ-PANEL-054(IME 게이트 합류)는 편집 표면과 조합 관찰이 필요하므로 M4로 미룬다.

### M4 — 포커스·라우팅과 패널별 배너·IME 게이트 (Priority: High, 위험 최상)

**선행 조건: OQ-3·OQ-4 확정.**

활성 패널 판정을 구현하고 뷰 의존 커맨드를 활성 패널로 라우팅한다. 마크다운 전용 커맨드가 보조 패널 활성 시 아무 일도 하지 않고 컨트롤이 비활성됨을 고정한다. `durumi:*` 이벤트에 발신 패널 식별자를 싣는다. 모드 컨트롤을 활성 패널 종속으로 바꾸고 `defaultMode` 의미론을 확정한다. 배너를 패널별로 옮기고 N개 동시 표시·포커스 불변식을 고정한다. IME 게이트의 문서 축 합류(논리적 OR)를 구현한다.

**e2e 패널 지목 수단이 이 마일스톤의 계약 산출물이다**(§B.8) — 없으면 IME·배너 AC가 공허하게 통과한다.

대상 요구: REQ-PANEL-020, 021, 022, 023, 024, 030, 031, 032, 033, 034, 035, 053, 054, 058
**밀폐성**: 라우팅·모드·게이트는 유닛으로, 배너 동시 표시와 포커스 불변식은 컴포넌트 테스트로 닫힌다. 실제 macOS 한글 IME 검증은 릴리스 게이트로 이관한다(C-8).

### M5 — 비마크다운 편집 표면: 열기와 extension 조립 (Priority: High)

파일 종류 판정을 `shared/`에 순수 함수로 정의한다(B.2의 방향 뒤집기 적용). extension 조립을 3층으로 재구성하고 보조 패널에서 마크다운 전용 확장 전부가 로드되지 않음을 단언한다. `@codemirror/language-data`로 `.py`/`.bib`/`.json`/`.yaml` 문법을 조달하고 `.csv`·미지 확장자는 평문 폴백한다. 열기 경로에 엄격 디코드를 적용해 바이너리를 편집 패널로 열지 않는다.

대상 요구: REQ-PANEL-040, 041, 042, 045, 046
**밀폐성**: 종류 판정·조립 목록·폴백·디코드는 유닛으로 닫힌다. REQ-PANEL-043/044(바이트 무결성·저장 변환 배제)는 저장 경로가 필요하므로 M6.

### M6 — 비마크다운 저장 경로와 바이트 무결성 (Priority: High)

**선행 조건: OQ-6 확정.**

비마크다운 저장 경로를 확정하고 마크다운 문법 인식 변환이 그 경로에 적용되지 않음을 고정한다. 열기→저장 왕복에서 바이트가 변하지 않음을 회귀 테스트로 고정한다(후행 공백·탭·BOM·NFD·제로폭·한글/이모지 — SPEC-1 `tests/editor/reconcileIntegrity.test.ts`의 대상 집합을 편집·저장 축으로 확장). CRLF 처리는 OQ-6 (ii)의 결정에 따르며, 어느 결정이든 **편집 없이 열었다 닫으면 바이트 불변**을 단언한다.

원칙 문서 범위 공백은 **기록만** 한다 — `docs/DOCUMENT_MODE_PRINCIPLES.md` 무변경을 `git diff --quiet`으로 단언한다.

대상 요구: REQ-PANEL-043, 044, 047
**밀폐성**: 저장 경로·왕복 무결성·문서 무변경은 유닛과 명령 종료 코드로 닫힌다.

### M7 — 메타데이터·보조 표면의 활성 원고 패널 종속 (Priority: Medium)

**선행 조건: OQ-5 확정 (프로젝트 트리 접근 범위에 영향).**

메타데이터·메모 사이드카·서지 해석을 활성 원고 패널 종속으로 바꾼다. 활성 패널이 보조 패널일 때 직전 활성 원고 패널을 유지한다. 목차·검색 히트의 패널 귀속을 정한다. SPEC-1이 남긴 두 표면을 처리한다 — `open-diff` effect의 문서 식별 가능화(표시 UI는 SPEC-4), `BibliographyResolution.fallback`의 활성 원고 패널 종속 표시. `projectDiscover`를 렌더러에 처음 배선한다(§A.4).

대상 요구: REQ-PANEL-060, 061, 062, 063, 064
**밀폐성**: 활성 원고 패널 종속·유지·귀속은 스토어·컴포넌트 테스트로 닫힌다.

### M8 — 패널 배치 persist와 통합 (Priority: Medium, 기계적)

패널 배치(패널 수·상대 크기·바인딩 경로)를 별개 prefs 키로 persist하고 복원한다. 복원 시 신뢰 경계 검증 실패 경로는 빈 버퍼 + 오류 표시로 처리한다(조용히 건너뛰지 않는다). 신규 IPC 채널이 있으면 `shared/ipc-contract.ts` 선언 + 구독 해제 클로저 계약 + 전 채널 `assertAllowedPath` 단언을 통과시킨다(C-3).

대상 요구: REQ-PANEL-006, C-3 (전 요구 횡단)
**밀폐성**: persist·복원·실패 경로·IPC 계약은 유닛으로 닫힌다.

---

## §D 위험과 완화

| 위험 | 완화 |
|---|---|
| **조정 실행자 싱글턴이 두 번째 패널에 덮어써져 엉뚱한 버퍼에 적용** (`src/store/reconciliationStore.ts:35`) | M3에서 문서별 등록으로 교체. REQ-PANEL-055 + 전용 AC. 이 SPEC의 최우선 정확성 위험이다 |
| **확정 이벤트가 path 대조 없이 적용** — 오늘 이미 창 축에서 성립할 수 있는 가설 | M3에서 경로 대조. OQ-8이 재현 여부를 먼저 확정하고 그에 따라 AC 범위를 정한다. `research.md` §7.3은 **미검증 가설**로 표시되어 있다 |
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
8. `git diff --quiet -- docs/DOCUMENT_MODE_PRINCIPLES.md` exit 0
9. `git status --porcelain`에 §A.5의 하네스 스캐폴딩 항목이 커밋되지 않았음
10. `acceptance.md`의 모든 AC가 PASS 증거와 함께 기록됨
11. 릴리스 전 수동 한글 IME 스모크 통과 (자동화 대체 불가)

---

## §F 참조

- `spec.md` — 요구사항 46개 (REQ-PANEL-001~064)
- `acceptance.md` — 수용 기준 (모든 항목이 REQ ID 또는 제약 ID 인용)
- `design.md` — 설계 결정과 기각된 대안 (Tier L 산출물)
- `research.md` — 8개 영역 조사 + 멀티패널 위험 목록 + 미검증 항목 (Tier L 산출물)
- `.moai/specs/SPEC-V03-WORKSPACE-001/plan.md` §A — D-1~D-7, §B.1 tsconfig 함정, §B.5 감시 결함
- `.moai/specs/SPEC-V03-WORKSPACE-001/research.md` §6.2·§6.3(tsconfig), §7.0(커버리지 게이트)
- `.moai/specs/EPIC-V03-WORKSPACE.md` §2.1, §3(`:90`), §6, §7
- `docs/v0.3-signoff.md` §4(issue #11), §5(원칙 문서 공백), §6(SPEC-2 계약 표면)
- `.moai/config/sections/quality.yaml` — TDD 설정, 커버리지 임계
- 코드 앵커: `src/editor/MarkdownEditor.tsx:86-175`, `src/App.tsx:122-190`, `src/store/{appStore.ts:54, reconciliationStore.ts:35}`, `src/hooks/{useMenuCommandRouter.ts:34,98, useExternalChangeWiring.ts:31-42}`, `shared/reconciliation.ts:54-62,209-268`, `electron/{ipc/project.ts:40-44,151-164, ipc/files.ts:34,48,58-76, pendingAssets.ts:150-181, externalWatch.ts:54-60, watchScope.ts:32-54, pathGuard.ts:81-152}`

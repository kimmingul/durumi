---
id: SPEC-V03-WORKSPACE-002
title: "수용 기준 — v0.3 멀티패널 셸"
version: "0.2.0"
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
tags: "acceptance, multipanel, degeneracy, routing, nonmarkdown, reconciliation"
---

# 수용 기준 — SPEC-V03-WORKSPACE-002

모든 AC는 관측 가능한 증거(테스트 출력, 바이트 비교, DOM 상태, 명령 종료 코드)로 판정한다. 주관적 판단("자연스럽다", "빠르다")은 사용하지 않는다.

**표기 규약** (SPEC-1의 관례를 그대로 따른다)

- 각 AC 제목 끝의 `↔ REQ-PANEL-0NN` 은 그 AC가 검증하는 요구사항이다. **제약(C-N)만 추적하는 AC**는 `↔ C-N` 으로 표기한다 — 품질 게이트·릴리스 게이트·회귀 보호처럼 요구사항이 아니라 제약에서 나오는 항목이다. 해당 AC는 정확히 여섯 개다: **AC-PANEL-090, 091, 092, 093, 094, 095**.
- `[P]` 프로젝트 있음 / `[N]` 프로젝트 없음 / `[P+N]` 양쪽 모두. `spec.md` C-1이 정의한 범위를 따른다. **위 여섯 개의 제약 추적 AC는 상태 태그를 의도적으로 생략한다** — 품질·릴리스 게이트는 프로젝트 유무와 무관하게 저장소 전체에 적용된다.
- 총 **78개 항목** (기본 식별자 57개 + 분할 21개). 식별자는 AC-PANEL-001 ~ 095이며, 002(b·c) / 003(b) / 006(b) / 013(b) / 030(b) / 032(b) / 036(b) / 043(b) / 050(b) / 051(b) / 053(b·c·d) / 054(b) / 055(b) / 057(b) / 062(b) / 064(b) / 080(b·c) 열일곱 개 기본 식별자가 분할되어 항목 수가 최대 번호와 어긋난다.
- **번호대 배치**: `080~084` = §0 출하 중인 결함(M0), `001~064` = §A~§G 기능 요구, `090~095` = §H 품질·릴리스 게이트. **AC 번호와 REQ 번호는 대응하지 않는다** — 예컨대 `REQ-PANEL-070`(크로스-윈도 결함)을 검증하는 것은 `AC-PANEL-080/080b/080c`이며 `AC-PANEL-090`은 타입 검사 게이트다. 각 AC 제목의 `↔` 표기가 유일한 대응 근거다.
- **미해결 결정 의존 표시**: 일부 AC는 `plan.md` §A.2의 미해결 결정 결과에 따라 판정 문구가 확정된다. 해당 AC는 `⟨OQ-N 의존⟩`으로 표시하고 무엇이 확정되어야 하는지 명시한다. 결정 없이 구현하면 그 AC는 판정 불가다.

---

## §0 출하 중인 결함의 해소 (M0 — 재현 우선)

> 이 절의 AC는 **수정 전에 실패하는 것을 먼저 확인**한 뒤 판정한다(REQ-PANEL-073). 실패 출력과 통과 출력 양쪽이 증거다. 두 결함 모두 컴파일 오류를 내지 않고 조용히 실패하므로, 실패 실증 없이는 무엇을 고쳤는지 알 수 없다.

### AC-PANEL-080 `[P+N]` 확정 이벤트가 대상 문서를 벗어나 적용되지 않는다 ↔ REQ-PANEL-070
- **Given** 조정 계층에 문서 `a.md`와 `b.md`가 등록되어 있고 둘 다 미저장 편집이 없으며, 각 문서에 별개의 적용 대상(`DispatchTarget`)이 결속된 상태
- **When** `a.md` 경로의 확정 외부 변경 이벤트를 주입한다
- **Then** `a.md`의 대상에만 `apply-to-buffer`가 도달하고, `b.md`의 대상에는 어떤 적용도 도달하지 않는다 (대상별 호출 횟수 단언: `a.md` = 1, `b.md` = 0)
- **And** `b.md`의 버퍼 내용이 바이트 단위로 동일하다
- **RED 선행 (필수)**: 이 AC는 수정 전 실패해야 한다. 오늘의 사슬 — `electron/ipc/project.ts:40-44`(모든 창 브로드캐스트) → `src/store/externalChangeChannel.ts:28-50`(`change.path` 미대조) → `src/store/reconciliationStore.ts:39`(`autoApplyPolicy`) → `shared/reconciliation.ts:192-197`(경로 검사 없는 `apply-to-buffer`) — 에서는 `b.md`의 대상이 `a.md`의 내용을 받는다. 실패 출력을 증거로 기록한다

### AC-PANEL-080b `[P+N]` 열려 있지 않은 경로의 확정 이벤트는 폐기된다 ↔ REQ-PANEL-070
- **Given** 문서 `a.md`만 등록된 상태
- **When** 등록되지 않은 경로 `z.md`의 확정 외부 변경 이벤트를 주입한다
- **Then** 어떤 대상에도 적용이 도달하지 않고 어떤 문서의 조정 상태도 전이하지 않는다

### AC-PANEL-080c `[P+N]` 오염된 버퍼가 저장으로 디스크에 전파되지 않는다 ↔ REQ-PANEL-070
- **Given** AC-PANEL-080의 상황 재현 후 `b.md`를 저장하는 시나리오
- **When** 저장을 수행한다
- **Then** 디스크의 `b.md` 바이트가 원래 `b.md` 내용과 동일하다 (SHA-256 동일)
- **결함의 실질 피해를 고정하는 AC**: 버퍼 오염 자체보다 이 전파가 데이터 손실이다. `appStore.filePath`가 여전히 `b.md`를 가리키므로 오늘은 A의 내용이 B의 파일에 기록된다

### AC-PANEL-081 `[P+N]` 다른 표면의 조합 종료가 진행 중인 조합의 보류를 해제하지 않는다 ↔ REQ-PANEL-071
- **Given** 두 편집 표면 각각에 조합 게이트가 부착되고, 표면 A에서 `compositionstart`가 발생해 그 문서가 보류 상태이며 확정 변경이 큐에 있는 상태
- **When** 표면 B에서 `compositionstart` → `compositionend` 를 발생시키고 지연 드레인이 실행되도록 한다
- **Then** 표면 A의 문서는 여전히 보류 상태이며 `apply-to-buffer` effect가 산출되지 않는다
- **And** 표면 A에서 `compositionend`를 발생시키고 드레인이 실행된 뒤에야 정책 라우터로 라우팅된다
- **RED 선행 (필수)**: 오늘 `shared/reconciliation.ts:57`의 `composing`은 창 전역 단일 boolean이고 어느 게이트든 그것을 쓰므로(`src/editor/compositionGate.ts:109, 112` ← `src/editor/MarkdownEditor.tsx:155`), 표면 B의 `compositionend`가 표면 A의 보류를 푼다. 실패 출력을 증거로 기록한다
- **IME 안전 최우선**: `compositionGate.ts:9-25`가 막기 위해 작성된 실패 계열을 한 계층 위에서 재도입하는 것이 이 결함이다

### AC-PANEL-082 조정 코어 5파일의 확장자 독립이 보존된다 ↔ REQ-PANEL-072, C-12
- **Given** M0의 라우팅 계층이 구현된 상태
- **When** `pnpm test -- extensionIndependence` 를 실행한다
- **Then** `tests/electron/extensionIndependence.test.ts`가 **소스 무변경 상태로** 통과한다
- **And** `applyExternalChange.length === 2` 단언(`:171-174`)이 통과한다 — 적용 API에 `path` 인자가 추가되지 않았다
- **And** `electron/changeConfirmation.ts`·`electron/watchScope.ts`·`shared/reconciliation.ts`·`src/editor/minimalDiff.ts` 네 파일의 `git diff --quiet` 이 exit 0이다
- **참고**: `src/editor/applyExternalChange.ts`는 `registerReconciliationExecutor`(`:123-132`) 변경이 REQ-PANEL-055로 필요할 수 있으므로 `git diff` 단언 대상에서 제외한다. 그 파일에 대한 증거는 위 arity 단언 통과다

### AC-PANEL-083 라우팅 키가 조정 코어 밖에 있다 ↔ REQ-PANEL-072
- **Given** M0 구현 완료 상태
- **When** 라우팅 키를 담은 모듈의 위치를 확인한다
- **Then** 경로→상태 / 경로→적용 대상 매핑이 `src/store/` 아래에 있고 `tests/electron/extensionIndependence.test.ts:34-40`의 `LAYER_FILES` 다섯 파일 어디에도 없다 (소스 스캔 단언)

### AC-PANEL-084 브로드캐스트 범위가 문서화된다 ↔ REQ-PANEL-070, OQ-8 후보 1
- **Given** M0 구현 완료 상태
- **When** `electron/ipc/project.ts`의 broadcast 구현을 스캔한다
- **Then** `BrowserWindow.getAllWindows()` 를 통한 전체 창 브로드캐스트가 여전히 유지되고 있음이 단언된다 (변경하지 않았다는 사실의 고정)
- **왜 이 단언인가**: M0은 렌더러 측 경로 대조로 결함을 닫고 main의 브로드캐스트 범위는 건드리지 않는다(`design.md` §6.2a의 기각된 대안 3). 창 간 소유권 모델은 `spec.md` §D.4가 범위 밖으로 둔 작업이므로, 이 단언이 "의도적으로 남겨 둔 것"임을 기록해 나중에 잊지 않게 한다

---

## §A 레이아웃과 패널 셸

### AC-PANEL-001 `[P+N]` 패널마다 표면 상태가 독립이다 ↔ REQ-PANEL-001
- **Given** 두 패널이 서로 다른 문서를 열고 있을 때
- **When** 패널 A에서 캐럿을 이동하고 텍스트를 선택하고 스크롤한다
- **Then** 패널 B의 캐럿 위치·선택 범위·스크롤 위치가 변경되지 않는다
- **And** 패널 A에서 실행 취소를 수행해도 패널 B의 문서가 변경되지 않는다

### AC-PANEL-002 `[P+N]` 사이드바 스토어 계약이 무변경으로 통과한다 ↔ REQ-PANEL-002, C-10
- **Given** `tests/store/sidebarStore.test.ts`(113줄), `tests/store/rightSidebarStore.test.ts`(118줄), `tests/sidebar/sidebarReorg.test.tsx`(317줄), `tests/sidebar/rightSidebar.test.tsx`(293줄) — 총 841줄
- **When** 패널 셸 구현 후 `pnpm test`를 실행한다
- **Then** 네 파일이 **소스 무변경 상태로** 전부 통과한다
- **And** 네 파일에 대한 `git diff --quiet` 이 exit 0이다
- ⟨OQ-1 의존⟩ 후보 2(통합 그리드)가 선택되면 이 AC는 판정 불가이며, 그 경우 REQ-PANEL-002의 "관측 동작 보존"을 별도 회귀 단언으로 재정의해야 한다

### AC-PANEL-002b `[P+N]` 사이드바 폭 경계가 보존된다 ↔ REQ-PANEL-002
- **Given** 패널이 2개 이상 열린 상태
- **When** 좌 사이드바 폭을 `WIDTH_BOUNDS.sidebar.min` 미만과 `.max` 초과로 각각 설정 시도한다
- **Then** 각각 경계값으로 clamp되며, clamp 값이 `@shared/prefsValidation`의 값과 문자열/수치 동일하다 (상수를 직접 참조하는 단언)
- **And** 우 사이드바에 대해서도 `WIDTH_BOUNDS.rightSidebar` 기준으로 동일하게 성립한다

### AC-PANEL-002c `[P+N]` 사이드바 persist 경로가 패널 축과 분리된다 ↔ REQ-PANEL-002, REQ-PANEL-007
- **Given** 사이드바 폭·가시성·활성 탭이 특정 값인 상태
- **When** 패널을 분할하고 닫는 동작을 반복한다
- **Then** 사이드바 설정에 대한 `prefsSet` 호출이 발생하지 않는다 (호출 횟수 단언)
- **And** 사이드바 설정 값이 변경되지 않는다

### AC-PANEL-003 `[N]` 프로젝트 없음 상태는 단일 패널로 축퇴한다 ↔ REQ-PANEL-003
- **Given** 어떤 상위 디렉터리에도 매니페스트가 없는 `a.md`
- **When** 그 파일을 연다
- **Then** 패널이 정확히 1개 존재한다
- **And** 오류·경고·프로젝트 관련 안내 UI가 표시되지 않는다

### AC-PANEL-003b `[N]` 단일 패널 축퇴가 오늘의 동작과 관측상 구분되지 않는다 ↔ REQ-PANEL-003
- **Given** 패널이 정확히 1개인 상태 (프로젝트 없음)
- **When** 렌더된 DOM 구조를 검사한다
- **Then** 좌 사이드바 → 툴바+에디터 → 우 사이드바의 가로 배치, 하단 상태바 배치가 이 SPEC 이전과 동일하다
- **And** 패널 경계선·패널 탭·분할 핸들 등 패널 다중화를 시사하는 시각 요소가 렌더되지 않는다
- **회귀 방어의 1차 방어선**: 이 AC가 깨지면 단일 파일 열기 사용자가 회귀를 겪는다

### AC-PANEL-004 `[P+N]` 마지막 패널은 닫을 수 없다 ↔ REQ-PANEL-004
- **Given** 패널이 정확히 1개인 상태
- **When** 패널 닫기를 요청한다
- **Then** 패널 수가 여전히 1이다
- **And** 그 패널의 문서를 닫는 요청은 패널을 유지한 채 빈 버퍼(`filePath` 없음, 내용 빈 문자열)로 되돌린다

### AC-PANEL-005 `[P+N]` 분할·닫기가 다른 패널을 훼손하지 않는다 ↔ REQ-PANEL-005
- **Given** 패널 A가 미저장 편집이 있는 문서를 열고 캐럿이 특정 오프셋에 있을 때
- **When** 새 패널 B를 분할로 만들고 다시 닫는다
- **Then** 패널 A의 문서 내용·미저장 여부·캐럿 오프셋·스크롤 위치가 모두 이전과 동일하다
- **And** 남은 패널들에 사용 가능한 가로 공간이 재배분된다 (각 패널 폭 합이 컨테이너 폭과 일치)

### AC-PANEL-006 `[P+N]` 패널 배치가 세션 간 복원된다 ↔ REQ-PANEL-006
- **Given** 패널 2개가 각각 다른 문서를 열고 특정 상대 크기를 가진 상태
- **When** 앱을 종료하고 재시작한다
- **Then** 패널 수·상대 크기·각 패널의 바인딩 문서 경로가 복원된다

### AC-PANEL-006b `[P+N]` 복원 실패 경로는 조용히 건너뛰지 않는다 ↔ REQ-PANEL-006
- **Given** persist된 패널 배치에 신뢰 경계(`pathGuard`) 검증에 실패하는 경로가 포함될 때
- **When** 앱을 재시작한다
- **Then** 그 패널은 빈 버퍼로 열리고 사용자에게 오류가 표시된다
- **And** 그 패널이 조용히 생략되지 않는다 (패널 수가 persist된 값과 일치)

### AC-PANEL-007 `[P+N]` 패널 축과 사이드바 축이 독립이다 ↔ REQ-PANEL-007
- **Given** 좌 사이드바 가시=true 폭=240, 우 사이드바 가시=false인 상태
- **When** 패널을 3개까지 분할하고 각 패널 폭을 변경한다
- **Then** 좌·우 사이드바의 가시성과 폭이 변경되지 않는다
- **And** 역방향으로 사이드바를 토글하고 폭을 바꿔도 패널 수·상대 크기가 변경되지 않는다

---

## §B 패널 상태와 문서 바인딩

### AC-PANEL-010 `[P+N]` 문서 상태와 패널 상태의 소유 축이 분리된다 ↔ REQ-PANEL-010
- **Given** 상태 계층에 문서 맵과 패널 목록이 있을 때
- **When** 문서 상태와 패널 상태의 필드 집합을 검사한다
- **Then** 디스크 경로·버퍼 내용·미저장 여부·파일 종류·조정 상태는 문서에만 존재한다
- **And** 캐럿·선택·스크롤·실행 취소 이력·표시 모드는 패널에만 존재한다
- **And** 어느 필드도 두 축에 중복 존재하지 않는다 (필드 집합 교집합이 공집합)

### AC-PANEL-011 `[P+N]` 같은 파일을 두 패널이 참조하면 버퍼가 복제되지 않는다 ↔ REQ-PANEL-011
- **Given** 패널 A가 `a.md`를 열고 있을 때
- **When** 패널 B가 같은 `a.md`를 연다
- **Then** 두 패널이 같은 문서 식별자를 참조한다 (문서 맵의 항목 수가 1)
- **And** 패널 A에서 텍스트를 입력하면 패널 B의 문서 내용이 즉시 같은 값이 된다
- **And** 패널 B의 캐럿은 변경 범위를 통해 매핑된 위치이며, 문서 맨 앞으로 이동하지 않는다

### AC-PANEL-012 `[P+N]` 저장은 문서 단위다 ↔ REQ-PANEL-012
- **Given** 같은 문서를 참조하는 패널 2개가 있고 그 문서에 미저장 편집이 있을 때
- **When** 한 패널에서 저장한다
- **Then** 디스크 쓰기가 정확히 1회 발생한다 (쓰기 함수 호출 횟수 단언)
- **And** 두 패널 모두의 미저장 표시가 해제된다

### AC-PANEL-013 `[P+N]` 마지막 참조 패널을 닫을 때 폐기 확인을 거친다 ↔ REQ-PANEL-013
- **Given** 미저장 편집이 있는 문서를 참조하는 패널이 정확히 1개일 때
- **When** 그 패널을 닫으려 한다
- **Then** 폐기 확인 흐름(`confirmDiscard`)이 호출된다
- **And** 사용자가 취소하면 패널이 닫히지 않고 문서 내용이 보존된다

### AC-PANEL-013b `[P+N]` 다른 참조 패널이 남으면 확인을 요구하지 않는다 ↔ REQ-PANEL-013
- **Given** 미저장 편집이 있는 문서를 참조하는 패널이 2개일 때
- **When** 그중 하나를 닫는다
- **Then** 폐기 확인이 호출되지 않는다 (호출 횟수 0 단언)
- **And** 문서 내용과 미저장 여부가 보존되며 남은 패널이 그것을 표시한다

### AC-PANEL-014 `[P+N]` 어떤 패널의 미저장 편집도 확인 없이 사라지지 않는다 ↔ REQ-PANEL-014
- **Given** 패널 2개가 서로 다른 문서에 각각 미저장 편집을 가진 상태
- **When** 패널 분할·닫기·활성 전환·외부 변경 수신을 임의 순서로 수행한다 (외부 변경은 확정 이벤트 주입)
- **Then** 어느 문서의 내용도 사용자 확인 없이 변경되지 않는다
- **And** 이는 SPEC-1 REQ-WS-028의 패널 축 확장이며 동일하게 타협 불가다

---

## §C 편집 모드

### AC-PANEL-020 `[P+N]` 원고 패널은 3-모드를 그대로 제공한다 ↔ REQ-PANEL-020
- **Given** 마크다운 문서에 바인딩된 패널
- **When** 그 패널의 사용 가능한 모드 집합을 조회한다
- **Then** `wysiwyg`, `typora`, `markdown` 정확히 세 개다
- **And** 각 모드의 데코레이션 동작이 이 SPEC 이전과 동일하다 (`tests/editor/editMode.test.ts` 무변경 통과)

### AC-PANEL-021 `[P+N]` 모드는 패널별로 독립이다 ↔ REQ-PANEL-021
- **Given** 원고 패널 A와 원고 패널 B가 모두 `wysiwyg`인 상태
- **When** 패널 A의 모드를 `markdown`으로 바꾼다
- **Then** 패널 A의 `editModeField` 값이 `markdown`이고 패널 B는 `wysiwyg`을 유지한다
- **And** 패널 B의 라이브 데코레이션이 계속 적용된다

### AC-PANEL-022 `[P+N]` 보조 패널에는 3-모드가 적용되지 않는다 ↔ REQ-PANEL-022
- **Given** `.py` 문서에 바인딩된 보조 패널
- **When** 그 패널의 사용 가능한 모드 집합을 조회하고 UI를 검사한다
- **Then** 모드 선택 수단이 그 패널에 제시되지 않는다
- **And** 라이브 데코레이션 집합이 비어 있다
- **And** `editModeField`는 등록되어 있다 (field 부재 시 `typora` 폴백이 흘러드는 것을 막기 위한 의도적 배치 — `design.md` §5.2)

### AC-PANEL-023 `[P+N]` `defaultMode`는 새 원고 패널의 초기값으로만 쓰인다 ↔ REQ-PANEL-023
- **Given** `prefs.editor.defaultMode`가 `wysiwyg`인 상태에서 원고 패널 A의 모드를 `markdown`으로 바꾼 뒤
- **When** 새 원고 패널 B를 연다
- **Then** 패널 B의 초기 모드가 `wysiwyg`이다
- **And** 패널 A의 모드 변경 시 `prefsSet({editor:{defaultMode:…}})` 호출이 발생하지 않았다 (호출 횟수 0 단언)
- ⟨OQ-3 의존⟩ 후보 2(마지막 변경을 prefs에 반영)가 선택되면 이 AC의 두 번째 단언은 제거되고 판정 문구가 바뀐다

### AC-PANEL-024 `[P+N]` 모드 컨트롤은 활성 패널에 종속된다 ↔ REQ-PANEL-024
- **Given** 원고 패널 A(`markdown`)와 원고 패널 B(`wysiwyg`)가 있고 A가 활성인 상태
- **When** 상태바 모드 표시를 검사한다
- **Then** `markdown`이 선택된 것으로 표시된다
- **And** 활성 패널을 B로 바꾸면 표시가 `wysiwyg`으로 바뀐다
- **And** 활성 패널이 보조 패널이면 모드 컨트롤이 비활성 또는 부재 상태다

---

## §D 포커스와 커맨드 라우팅

### AC-PANEL-030 `[P+N]` 활성 패널은 마지막 편집 포커스를 따른다 ↔ REQ-PANEL-030
- **Given** 패널 A와 B가 있고 A가 활성인 상태
- **When** 패널 B의 편집 표면에 포커스를 준다
- **Then** 활성 패널이 B가 된다

### AC-PANEL-030b `[P+N]` 패널 밖 포커스 이동이 활성 패널을 바꾸지 않는다 ↔ REQ-PANEL-030
- **Given** 패널 B가 활성인 상태
- **When** 툴바 버튼 · 사이드바 항목 · 상태바 컨트롤에 차례로 포커스를 준다
- **Then** 각 단계 후에도 활성 패널이 B다
- **And** 패널이 1개뿐인 상태에서는 어떤 포커스 이동 후에도 그 패널이 활성이다

### AC-PANEL-031 `[P+N]` 뷰 의존 커맨드가 활성 패널에만 작용한다 ↔ REQ-PANEL-031
- **Given** 원고 패널 A와 원고 패널 B가 서로 다른 문서를 열고 있고 B가 활성인 상태
- **When** `bold` / `insertTable` / `toggleTask` / `{heading, level:2}` 커맨드를 각각 발신한다
- **Then** 매 경우 패널 B의 문서만 변경되고 패널 A의 문서 내용은 바이트 단위로 동일하다

### AC-PANEL-032 `[P+N]` 보조 패널 활성 시 마크다운 전용 커맨드는 아무 일도 하지 않는다 ↔ REQ-PANEL-032
- **Given** 보조 패널(`.py`)이 활성이고 원고 패널이 별도로 존재하는 상태
- **When** `bold` / `italic` / `insertTable` / `{heading, level:1}` 커맨드를 각각 발신한다
- **Then** **어느 패널의 문서도 변경되지 않는다** (모든 문서 내용이 바이트 단위로 동일)
- **And** 특히 원고 패널의 문서가 변경되지 않는다 — 보이지 않는 문서를 조용히 바꾸는 것이 이 AC가 막는 결함이다

### AC-PANEL-032b `[P+N]` 마크다운 전용 컨트롤이 비활성으로 제시된다 ↔ REQ-PANEL-032
- **Given** 보조 패널이 활성인 상태
- **When** 툴바와 메뉴의 마크다운 전용 항목을 검사한다
- **Then** 해당 항목들이 비활성(disabled) 상태다
- **And** 오류 토스트·경고가 표시되지 않는다 (정상 상황이므로)

### AC-PANEL-033 `[P+N]` 전역 커맨드는 패널 구성과 무관하게 동작한다 ↔ REQ-PANEL-033
- **Given** 패널 3개가 열린 상태
- **When** `toggleTheme` / `toggleSidebar` / `quickOpen` / `openSettings` / `refreshProjectTree`를 각각 발신한다
- **Then** 각 커맨드가 패널 1개 상태와 동일한 결과를 낸다
- **And** 문서 대상 커맨드(`save`, `exportHtml`)는 활성 패널의 문서를 대상으로 한다

### AC-PANEL-034 `[P+N]` 창 전역 이벤트가 발신 패널을 식별한다 ↔ REQ-PANEL-034
- **Given** 패널 A와 B가 각각 편집 표면을 갖고 각각 대응 수신 컴포넌트를 가진 상태
- **When** 패널 A의 편집 표면에서 링크 편집 이벤트(`durumi:edit-link` 계열)를 발신한다
- **Then** 패널 A에 대응하는 수신 컴포넌트만 반응한다 (반응 횟수 1)
- **And** 패널 B의 수신 컴포넌트는 반응하지 않는다 (반응 횟수 0)
- **And** 같은 단언이 `durumi:open-link-dialog` · `durumi:memo-focus` · `durumi:cm-focus` · `durumi:reference-open` · `durumi:memo-panel-toggle` 각각에 대해 성립한다

### AC-PANEL-035 `[P+N]` 패널 조작이 IME 조합을 중단시키지 않는다 ↔ REQ-PANEL-035
- **Given** 조합 유지형 프리미티브로 패널 A에서 조합을 열어 둔 상태 (`compositionend` 카운터 설치)
- **When** 패널 B를 분할로 만들고, 패널 B를 활성화하고, 다시 패널 B를 닫는다
- **Then** `compositionend` 발생 횟수가 0이다 (조합이 조기 종료되지 않았다)
- **And** 패널 A의 조합을 정상 종료하면 커밋된 텍스트가 입력한 바이트와 일치한다
- **And** 패널 전환 UI에 `role="dialog"` 요소가 렌더되지 않는다

### AC-PANEL-036 `[P]` 수동 새로고침 어포던스가 존재한다 ↔ REQ-PANEL-036, REQ-WS-047a
- **Given** 소유 프로젝트가 있는 파일이 열린 상태
- **When** 프로젝트 트리 표면을 검사한다
- **Then** 수동 새로고침을 발동하는 시각적 어포던스가 존재한다
- **And** 그것을 활성화하면 `project:refresh`가 호출된다 (호출 횟수 1)

### AC-PANEL-036b `[N]` 프로젝트 없음 상태에서는 새로고침 어포던스가 없다 ↔ REQ-PANEL-036
- **Given** 프로젝트 없음 상태
- **When** UI를 검사한다
- **Then** 수동 새로고침 어포던스가 렌더되지 않는다 (재열거 대상이 없다)

---

## §E 비마크다운 편집 표면

### AC-PANEL-040 `[P+N]` 파일 종류 판정이 마크다운 집합을 좁히지 않는다 ↔ REQ-PANEL-040
- **Given** 파일 종류 판정 함수
- **When** `a.md` · `a.markdown` · `a.txt` 를 각각 판정한다
- **Then** 세 경우 모두 마크다운으로 판정된다
- **And** 그 확장자 집합이 `electron/ipc/files.ts`의 다이얼로그 필터 값과 동일하다 (상수를 직접 참조하는 단언 — `tests/` 계층에 배치, `plan.md` §B.2)

### AC-PANEL-041 `[P+N]` 보조 패널이 언어 문법 하이라이팅을 제공한다 ↔ REQ-PANEL-041, C-11
- **Given** `analysis.py` · `refs.bib` · `data.json` · `conf.yaml` 각각을 보조 패널로 열 때
- **When** 각 패널의 extension 목록에서 언어 지원 항목을 조회한다
- **Then** 각 파일에 대응하는 문법 정의가 조달된다
- **And** 문법 정의의 출처가 `@codemirror/language-data`다
- **And** `package.json`의 dependencies에 언어별 개별 패키지(`@codemirror/lang-*`)가 추가되지 않았다 (`git diff` 기반 단언)

### AC-PANEL-042 `[P+N]` 보조 패널에 마크다운 전용 확장이 로드되지 않는다 ↔ REQ-PANEL-042
- **Given** `.py` 보조 패널
- **When** 그 패널의 extension 조립 결과를 조회한다
- **Then** 다음이 모두 부재한다: 마크다운 라이브 데코레이션, 3-모드 데코레이션 컴파트먼트 내용, 이미지/링크 원자 경계, WYSIWYG 이스케이프 필터, 인용 자동완성, 인용 호버 툴팁, 제목 힌트 플러그인, 마크다운 keymap, 이미지 붙여넣기·드롭 핸들러
- **And** 공통 항목(실행 취소 이력, 기본 keymap, 테마, 활성 줄 강조, 줄바꿈, 변경 리스너)은 존재한다

### AC-PANEL-043 `[P+N]` 보조 패널이 파일 바이트를 정규화하지 않는다 ↔ REQ-PANEL-043
- **Given** 후행 공백 · 탭 들여쓰기 · BOM · NFD 한글 · 제로폭 문자 · 이모지를 포함한 `.py` 파일
- **When** 그 파일을 보조 패널로 열고 **편집하지 않고** 저장한다
- **Then** 저장 후 파일 바이트가 저장 전과 동일하다 (SHA-256 동일)

### AC-PANEL-043b `[P+N]` 열었다 편집 없이 닫으면 바이트가 변하지 않는다 ↔ REQ-PANEL-043
- **Given** 위와 같은 `.py` 파일
- **When** 보조 패널로 열고 저장 없이 닫는다
- **Then** 파일 바이트가 변경되지 않는다 (SHA-256 동일)
- **최소 관측 형태**: 이 AC는 CRLF 처리 결정(OQ-6 (ii))과 무관하게 성립해야 한다 — 저장하지 않으면 어떤 접기도 디스크에 반영되지 않는다

### AC-PANEL-044 `[P+N]` 마크다운 전용 저장 변환이 비마크다운에 적용되지 않는다 ↔ REQ-PANEL-044
- **Given** 마크다운 이미지 링크 형태의 문자열(`![alt](path)`)을 **본문에 포함한** `.py` 파일
- **When** 그 파일을 보조 패널로 열고 저장한다
- **Then** 마크다운 이미지 링크 재작성 함수가 호출되지 않는다 (호출 횟수 0 단언)
- **And** 저장된 바이트에서 그 문자열이 원문 그대로 유지된다
- ⟨OQ-6 (i) 의존⟩ 후보 1(채널 분리)이면 "그 채널에 변환이 존재하지 않는다"는 소스 스캔 단언이 추가된다. 후보 2(게이트)면 호출 횟수 0 단언만 남는다

### AC-PANEL-045 `[P+N]` 문법 정의가 없으면 평문으로 연다 ↔ REQ-PANEL-045
- **Given** 문법 정의가 없는 확장자 파일 (`data.csv`, `notes.xyz`)
- **When** 각각을 패널로 연다
- **Then** 열기가 성공하고 내용이 편집 가능하다
- **And** 오류·경고가 표시되지 않는다

### AC-PANEL-046 `[P+N]` 디코드 불가 파일은 편집 패널로 열지 않는다 ↔ REQ-PANEL-046
- **Given** 유효한 UTF-8이 아닌 바이트 시퀀스를 담은 파일
- **When** 그 파일을 패널로 열려고 한다
- **Then** 편집 가능한 패널이 만들어지지 않고 사용자에게 사유가 보고된다
- **And** 버퍼에 U+FFFD 대체 문자가 담기지 않는다
- **And** 그 파일의 바이트가 변경되지 않는다 (SHA-256 동일)

### AC-PANEL-047 원칙 문서 범위 공백은 기록만 된다 ↔ REQ-PANEL-047, C-9
- **Given** 이 SPEC이 비마크다운 편집 표면을 도입한 상태
- **When** `git diff --quiet -- docs/DOCUMENT_MODE_PRINCIPLES.md` 를 실행한다
- **Then** exit 0이다
- **And** 범위 공백 사실이 `spec.md` REQ-PANEL-047과 이 SPEC의 sync 산출물에 기록되어 있다

---

## §F SPEC-1 계약의 패널별 소비

### AC-PANEL-050 `[P+N]` 열린 모든 패널의 문서가 감시 등록된다 ↔ REQ-PANEL-050
- **Given** 패널 3개가 서로 다른 문서 `a.md` · `b.py` · `c.csv` 를 열고 있을 때
- **When** 감시 등록 호출을 검사한다
- **Then** 세 경로 각각에 대해 `watchOpenFile`이 호출되었다
- **And** 어느 경로의 등록도 다른 경로의 등록을 해제하지 않았다 (`unwatchOpenFile` 호출 횟수 0)
- **회귀 전환**: 오늘의 `tests/hooks/useExternalChangeWiring.test.tsx:90` "파일이 바뀌면 이전 파일의 감시를 먼저 푼다" 단언이 이 AC로 **뒤집힌다**

### AC-PANEL-050b `[P+N]` 같은 문서의 등록·해제는 참조 카운트를 따른다 ↔ REQ-PANEL-050
- **Given** 패널 A와 B가 같은 `a.md`를 참조하는 상태
- **When** 등록 호출을 검사하고, 이어서 패널 A만 닫는다
- **Then** `watchOpenFile('a.md', …)` 호출이 정확히 1회다
- **And** 패널 A 닫힘 후 `unwatchOpenFile('a.md')`가 호출되지 않는다
- **And** 패널 B까지 닫으면 그때 `unwatchOpenFile('a.md')`가 정확히 1회 호출된다

### AC-PANEL-051 `[P+N]` 확정 이벤트가 경로에 해당하는 문서로만 라우팅된다 ↔ REQ-PANEL-051
- **Given** 패널 A가 `a.md`(미저장 편집 없음), 패널 B가 `b.md`(미저장 편집 없음)를 열고 있을 때
- **When** `a.md` 경로의 확정 외부 변경 이벤트를 주입한다
- **Then** 문서 `a.md`에만 조정이 적용되고 `b.md`의 버퍼 내용이 바이트 단위로 동일하다
- **And** 열려 있지 않은 경로 `z.md`의 확정 이벤트를 주입하면 어떤 버퍼도 변경되지 않는다

### AC-PANEL-051b `[P+N]` 경로 대조가 플랫폼 차이를 흡수한다 ↔ REQ-PANEL-051, C-7
- **Given** 경로 대조 로직이 주입 가능한 순수 함수로 분리된 상태
- **When** macOS 형태(`/`, 대소문자 구분)와 Windows 형태(`\`, 드라이브 문자, 대소문자 무구분) 경로 쌍을 각각 대조한다
- **Then** 두 플랫폼 시나리오에서 동일한 대조 결과가 산출된다
- **검증 방법**: Windows e2e가 없으므로(C-7) 순수 함수 유닛에서 양 플랫폼을 재현한다 — SPEC-1이 재검사 로직에 쓴 수단과 동일

### AC-PANEL-052 `[P+N]` 조정 상태가 문서별로 독립이다 ↔ REQ-PANEL-052
- **Given** 문서 `a.md`(미저장 편집 있음)와 `b.md`(미저장 편집 없음)가 각각 패널에 열린 상태
- **When** 두 경로에 각각 확정 외부 변경을 주입한다
- **Then** `a.md`는 알림 상태가 되고 버퍼가 불변이며, `b.md`는 자동 반영된다
- **And** 한 문서의 상태 전이가 다른 문서의 상태를 변경하지 않았다

### AC-PANEL-053 `[P+N]` 배너가 해당 문서의 패널에 표면화된다 ↔ REQ-PANEL-053
- **Given** 패널 A(`a.md`, 미저장 편집 있음)와 패널 B(`b.md`)가 있을 때
- **When** `a.md`에 확정 외부 변경을 주입한다
- **Then** 패널 A 영역 안에 배너가 렌더되고 패널 B 영역에는 렌더되지 않는다
- **And** 창 전역 위치(패널 컨테이너 밖)에 배너가 렌더되지 않는다

### AC-PANEL-053b `[P+N]` N개 패널이 동시에 배너를 표시한다 ↔ REQ-PANEL-053
- **Given** 패널 A·B·C가 각각 미저장 편집이 있는 서로 다른 문서를 열고 있을 때
- **When** 세 경로 모두에 확정 외부 변경을 주입한다
- **Then** 세 패널 모두에 배너가 **동시에** 렌더된다 (배너 요소 개수 3)
- **왜 대기가 아닌가**: 하나만 보이고 나머지가 대기하면 사용자가 나머지를 모른 채 저장해 외부 변경을 덮어쓴다 — REQ-WS-028의 거울상 결함

### AC-PANEL-053c `[P+N]` 배너 등장이 포커스와 활성 패널을 바꾸지 않는다 ↔ REQ-PANEL-053, REQ-PANEL-030
- **Given** 패널 B가 활성이고 패널 A의 편집 표면에 포커스가 없는 상태
- **When** `a.md`에 확정 외부 변경을 주입해 패널 A에 배너가 뜬다
- **Then** `document.activeElement`가 변경되지 않는다
- **And** 활성 패널이 여전히 B다
- **And** 배너 DOM에 자동 포커스 속성이 없고 프로그램적 포커스 호출이 소스에 없다 (소스 스캔 단언)

### AC-PANEL-053d `[P+N]` 배너 동작이 자기 문서에만 작용한다 ↔ REQ-PANEL-053
- **Given** 패널 A와 패널 B가 각각 배너를 표시하는 상태
- **When** 패널 A의 배너에서 "디스크에서 불러오기"를 누른다
- **Then** 문서 `a.md`에만 버퍼 적용이 일어나고 `b.md`의 버퍼는 불변이며 배너도 유지된다
- **And** "해제"와 "차이 보기"에 대해서도 동일하게 자기 문서에만 작용한다

### AC-PANEL-054 `[P+N]` IME 게이트가 패널별로 독립이다 ↔ REQ-PANEL-054
- **Given** 패널 A(`a.md`)에서 조합을 열어 두고 패널 B(`b.md`)는 조합 중이 아닌 상태
- **When** `b.md`에 확정 외부 변경을 주입한다 (`b.md`는 미저장 편집 없음)
- **Then** `b.md`가 즉시 자동 반영된다 (패널 A의 조합에 의해 보류되지 않는다)
- **And** 패널 A의 `compositionend` 발생 횟수가 0이다

### AC-PANEL-054b `[P+N]` 같은 문서를 참조하는 패널 중 하나라도 조합 중이면 보류된다 ↔ REQ-PANEL-054, REQ-WS-020
- **Given** 패널 A와 B가 **같은** 문서 `a.md`를 참조하고, 패널 A에서만 조합이 열려 있고 문서는 미저장 편집이 없는 상태
- **When** `a.md`에 확정 외부 변경을 주입한다
- **Then** 버퍼 적용 effect가 산출되지 않고 문서 상태가 보류(`held-composition`)다
- **And** 패널 A의 조합을 종료하면 그때 정책 라우터로 라우팅된다
- **근거**: 같은 문서이므로 패널 B에 적용하는 것이 곧 조합 중인 패널 A의 문서를 바꾸는 것이다 (`design.md` §6.3)

### AC-PANEL-055 `[P+N]` 실행자가 마운트 탈취로 무효화되지 않는다 ↔ REQ-PANEL-055
- **Given** 패널 A(`a.md`)가 먼저 마운트되고 이어서 패널 B(`b.py`)가 마운트된 상태
- **When** `a.md`에 확정 외부 변경을 주입한다 (`a.md`는 미저장 편집 없음)
- **Then** 패널 A의 버퍼가 새 내용으로 갱신된다
- **And** 패널 B의 마운트가 패널 A의 실행자를 무효화하지 않았다
- **오늘의 결함**: `src/store/reconciliationStore.ts:35`의 모듈 수준 단일 슬롯 `effectHandler`를 두 번째 `registerReconciliationExecutor`(`MarkdownEditor.tsx:159-162`)가 조용히 가져간다

### AC-PANEL-055b `[P+N]` 실행자가 다른 패널의 언마운트로 무효화되지 않는다 ↔ REQ-PANEL-055
- **Given** 패널 A(`a.md`)와 패널 B(`b.py`)가 모두 마운트된 상태
- **When** 패널 B를 언마운트한 뒤 `a.md`에 확정 외부 변경을 주입한다 (`a.md`는 미저장 편집 없음)
- **Then** 패널 A의 버퍼가 새 내용으로 갱신된다 (패널 A의 조정이 살아 있다)
- **오늘의 결함**: 언마운트 정리 클로저가 `setEffectHandler(null)`(`src/editor/applyExternalChange.ts:131`)을 호출해 **그 시점에 슬롯을 쥐고 있던 패널**의 조정을 끈다 — 자기 것이 아니어도 끈다. 마운트 탈취와 언마운트 무장 해제는 별개 경로이므로 AC도 둘이다

### AC-PANEL-056 `[P+N]` 정책 주입 지점이 보존된다 ↔ REQ-PANEL-056, REQ-WS-029
- **Given** 패널 3개가 서로 다른 문서를 열고 있고 각 문서가 미저장 편집이 없는 상태
- **When** 항상 알림을 택하는 정책(`bannerNotifyPolicy` 형태)을 **한 번** 주입하고 세 경로 모두에 확정 외부 변경을 주입한다
- **Then** 세 문서 모두 자동 반영되지 않고 알림 상태가 된다
- **And** 정책 주입 호출이 문서 수와 무관하게 1회다

### AC-PANEL-057 `[P]` data 역할 경로 제외가 패널 수와 무관하다 ↔ REQ-PANEL-057, REQ-WS-046
- **Given** 소유 프로젝트가 있고 패널이 3개 열린 상태
- **When** 감시 범위를 해석한다
- **Then** 제외된 경로가 정확히 하나이며 그것은 `folders`가 data 역할에 대해 해석한 경로다
- **And** 패널이 1개일 때와 제외 결과가 동일하다

### AC-PANEL-057b `[P]` data 역할 경로 안의 파일을 패널로 열면 감시된다 ↔ REQ-PANEL-057, REQ-WS-057b
- **Given** data 역할 경로 하위의 `data/raw.csv`
- **When** 그 파일을 보조 패널로 연다
- **Then** 그 경로에 대해 `watchOpenFile`이 호출된다
- **And** data 역할 **폴더** 자체는 여전히 규약 폴더 감시에서 제외되어 있다

### AC-PANEL-058 `[P+N]` 패널 관련 알림이 모달을 쓰지 않는다 ↔ REQ-PANEL-058, REQ-WS-049
- **Given** 패널 관련 상태(분할·닫기 실패·복원 실패·조정 알림·감시 등록 실패)를 각각 재현한 상태
- **When** 각 상태의 렌더 결과를 검사한다
- **Then** `role="dialog"` / `role="alertdialog"` 요소가 없고 포커스가 이동하지 않는다
- **And** 조정·패널 알림 소스에 자동 포커스 속성과 프로그램적 포커스 호출이 없다 (소스 스캔 단언)
- **예외**: 미저장 편집 폐기 확인(`confirmDiscard`)은 이 SPEC이 도입하지 않은 기존 모달이므로 대상 밖이다

---

## §G 메타데이터·보조 표면의 활성 원고 패널 종속

### AC-PANEL-060 `[P]` 메타데이터 표면이 활성 원고 패널에 종속된다 ↔ REQ-PANEL-060
- **Given** 같은 프로젝트의 원고 `main.md`(front matter `author: Kim`)와 `supp.md`(front matter `author: Lee`)가 각각 패널에 열린 상태
- **When** 활성 패널을 `main.md` 패널로 두고 메타데이터 표면을 검사한다
- **Then** 표시된 저자가 `Kim`이다
- **And** 활성 패널을 `supp.md` 패널로 바꾸면 `Lee`로 바뀐다
- **And** 프로젝트 전역 단일 메타데이터 값이 표시되는 표면이 존재하지 않는다

### AC-PANEL-061 `[P]` 보조 패널 활성 시 직전 활성 원고 패널을 유지한다 ↔ REQ-PANEL-061
- **Given** 원고 패널(`main.md`)이 활성이고 메타데이터 표면이 그 원고의 값을 표시하는 상태
- **When** 보조 패널(`analysis.py`)을 활성화한다
- **Then** 메타데이터 표면이 계속 `main.md`의 값을 표시한다 (비어 있지 않다)
- **And** 원고 패널이 하나도 없으면 그 표면이 부재 상태다

### AC-PANEL-062 `[P+N]` 메모 사이드카와 서지 바인딩이 활성 원고 패널을 따른다 ↔ REQ-PANEL-062
- **Given** 원고 `main.md`(메모 있음)와 `supp.md`(메모 없음)가 각각 패널에 열린 상태
- **When** 활성 원고 패널을 `main.md` → `supp.md` → `main.md` 로 전환한다
- **Then** 각 시점에 표시되는 메모 집합이 그 원고의 것이다
- **And** 어느 시점에도 `main.md`의 메모가 `supp.md` 옆에 저장되지 않는다 (사이드카 쓰기 경로 단언)
- **And** 서지(`.bib`) 해석 결과도 같은 방식으로 활성 원고 패널을 따른다

### AC-PANEL-062b `[P+N]` 활성 패널 전환이 사이드카 디스크 쓰기를 유발하지 않는다 ↔ REQ-PANEL-062
- **Given** 원고 `main.md`(메모 사이드카에 미저장 변경 있음)와 `supp.md`가 각각 패널에 열린 상태
- **When** 활성 원고 패널을 `main.md` → `supp.md` → `main.md` 로 전환한다
- **Then** `memoSidecarWrite` 호출 횟수가 0이다
- **오늘의 결함**: `loadFor`(`src/store/memoSidecarStore.ts:70-84`)는 `docPath` 하나만 붙들고 재바인딩 전에 이전 문서의 dirty 사이드카를 `await window.api.memoSidecarWrite(prev.docPath, prev.sidecar)`로 플러시한다. 패널 전환마다 이 경로가 돌면 (a) 사용자가 오갈 때마다 디스크 쓰기가 발생하고 (b) 그 쓰기가 SPEC-1 감시 계층에 외부 변경 이벤트로 되돌아오는 순환이 생긴다

### AC-PANEL-063 `[P+N]` 목차·검색 히트의 패널 귀속이 결정 가능하다 ↔ REQ-PANEL-063
- **Given** 원고 패널 A와 원고 패널 B가 서로 다른 문서를 열고 A가 활성인 상태
- **When** 목차 항목을 클릭한다
- **Then** 패널 A가 해당 줄로 이동하고 패널 B의 스크롤·캐럿이 변경되지 않는다
- **And** 검색 히트를 열 때 이미 그 문서를 연 패널이 있으면 그 패널로 이동하고, 없으면 활성 패널에 그 문서를 연다
- **And** 어느 경우에도 사용자 요청 없이 새 패널이 만들어지지 않는다 (패널 수 불변 단언)

### AC-PANEL-064 `[P+N]` `open-diff` effect가 문서를 식별한다 ↔ REQ-PANEL-064
- **Given** 패널 A(`a.md`)와 패널 B(`b.md`)가 각각 배너를 표시하는 상태
- **When** 패널 A의 배너에서 "차이 보기"를 누른다
- **Then** 산출된 `open-diff` effect에서 대상 문서가 `a.md`로 식별 가능하다
- **And** diff 표시 UI 자체의 구현은 이 AC의 대상이 아니다 (SPEC-4 소관)

### AC-PANEL-064b `[P]` 서지 폴백이 활성 원고 패널 종속으로 표시된다 ↔ REQ-PANEL-064, REQ-WS-056
- **Given** 매니페스트의 `bibliography`가 읽을 수 없는 경로를 가리켜 walk-up 폴백이 일어난 상태
- **When** 활성 원고 패널의 서지 표면을 검사한다
- **Then** 폴백 사실과 읽을 수 없었던 선언 경로가 표시된다
- **And** 활성 원고 패널이 바뀌면 그 원고 기준으로 다시 해석·표시된다

---

## §H 품질·회귀 게이트

### AC-PANEL-090 타입 검사가 두 프로젝트 모두에서 통과한다 ↔ C-6
- **Given** 구현 완료 상태
- **When** `pnpm typecheck` 를 실행한다
- **Then** `tsc --build` 와 `tsc --noEmit -p tsconfig.test.json` 양쪽이 exit 0이다
- **함정 기록**: 루트 `tsconfig.json`은 `files: []` + `references`만 갖는 컨테이너라 단독 `tsc --noEmit`은 아무것도 검사하지 않는다 (SPEC-1 `research.md` §6.3)

### AC-PANEL-091 린트와 테스트가 통과한다 ↔ C-6, C-10
- **Given** 구현 완료 상태
- **When** `pnpm lint` 와 `pnpm test` 를 실행한다
- **Then** 양쪽이 exit 0이다
- **And** baseline(199 테스트 파일) 대비 **의도적으로 재작성한 테스트**(`plan.md` §B.8이 열거한 항목) 외의 회귀가 0이다

### AC-PANEL-092 커버리지 임계를 만족한다 ↔ C-6
- **Given** 구현 완료 상태
- **When** 커버리지를 측정한다
- **Then** 신규 표면의 커버리지가 85% 목표를 향하며 커밋당 최소 80%를 만족한다
- **주의**: vitest의 glob 임계값은 예외가 아니라 추가 그룹이며, `perFile: true`가 게이트를 실제로 작동하게 만드는 설정이다 (SPEC-1 `research.md` §7.0)

### AC-PANEL-093 커밋 위생이 지켜진다 ↔ C-10, `plan.md` §A.5
- **Given** 이 SPEC의 커밋들
- **When** `git show --stat <각 SHA>` 를 검사한다
- **Then** `plan.md` §A.5의 "하네스 스캐폴딩" 목록 중 어느 것도 포함되지 않는다
- **And** `.moai/specs/SPEC-V03-WORKSPACE-001/` 하위 파일이 변경되지 않았다
- **And** `docs/DOCUMENT_MODE_PRINCIPLES.md` 가 변경되지 않았다

### AC-PANEL-095 e2e `.cm-content` 셀렉터 이관이 완료된다 ↔ C-13
- **Given** 패널 지목 수단이 도입된 상태 (M4 계약 산출물)
- **When** `grep -rl "cm-content" e2e/` 로 대상 파일을 열거하고 각 파일의 셀렉터 형태를 검사한다
- **Then** 34개 파일 중 `.cm-content`를 **창 안 유일 요소로 가정하는** 셀렉터가 0건이다 — 전부 활성 패널 또는 명시 패널을 지목한다
- **And** `pnpm test:e2e` 가 exit 0이다
- **명시적 작업 항목**: 이 이관은 부수 효과가 아니다. 전역 `.cm-content` 규칙(`src/styles/global.css:32`)을 패널 스코프로 좁히는 어떤 작업도 이 이관을 선행으로 요구한다 (`design.md` §3.2a)

### AC-PANEL-094 릴리스 게이트 — 수동 한글 IME 스모크 ↔ C-8
- **Given** AC-PANEL-035, 054, 054b, 053c 가 모두 자동으로 PASS한 상태
- **When** 릴리스 사인오프를 진행한다
- **Then** 실제 macOS 한글 2벌식 IME로 **다중 패널 상태에서** "조합 중 다른 패널의 파일이 외부에서 변경" 및 "조합 중 패널 전환" 시나리오를 수동 검증한 기록이 존재한다 (음절 소실·중복 없음 포함)
- **And** 이 항목은 자동화로 대체될 수 없다 — CDP `Input.imeSetComposition`은 OS 변환 계층을 재현하지 못한다 (`product.md` §8 게이트 3, `docs/v0.3-signoff.md` §3)
- **And** SPEC-1의 AC-WS-024와 함께 v0.3 릴리스 사인오프 게이트로 다룬다

---

## §I 미해결 결정에 의존하는 AC 요약

`plan.md` §A.2의 결정 없이 판정 문구가 확정되지 않는 AC:

| AC | 의존 | 확정되어야 하는 것 |
|---|---|---|
| AC-PANEL-002 | OQ-1 | 사이드바 보존(후보 1) 여부. 흡수(후보 2)면 이 AC는 별도 회귀 단언으로 재정의 |
| AC-PANEL-023 | OQ-3 | `defaultMode`를 패널 모드 변경 시 쓰는가 |
| AC-PANEL-044 | OQ-6 (i) | 채널 분리(소스 스캔 단언 추가) vs 게이트(호출 횟수 단언만) |
| AC-PANEL-043 / 043b | OQ-6 (ii) | CRLF 처리. 어느 결정이든 043b는 성립하나 043의 "편집 없이 저장" 케이스 판정이 달라진다 |
| AC-PANEL-036 / 036b | OQ-5 | 프로젝트 트리의 접근 범위. 후보 1(현행 유지)이면 어포던스가 가리키는 범위를 신뢰된 트리로 좁혀 표시하는 단언이 추가된다 |
| AC-PANEL-084 | OQ-8 | 결함 자체는 M0이 닫으므로 **의존이 좁아졌다**. 후보 2(창 2개 e2e 추가)가 선택되면 실제 `BrowserWindow` 2개 기반 e2e AC 1건이 추가된다. 후보 1(권고)이면 AC-PANEL-084의 소스 스캔 단언으로 갈음한다 |
| AC-PANEL-006 / 006b | OQ-9 | persist 담는 곳. 후보 1(prefs `panels` 배열)이면 `panels`를 `pathGuard` 신뢰 소스로 쓰지 않음을 단언하는 항목이 추가된다. 후보 3(persist 안 함)이면 두 AC 모두 삭제되고 REQ-PANEL-006이 사라진다 |
| AC-PANEL-095 | OQ-1 | e2e `.cm-content` 셀렉터 이관 34파일. 레이아웃 후보에 따라 패널 지목 셀렉터의 형태가 달라진다 |
| §A 전반의 패널 조작 AC | OQ-7 | 탭 축 도입 여부. 도입되면 AC-PANEL-013/053b에 탭 축 단언이 추가된다 |

**M0의 AC는 어떤 미해결 결정에도 의존하지 않는다** (AC-PANEL-080~084). 라우팅 계층의 위치가 C-12/F6에 의해 강제되므로 선택지가 없고, 대상이 출하 중인 결함이므로 승인을 기다릴 이유도 없다.

---

## §J 참조

- `spec.md` — 요구사항 50개 (REQ-PANEL-070~073 + 001~064)
- `plan.md` §A.2 — 미해결 결정 9건, §A.5 — PRESERVE 목록, §C M0 — 출하 중인 결함의 재현 우선 해소, §B.8 — 재작성 대상 테스트 + e2e 34파일 이관
- `design.md` §6.3(조합 OR 합류), §6.4(배너 동시 표시 근거), §5.2(extension 3층)
- `research.md` §7.3(미검증 결함 가설), §8(기존 테스트 불변식)
- `.moai/specs/SPEC-V03-WORKSPACE-001/acceptance.md` — AC-WS-024(수동 IME 스모크), AC-WS-037(원칙 문서 무변경), AC-WS-057b(data 안 열린 파일)
- `docs/v0.3-signoff.md` §3(AC-WS-024 이관), §4(issue #11), §6(SPEC-2 계약 표면)

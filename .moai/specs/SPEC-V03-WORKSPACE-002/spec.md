---
id: SPEC-V03-WORKSPACE-002
title: "v0.3 멀티패널 셸 — 패널 레이아웃·모드·커맨드 라우팅·비마크다운 편집 표면"
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
tags: "multipanel, layout, editmode, focus, menurouting, nonmarkdown, language, reconciliation"
---

# SPEC-V03-WORKSPACE-002 — v0.3 멀티패널 셸

## HISTORY

| 일자 | 버전 | 변경 |
|---|---|---|
| 2026-08-08 | 0.1.0 | 최초 작성 — `EPIC-V03-WORKSPACE`의 2번 SPEC. SPEC-1(`status: completed`, 커밋 `3a51f72`)의 D-1~D-7을 승계하고 D-5가 비워 둔 비마크다운 편집 표면을 채운다 |

---

## §A 배경과 목적

Durumi의 편집 표면은 오늘 **창당 정확히 하나**다. `new EditorView`는 저장소 전체에 `src/editor/MarkdownEditor.tsx:150` 한 곳뿐이고, 그 위의 문서 상태(`src/store/appStore.ts:8-10`), 조정 상태(`src/store/reconciliationStore.ts:35, 38-39`), 커맨드 라우팅(`src/hooks/useMenuCommandRouter.ts:34, 98`), 상태바(`src/components/StatusBar.tsx:32-37`)가 모두 그 하나를 전제한다.

`EPIC-V03-WORKSPACE.md` §1의 end-state는 이 전제를 견딜 수 없다. 한 연구가 원고(`manuscript/*.md`)·분석 스크립트(`scripts/*.py`)·데이터(`data/*.csv`)·서지(`reference/references.bib`)를 함께 담고, CLI 에이전트가 그 파일들을 **동시에** 쓴다. 사용자가 스크립트를 보면서 원고를 고치는 것이 정상 흐름이며, 그러려면 창 하나가 패널 N개를 담아야 한다.

이 SPEC은 네 가지를 정의한다:

- **§B.1~B.2 레이아웃과 패널 상태** — 기존 좌/우 사이드바와 충돌하지 않는 패널 컨테이너, 문서 상태와 패널 상태의 소유 축
- **§B.3~B.4 모드와 라우팅** — 3-모드의 패널별 적용, 활성 패널의 정의, 메뉴 커맨드가 어디로 가는가
- **§B.5 비마크다운 편집 표면** — SPEC-1의 D-5가 의도적으로 비워 둔 공백. 이 SPEC의 핵심 산출
- **§B.6~B.7 SPEC-1 계약의 패널별 소비** — 감시·확정·조정·IME 게이트를 N개 문서에 대해 일관되게 적용

이 SPEC은 구현 방법(HOW)이 아니라 관측 가능한 동작(WHAT)과 그 이유(WHY)를 기술한다.

### 이 SPEC의 가장 위험한 지점 — 조정 계층이 창 전역이다

SPEC-1은 감시·확정을 **경로별로** 만들었다(`electron/ipc/project.ts:151-164`, `electron/externalWatch.ts:67, 76`, `electron/watchScope.ts:32-34`의 `openFiles: readonly string[]`). 그러나 렌더러 쪽 조정 계층은 **문서 축을 갖지 않는다**:

- `ReconciliationState`(`shared/reconciliation.ts:54-62`)에 `path` 필드가 없다.
- `reduceReconciliation`(`:209-268`)은 어느 분기에서도 `change.path`를 비교하지 않는다.
- `useReconciliationStore`의 `effectHandler`(`src/store/reconciliationStore.ts:35`)는 **모듈 수준 싱글턴**이다 — 두 번째 `MarkdownEditor`가 마운트되면 `registerReconciliationExecutor`(`MarkdownEditor.tsx:159-162`)가 첫 번째의 실행자를 덮어쓴다.
- `ReconciliationSurface`(`src/App.tsx:189`)는 창 전역 1개다.

따라서 패널을 늘리기만 하면 **외부 변경이 엉뚱한 버퍼에 적용되는 경로가 생긴다.** SPEC-1의 D-2가 "패널당 배너"를 요구하는 것은 UX 취향이 아니라 이 구조적 결함을 막는 요구다. REQ-PANEL-051~055가 이에 대한 직접 대응이다.

### 승계하는 SPEC-1 결정 (재론하지 않는다)

| SPEC-1 결정 | 이 SPEC에서의 귀결 |
|---|---|
| **D-2** 충돌 시 사용자 편집 유지 + 비침습 배너, 모달 금지(REQ-WS-049) | 배너는 **패널당** 표면화된다(REQ-PANEL-053). 창 전역 단일 배너는 D-2 위반이다 |
| **D-3** 열린 파일 전부 감시 + 규약 폴더, data 역할 경로 1개 제외(REQ-WS-046), 열려 있으면 감시(REQ-WS-057b) | 패널이 늘어도 제외 경계는 그대로(REQ-PANEL-057) |
| **D-5** 비마크다운 편집 표면은 SPEC-2 소관(REQ-WS-032) | §B.5 전체가 이 공백을 채운다 |
| **D-6** pathGuard 신뢰 모델 완화 없음(REQ-WS-012, C-4) | 이 SPEC도 완화하지 않는다(C-4). 다만 실사용 마찰이 §B.5·§B.1에서 정면으로 드러나므로 `plan.md` §A의 미해결 결정으로 올린다 |
| **D-4** 메타데이터 정본 = 원고 front matter | 메타데이터 표면은 **활성 원고 패널 종속**(REQ-PANEL-060). `EPIC-V03-WORKSPACE.md:90`의 구속 |

### 용어

| 용어 | 정의 |
|---|---|
| 패널(panel) | 편집 표면 하나 + 그것이 바인딩된 문서 + 그 표면 고유 상태(캐럿·선택·스크롤·실행 취소·표시 모드)의 단위 |
| 활성 패널(active panel) | 뷰 의존 커맨드가 향하는 패널. 정의는 REQ-PANEL-030 |
| 원고 패널(manuscript panel) | 마크다운 문서에 바인딩된 패널. 3-모드가 적용되는 유일한 종류 |
| 보조 패널(auxiliary panel) | 비마크다운 문서(`.py`/`.csv`/`.bib`/`.json`/기타)에 바인딩된 패널 |
| 문서(document) | 디스크 경로 하나와 그 버퍼 내용·미저장 여부. 패널과 1:N 관계가 될 수 있다(REQ-PANEL-011) |
| 단일 패널 축퇴(single-panel degeneracy) | 패널이 정확히 1개인 상태. 오늘의 동작과 관측상 구분되지 않아야 한다(REQ-PANEL-003) |
| 프로젝트 없음(no-project) | SPEC-1과 동일 정의. **예외가 아니라 1급 상태** |

---

## §B 요구사항 (GEARS)

### §B.1 레이아웃과 패널 셸

**REQ-PANEL-001** (Ubiquitous)
창은 **하나 이상의 패널**을 담**아야 한다(shall)**. 각 패널은 자기 편집 표면과 자기 문서 바인딩을 가지며, 다른 패널의 표면 상태(캐럿·선택·스크롤·실행 취소 이력)를 공유하지 **않는다(shall not)**.

**REQ-PANEL-002** (Ubiquitous)
패널 컨테이너의 도입은 기존 좌/우 사이드바의 **관측 가능한 동작을 변경하지 않아야 한다(shall not)**. 구체적으로 다음이 보존**된다(shall)**: 좌 사이드바 3탭(파일/목차/검색)과 우 사이드바 4탭(참고문헌/AI/메모/변경)의 구성, 각 사이드바의 가시성 토글, 폭 경계(`WIDTH_BOUNDS` — `@shared/prefsValidation`)와 clamp 동작, 폭·가시성·활성 탭의 prefs persist.

**REQ-PANEL-003** (State-driven)
**While** 프로젝트 없음 상태인 동안, 셸은 **단일 패널로 축퇴해야 한다(shall)**. 이 상태에서 사용자가 관측하는 레이아웃·툴바 위치·상태바 내용은 이 SPEC 이전의 단일 에디터 동작과 **구분되지 않아야 한다(shall)**. 단일 패널 축퇴는 기능 축소가 아니라 **1급 상태**이며, 프로젝트가 없다는 사실만으로 오류·경고·안내를 표시하지 **않는다(shall not)**.

**REQ-PANEL-004** (Unwanted)
셸은 패널 수를 0으로 만들 수 있게 해서는 **안 된다(shall not)**. 마지막 남은 패널은 닫을 수 **없으며(shall not)**, 그 패널의 문서를 닫는 동작은 패널을 없애는 것이 아니라 빈 버퍼로 되돌리는 것**이다(shall)** — 오늘의 `새 파일`(`useFileMenuCommands.ts:87-90`)과 같은 결과다.

**REQ-PANEL-005** (Event-driven)
**When** 사용자가 패널 분할 또는 패널 닫기를 요청하면, 셸은 그 요청을 수행하고 남은 패널들에 사용 가능한 공간을 재배분**해야 한다(shall)**. 분할·닫기는 다른 패널의 문서 내용·미저장 여부·캐럿 위치를 변경하지 **않는다(shall not)**.

**REQ-PANEL-006** (Ubiquitous)
패널 배치(패널 수, 각 패널의 상대 크기, 각 패널이 바인딩한 문서 경로)는 세션 간 복원 가능한 형태로 persist **되어야 한다(shall)**. 복원 시 신뢰 경계(`pathGuard`) 검증에 실패하는 경로는 그 패널을 빈 버퍼로 열고 **오류를 표시해야 한다(shall)** — 조용히 건너뛰지 **않는다(shall not)**.

**REQ-PANEL-007** (Unwanted)
패널 수·패널 폭 변화가 사이드바의 가시성이나 폭을 변경해서는 **안 된다(shall not)**. 두 축은 독립**이다(shall)**.

---

### §B.2 패널 상태와 문서 바인딩

**REQ-PANEL-010** (Ubiquitous) — 상태의 소유 축
셸은 다음 소유 축을 지켜**야 한다(shall)**:

| 상태 | 소유자 | 이유 |
|---|---|---|
| 디스크 경로, 버퍼 내용, 미저장 여부 | **문서** | 같은 파일이 두 패널에 열려도 내용·미저장 여부가 둘로 갈라지면 어느 쪽을 저장할지 정의할 수 없다 |
| 캐럿·선택·스크롤 위치, 실행 취소 이력, 표시 모드 | **패널** | 사용자가 한 문서의 서로 다른 부분을 나란히 보는 것이 분할의 목적이다 |
| 조정 상태(status·pending·조합 여부) | **문서** | 확정 이벤트는 경로 단위로 온다(REQ-PANEL-051) |

**REQ-PANEL-011** (Event-driven)
**When** 이미 다른 패널이 열고 있는 파일을 어떤 패널이 열면, 두 패널은 **같은 문서를 참조해야 한다(shall)** — 버퍼가 복제되지 **않는다(shall not)**. 한 패널의 편집은 즉시 다른 패널에 반영**되며(shall)**, 각 패널의 캐럿·스크롤은 그 변경을 통해 매핑**된다(shall)**.

**REQ-PANEL-012** (Ubiquitous)
저장은 **문서 단위**로 수행**되어야 한다(shall)**. 같은 문서를 참조하는 패널이 여럿일 때 저장 1회로 모든 참조 패널의 미저장 표시가 해제**된다(shall)**.

**REQ-PANEL-013** (Event-driven)
**When** 사용자가 미저장 편집이 있는 문서의 **마지막 참조 패널**을 닫으려 하면, 셸은 기존 폐기 확인 흐름(`confirmDiscard`)을 거쳐**야 한다(shall)**. 그 문서를 참조하는 다른 패널이 남아 있으면 확인을 요구하지 **않는다(shall not)** — 편집이 소실되지 않기 때문이다.

**REQ-PANEL-014** (Unwanted)
셸은 사용자 확인 없이 어떤 패널의 미저장 편집도 폐기해서는 **안 된다(shall not)**. 이는 SPEC-1 REQ-WS-028의 패널 축 확장이며 동일하게 **타협 불가다**.

---

### §B.3 편집 모드

**REQ-PANEL-020** (Where)
**Where** 패널이 마크다운 문서에 바인딩된 경우, 그 패널은 3-모드(Document/Live/Source, `EditMode = 'wysiwyg'|'typora'|'markdown'`)를 그대로 제공**해야 한다(shall)**. 이 SPEC은 모드의 의미·개수·데코레이션 동작을 변경하지 **않는다(shall not)**.

**REQ-PANEL-021** (Ubiquitous)
표시 모드는 **패널별로 독립**이어야 한다(shall). 한 패널의 모드 변경이 다른 패널의 모드를 변경해서는 **안 된다(shall not)**.

**REQ-PANEL-022** (Where)
**Where** 패널이 비마크다운 문서에 바인딩된 경우, 3-모드는 그 패널에 적용되지 **않아야 한다(shall not)** — 마크다운 마커를 숨기거나 드러내는 개념이 그 문서에 존재하지 않기 때문이다. 보조 패널의 표시 상태는 3-모드와 **별개 축**이며, 사용자가 그 패널에 대해 3-모드를 선택할 수단을 제시하지 **않는다(shall not)**.

**REQ-PANEL-023** (Ubiquitous)
모드 기본값(`prefs.editor.defaultMode`)은 **새로 여는 원고 패널의 초기 모드**로 해석**되어야 한다(shall)**. 패널별 모드 변경이 이 기본값을 즉시 덮어써서는 **안 된다(shall not)** — 그러면 마지막으로 모드를 바꾼 패널이 전역 기본값을 결정해 다음 세션의 모든 패널을 규정한다.

**REQ-PANEL-024** (Ubiquitous)
모드를 표시·변경하는 사용자 표면(상태바 모드 라디오, 메뉴의 모드 항목)은 **활성 패널의 모드**를 표시하고 그 패널에 작용**해야 한다(shall)**. 활성 패널이 보조 패널이면 그 표면은 비활성 또는 부재 상태로 제시**된다(shall)** — 적용 대상이 없는 컨트롤을 활성으로 보이게 하지 **않는다(shall not)**.

---

### §B.4 포커스와 커맨드 라우팅

**REQ-PANEL-030** (Ubiquitous) — 활성 패널의 정의
셸은 정확히 하나의 패널을 **활성 패널**로 유지**해야 한다(shall)**. 활성 패널은 **가장 최근에 편집 포커스를 받은 패널**이**며(shall)**, 포커스가 패널 밖(사이드바·툴바·대화상자)으로 이동해도 활성 패널은 **변하지 않는다(shall not)** — 툴바 버튼을 누르기 위해 포커스가 떠나는 것이 활성 패널을 잃는 것이어서는 안 된다. 패널이 하나뿐이면 그 패널이 항상 활성**이다(shall)**.

**REQ-PANEL-031** (Ubiquitous)
편집 표면을 필요로 하는 메뉴 커맨드(서식·표·검색·메모 이동·포커스/타이프라이터 모드·제목 수준 등, `useMenuCommandRouter.ts:148-248`의 `view` 의존 분기)는 **활성 패널**에 작용**해야 한다(shall)**. 어떤 커맨드도 활성 패널이 아닌 패널의 문서를 변경해서는 **안 된다(shall not)**.

**REQ-PANEL-032** (Where)
**Where** 활성 패널이 보조 패널이고 요청된 커맨드가 마크다운 전용인 경우, 셸은 그 커맨드를 **아무 일도 하지 않고 종료해야 하며(shall)**, 다른 패널로 우회 적용하지 **않는다(shall not)**. 사용자가 보이지 않는 문서를 바꾸는 것이 최악의 결과이므로 "마지막 마크다운 패널로 보낸다"는 대안은 채택되지 **않는다(shall not)**. 해당 메뉴 항목·툴바 버튼은 비활성 상태로 제시**된다(shall)**.

**REQ-PANEL-033** (Ubiquitous)
편집 표면과 무관한 커맨드(파일 열기/저장, 내보내기, 테마, 사이드바 토글, Quick Open, 설정, 수동 새로고침 등)는 패널 구성과 무관하게 오늘과 동일하게 동작**해야 한다(shall)**. 단 문서를 대상으로 하는 것(저장·내보내기)은 **활성 패널의 문서**를 대상으로 **한다(shall)**.

**REQ-PANEL-034** (Ubiquitous)
편집 표면에서 발신되어 셸이 수신하는 창 전역 이벤트(링크 편집·링크 대화상자 열기·메모 포커스·변경 포커스·참고문헌 열기·메모 패널 토글 계열)는 **발신 패널을 식별할 수 있어야 한다(shall)**. 수신 측은 자기 패널이 발신자가 아닌 이벤트를 처리하지 **않는다(shall not)** — 그러지 않으면 패널 N개에서 N개의 대화상자가 동시에 열린다.

**REQ-PANEL-035** (Unwanted)
패널 활성화·분할·닫기는 진행 중인 IME 조합을 중단시키거나 강제 커밋시켜서는 **안 된다(shall not)**. 이는 SPEC-1 REQ-WS-022의 패널 축 확장이다. 패널 전환 UI는 모달을 사용하지 **않는다(shall not)**(REQ-WS-049 승계).

**REQ-PANEL-036** (Ubiquitous)
셸은 수동 새로고침(SPEC-1 REQ-WS-047)의 **시각적 어포던스**를 제공**해야 한다(shall)** — SPEC-1 REQ-WS-047a가 이 SPEC에 명시적으로 넘긴 소유권이다. 어포던스는 프로젝트 트리 표면에 배치**되며(shall)**, 프로젝트 없음 상태에서는 표시되지 **않는다(shall not)**(재열거 대상이 없다).

---

### §B.5 비마크다운 편집 표면 (SPEC-1 D-5가 비워 둔 공백)

**REQ-PANEL-040** (Event-driven)
**When** 패널이 문서를 바인딩하면, 셸은 그 문서의 **종류**를 판정**해야 한다(shall)**. 판정은 파일 확장자에 기반**하며(shall)**, 마크다운으로 판정되는 확장자 집합은 오늘 다이얼로그가 이미 받는 집합(`md`, `markdown`, `txt` — `electron/ipc/files.ts:34`)을 **좁히지 않는다(shall not)**.

**REQ-PANEL-041** (Where)
**Where** 문서 종류에 대응하는 문법 정의가 사용 가능한 경우, 보조 패널은 그 언어의 문법 하이라이팅을 제공**해야 한다(shall)**. 문법 정의는 **이미 의존성인 `@codemirror/language-data`**(`package.json:39`)에서 조달**되며(shall)**, 이 SPEC은 언어별 개별 패키지를 새로 추가하지 **않는다(shall not)**. 최소한 `.py`, `.csv`, `.bib`/`.bibtex`, `.json`, `.yaml`/`.yml`이 다뤄**진다(shall)**.

**REQ-PANEL-042** (Unwanted)
보조 패널에는 마크다운 전용 확장이 로드되어서는 **안 된다(shall not)**. 구체적으로 다음이 보조 패널에 적용되지 **않는다(shall not)**: 마크다운 라이브 데코레이션, 3-모드 컴파트먼트, 이미지/링크 원자 경계, WYSIWYG 이스케이프 필터, 인용 자동완성·호버, 제목 힌트, 마크다운 keymap, 이미지 붙여넣기·드롭 핸들러.

**REQ-PANEL-043** (Ubiquitous) — 바이트 무결성
보조 패널의 열기·편집·저장은 대상 파일의 바이트를 정규화하지 **않아야 한다(shall not)** — 줄바꿈 변환, 후행 공백 제거, 인코딩 재작성, 들여쓰기 정규화, BOM 추가·제거를 수행하지 **않는다(shall not)**. 이는 SPEC-1 REQ-WS-033을 **조정 계층에서 편집·저장 계층으로 확장**한 것이다.

**편집하지 않고 열었다 닫으면 파일 바이트가 변하지 않아야 한다(shall)** — 이것이 이 요구의 최소 관측 형태다.

**REQ-PANEL-044** (Unwanted)
마크다운 문법을 인식하는 저장 시 변환은 비마크다운 문서에 적용되어서는 **안 된다(shall not)**. 오늘의 저장 경로는 파일 종류와 무관하게 마크다운 이미지 링크 정규식 재작성을 거친다(`electron/ipc/files.ts:64` → `electron/pendingAssets.ts:157, 175-176`). 실제 치환이 pending 경로 조건(`pendingAssets.ts:162`)에 걸려 드물게 일어난다는 사실은 이 요구를 면제하지 **않는다(shall not)** — 구조적으로 적용 가능한 경로가 남아 있으면 언젠가 적용된다.

**REQ-PANEL-045** (Where)
**Where** 문서 종류에 대응하는 문법 정의가 없는 경우, 보조 패널은 그 문서를 **평문(plain text)** 으로 열어**야 한다(shall)** — 열기를 거부하지 **않는다(shall not)**. 알 수 없는 확장자는 오류가 아니**다(shall)**.

**REQ-PANEL-046** (Event-driven — 실패 모드 감지)
**When** 문서 내용이 유효한 텍스트로 디코드되지 않으면, 셸은 그 문서를 편집 가능한 패널로 열지 **않아야 하며(shall not)** 사용자에게 사유를 보고**해야 한다(shall)**. 손상된 내용을 대체 문자로 때워 버퍼에 담지 **않는다(shall not)** — SPEC-1 REQ-WS-031이 조정 경로에 대해 세운 것과 같은 자세이며, 열기 경로에서 이를 어기면 저장 시 파일이 파괴된다.

**REQ-PANEL-047** (Ubiquitous)
`docs/DOCUMENT_MODE_PRINCIPLES.md`는 문서모드 마크다운 편집에만 범위가 걸려 있다(그 문서 §0). 이 SPEC이 비마크다운 편집 표면을 도입하면 **원칙 문서가 덮지 않는 편집 표면이 처음으로 실재한다**. 이 SPEC은 그 공백을 **기록만 하며(shall)**, 해당 문서를 수정하지 **않는다(shall not)** — SPEC-1 AC-WS-037이 그 파일의 무변경을 불변식으로 고정했다. 비마크다운 바이트 무결성은 REQ-PANEL-043·044와 이 SPEC의 자체 수용 기준이 고정**한다(shall)**.

---

### §B.6 SPEC-1 계약의 패널별 소비

> 이 절이 이 SPEC의 정확성 핵심이다. §A가 기술한 창 전역 조정 상태 결함에 대한 직접 대응이다.

**REQ-PANEL-050** (Ubiquitous)
셸은 **열려 있는 모든 패널의 문서**를 감시 등록**해야 한다(shall)**. 등록·해제는 문서 단위**이며(shall)**, 어떤 문서를 두 패널이 참조하면 등록은 1회, 해제는 마지막 참조 패널이 닫힐 때 1회**다(shall)**. main 측 감시 계약은 이미 경로별이므로(`electron/ipc/project.ts:151-164`) 이 요구는 렌더러 측의 단일 경로 등록(`src/hooks/useExternalChangeWiring.ts:31-42`)을 대체**한다(shall)**.

**REQ-PANEL-051** (Ubiquitous)
확정된 외부 변경은 그 **경로에 해당하는 문서로만** 라우팅**되어야 한다(shall)**. 열려 있지 않은 경로의 확정 이벤트는 어떤 버퍼에도 영향을 주지 **않아야 한다(shall not)**.

이는 방어적 요구가 아니라 **필수**다: `ExternalFileChange`는 모든 창에 브로드캐스트되고(`electron/ipc/project.ts:40-44`) 렌더러는 오늘 `path`를 대조하지 않는다(`src/store/externalChangeChannel.ts:28-50`, `shared/reconciliation.ts:209-268`).

**REQ-PANEL-052** (Ubiquitous)
조정 상태(status·보류 변경·조합 여부·미저장 여부)는 **문서별로 독립**이어야 한다(shall). 한 문서의 조정 상태가 다른 문서의 조정 판정에 영향을 주어서는 **안 된다(shall not)**.

**REQ-PANEL-053** (State-driven)
**While** 어떤 문서가 조정 알림 상태인 동안, 그 알림은 **그 문서를 표시하는 패널에** 표면화**되어야 한다(shall)** — 창 전역 단일 배너로 표현하지 **않는다(shall not)**. 창 전역 단일 배너는 어느 문서의 알림인지 표현할 수 없어 SPEC-1 D-2/REQ-WS-027를 위반**한다(shall)**.

N개 패널이 동시에 알림 상태일 때:
- 각 패널이 자기 배너를 **동시에** 표시**한다(shall)** — 하나만 보이고 나머지가 대기하면 사용자가 나머지를 모른 채 저장한다.
- 어떤 배너도 자동으로 포커스를 받지 **않는다(shall not)**. 배너 등장은 활성 패널을 변경하지 **않는다(shall not)**(REQ-PANEL-030, REQ-WS-049).
- 배너의 동작(차이 보기 / 디스크에서 불러오기 / 해제)은 그 배너가 속한 문서에만 작용**한다(shall)**.
- 어떤 배너도 모달이 아니**다(shall)**.

**REQ-PANEL-054** (Ubiquitous)
IME 조합 게이트는 **패널별로 독립**이어야 한다(shall). 패널 A의 조합이 패널 B 문서의 조정을 보류시켜서는 **안 되고(shall not)**, 반대로 패널 B의 조정이 패널 A의 조합 중에 그 문서를 건드려서도 **안 된다(shall not)**. 조합 중 보류는 SPEC-1 REQ-WS-020~023의 규칙을 **각 패널에 대해 그대로** 따른다(shall).

**REQ-PANEL-055** (Unwanted)
조정 결과를 버퍼에 적용하는 실행자는 **창 전역 싱글턴이어서는 안 된다(shall not)**. 실행자는 패널(또는 문서)별로 해소**되어야 하며(shall)**, 두 번째 패널의 마운트가 첫 번째의 실행자를 무효화해서는 **안 된다(shall not)**. 오늘의 모듈 수준 `effectHandler`(`src/store/reconciliationStore.ts:35`)가 정확히 이 형태의 결함이다.

**REQ-PANEL-056** (Ubiquitous)
SPEC-1 REQ-WS-029의 **교체 가능한 조정 정책 주입 지점**은 보존**되어야 한다(shall)** — 문서별 라우팅을 도입하면서 정책 주입이 불가능해지면 SPEC-4(Diff 승인 UI)가 조정 계층을 재작성해야 한다. 정책은 최소한 창 단위로 주입 가능**해야 하며(shall)**, 주입된 정책이 모든 문서에 적용**된다(shall)**.

**REQ-PANEL-057** (Unwanted)
패널 수 증가는 SPEC-1 REQ-WS-046의 **data 역할 경로 감시 제외**를 무효화하지 **않아야 한다(shall not)**. data 역할 경로는 패널이 몇 개든 규약 폴더 감시에서 제외**되며(shall)**, 그 경로 **안**의 파일이라도 어떤 패널이 열고 있으면 감시**된다(shall)** — SPEC-1 REQ-WS-057b의 경계를 그대로 승계**한다(shall)**. data 역할 경로 안의 파일을 패널로 여는 것은 허용**되며(shall)**, 그 순간 그 파일은 "열린 파일"이 되어 REQ-PANEL-050의 등록 대상**이다(shall)**.

**REQ-PANEL-058** (Unwanted)
패널과 관련된 어떤 알림·확인도 모달 대화상자를 사용해서는 **안 된다(shall not)** — 단 오늘 이미 모달인 미저장 편집 폐기 확인(`confirmDiscard`)은 이 SPEC이 도입하는 것이 아니므로 예외**다(shall)**. 조정·감시·패널 상태에서 비롯한 알림은 전부 비침습 표면**이다(shall)**(REQ-WS-049 승계).

---

### §B.7 메타데이터·보조 표면의 활성 원고 패널 종속

**REQ-PANEL-060** (Ubiquitous)
메타데이터(저자·감사의 글·등록번호)를 표시하는 표면은 **활성 원고 패널에 종속**되어야 한다(shall). 프로젝트 전역 단일 메타데이터 뷰로 설계하지 **않는다(shall not)**.

근거는 SPEC-1 D-4다: 정본이 원고 front matter이므로 한 프로젝트의 원고들이 서로 다른 저자 목록을 가질 수 있고, 그것이 의학연구 실무에서 흔하다(`EPIC-V03-WORKSPACE.md:88-90`). 프로젝트 전역 뷰는 이 차이를 표현할 수 없다.

**REQ-PANEL-061** (Where)
**Where** 활성 패널이 보조 패널인 경우, 메타데이터 표면은 **직전 활성 원고 패널의 문서**를 대상으로 유지**되어야 한다(shall)** — 비워지지 **않는다(shall not)**. 스크립트를 잠깐 보는 동안 원고 메타데이터가 사라지는 것은 결함이다. 원고 패널이 하나도 없으면 그 표면은 부재 상태**다(shall)**.

**REQ-PANEL-062** (Ubiquitous)
문서에 결속된 보조 상태 — 메모 사이드카, 서지(`.bib`) 해석 — 는 **활성 원고 패널의 문서**를 따라**야 한다(shall)**. 활성 원고 패널이 바뀌면 이 상태들도 그 문서 기준으로 다시 해석**된다(shall)**. 어떤 경우에도 한 문서의 메모가 다른 문서 옆에 저장되어서는 **안 된다(shall not)**.

**REQ-PANEL-063** (Ubiquitous)
목차와 검색 히트는 **어느 패널에 작용하는지 결정 가능해야 한다(shall)**. 목차는 활성 원고 패널의 문서 구조를 표시하고 그 패널로 이동**시키며(shall)**, 검색 히트 열기는 활성 패널에 문서를 열거나 이미 그 문서를 연 패널로 이동**한다(shall)** — 새 패널을 사용자 요청 없이 만들지 **않는다(shall not)**.

**REQ-PANEL-064** (Ubiquitous)
SPEC-1이 남긴 미구현 표면 두 가지의 **소유권은 이 SPEC에 있다**(`docs/v0.3-signoff.md` §6):
1. 조정의 `open-diff` effect(`shared/reconciliation.ts:70`)는 오늘 방출되지만 소비되지 않는다(`src/editor/applyExternalChange.ts:128`). 이 SPEC은 그 effect가 **어느 패널의 문서에 대한 요청인지 식별 가능하게** 해야 하며(shall), diff 표시 UI 자체는 SPEC-4 소관으로 남긴다(shall).
2. `BibliographyResolution.fallback`(SPEC-1 REQ-WS-056)의 사용자 표시. 반환값에는 이미 실려 있으므로 표시 표면만 필요**하다(shall)**. 표시는 활성 원고 패널 종속**이다(shall)**(REQ-PANEL-060과 같은 이유 — 원고마다 서지가 다를 수 있다).

---

## §C 제약

| # | 제약 | 근거 |
|---|---|---|
| C-1 | 다음 요구는 **프로젝트 없음 상태에서도 완전히 동작해야 한다**: REQ-PANEL-001, 003~007, 010~014, 020~024, 030~035, 040~047, 050~056, 058, 060~064. 본질적으로 프로젝트 조건부인 것은 REQ-PANEL-036(수동 새로고침 어포던스), REQ-PANEL-057(규약 폴더 제외)뿐이며, 그 상태에서 올바른 동작은 "적용되지 않음"이다 | `EPIC-V03-WORKSPACE.md` §2.2 — 단일 파일 열기 보존, 프로젝트 없음은 1급 상태 |
| C-2 | 3-프로세스 경계를 변경하지 않는다. 패널 레이아웃·패널 상태는 `src/`에만 존재하며, 파일시스템·감시는 main, 타입·순수 함수는 `shared/` | `.moai/project/structure.md` §2, `EPIC-V03-WORKSPACE.md` §6 |
| C-3 | 렌더러는 Node API를 갖지 않는다(`sandbox: true`, `contextIsolation: true`). 신규 IPC 채널은 `shared/ipc-contract.ts`에 선언되어야 하며 구독형 API는 구독 해제 클로저를 반환한다 | `EPIC-V03-WORKSPACE.md` §6, SPEC-1 C-3 |
| C-4 | `pathGuard` 4-tier 신뢰 모델을 **완화하지 않는다**. 새 신뢰 승격 경로를 만들지 않으며 기존 Tier 1~4와 `allowSessionPath` 동작에 의존한다. 프로젝트 발견이나 패널 열기가 그 자체로 새 경로를 신뢰시켜서는 안 된다 | SPEC-1 D-6/REQ-WS-012, `electron/pathGuard.ts:183-215` `assertPrefsPatchAllowed` |
| C-5 | CodeMirror 6를 유지한다. ProseMirror/Lexical/Slate 마이그레이션, 3-모드 모델 재설계, `RenderedSpan` 양방향 소스맵은 범위 밖이다 | `EPIC-V03-WORKSPACE.md` §2.1, §7 |
| C-6 | 개발 방법론은 TDD(RED-GREEN-REFACTOR), 커버리지 목표 85%, 커밋당 최소 80% | `.moai/config/sections/quality.yaml`, SPEC-1 C-5 |
| C-7 | macOS와 Windows 모두 출하 대상. Windows e2e CI가 없으므로 플랫폼 차이는 유닛 계층에서 검증 가능한 형태로 설계해야 한다 | `.moai/project/tech.md` §9, §13.1, SPEC-1 C-6 |
| C-8 | IME 조합에 닿는 코드 변경은 SPEC-1이 구축한 조합 유지형 CDP e2e 프리미티브 기반 검증이 의무이며, 릴리스 전 수동 한글 스모크를 대체하지 않는다 | `docs/DOCUMENT_MODE_PRINCIPLES.md` §2, SPEC-1 C-7, `docs/v0.3-signoff.md` §3 |
| C-9 | `docs/DOCUMENT_MODE_PRINCIPLES.md`를 수정하지 않는다 (SPEC-1 AC-WS-037 불변식) | `docs/v0.3-signoff.md` §5 |
| C-10 | 기존 테스트 baseline(199 테스트 파일, 33 e2e spec)을 근거 없이 깨뜨리지 않는다. 사이드바 스토어·탭 구조 테스트(`tests/store/{sidebarStore,rightSidebarStore}.test.ts`, `tests/sidebar/*.test.tsx`)를 깨는 설계는 REQ-PANEL-002 위반으로 간주한다. 반대로 조정·감시 계층 테스트(`tests/hooks/useExternalChangeWiring.test.tsx`, `tests/components/reconciliationBanner.test.tsx`, `e2e/reconciliation-ime.spec.ts`)는 문서 축 도입에 따라 **의도적으로 재작성된다** | `research.md` §8 |
| C-11 | 새 런타임 의존성을 추가하지 않는다. 언어 문법은 이미 의존성인 `@codemirror/language-data`에서 조달한다 | REQ-PANEL-041, `package.json:39` |

---

## §D 제외 범위

### Out of Scope — 에이전트·승인·샌드박스

- CLI 에이전트 실행·수명주기(SPEC-3)
- Diff 승인 UI — 이 SPEC은 `open-diff` effect가 **어느 문서의 요청인지 식별 가능하게** 만들 뿐, diff를 표시·승인·거부하는 UI는 SPEC-4 소관이다(REQ-PANEL-064)
- Python 분석 샌드박스와 그림 산출물 파이프라인(SPEC-5)
- 에이전트·샌드박스가 요구하는 pathGuard 신뢰 확장(SPEC-3/5 소유)

### Out of Scope — 편집 엔진과 문서 모델

- CodeMirror 6 교체 검토 재개 (`EPIC-V03-WORKSPACE.md` §2.1에서 기각 확정)
- 3-모드(Document/Live/Source) 모델 재설계 — 이 SPEC은 모드의 **적용 범위(패널별)** 만 정하고 모드 자체를 바꾸지 않는다
- `RenderedSpan` 양방향 소스맵 계약 (`DOCUMENT_MODE_PRINCIPLES.md` §7) — 별개 v0.3 로드맵 항목
- **CRLF 전 구간 보존(issue #11)** — CodeMirror 문서 좌표계가 줄바꿈을 항상 1 위치로 계산하는 구조적 제약이며, 해소에는 파일별 줄바꿈 감지 + 동적 `lineSeparator` + 저장 시 재직렬화가 필요하다. 비마크다운 파일에서 더 심각해질 가능성은 `plan.md` §A의 미해결 결정으로 올리되, **해소 자체는 이 SPEC 범위가 아니다**
- **sticky dirty 플래그(issue #12)** — `appStore.isDirty`가 `|| s.isDirty`로 latch되는 기존 결함. REQ-PANEL-010이 dirty를 문서에 매면서 이 결함이 문서 축으로 복제되지 않도록 주의해야 하나, 결함 해소는 별개다

### Out of Scope — 원칙 문서와 문서화

- `docs/DOCUMENT_MODE_PRINCIPLES.md` 자체의 개정·확장 (C-9). 비마크다운 편집 표면이 그 문서의 범위 공백을 실재화하지만, 이 SPEC은 **기록만 한다**(REQ-PANEL-047)
- `CONTRIBUTING.md` / `structure.md`의 파일명 드리프트 정정 (SPEC-1이 기록만 하고 남긴 항목)

### Out of Scope — 다중 창과 세션

- **다중 창(BrowserWindow) 간의 조정 조율.** 창 축은 오늘 이미 존재하며(`electron/main.ts:46, 103`), 확정 이벤트가 모든 창에 브로드캐스트된다(`electron/ipc/project.ts:40-44`). 이 SPEC은 **창 안의 패널 축**을 정의하고, REQ-PANEL-051의 경로 대조가 부수적으로 창 간 오적용도 막지만, 창 간 소유권 모델(어느 창이 어느 파일의 감시를 소유하는가)은 별개 작업이다
- 창별 패널 배치의 창 간 동기화
- 탭(tab) UI로서의 문서 목록 관리 — 이 SPEC은 패널 분할을 정의하며, 패널 하나 안에 여러 문서를 탭으로 쌓는 모델은 `plan.md` §A의 미해결 결정에서 다루고 채택 여부는 사용자 결정이다

### Out of Scope — 실시간 협업과 원격

- CRDT/OT 동시 편집, 원격 커서, 협업 세션 서버 (`EPIC-V03-WORKSPACE.md` §7)
- 클라우드 동기화, 원격 프로젝트, 백엔드 API
- 3-way 자동 병합 — SPEC-1과 동일하게 제외. 배너의 "차이 보기" 이후 사용자가 판단한다

### Out of Scope — 비마크다운 파일의 고급 편집 기능

- 언어 서버(LSP) 연동, 자동완성, 정의로 이동, 진단 표시
- 코드 포매팅·린팅 (`.py` 포매터 실행 등)
- CSV의 표 형태 편집 UI — 이 SPEC은 `.csv`를 **텍스트로** 편집한다. 표 그리드 편집은 별개 기능이다
- `.bib` 전용 구조 편집 — 기존 참고문헌 탭(`ReferencesTab`)이 이미 그 역할을 하며, 이 SPEC은 `.bib`를 텍스트로 여는 경로만 제공한다
- 이미지·PDF 등 바이너리 파일의 뷰어 패널 (REQ-PANEL-046이 편집 패널로 열지 않도록 규정하는 것으로 끝낸다)

### Out of Scope — 프로젝트 생성과 매니페스트 편집

- 프로젝트 생성 마법사, 템플릿에서 프로젝트 스캐폴딩
- 규약 폴더 자동 생성 (SPEC-1 REQ-WS-011이 금지)
- 매니페스트 편집 전용 GUI — SPEC-1이 읽기·검증·키 단위 최소 갱신만 정의했고 이 SPEC도 넓히지 않는다

---

## §E 성공 기준

- §B의 요구사항(REQ-PANEL-001~007, 010~014, 020~024, 030~036, 040~047, 050~058, 060~064 — 총 46개)이 모두 관측 가능한 수용 기준으로 매핑된다(`acceptance.md`, 모든 AC가 REQ ID 또는 제약 ID를 인용)
- C-1이 지정한 범위에 대해 프로젝트 있음/없음 두 상태가 검증된다
- **단일 패널 축퇴가 오늘의 동작과 관측상 구분되지 않는다** — 이것이 회귀 방어의 1차 방어선이다
- 조정·감시 계층이 N개 문서에 대해 동작함이 유닛 계층에서 검증된다(문서 축 도입)
- 비마크다운 파일의 바이트 무결성이 열기→저장 왕복 회귀 테스트로 고정된다
- 사이드바 스토어·탭 구조 테스트가 무변경으로 통과한다(REQ-PANEL-002)
- `docs/DOCUMENT_MODE_PRINCIPLES.md`가 수정되지 않는다(C-9)
- 커버리지 85% 목표, 커밋당 80% 최소
- 릴리스 전 수동 한글 IME 스모크 통과 (자동화 대체 불가, C-8)

---

## §F 참조

- `.moai/specs/EPIC-V03-WORKSPACE.md` — Epic 개요, §2.1(CodeMirror 유지), §3(메타데이터 3계층 + `:90` 활성 원고 패널 종속 구속), §6(프로세스 경계·불변식), §7(Epic 범위 밖)
- `.moai/specs/SPEC-V03-WORKSPACE-001/spec.md` — REQ-WS-012(신뢰 경계), 020~023(IME), 027~030(조정·배너), 032~033(확장자 무관 무결성), 045~047a(감시 범위·수동 새로고침), 049(모달 금지), 057b(data 안 열린 파일)
- `.moai/specs/SPEC-V03-WORKSPACE-001/plan.md` §A — D-1~D-7 확정 결정
- `.moai/specs/SPEC-V03-WORKSPACE-001/design.md` §2(계층 배치), §4(IME 게이트), §6(정책 seam)
- `docs/v0.3-signoff.md` §4(AC-WS-035 CRLF 한계, issue #11), §5(원칙 문서 공백), §6(SPEC-2 계약 표면)
- `docs/DOCUMENT_MODE_PRINCIPLES.md` §0(범위 선언), §1(소스 무결성), §2(IME 안전)
- `research.md` (동일 디렉터리) — 8개 영역 조사 + 멀티패널 위험 목록
- `design.md` (동일 디렉터리) — 레이아웃·상태·라우팅·extension 조립 설계와 기각된 대안
- 코드: `src/editor/MarkdownEditor.tsx:86-175`(유일한 마운트·조립 지점), `src/App.tsx:122-190`(레이아웃), `src/store/{appStore,reconciliationStore,sidebarStore,rightSidebarStore}.ts`, `src/hooks/useMenuCommandRouter.ts`, `src/hooks/useExternalChangeWiring.ts`, `shared/reconciliation.ts`, `electron/ipc/{project,files}.ts`, `electron/pathGuard.ts`, `electron/pendingAssets.ts:150-181`

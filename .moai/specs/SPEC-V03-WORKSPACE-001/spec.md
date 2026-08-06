---
id: SPEC-V03-WORKSPACE-001
title: "v0.3 워크스페이스 골격 — 프로젝트 매니페스트·외부 변경 조정·메타데이터 모델"
version: "0.2.2"
status: in-progress
created: 2026-08-06
updated: 2026-08-07
author: manager-spec
priority: P0
phase: "v0.3.0 target"
module: "shared/, electron/, src/"
lifecycle: spec-anchored
tier: L
tags: "workspace, manifest, file-watching, reconciliation, ime, metadata"
---

# SPEC-V03-WORKSPACE-001 — v0.3 워크스페이스 골격

## HISTORY

| 일자 | 버전 | 변경 |
|---|---|---|
| 2026-08-06 | 0.1.0 | 최초 작성 — EPIC-V03-WORKSPACE의 1번 SPEC |
| 2026-08-07 | 0.2.2 | **M1 구현이 드러낸 결함 수정 (run-phase 인라인 정정)**. REQ-WS-042의 억제를 **키 존재 기반에서 값 기반으로** 전환 — 출하 템플릿이 모든 원고에 `author: `를 발행하므로 키 기반 억제 아래에서는 매니페스트 기본값 계층이 정상 생성 경로에서 사용 불가였다. REQ-WS-054(미기입 판정, **null 포함**) 및 REQ-WS-055(등록번호 placeholder는 미기입) 신설, REQ-WS-035/036/037/051/038 연동 수정. "의도적으로 저자 없음"을 표현할 수 없다는 대가를 명시적으로 수용 |
| 2026-08-07 | 0.2.1 | 재감사(PASS WITH FIXES, 0.84) SHOULD-FIX 8건 + NIT 6건 반영. `tier: L` 선언 및 `design.md` / `research.md` 추가. REQ-WS-038에 "채택된 유효값만 검증" 조항 추가(SF-2), REQ-WS-046을 역할 기반 단일 경로 제외로 재작성(SF-8), REQ-WS-047a 신설(수동 새로고침 진입점 소유 경계, NIT-5), REQ-WS-052에 비-ClinicalTrials.gov 무검증 명시(NIT-4), 요구사항 패턴 라벨 정리(NIT-2) |
| 2026-08-07 | 0.2.0 | plan-auditor FAIL 대응. 미해결 결정 6건 반영: 매니페스트 YAML 확정(A-1), 비침습 배너 충돌 정책(A-2), 감시 범위 확정(A-3), **메타데이터 정본을 front matter로 반전(A-4)**, 비마크다운 열기는 SPEC-2(A-5), pathGuard Tier-2 유지(A-6). front matter 키 스키마 명시(REQ-WS-050~053), 감시 범위 요구 추가(045~047), 모달 금지(049), 경로별 debounce로 REQ-WS-016 강화. C-1 범위 축소 |

---

## §A 배경과 목적

Durumi는 현재 "마크다운 파일 하나를 여는 에디터"다. 파일 감시는 워크스페이스 폴더 **트리**에만 존재하며(`electron/fs.ts::watchRoot` → `fs:change`), 그 이벤트를 소비하는 곳은 폴더 트리 UI(`src/hooks/useFolderTree.ts`) 하나뿐이다. **열려 있는 문서 자체가 디스크에서 바뀌었을 때 무슨 일이 일어나야 하는지는 정의된 적이 없다.**

v0.3의 워크스페이스는 이 공백을 견딜 수 없다. `EPIC-V03-WORKSPACE.md` §1의 end-state에서는 CLI 에이전트가 사용자와 같은 파일을 쓴다. 조정 계약이 없으면 미저장 편집 소실이 기본 동작이 된다.

이 SPEC은 세 가지를 정의한다:

- **§B.1 프로젝트 매니페스트와 폴더 규약** — 무엇이 Durumi 프로젝트인가, 어떻게 발견하는가, 없으면 어떻게 되는가
- **§B.2 파일 감시와 외부 변경 조정** — 이 SPEC의 정확성 핵심. IME 안전이 일급 요구사항
- **§B.3 메타데이터 모델** — 저자·참고문헌·감사의 글·등록번호가 어디에 사는가

이 SPEC은 구현 방법(HOW)이 아니라 관측 가능한 동작(WHAT)과 그 이유(WHY)를 기술한다.

### 이 SPEC의 가장 위험한 지점 — 코드에 남은 선례

`src/editor/keymap/pendingInlineFormat.ts:12-32`의 주석은 과거 실패를 이렇게 기록한다:

> "…rewriting the doc during composition (even on the first event) confuses the IME's composing-range tracking."

즉 **조합 중 문서를 바꾸면 한글 IME가 깨진다**는 것이 이 코드베이스에서 이미 실증된 사실이며, 그 파일은 결국 Word 같은 타입어헤드 UX를 포기하고 IME 안전을 택했다고 적고 있다. 외부 변경 조정은 정의상 **문서를 조합 도중에 바꾸려는 시도**이므로 같은 실패 계열에 정면으로 놓인다. REQ-WS-020~023과 REQ-WS-049는 이 선례에 대한 직접적 대응이다.

### 용어

| 용어 | 정의 |
|---|---|
| 프로젝트(project) | 매니페스트 파일을 루트에 가진 디렉터리 트리 |
| 프로젝트 없음(no-project) | 열린 파일이 어떤 프로젝트에도 속하지 않는 상태. **예외가 아니라 1급 상태** |
| 외부 변경(external change) | 에디터 자신의 저장이 아닌 경로로 발생한 디스크상의 파일 변경 |
| 변경 확정(change confirmation) | 감시 이벤트가 실제 내용 변경임을 재검사로 확인한 상태 |
| 조정(reconciliation) | 확정된 외부 변경을 열린 버퍼에 반영하는 절차 |
| 조합(composition) | IME 입력 조합 세션 (`compositionstart` ~ `compositionend`) |
| 미저장 편집(unsaved edits) | 버퍼가 마지막 저장/로드 이후 변경된 상태 (`appStore.isDirty`) |
| 규약 폴더(convention folder) | 매니페스트가 정의하는 프로젝트 표준 하위 폴더. 감시 대상에서 `data/`는 제외(REQ-WS-046) |
| 키 단위 스플라이스(key-range splice) | 매니페스트에서 대상 키의 바이트 범위만 교체하는 갱신 방식 (REQ-WS-003) |
| 미기입(empty value) | 메타데이터 키의 값이 없음·null·빈 문자열·공백 문자열·빈 시퀀스 중 하나인 상태. **키의 존재 여부가 아니라 값으로 판정한다** (REQ-WS-054) |

---

## §B 요구사항 (GEARS)

### §B.1 프로젝트 매니페스트와 폴더 규약

**REQ-WS-001** (Ubiquitous)
매니페스트 파일을 루트에 가진 디렉터리를 Durumi 프로젝트로 취급**해야 한다(shall)**. 매니페스트 파일명은 `durumi.project.yaml`이며, 프로젝트 루트당 정확히 하나만 유효하다.

**REQ-WS-002** (Ubiquitous)
매니페스트는 YAML 매핑**이어야 하며(shall)**, 다음 최상위 키를 정의한다: `name`(필수, 문자열), `version`(선택, 스키마 버전), `folders`(선택, 폴더 재정의 매핑), `authors`(선택, 프로젝트 기본값), `acknowledgements`(선택, 프로젝트 기본값), `registration`(선택, 프로젝트 기본값), `bibliography`(선택). 정의되지 않은 최상위 키가 존재해도 읽기는 성공**해야 한다(shall)**.

**REQ-WS-003** (Ubiquitous)
매니페스트를 갱신할 때, 앱은 **대상 키의 바이트 범위만 교체**해야 하며(shall), 매니페스트 전체를 파싱→재직렬화하여 덮어쓰지 **않는다(shall not)**. 이로써 앱이 정의하지 않은 키, 사용자 주석, 키 순서, 들여쓰기 스타일이 갱신 이후에도 보존된다. 갱신 대상 키가 아닌 바이트는 변경되지 **않는다(shall not)**.

**REQ-WS-004** (Event-driven)
**When** 사용자가 파일을 열면, 앱은 해당 파일의 디렉터리에서 시작해 상위로 올라가며 매니페스트를 탐색**해야 한다(shall)**. 탐색 상한은 32단계이며, 이는 기존 `.bib` walk-up 탐색(`electron/bibliography.ts`)과 동일한 상한이다.

**REQ-WS-005** (Event-driven)
**When** 매니페스트가 여러 상위 디렉터리에서 발견되면, 가장 가까운(depth가 작은) 것을 소유 프로젝트로 선택**해야 한다(shall)**.

**REQ-WS-006** (Event-driven — 실패 모드 감지)
**When** walk-up 탐색이 매니페스트를 찾지 못하면, 앱은 파일을 "프로젝트 없음" 상태로 정상적으로 열어**야 한다(shall)**. 이 경우 사용자에게 오류·경고를 표시하지 **않는다(shall not)**.

**REQ-WS-007** (Event-driven — 실패 모드 감지)
**When** 매니페스트가 존재하나 파싱에 실패하면, 앱은 "손상된 매니페스트" 상태로 진입해 사용자에게 파싱 오류를 표시**해야 한다(shall)**. 이 경우에도 문서 편집·저장은 계속 가능**해야 하며(shall)**, 앱은 손상된 매니페스트를 자동으로 수정·재작성하지 **않는다(shall not)**.

**REQ-WS-008** (Event-driven — 실패 모드 감지)
**When** 매니페스트가 파싱은 되나 필수 키(`name`)를 결여하면, 앱은 이를 손상된 매니페스트와 동일하게 취급**해야 한다(shall)** — 프로젝트 없음으로 조용히 강등하지 **않는다(shall not)**.

**REQ-WS-009** (Ubiquitous)
프로젝트 폴더 규약의 기본값은 `data/`, `scripts/`, `figures/`, `manuscript/`, `reference/` 다섯 가지**여야 한다(shall)**. `reference/`의 이름과 의미는 기존 참고문헌 구현(`electron/referenceFs.ts`의 `REFERENCE_DIR_NAME = 'reference'`, 단수형)과 동일**해야 하며(shall)**, 이 SPEC은 그것을 변경하지 **않는다(shall not)**.

**REQ-WS-010** (Where)
**Where** 매니페스트의 `folders` 키가 존재하는 경우, 앱은 기본 폴더 경로 대신 그 값을 사용**해야 한다(shall)**. 재정의된 경로가 프로젝트 루트 밖을 가리키면 그 항목은 무시하고 기본값으로 되돌아**가야 한다(shall)**.

**REQ-WS-011** (Ubiquitous)
규약 폴더의 부재는 오류가 아니**어야 한다(shall)**. 앱은 규약 폴더를 사용자 동의 없이 자동 생성하지 **않는다(shall not)**.

**REQ-WS-012** (Unwanted)
프로젝트 발견은 `pathGuard`의 신뢰 경계를 확장하지 **않는다(shall not)**. 매니페스트가 발견되었다는 사실만으로 프로젝트 루트 하위 경로가 신뢰되지 않으며, 신뢰는 기존 4-tier 모델(`electron/pathGuard.ts`)과 기존 Tier 2 자동 편입(`allowSessionPath`)을 그대로 따른다. 특히 앱은 매니페스트 발견을 근거로 새 경로를 Tier 3(워크스페이스 폴더)에 추가하지 **않는다(shall not)** — 그 경로가 존재하면 손상된 렌더러가 매니페스트를 심어 신뢰를 스스로 넓힐 수 있기 때문이다.

---

### §B.2 파일 감시와 외부 변경 조정

> 이 절이 SPEC의 정확성 핵심이다. **REQ-WS-020 ~ REQ-WS-023(IME)** 과 **REQ-WS-049(모달 금지)** 는 최우선 요구사항이며, `docs/DOCUMENT_MODE_PRINCIPLES.md` §0의 우선순위(소스 무결성 > IME 안전)를 따른다.

#### 감시 범위

**REQ-WS-013** (Ubiquitous)
앱은 현재 열려 있는 **모든** 파일의 디스크 상태를 감시**해야 하며(shall)**, 이 감시는 파일의 위치와 프로젝트 소속 여부에 무관하게 동작**해야 한다(shall)**.

**REQ-WS-045** (Where)
**Where** 소유 프로젝트가 존재하는 경우, 앱은 규약 폴더(`manuscript/`, `reference/`, `figures/`, `scripts/` 및 `folders` 재정의로 지정된 대응 경로)를 추가로 감시**해야 한다(shall)** — 열려 있지 않은 파일의 생성·삭제도 표면화하기 위함이다.

**REQ-WS-046** (Unwanted)
앱은 **data 역할(role)에 해당하는 정확히 하나의 경로**를 규약 폴더 감시 대상에서 제외**해야 한다(shall)**. 그 경로는 `folders`가 data 역할에 대해 해석한 결과이며, `folders` 재정의가 없으면 기본값 `data/`, `folders.data: archive`가 있으면 `archive/`다 — **두 경로가 동시에 제외되지 않는다(shall not)**. 다른 역할(manuscript / reference / figures / scripts)에 해석된 경로는 그 이름이 우연히 `data`이더라도 제외되지 **않으며(shall not)** REQ-WS-045에 따라 감시된다.

제외 이유: 의학연구 원자료는 수 기가바이트에 이를 수 있어 감시 등록과 이벤트 처리 비용이 UI 응답성을 위협한다.

이 제외는 REQ-WS-013을 무효화하지 **않는다(shall not)** — data 역할 경로 안의 파일이라도 **열려 있다면** 감시된다.

**REQ-WS-047** (Event-driven)
**When** 사용자가 수동 새로고침을 요청하면, 앱은 data 역할 경로를 포함한 프로젝트 트리를 재열거해 변경을 표면화**해야 한다(shall)**. 열려 있지 않은 data 역할 경로 하위 파일의 변경을 표면화하는 유일한 경로는 이 수동 새로고침**이다(shall)**.

**REQ-WS-047a** (Ubiquitous)
앱은 수동 새로고침을 **호출 가능한 진입점**으로 제공**해야 한다(shall)** — 최소한 IPC 계층과 메뉴 커맨드 라우터에서 호출 가능해야 한다. 사이드바 버튼·키보드 단축키 등 **시각적 어포던스의 배치와 형태는 이 SPEC의 범위가 아니며 SPEC-2(멀티패널 셸)가 소유한다** — 패널 레이아웃이 확정되어야 어포던스 위치를 정할 수 있기 때문이다. 이 SPEC은 SPEC-2가 호출할 진입점이 존재함만 보장한다.

#### 감지와 확정

**REQ-WS-014** (Ubiquitous)
앱은 감시 이벤트를 그대로 신뢰하지 **않고(shall not)**, 파일 크기와 수정 시각을 재검사해 실제 내용 변경임을 확인한 뒤에만 변경을 확정**해야 한다(shall)**.

**REQ-WS-015** (Event-driven — 실패 모드 감지)
**When** 앱 자신의 저장으로 발생한 감시 이벤트가 관측되면, 앱은 이를 외부 변경으로 확정하지 **않아야 한다(shall not)**. 저장 경로는 원자적 쓰기(임시 파일 + `rename`, `electron/fs.ts::writeFileAtomic`)를 사용하므로 감시 이벤트가 반드시 발생한다.

**REQ-WS-016** (Ubiquitous)
앱은 감시 이벤트를 **경로별로 독립적으로** 합류(debounce)시켜 경로당 단일 확정 이벤트로 정규화**해야 한다(shall)**. 한 합류 창(window) 안에서 서로 다른 경로에 발생한 이벤트는 어느 것도 소실되지 **않아야 한다(shall not)** — 에이전트가 `manuscript/a.md`와 `manuscript/b.md`를 연달아 쓰면 두 확정 이벤트가 모두 산출된다. 합류는 쓰기가 진행 중인 파일을 부분적으로 읽는 것을 방지하는 목적도 겸한다.

**REQ-WS-017** (Where)
**Where** 실행 플랫폼이 macOS 또는 Windows인 경우, 앱은 두 플랫폼의 감시 이벤트 semantics 차이 — 이벤트 병합 정도, 중복 발행, `rename`/`change` 이벤트 시퀀스의 차이, 경로 대소문자 정규화 — 를 흡수해 **동일한 확정 이벤트**를 산출**해야 한다(shall)**. 플랫폼 차이는 조정 계층(`src/`)에 노출되지 **않아야 한다(shall not)**.

**REQ-WS-018** (Event-driven — 실패 모드 감지)
**When** 감시 이벤트가 유실될 수 있는 조건 — 감시자 재등록, 시스템 절전 복귀, 이벤트 큐 오버플로, **그리고 REQ-WS-016의 경로별 합류 용량을 초과한 이벤트 폭주** — 가 감지되면, 앱은 열린 파일들과 감시 중인 규약 폴더의 디스크 상태를 재검사**해야 한다(shall)**.

**REQ-WS-019** (Unwanted)
감시는 `pathGuard` 검증을 우회하지 **않는다(shall not)** — 감시 등록 대상 경로는 기존 `assertAllowedPath` 검증을 통과한 경로로 한정된다.

#### IME 안전 (최우선)

**REQ-WS-020** (State-driven)
**While** 편집 표면에서 IME 조합이 진행 중인 동안, 앱은 어떤 조정도 버퍼에 적용하지 **않아야 한다(shall not)**. 확정된 외부 변경은 큐에 보류된다.

**REQ-WS-021** (Event-driven)
**When** 조합이 종료되면(`compositionend`), 앱은 보류된 조정을 적용**해야 한다(shall)**. 보류 중 같은 파일에 복수의 변경이 확정된 경우, 최종 디스크 상태 하나만 적용한다.

**REQ-WS-022** (Unwanted)
조정은 진행 중인 IME 조합 세션을 취소하거나 강제 커밋시키지 **않아야 한다(shall not)**. 조정 때문에 조합 중이던 글자가 소실되거나 중복 입력되어서는 **안 된다(shall not)**.

**REQ-WS-023** (State-driven)
**While** 조정이 보류된 상태인 동안, 앱은 "디스크 내용이 최신이 아님"을 사용자에게 비침습적으로(포커스를 뺏지 않고) 표시**해야 한다(shall)**.

**REQ-WS-049** (Unwanted)
조정과 관련된 어떤 알림도 모달 대화상자를 사용하지 **않아야 한다(shall not)**. 모달은 포커스를 강제로 이동시켜 진행 중인 IME 조합을 중단시킬 수 있으며, 이는 `pendingInlineFormat.ts:12-32`가 기록한 실패 계열과 동일하다. 모든 조정 알림은 편집 포커스를 유지하는 비침습적 표면(배너 등)으로 제시**된다(shall)**.

#### 조정

**REQ-WS-024** (State-driven, Event-driven)
**While** 열린 문서에 미저장 편집이 없는 상태에서 **When** 외부 변경이 확정되면, 앱은 디스크 내용을 버퍼에 반영**해야 한다(shall)**.

**REQ-WS-025** (Ubiquitous)
조정은 버퍼 전체 교체가 아니라 **최소 차이 적용**으로 수행**해야 한다(shall)**. 이는 캐럿·선택 영역·스크롤 위치·실행 취소 이력이 조정 이후에도 의미를 유지하게 하기 위함이다.

**REQ-WS-026** (Ubiquitous)
조정 이후 캐럿과 선택 영역은 변경되지 않은 텍스트에 대해 **문서상 같은 위치**를 가리켜**야 한다(shall)**. 변경 영역 내부에 있던 캐럿은 그 영역의 경계로 이동한다.

**REQ-WS-027** (State-driven, Event-driven)
**While** 열린 문서에 미저장 편집이 있는 상태에서 **When** 외부 변경이 확정되면, 앱은 버퍼를 교체하지 **않아야 하며(shall not)** — 사용자의 편집이 기본으로 유지된다 — 해제 가능한 비침습 배너로 외부 변경 사실을 알리고 최소 두 가지 동작 **차이 보기(view diff)** 와 **디스크에서 불러오기(load from disk)** 를 제공**해야 한다(shall)**.

**REQ-WS-028** (Unwanted)
앱은 사용자 확인 없이 미저장 편집을 폐기하지 **않아야 한다(shall not)**. 이는 이 SPEC에서 타협 불가한 요구다.

**REQ-WS-029** (Ubiquitous)
확정 이벤트는 교체 가능한 조정 정책 객체를 통해 라우팅**되어야 한다(shall)**. 최소한 자동 반영 정책과 배너 알림 정책이 존재하며, 제3의 정책(승인 대기)을 주입할 수 있어**야 한다(shall)** — SPEC-4(Diff 승인 UI)가 REQ-WS-027의 배너를 승인 표면으로 확장할 수 있게 하기 위함이다.

**REQ-WS-030** (Event-driven)
**When** 열린 파일이 디스크에서 삭제되거나 이동된 것이 확정되면, 앱은 버퍼 내용을 보존한 채 "디스크에서 사라짐" 상태로 표시**해야 한다(shall)**. 버퍼를 비우거나 문서를 닫지 **않는다(shall not)**.

**REQ-WS-031** (Event-driven — 실패 모드 감지)
**When** 외부 변경으로 읽어들인 내용이 유효한 텍스트로 디코드되지 않으면, 앱은 조정을 중단하고 사용자에게 보고**해야 한다(shall)** — 손상된 내용으로 버퍼를 덮어쓰지 **않는다(shall not)**.

#### 파일 종류 무관 무결성

**REQ-WS-032** (Ubiquitous)
감시·확정·조정 규칙은 파일 확장자와 무관하게 동일하게 적용**되어야 한다(shall)**. 마크다운 파일에만 적용되는 특례는 없다. 비마크다운 파일을 **여는 편집 표면**은 이 SPEC의 범위가 아니며(SPEC-2 소유, `EPIC-V03-WORKSPACE.md:101`), 이 SPEC은 그 파일들에 대한 조정 계약만 정의한다.

**REQ-WS-033** (Ubiquitous)
조정은 대상 파일의 바이트를 정규화하지 **않아야 한다(shall not)** — 줄바꿈 변환(CRLF↔LF), 후행 공백 제거, 인코딩 재작성, 들여쓰기 정규화를 수행하지 않는다. 이는 `docs/DOCUMENT_MODE_PRINCIPLES.md` §1(소스 무결성)의 정신을 마크다운 밖으로 확장한 것이며, 해당 문서는 현재 문서모드 마크다운 편집에만 범위가 걸려 있어 이 확장을 덮지 않는다(§D 참조).

---

### §B.3 메타데이터 모델 — front matter 정본

> **정본은 원고의 YAML front matter다.** 한 연구가 본문·보충자료·리뷰어 응답서 등 여러 원고를 갖고 그 저자 목록이 서로 다른 것이 의학연구 실무에서 흔하며, `shared/manuscriptTemplates.ts`가 이미 `author:` / `registration:` front matter 키를 출하하고 있기 때문이다. 매니페스트는 **문서가 스스로 선언하지 않을 때 쓰이는 프로젝트 기본값**을 제공한다.

**REQ-WS-034** (Ubiquitous)
메타데이터는 3계층으로 배치**되어야 한다(shall)**:
1. **원고 front matter — 정본.** 저자·감사의 글·등록번호의 유효값이 여기서 결정된다.
2. **매니페스트 — 프로젝트 기본값.** 원고의 해당 키가 **미기입(REQ-WS-054)** 일 때 사용된다.
3. **`.bib` 파일 — 서지 정본.** 위 두 계층은 서지 항목을 담지 않는다.

**REQ-WS-054** (Ubiquitous) — 미기입(empty) 판정
메타데이터 키의 값이 다음 중 하나이면 앱은 그것을 **미기입**으로 판정**해야 한다(shall)**:

| 형태 | YAML 원문 예 | `js-yaml`(`JSON_SCHEMA`) 파싱 결과 |
|---|---|---|
| 키 자체가 없음 | (키 부재) | `undefined` |
| null | `author:` · `author: ` · `author:   ` | `null` |
| 빈 문자열 | `author: ""` | `""` |
| 공백만인 문자열 | `author: "   "` | `"   "` |
| 빈 시퀀스 | `author: []` | `[]` |
| 모든 원소가 위 조건에 해당하는 시퀀스 | `author: ["", "  "]` | `["", "  "]` |

**null을 반드시 포함해야 하는 이유**: 출하 템플릿(`shared/manuscriptTemplates.ts:22`)은 `'author: '`를 발행하며 이는 빈 문자열이 **아니라 `null`로 파싱된다**. 미기입 판정을 빈 문자열로만 정의하면 모든 출하 템플릿의 `author`가 미기입으로 분류되지 않는다.

미기입 판정은 **키의 존재 여부가 아니라 값**으로 한다 — 키가 존재하더라도 값이 위 표에 해당하면 미기입**이다(shall)**.

**REQ-WS-035** (Ubiquitous)
저자의 정본은 원고 front matter의 `author` 키**여야 한다(shall)** — 단 그 값이 미기입이 아닐 때다(REQ-WS-042). 매니페스트의 `authors`는 원고의 `author`가 **미기입일 때**(키 부재 또는 REQ-WS-054의 미기입 값) 적용되는 기본값**이다(shall)**.

**REQ-WS-036** (Ubiquitous)
감사의 글의 정본은 원고 front matter의 `acknowledgements` 키**여야 한다(shall)** — 단 그 값이 미기입이 아닐 때다. 매니페스트의 `acknowledgements`는 원고의 값이 미기입일 때 적용되는 기본값**이다(shall)**.

**REQ-WS-037** (Ubiquitous)
등록번호의 정본은 원고 front matter의 `registration` 키**여야 한다(shall)** — 단 그 값이 미기입이 아닐 때다. 매니페스트의 `registration`은 원고의 값이 미기입일 때 적용되는 기본값**이다(shall)**. 유효값이 ClinicalTrials.gov 등록을 담은 경우, 앱은 `NCT` 뒤 8자리 숫자 형식을 검증**해야 한다(shall)**.

**REQ-WS-055** (Ubiquitous) — 출하 placeholder는 `registration`의 미기입 형태다
`registration` 키에 한해, 식별자 부분이 비어 있는 출하 placeholder — `ClinicalTrials.gov NCT`(`manuscriptTemplates.ts:70`)와 `PROSPERO CRD`(`:168`) — 를 앱은 **미기입으로 판정해야 한다(shall)**. 따라서 이 값들은 REQ-WS-042의 억제를 발동시키지 **않으며(shall not)** 매니페스트의 `registration` 기본값이 채택**된다(shall)**.

이 조항이 없으면 `author`에서 방금 고친 것과 **동일한 결함**이 `registration`에서 재발한다: CONSORT / PRISMA 템플릿이 모든 원고에 placeholder를 발행하므로, placeholder를 "값 있음"으로 보면 그 두 템플릿에서 만든 원고에는 프로젝트 수준 등록번호가 결코 적용되지 않는다.

이 판정은 REQ-WS-053(placeholder에 형식 경고를 내지 않음)과 **같은 결론의 두 측면**이다 — placeholder는 "사용자가 아직 채우지 않은 자리"이며, 그래서 경고 대상도 아니고 억제 근거도 아니다.

**REQ-WS-050** (Ubiquitous)
front matter 메타데이터 키는 **이미 출하 중인 템플릿 키를 그대로 사용**해야 하며(shall), 병렬 명칭을 새로 도입하지 **않는다(shall not)**. 인식 키는 다음 세 가지**다(shall)**:

| 키 | 출하 선례 | 값 형태 |
|---|---|---|
| `author` (단수형) | `shared/manuscriptTemplates.ts:22` — 모든 템플릿의 `FRONT_MATTER` | 문자열 또는 문자열 시퀀스 (REQ-WS-051) |
| `registration` | `manuscriptTemplates.ts:70`(CONSORT), `:168`(PRISMA) | 레지스트리 이름 + 식별자 문자열 (REQ-WS-052) |
| `acknowledgements` | 선례 없음 — 신규 | 문자열 |

**REQ-WS-051** (Ubiquitous)
`author` 키는 단수 명칭을 유지한 채 복수 저자를 표현**해야 한다(shall)**: 값이 미기입이 아닌 문자열이면 저자 1명, 미기입이 아닌 원소를 가진 YAML 시퀀스이면 순서를 보존한 복수 저자로 해석한다. 앱은 단수 문자열 값을 가진 기존 원고를 거부하지 **않는다(shall not)**.

값이 REQ-WS-054의 미기입에 해당하면 저자 미기입으로 취급**한다(shall)**. **이 판정은 단순한 읽기 규칙이 아니라 REQ-WS-042의 억제 여부를 결정하는 하중 지지 규칙이다** — 미기입이면 매니페스트의 `authors` 기본값이 채택되고, 미기입이 아니면 억제된다. 특히 출하 템플릿의 `author: `는 빈 문자열이 아니라 **`null`로 파싱되므로**, 미기입 판정이 null을 포함하지 않으면 이 규칙 전체가 무력해진다(REQ-WS-054 표 참조).

**REQ-WS-052** (Ubiquitous)
`registration` 값은 **레지스트리 다형성**을 가져**야 한다(shall)**. 출하 템플릿이 이미 두 종류를 발행한다 — `ClinicalTrials.gov NCT…`(CONSORT, `:70`)와 `PROSPERO CRD…`(PRISMA, `:168`). 앱은 값의 레지스트리 접두를 식별**해야 하며(shall)**, ClinicalTrials.gov 값에만 NCT 형식 검증을 적용**한다(shall)**.

**ClinicalTrials.gov가 아닌 등록 값에는 어떤 형식 검증도 적용하지 않는다(shall not)** — PROSPERO CRD를 포함해 이 SPEC은 비-ClinicalTrials.gov 레지스트리의 식별자 형식을 정의하지 않으며, 정의되지 않은 형식을 근거로 값을 거부하거나 경고하지 **않는다(shall not)**. 그런 값은 형식 판정 없이 원본 그대로 통과**한다(shall)**.

**REQ-WS-053** (Unwanted)
앱은 출하 템플릿의 **미기입 placeholder 값**에 대해 형식 경고를 발생시키지 **않아야 한다(shall not)**. 구체적으로 식별자 부분이 비어 있는 `ClinicalTrials.gov NCT`(`:70`)와 `PROSPERO CRD`(`:168`)는 "미기입"으로 취급된다. 새 원고를 템플릿에서 만들 때마다 경고가 뜨는 동작은 결함이다.

**REQ-WS-038** (Event-driven — 실패 모드 감지)
**When** 등록번호가 형식 검증에 실패하면(placeholder가 아닌 실제 값이 형식을 어긴 경우), 앱은 값을 버리지 **않고(shall not)** 원본을 보존한 채 형식 경고를 표시**해야 한다(shall)**.

**형식 검증은 REQ-WS-034의 계층 해석으로 실제 채택된 유효값에만 적용된다(shall)** — 채택되지 않은 값은 검증 대상이 아니며 경고를 유발하지 **않는다(shall not)**. 따라서 원고 front matter가 `registration`에 **미기입이 아닌 값**을 담으면(REQ-WS-042에 따라 매니페스트 값이 억제됨) 매니페스트의 `registration` 값은 검증되지 **않는다(shall not)** — 유효한 NCT를 선언한 원고가 쓰이지도 않는 매니페스트의 낡은 placeholder 때문에 경고를 받는 것은 REQ-WS-053이 막으려는 것과 같은 결함 계열이다. 매니페스트 값은 원고의 값이 **미기입이어서 기본값으로 채택된 경우에만** 검증된다.

**REQ-WS-039** (Ubiquitous)
서지에 대해 매니페스트는 `.bib` 파일 경로를 **가리키기만 해야 하며(shall)**, 서지 항목 자체(제목·저자·DOI 등 필드를 가진 인라인 엔트리)를 담지 **않는다(shall not)**. `references.bib`는 계속 유일한 서지 정본이다.

**REQ-WS-040** (Ubiquitous)
매니페스트의 `bibliography` 키가 존재하면 기존 walk-up 탐색보다 우선**해야 한다(shall)**. 키가 없으면 기존 탐색 순서(`references.bib` → `references.bibtex` → `bibliography.bib`, `electron/bibliographyWrite.ts`)가 변경 없이 적용**되어야 한다(shall)**.

**REQ-WS-041** (State-driven)
**While** 프로젝트 없음 상태인 동안, 메타데이터는 완전하게 동작**해야 한다(shall)** — 정본이 원고 front matter이므로 매니페스트 부재는 기능 상실을 뜻하지 **않는다(shall not)**. 이 상태에서는 프로젝트 기본값 계층만 비어 있다.

**REQ-WS-042** (Ubiquitous) — 억제는 값 기반이다
원고 front matter의 어떤 메타데이터 키가 **미기입이 아닌 값**(REQ-WS-054에 해당하지 않는 값)을 가지면, 앱은 그 키에 대한 매니페스트 값을 사용하지 **않아야 한다(shall not)**. 두 값이 다른 것은 충돌이 아니라 정상적인 문서 수준 선언**이므로(shall)** 앱은 이를 경고로 보고하지 **않는다(shall not)**.

**When** front matter의 해당 키가 미기입이면(키 부재 **또는** 미기입 값), 앱은 매니페스트의 대응 값을 유효값으로 채택**해야 한다(shall)** — 키의 존재만으로 매니페스트 기본값을 억제하지 **않는다(shall not)**.

**이 조항이 값 기반인 이유**: 출하 템플릿이 모든 원고에 `author: `를 발행하므로(`manuscriptTemplates.ts:22`), 억제를 키 존재 기준으로 하면 **템플릿에서 생성한 어떤 원고에도 매니페스트 기본값이 적용될 수 없다** — 기본값 계층이 정상 생성 경로에서 죽는다. 값 기준으로 하면 저자를 프로젝트 수준에 한 번 쓰고 모든 원고가 상속하며, 다른 저자 목록이 필요한 원고만 스스로 선언해 그것이 이긴다. D-4(원고별 저자 목록)의 동기가 그대로 유지된다.

**수용된 대가 (누락이 아니라 의도된 선택)**: 이 규칙 아래에서는 "의도적으로 저자 없음"을 표현할 수단이 없다 — 빈 값은 언제나 "아직 안 썼다"로 해석되어 매니페스트 기본값을 끌어온다. 프로젝트 기본값을 원고 단위로 비우려면 매니페스트에서 해당 키를 제거하거나 원고에 placeholder가 아닌 명시적 값을 쓰는 수밖에 없다. 이 한계는 인지된 상태로 수용한다.

**REQ-WS-043** (Unwanted)
메타데이터 읽기·쓰기는 원고의 front matter 영역 밖 바이트를 변경하지 **않아야 한다(shall not)**. front matter 갱신 시 본문은 바이트 단위로 동일하게 유지된다.

**REQ-WS-044** (Ubiquitous)
메타데이터 모델은 기존 front matter 파서(`shared/frontMatter.ts`, `shared/frontMatterFenced.ts`)를 사용**해야 하며(shall)**, 별도의 두 번째 front matter 파서를 도입하지 **않는다(shall not)**.

---

## §C 제약

| # | 제약 | 근거 |
|---|---|---|
| C-1 | 다음 요구는 **프로젝트 없음 상태에서도 완전히 동작해야 한다**: REQ-WS-006, 013, 014~019, 020~033, 034~038, 041~044. 나머지 — REQ-WS-001~005, 007~012, 039, 040, 045~047 — 는 본질적으로 프로젝트 조건부이며, 프로젝트 없음 상태에서 올바른 동작은 "적용되지 않음"이다 | 사용자 확정 결정 — 단일 파일 열기 보존 |
| C-2 | 3-프로세스 경계를 변경하지 않는다: 파일시스템·감시는 main, 조합 상태·뷰는 renderer, 타입·스키마는 `shared/` | `structure.md` §2 |
| C-3 | 신규 IPC 채널은 `shared/ipc-contract.ts`에 선언되어야 하며, 구독형 API는 구독 해제 클로저를 반환해야 한다 | `structure.md` §3 |
| C-4 | `pathGuard` 4-tier 모델을 완화하지 않는다. 새 신뢰 승격 경로를 추가하지 않고 기존 Tier 2 자동 편입(`allowSessionPath`)에 의존한다 | `structure.md` §4, REQ-WS-012 |
| C-5 | 개발 방법론은 TDD(RED-GREEN-REFACTOR), 커버리지 목표 85%, 커밋당 최소 80% | `.moai/config/sections/quality.yaml` |
| C-6 | macOS와 Windows 모두 출하 대상. Windows는 e2e CI가 없으므로 플랫폼 차이는 유닛 계층에서 검증 가능한 형태로 설계해야 한다 | `tech.md` §9, §13.1 |
| C-7 | IME 조합에 닿는 코드 변경은 CDP `Input.imeSetComposition` 기반 e2e가 의무이며, 릴리스 전 수동 한글 스모크를 대체하지 않는다. **현행 `composeKorean()` 헬퍼는 조합을 열어둔 채 유지할 수 없으므로(원자적 start-then-commit + `finally` detach), 조합 유지형 e2e 프리미티브 도입이 선행 조건이다** | `docs/DOCUMENT_MODE_PRINCIPLES.md` §2, `e2e/_helpers.ts:241-281` |
| C-8 | 3단계 릴리스 게이트(CI → macOS e2e → 수동 한글 IME 스모크)를 그대로 통과해야 한다 | `product.md` §8 |

---

## §D 제외 범위

### Out of Scope — 멀티패널·에이전트·샌드박스

- 다중 패널 레이아웃과 **비마크다운 파일의 편집 표면**(SPEC-2, `EPIC-V03-WORKSPACE.md:101`). 이 SPEC은 REQ-WS-032의 조정 계약만 정의하고 `.py`/`.csv`를 여는 UI는 만들지 않는다
- CLI 에이전트 실행·수명주기(SPEC-3)
- Diff 승인 UI(SPEC-4) — 이 SPEC은 정책 교체 지점(REQ-WS-029)과 배너 표면(REQ-WS-027)만 제공한다
- Python 분석 샌드박스(SPEC-5)

### Out of Scope — 실시간 협업

- CRDT/OT 동시 편집, 원격 커서, 협업 세션 서버
- 3-way 자동 병합 알고리즘 — REQ-WS-027은 사용자의 편집을 유지하고 배너로 알릴 뿐 병합을 요구하지 않는다

### Out of Scope — 편집 엔진과 원칙 문서

- CodeMirror 6 교체 또는 3-모드 모델 재설계
- `RenderedSpan` 양방향 소스맵 계약(`DOCUMENT_MODE_PRINCIPLES.md` §7) — 별개의 v0.3 항목
- **`docs/DOCUMENT_MODE_PRINCIPLES.md` 자체의 개정** — REQ-WS-033은 마크다운 밖 파일에도 바이트 무결성을 요구하지만, 해당 문서는 현재 문서모드 마크다운 편집에만 범위가 걸려 있다. 이 공백은 **기록만 하고 이 SPEC에서 문서를 고치지 않는다**

### Out of Scope — 프로젝트 생성 UX

- 프로젝트 생성 마법사, 템플릿에서 프로젝트 스캐폴딩
- 규약 폴더 자동 생성(REQ-WS-011이 금지)
- 매니페스트 편집 전용 GUI — 이 SPEC은 읽기·검증·키 단위 최소 갱신(REQ-WS-003)만 정의한다

### Out of Scope — 신뢰 경계 확장

- 프로젝트 루트의 자동 워크스페이스(Tier 3) 편입
- 에이전트·샌드박스 실행에 필요한 신뢰 확장 — SPEC-3/SPEC-5 소유

### Out of Scope — 원격·동기화

- 클라우드 동기화, 원격 프로젝트, 백엔드 API
- git 연동 확장 — 기존 `electron/git.ts` 상태 배지를 넘어서지 않는다

---

## §E 성공 기준

- §B의 53개 요구사항(REQ-WS-001~047 + 047a + 049~053 — **REQ-WS-048은 결번**)이 모두 관측 가능한 수용 기준으로 매핑된다(`acceptance.md`, 모든 AC가 REQ ID 또는 제약 ID를 인용)
- 조합 유지형 e2e 프리미티브가 존재하고, IME 조정 시나리오가 그 위에서 검증된다
- C-1이 지정한 범위에 대해 프로젝트 있음/없음 두 상태가 검증된다
- macOS/Windows 감시 semantics 차이가 유닛 계층에서 검증 가능하다
- 커버리지 85% 목표, 커밋당 80% 최소

---

## §F 참조

- `EPIC-V03-WORKSPACE.md` — Epic 개요와 SPEC 의존 순서 (비마크다운 편집 표면 = SPEC-2, `:101`)
- `.moai/project/structure.md` §2·§3·§4 — 프로세스 경계·IPC 계약·pathGuard
- `.moai/project/tech.md` §9·§13 — CI 커버리지 한계, 알려진 결함
- `docs/DOCUMENT_MODE_PRINCIPLES.md` §0·§1·§2 — 우선순위, 소스 무결성, IME 안전
- `src/editor/keymap/pendingInlineFormat.ts:12-32` — 조합 중 문서 변경이 한글 IME를 깨뜨린 실증 기록
- `e2e/_helpers.ts:241-281` — 현행 `composeKorean()` (원자적, 조합 유지 불가)
- `electron/fs.ts:101-163` — 기존 `watchRoot` (단일 `pendingPath` 합류)
- `electron/bibliography.ts`, `electron/bibliographyWrite.ts`, `electron/referenceFs.ts` — 기존 서지·`reference/` 관례
- `shared/frontMatter.ts:59-77` — `frontMatterString` / `frontMatterRange`
- `shared/manuscriptTemplates.ts:22, :70, :168` — 출하 중인 `author:` / `registration:` 키

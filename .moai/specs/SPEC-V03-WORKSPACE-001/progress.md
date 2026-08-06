---
id: SPEC-V03-WORKSPACE-001
title: "진행 기록 — v0.3 워크스페이스 골격"
version: "0.2.2"
status: in-progress
created: 2026-08-06
updated: 2026-08-07
tier: L
author: manager-spec
priority: P0
phase: "v0.3.0 target"
module: "shared/, electron/, src/"
lifecycle: spec-anchored
tags: "workspace, manifest, file-watching, reconciliation, ime, metadata"
---

# 진행 기록 — SPEC-V03-WORKSPACE-001

## §E.1 Plan-phase Audit-Ready Signal

### 판 0.2.2 (2026-08-07) — M1 구현이 드러낸 결함의 인라인 정정 (run-phase)

- **결함**: REQ-WS-042(키 존재 기반 억제) + REQ-WS-051(빈 값 = 미기입) + `manuscriptTemplates.ts:22`(모든 템플릿이 `author: ` 발행)의 조합이, 템플릿에서 만든 **모든** 원고에서 매니페스트 기본값 계층을 사용 불가로 만들었다. 판 0.2.1의 AC는 키 존재/부재만 다뤄 이 경우를 잡지 못했다
- **정정**: 억제를 **값 기반**으로 전환. 미기입 값은 억제를 발동시키지 않고 매니페스트 기본값이 채택된다
- **파생 실측**: `author: `는 빈 문자열이 아니라 **`null`로 파싱**된다(`js-yaml` `JSON_SCHEMA`). 미기입 판정에 null을 포함하지 않으면 정정이 무효가 된다
- **파생 정정**: `registration`에도 동일 결함 존재 — CONSORT/PRISMA placeholder(`ClinicalTrials.gov NCT` / `PROSPERO CRD`)가 억제를 발동시키면 그 템플릿 원고는 프로젝트 등록번호를 상속받지 못한다. REQ-WS-055로 해소
- **요구사항 55개** (52 → 55): REQ-WS-054(미기입 판정), REQ-WS-055(등록번호 placeholder) 신설 + 047a 유지. 048은 여전히 결번
- **수용 기준 77개 항목** (72 → 77): AC-WS-038c(미기입 다섯 형태 → 기본값 채택), 039b(감사의 글 균일성), 067c(placeholder 비억제), 068(미기입 판정 매트릭스), 069(출하 템플릿 전수 상속) 신설
- **회귀 게이트**: AC-WS-038c와 AC-WS-069는 **문자 그대로의 이전 규칙 아래에서 실패한다** — 결함의 무성 재발을 막는 실행 가능한 검사다
- **수용된 대가**: "의도적으로 저자 없음"을 표현할 수단 없음 (REQ-WS-042에 명시)
- 상태: `in-progress` (6개 파일 전부)

### 판 0.2.1 (2026-08-07) — 재감사(PASS WITH FIXES 0.84) SHOULD-FIX 8 + NIT 6 반영

- **`tier: L` 선언** — 4개 아티팩트에 frontmatter 추가. Tier L 산출물 `design.md` / `research.md` 신설 (총 6개 파일)
- **요구사항 53개** — REQ-WS-001~047 + 047a + 049~053 (048은 결번). REQ-WS-047a 신설(수동 새로고침 진입점 소유 경계)
- **수용 기준 72개 항목** — 식별자 001~067, 016/038/057/058/067이 a·b 분할. 신설 4건: AC-WS-058b(새로고침 진입점), 066(역할 기반 제외 이름 충돌), 067·067b(채택된 값만 검증)
- 전 항목 추적 표기 유지 (`grep '^### AC-WS-' acceptance.md | grep -vc '↔'` → 0)
- `EPIC-V03-WORKSPACE.md` §3 메타데이터 계층을 front-matter 정본으로 정정 — SPEC-2~5가 이 문서에서 파생되므로 최우선 처리
- 미해결 clarification 마커 0건 유지 (6개 파일 전수 확인)
- 상태: `draft`

### 판 0.2.0 (2026-08-07) — plan-auditor FAIL 대응 후

- 아티팩트 4종: `spec.md`, `plan.md`, `acceptance.md`, `progress.md`
- **요구사항 52개** — REQ-WS-001~047 및 049~053 (REQ-WS-048은 결번; `data/` 배제 조항을 REQ-WS-046 본문에 통합하며 발생)
- **수용 기준 68개 항목** — 식별자 AC-WS-001~065, 016/038/057이 각각 a·b로 분할되어 항목 수가 3 많음. 전 항목이 `↔ REQ-WS-0NN` 또는 `↔ C-N` 추적 표기를 가짐 (`grep '^### AC-WS-' acceptance.md | grep -vc '↔'` → 0)
- **미해결 clarification 마커 0건** — 이전 판 6건 전부 `plan.md` §A에 확정 결정(D-1~D-6)으로 기록
- 미결 선행 조건: M5의 **조합 유지형 e2e 프리미티브**가 없으면 §C(IME) AC를 PASS로 기록할 수 없음 — `plan.md` §B.3 계약 참조
- 상태: `draft`

### 판 0.1.0 (2026-08-06) — 최초 작성

- 요구사항 44개, 수용 기준 52개 항목
- 미해결 결정 6건(A-1~A-6)이 `plan.md` §A에 기록됨 → 판 0.2.0에서 전부 해소

## §E.1a 아티팩트 수명주기 — Tier L 6파일 (하네스 스키마 공백 기록)

manager-develop이 `draft → in-progress` 전환 시 4개 아티팩트(spec/plan/acceptance/progress)만 전환하고 `design.md` / `research.md`를 `draft`로 남겼다. **이는 하네스 스키마의 공백이며, 두 파일이 다른 수명주기를 갖는다는 뜻이 아니다.**

**올바른 수명주기 판정 — 두 파일은 형제와 동일하다.** 근거:

1. `.claude/rules/moai/development/spec-frontmatter-schema.md` § Optional Fields의 `tier` 항목이 **Tier L = 5 files (spec.md + plan.md + acceptance.md + design.md + research.md)** 로 정의한다 — `design.md`와 `research.md`는 Tier L의 정규 아티팩트다.
2. 같은 파일의 Status Transition Ownership Matrix `(none) → draft` 행이 커밋 제목에 `{N}`을 Tier 아티팩트 수로 쓰라며 **"Tier L = 5"** 를 명시하고 `do NOT hardcode a fixed count`라고 못박는다 — 즉 스키마는 Tier L에서 두 파일을 plan-phase 아티팩트로 **이미 계산하고 있다**.
3. 두 파일은 manager-spec이 plan-phase에 저작했고(`(none) → draft` 소유), 내용이 SPEC 본문과 함께 움직인다(판 0.2.2에서 design.md §7.1a와 research.md §4.2a가 이번 정정과 함께 갱신됨).

**공백의 정확한 위치**: `draft → in-progress` 행(manager-develop 소유)은 `(none) → draft` 행과 달리 아티팩트 수를 언급하지 않는다. 아티팩트 열거가 없으므로 구현체가 관례적 4파일만 전환했다. `(none) → draft`는 Tier 수를 명시하는데 `draft → in-progress`는 그렇지 않은 **비대칭**이 공백이다.

**조치**: 이 SPEC에서는 두 파일을 형제와 함께 `in-progress`로 전환했다(6개 파일 전부 `version: 0.2.2` / `status: in-progress`). **하네스 규칙 파일은 수정하지 않았다** — 스키마 비대칭의 항구적 해소는 이 SPEC의 범위가 아니며(`spec.md` §D의 "이 SPEC은 harness 규칙 파일을 수정하지 않는다" 원칙과 동일 계열), 별도 항목으로 다뤄져야 한다. 여기서는 관측된 공백과 올바른 판정만 기록한다.

## §E.2 Run-phase Evidence

### M1 — 메타데이터·매니페스트 데이터 모델 (TDD, cycle_type=tdd)

산출물 (신규 4 / 수정 3):

| 파일 | 상태 | 내용 |
|---|---|---|
| `shared/yamlKeyRange.ts` | 신규 | 최상위 키 단위 범위 산출 + 스플라이스 (D-1) |
| `shared/projectFolders.ts` | 신규 | 역할 5종·기본 경로·`folders` 재정의 해석·`REFERENCE_DIR_NAME` |
| `shared/workspaceManifest.ts` | 신규 | 매니페스트 타입·파싱·검증·최소 쓰기·서지 참조 |
| `shared/manuscriptMetadata.ts` | 신규 | front matter 키 스키마·저자 정규화·등록번호 검증·3계층 병합·front matter 갱신 |
| `shared/frontMatterFenced.ts` | 수정 | `yamlStart` 오프셋 추가 (두 번째 파서 도입 회피, REQ-WS-044) |
| `electron/referenceFs.ts` | 수정 | `REFERENCE_DIR_NAME`을 `shared/`에서 재export (composite 경계 해소) |
| `tests/shared/{yamlKeyRange,projectFolders,workspaceManifest,manuscriptMetadata}.test.ts` | 신규 | 85 테스트 |

RED→GREEN 4주기: yamlKeyRange(17) → projectFolders(11) → workspaceManifest(18) → manuscriptMetadata(35).
각 주기에서 모듈 부재로 인한 수집 실패(RED)를 먼저 관측한 뒤 구현했다.
REFACTOR: `frontMatterFenced.yamlStart` 도입으로 `manuscriptMetadata`의 중복 펜스 정규식 제거
(AC-WS-047 가드가 잡아낸 실제 위반), 커버리지 공백 3건 후속 테스트 보강(+4 테스트, 총 89).

AC 판정 (M1 범위):

| AC | ↔ REQ | 상태 | 근거 테스트 |
|---|---|---|---|
| AC-WS-007 | 003 | PASS | `workspaceManifest.test.ts` — setManifestKey 4건 (주석·미정의 키·순서·범위 밖 diff 0) |
| AC-WS-008 | 010 | PASS | `projectFolders.test.ts` — 상대 경로 해석. **절대 경로 결합은 M3에서 완결**(아래 M3 표) |
| AC-WS-009 | 010 | PASS | `projectFolders.test.ts` — 루트 밖 재정의는 무시 |
| AC-WS-052 | 002 | PASS | `workspaceManifest.test.ts` — 7개 키 파싱 + `future_key` 무경고 |
| AC-WS-053 | 009 | PASS | `projectFolders.test.ts` — 기본 5종 + `REFERENCE_DIR_NAME` 문자열 동일(상수 직접 참조) |
| AC-WS-054 | 034 | PASS | `manuscriptMetadata.test.ts` — 키별 정본·기본값 분기 |
| AC-WS-038 | 035 | PASS | `manuscriptMetadata.test.ts` — 저자 정본은 front matter |
| AC-WS-038b | 035, 042 | PASS | `manuscriptMetadata.test.ts` — 매니페스트 저자는 미선언 시에만 |
| AC-WS-039 | 036 | PASS | `manuscriptMetadata.test.ts` — 감사의 글도 front matter가 이김 |
| AC-WS-040 | 037 | PASS | `manuscriptMetadata.test.ts` — 유효 NCT 무경고 |
| AC-WS-041 | 038 | PASS | `manuscriptMetadata.test.ts` — 형식 위반 보존 + 경고 |
| AC-WS-065 | 038, 041 | PASS | `manuscriptMetadata.test.ts` — 매니페스트 부재가 검증을 끄지 않음 |
| AC-WS-067 | 038, 042 | PASS | `manuscriptMetadata.test.ts` — 채택되지 않은 매니페스트 값 무검증 |
| AC-WS-067b | 038 | PASS | `manuscriptMetadata.test.ts` — 기본값으로 채택된 값은 검증 |
| AC-WS-061 | 050 | PASS | `manuscriptMetadata.test.ts` — 화이트리스트 `['author','registration','acknowledgements']` 직접 단언 + 출하 템플릿 3종 |
| AC-WS-062 | 051 | PASS | `manuscriptMetadata.test.ts` — 단수·복수·빈값 3형태 |
| AC-WS-063 | 052 | PASS | `manuscriptMetadata.test.ts` — PROSPERO에 NCT 검증 미적용 |
| AC-WS-064 | 053 | PASS | `manuscriptMetadata.test.ts` — placeholder 2종 + 템플릿 원문 무경고 |
| AC-WS-042 | 040 | PASS | `workspaceManifest.test.ts` — 매니페스트 경로 우선 |
| AC-WS-043 | 040 | PASS (부분) | `workspaceManifest.test.ts` — 키 부재 시 null 반환(walk-up 위임). **M3에서 walk-up 동일성까지 완결** |
| AC-WS-055 | 039 | PASS | `workspaceManifest.test.ts` — 인라인 엔트리 매핑·시퀀스 모두 스키마 위반 |
| AC-WS-044 | 041 | PASS | `manuscriptMetadata.test.ts` — 프로젝트 없이 3값 반환 |
| AC-WS-045 | 042 | PASS | `manuscriptMetadata.test.ts` — 무음 대체 + 입력 불변 |
| AC-WS-046 | 043 | PASS | `manuscriptMetadata.test.ts` — 본문 바이트 diff 0 |
| AC-WS-047 | 044 | PASS | `manuscriptMetadata.test.ts` — `shared/` 전수 스캔, 위반 0 |

M1 범위 밖(미착수): AC-WS-001~006, 010~037, 048~051, 056~060, 066 — M2~M8 소관.

### M1a — REQ-WS-042 개정 반영 (판 0.2.2 인라인 정정)

억제를 키 존재 기반에서 **값 기반**으로 전환했다. RED에서 9건 실패를 먼저 관측한 뒤 GREEN.

| 관측된 RED | 증상 |
|---|---|
| AC-WS-038c | 출하 형태 `author: `를 포함한 다섯 미기입 형태 전부에서 `[]` 반환 (매니페스트 3명이 억제됨) |
| AC-WS-069 | `MANUSCRIPT_TEMPLATES` 전 템플릿(imrad 포함)에서 프로젝트 저자 상속 실패 |
| AC-WS-067c | CONSORT/PRISMA placeholder가 매니페스트 등록번호를 억제 |
| AC-WS-039b · AC-WS-054 | 미기입 `acknowledgements:`가 매니페스트 기본값을 억제 |
| AC-WS-068 | `isEmptyMetadataValue` 미존재 |

| AC | ↔ REQ | 상태 | 근거 테스트 |
|---|---|---|---|
| AC-WS-068 | 054 | PASS | 여섯 미기입 형태 + 부정 3종 + 타입 어긋난 값 |
| AC-WS-038c | 042, 054 | PASS | 다섯 미기입 형태 모두 매니페스트 3명 채택 |
| AC-WS-069 | 042, 051, 054 | PASS | `MANUSCRIPT_TEMPLATES` 배열 순회 (템플릿 추가 시 자동 커버) |
| AC-WS-039b | 036, 054 | PASS | 미기입 `acknowledgements:` → 매니페스트 |
| AC-WS-067c | 055, 042 | PASS | placeholder 2종 + CONSORT/PRISMA 원문 |
| AC-WS-062 `[N]` | 051 | PASS | 재태깅 반영 — 프로젝트 없음 상태로 한정 |
| AC-WS-038 · 054 · 045 | 035, 034, 042 | PASS | "미기입이 아닌 값만 억제"로 갱신 |

파싱 근거를 테스트로 고정했다: `author: ` / `author:` / `author:   ` 는 `null`, `author: ""` 는 `""`.
이 단언이 미기입 판정을 `=== ''`로 되돌리는 회귀를 막는다.

### M2 — 조정 흐름과 배너 UX

산출물 (신규 5 / 수정 3):

| 파일 | 상태 | 내용 |
|---|---|---|
| `shared/reconciliation.ts` | 신규 | 상태 기계(순수) — 상태·이벤트·effect·정책·알림 표면 |
| `src/store/reconciliationStore.ts` | 신규 | zustand 배선 — 상태 보관, 정책 주입, effect 전달 |
| `src/components/ReconciliationSurface.tsx` | 신규 | 알림의 유일한 렌더러 |
| `src/components/ReconciliationSurface.css` | 신규 | 인라인 스트립 스타일 (오버레이 아님) |
| `tests/shared/reconciliation.test.ts` | 신규 | 30 테스트 |
| `tests/components/reconciliationBanner.test.tsx` | 신규 | 14 테스트 |
| `src/App.tsx` | 수정 | StatusBar 위에 표면 마운트 |
| `src/i18n/dict.ts` | 수정 | `reconcile.*` 8키 (en/ko 동수) |

상태 기계:

| 상태 | 의미 | 표면 |
|---|---|---|
| `idle` | 보류 없음 | 없음 |
| `held-composition` | IME 조합 중이라 보류 | status (동작 없음) |
| `held-notify` | 정책이 알림 선택 — 버퍼 불변 | banner (차이 보기 / 불러오기 / 닫기) |
| `held-approval` | 주입 정책이 승인 대기 | banner |
| `missing` | 디스크에서 사라짐 — 버퍼 보존 | status (해제 불가) |
| `decode-error` | 디코드 실패로 조정 중단 | banner (닫기) |

| AC | ↔ REQ | 상태 | 근거 테스트 |
|---|---|---|---|
| AC-WS-025 | 024 | PASS | `reconciliation.test.ts` — 깨끗하면 `apply-to-buffer` 1건, 알림 없음 |
| AC-WS-029 | 027 | PASS | `reconciliation` + `reconciliationBanner` — 버퍼 불변 + 3동작 배너 |
| AC-WS-030 | 028 | PASS | 해제·무시·rogue 정책 3경로 모두 apply effect 0 |
| AC-WS-031 | 030 | PASS | 삭제 시 effect 0 + `missing` 표시, 해제 불가 |
| AC-WS-032 | 031 | PASS | decode-error 시 조정 중단 + 원인 표시, 보류분 폐기 |
| AC-WS-033 | 029 | PASS | 승인 대기 정책 주입 → `held-approval`, 버퍼 불변 |
| AC-WS-023 | 023 | PASS (부분) | 보류 표면이 status·무버튼·포커스 불변. **조합 진입 트리거는 M5** |
| AC-WS-060 | 049 | PASS | 5개 상태 전수 DOM 검사 + `NOTICE_PRESENTATIONS`에 modal 부재 + 소스 스캔 |

M2 범위 밖: AC-WS-026·027·028(캐럿·실행취소 = M6), AC-WS-019~022·024(조합 유지형 e2e = M5).

### M3 — 프로젝트 discovery와 신뢰 경계

산출물 (신규 2 / 수정 1):

| 파일 | 상태 | 내용 |
|---|---|---|
| `electron/projectDiscovery.ts` | 신규 | walk-up 탐색(32단계), 최근접 선택, none/corrupt 진입, 규약 폴더 절대 경로 |
| `electron/bibliography.ts` | 수정 | `findBibliographyForDocument` 추가 — 매니페스트 우선, 기존 walk-up으로 폴백 |
| `tests/electron/projectDiscovery.test.ts` | 신규 | 27 테스트 |

`findBibliographyFor`는 **한 글자도 바꾸지 않았다** — 새 함수가 그것에 위임한다.

| AC | ↔ REQ | 상태 | 근거 테스트 |
|---|---|---|---|
| AC-WS-001 | 004 | PASS | `X/manuscript/a.md` → 루트 `X/`, manifestPath 확인 |
| AC-WS-002 | 004 | PASS | 33단계 위 → `none`, 오류 없음. 31단계는 발견. `.bib` walk-up과 상한 일치 단언 |
| AC-WS-003 | 005 | PASS | `X/`·`X/sub/` 양쪽 매니페스트 → `X/sub/`. 최근접이 손상이어도 상위로 강등 안 함 |
| AC-WS-004 | 006 | PASS | 매니페스트 없음 → `{kind:'none'}`, throw 없음 |
| AC-WS-005 | 007 | PASS | 유효하지 않은 YAML → `corrupt`+메시지. **읽기 전후 SHA-256 동일** |
| AC-WS-006 | 008 | PASS | `name` 결여 → `corrupt`/`missing-name` (`none`이 아님) |
| AC-WS-010 | 011 | PASS | 규약 폴더 부재 프로젝트 열기 전후 디렉터리 목록 동일 |
| AC-WS-011 | 012 | PASS | 발견 후에도 루트 하위 미신뢰 경로가 `PathNotAllowedError`. 소스 스캔으로 승격 API 부재 확인 |
| AC-WS-008 | 010 | **PASS (완결)** | `projectFolderPaths` → `join(root,'output','fig')` 절대 경로 |
| AC-WS-009 | 010 | **PASS (완결)** | 루트 밖 재정의 → `join(root,'data')` 절대 경로 |
| AC-WS-042 | 040 | PASS | 매니페스트 `refs/custom.bib`가 인접 `references.bib`를 이김 |
| AC-WS-043 | 040 | **PASS (완결)** | 키 부재·프로젝트 부재 두 경우 모두 `findBibliographyFor` 결과와 `toEqual` |
| AC-WS-055 | 039 | PASS (electron 절반) | 인라인 서지 항목 → 채택 안 하고 walk-up 폴백 |

M1 미완 2건 해소: AC-WS-008(절대 경로 결합), AC-WS-043(walk-up 동일성). 둘 다 완결.

M3 범위 밖: AC-WS-012~018·056~059·066(감시 = M4), AC-WS-058b(IPC 진입점 = M8).

## §E.3 Run-phase Audit-Ready Signal

```yaml
run_status: in-progress            # M1 + M1a + M2 + M3 완료, M4~M8 미착수
milestones_complete: [M1, M1a, M2, M3]
run_commit_sha: 124455d
ac_pass_count: 50                  # M1 25 + M1a 6 + M2 8 + M3 11(신규) — 008/009/043은 M3에서 완결
ac_fail_count: 0
ac_partial_remaining: 1            # AC-WS-023 (조합 관찰자 = M5)
requirements_pass:
  m1: 20                           # REQ-WS-001,002,003,009,010,034~044,050~053
  m1a: 3                           # REQ-WS-042(개정), 054, 055
  m2: 8                            # REQ-WS-023,024,027,028,029,030,031,049
  m3: 7                            # REQ-WS-004,005,006,007,008,011,012
new_warnings_or_lints_introduced: 0
typecheck: "tsc --build && tsc --noEmit -p tsconfig.test.json → exit 0"
lint: "eslint . --ext .ts,.tsx → exit 0"
test: "vitest run → 186 files / 1996 tests passed"
coverage_command: "pnpm test:coverage"
coverage_new_modules:
  electron/projectDiscovery.ts: "100% stmts / 100% branch"
  electron/bibliography.ts: "96.82% stmts / 87.09% branch (미커버 32-33행은 M3 이전부터의 공백)"
  shared/reconciliation.ts: "100% stmts / 97.5% branch"
  shared/manuscriptMetadata.ts: "100% stmts / 94.52% branch"
  shared/workspaceManifest.ts: "100% stmts / 97.36% branch"
  shared/projectFolders.ts: "100% stmts / 100% branch"
  shared/yamlKeyRange.ts: "96.96% stmts / 91.83% branch"
  src/store/reconciliationStore.ts: "100% stmts / 100% branch"
  src/components/ReconciliationSurface.tsx: "100% stmts / 100% branch"
coverage_repo_wide: "68.22% stmts / 80.95% branch"
coverage_gate_note: >
  저장소 전체는 C-5의 85% 목표와 80% 커밋 최소선 아래다. 이는 이 SPEC 이전부터의
  격차이며 M1~M3가 만든 것이 아니다 — shared/는 96.51%. vitest.config.ts에
  임계값을 걸지 않은 이유는 판 0.2.2 기록 참조.
trust_boundary_note: >
  D-6 유지 확인. projectDiscovery는 pathGuard 신뢰 승격 API를 호출하지 않으며
  소스 스캔 회귀 테스트가 이를 고정한다. 다만 discovery는 조상 디렉터리의
  durumi.project.yaml을 읽으므로, 렌더러가 직접 요청할 수 없는 경로를 main이
  읽는다 — 신뢰 승격(REQ-WS-012이 다루는 축)이 아니라 읽기 범위 문제이며
  SPEC이 다루지 않는다. 보고서 참조.
stubbed_producers:
  - "ConfirmedChange 생산자(감시·확정 계층)는 M4 소관"
  - "composition-start/end 관찰자는 M5 소관"
  - "apply-to-buffer effect의 최소 diff 실행자는 M6 소관"
  - "discoverProjectFor / findBibliographyForDocument의 IPC 노출은 M8 소관 — 현재 호출부 없음"
total_run_phase_files: 21          # 신규 13 + 수정 8
```

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_

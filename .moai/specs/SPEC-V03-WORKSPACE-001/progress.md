---
id: SPEC-V03-WORKSPACE-001
title: "진행 기록 — v0.3 워크스페이스 골격"
version: "0.2.3"
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

### 판 0.2.3 (2026-08-07) — M1~M4 구현이 드러낸 결함 7건 정정 (run-phase)

- **최우선 — REQ-WS-014 ↔ AC-WS-013 모순 해소**: 확정 근거를 2단계로 재작성(전 경로 크기+수정시각 → 열린 파일만 내용 대조). 내용 동일 재작성도 mtime을 바꾸므로 두 문장은 동시 성립 불가였고, 구현은 해석 PASS로 흡수하고 있었다. 조정은 최소 diff·차이 보기를 위해 어차피 내용을 읽으므로 2단계는 **추가 읽기 비용 0**이며, 대상이 열린 파일뿐이라 REQ-WS-046의 `data/` 배제 취지와 충돌하지 않는다. **사용자 결정 불필요** — 요구사항들에서 무비용 해법이 도출됨
- **REQ-WS-056 신설**: 읽을 수 없는 `bibliography` 경로 → walk-up 폴백 **+ 폴백 사실·원인 경로 표시**. 조용한 폴백은 오타를 다른 서지 파일로 은폐하고, 폴백 없는 실패는 REQ-WS-007의 자세와 어긋난다
- **REQ-WS-030 명시**: 사라짐 표시는 해제 불가(알림이 아니라 디스크 사실). REQ-WS-027 배너(해제 가능)와의 구분을 AC-WS-031b가 한 검사에서 대조
- **AC-WS-023 → 023a/023b 분할**: 상태·표면(M2 밀폐 종료 가능) / 조합 진입(M5) 분리. 부분 PASS 상태 해소
- **REQ-WS-004 / REQ-WS-055 문구 정정**: 상한만 동일하고 정지 조건은 다름 명시 / `PROSPERO CRD` 리터럴 표현 불가라는 자체 대가 기록
- **요구사항 56개** (55 → 56): REQ-WS-056 신설
- **수용 기준 81개 항목** (77 → 81): AC-WS-013b, 031b, 070 신설 + AC-WS-023 분할
- **반려 1건**: AC-WS-069의 "CARE / STROBE 템플릿 없음" 지적은 사실 오인 — 6개 템플릿이 존재하며 `id`가 계열명과 다르다(`case-report` / `cohort` / `cross-sectional`). AC 본문은 정확했고, 대신 계열↔`id` 대응표를 추가해 같은 오판을 예방
- 상태: `in-progress` (6개 파일 전부)

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

### M3a — 커버리지 게이트 (C-5 강제 개시)

`@vitest/coverage-v8`는 판 0.2.2에 들어왔으나 임계값이 없어 C-5가 강제되지 않았다.

| 파일 | 상태 | 내용 |
|---|---|---|
| `vitest.config.ts` | 수정 | `thresholds: { statements: 85, lines: 85, perFile: true }` |
| `vitest.legacy-coverage.ts` | 신규 | 기존 부채 파일 목록 (초기 98개 → M4 후 97개) |

설계 두 가지:

- **제외 목록 방식** — 새 모듈은 등록 없이 게이트 안에 들어온다. 포함 목록이면
  등록을 잊은 모듈이 조용히 빠져나간다. 제외는 **파일 단위**다: `src/hooks/**`
  같은 디렉터리 glob이면 M5가 그 디렉터리에 추가할 훅까지 함께 빠져나간다.
- **perFile** — 집계 임계값은 무력하다. 게이트 대상 statements 14,430개 중 96%가
  덮여 있어 집계 85%를 깨려면 미커버 statement ~1,900개가 더 필요하다. 테스트
  없는 새 모듈 하나는 묻혀 통과한다. perFile이면 파일 하나가 곧바로 걸린다.

게이트 실패 검증(반증): 테스트 없는 `shared/__gateProbe.ts` 투입 →
`ERROR: Coverage for statements (0%) ... for shared/__gateProbe.ts`, exit 1.
제거 후 exit 0.

vitest 2.1.9의 glob threshold는 전역 집계에서 파일을 빼주지 않아
(`vitest/dist/coverage.js` resolveThresholds가 전역 맵에 모든 파일을 넣는다)
"리포트에 남기되 게이트에서만 제외"는 불가능했다. exclude를 쓰므로 제외 파일은
리포트에서도 사라진다 — 감수한 대가이며 config에 기록했다.

### M4 — 감시와 변경 확정

산출물 (신규 2 / 수정 1):

| 파일 | 상태 | 내용 |
|---|---|---|
| `electron/changeConfirmation.ts` | 신규 | 확정 계층 — 재검사·에코 억제·경로별 합류·플랫폼 흡수·재검사 복구 |
| `electron/watchScope.ts` | 신규 | 감시 범위 결정(역할 기반 제외)·pathGuard 등록·수동 새로고침 |
| `electron/fs.ts` | 수정 | 경로별 debounce로 교체, Linux 폴링 경로 단위 승격 |
| `tests/electron/{changeConfirmation,watchScope,fsWatchPerPath}.test.ts` | 신규 | 49 테스트 |

`src/hooks/useFolderTree.ts`는 **변경 없다** — 아래 참조.

| AC | ↔ REQ | 상태 | 근거 테스트 |
|---|---|---|---|
| AC-WS-012 | 013 | PASS | 내용 변경 → 확정 1건. 프로젝트 밖 경로도 동일 |
| AC-WS-013 | 014 | PASS (해석 있음) | 재검사 결과가 기준선과 같으면 미확정. 아래 §SPEC 긴장 참조 |
| AC-WS-014 | 015 | PASS | 자기 저장 예상값 일치 시 억제, 이후 진짜 외부 변경은 확정 |
| AC-WS-015 | 014, 016 | PASS | 주입 시계+스텁 stat으로 중간 상태 → 최종 상태 재생, 확정 1건이 최종 상태 |
| AC-WS-016a | 017 | PASS | macOS 형태(병합 단일 이벤트) → 정규화 확정 |
| AC-WS-016b | 017 | PASS | Windows 형태(중복+rename 분리+대소문자) → 016a와 `toEqual`. `process.platform` 미사용 |
| AC-WS-017 | 018 | PASS | 감시 공백 중 변경을 `rescan()`이 확정 |
| AC-WS-018 | 019 | PASS | 신뢰 밖 경로 → `PathNotAllowedError`, 등록 0건. 전 대상이 검증을 거침 |
| AC-WS-056 | 045 | PASS | 규약 폴더 4종 감시 목록 + 추적 안 하던 새 파일 확정 |
| AC-WS-057 | 046 | PASS | `data/` 부재, 나머지 4종 존재 |
| AC-WS-066 | 046, 045 | PASS | `folders.data: archive` + `folders.manuscript: data` → 제외는 `archive/` 하나, `data/`는 감시 |
| AC-WS-057b | 046, 013 | PASS | data 역할 경로 안이라도 열린 파일은 `files`에 포함 |
| AC-WS-058 | 047 | PASS | 재열거가 data 역할 경로 포함. 재정의 경로도 포함 |
| AC-WS-059 | 016 | PASS | 한 창 안 두 경로 → 2건. RED에서 `['b.md']` 1건 관측 |

M4 범위 밖: AC-WS-058b(REQ-WS-047a — IPC·메뉴 진입점 = M8).

**Linux 결정 (plan.md §B.5)**: (a) 폴링을 경로 단위로 승격. `pollSnapshot`이 이미
경로별 mtime 맵이라 diff 비용이 사실상 없고, 감시 계약이 플랫폼에 무관하게
하나로 유지된다. (b) Linux 조정 비활성화는 C-6상 정당하지만 플랫폼별 동작 분기를
만들어 v0.3이 커질수록 조용히 어긋난다.

**useFolderTree 영향 없음**: 소비자는 `changedPath === rootPath || startsWith(rootPath)`로
분기하는데, 두 수정 모두 그 계약 안에 머문다 — 경로별 debounce는 이벤트 수가
늘 뿐 각 경로가 여전히 루트의 자손이고, Linux 승격은 루트 대신 실제 파일 경로를
주므로 펼쳐진 디렉터리 갱신이 오히려 정확해진다. 감시 수정이 폴더 트리 수정으로
번지지 않았다.

### M4a — REQ-WS-014 2단계 확정 (판 0.2.3 정정)

| AC | ↔ REQ | 상태 | 근거 테스트 |
|---|---|---|---|
| AC-WS-013 | 014 | PASS (완결) | 열린 파일 내용 동일 재작성(mtime만 변경) → 미확정, 2단계 수행 확인 |
| AC-WS-013b | 014 | PASS | 열려 있지 않은 경로 → 확정되되 `readCalls === []` (읽기 0회) |

M4에서 보고한 REQ-WS-014 ↔ AC-WS-013 모순이 해소됐다. 읽은 내용은
`ConfirmedFileEvent.content`로 실려 나가 조정 계층이 재사용한다.
읽기 실패는 억제하지 않는다 — 비교 불가를 "같다"로 해석하면 진짜 변경을 삼킨다.

### M5 — 조합 유지형 e2e 프리미티브 + IME 게이트

산출물 (신규 4 / 수정 2):

| 파일 | 상태 | 실행 가능 | 내용 |
|---|---|---|---|
| `src/editor/compositionGate.ts` | 신규 | **예 (jsdom)** | IME 게이트 — 조합 경계 관찰 + 지연 드레인 |
| `tests/editor/compositionGate.test.ts` | 신규 | **예** | 16 테스트 |
| `e2e/_helpers.ts` | 수정 | **아니오** | 조합 유지형 프리미티브 4종 + `composeKorean` 래퍼 |
| `e2e/composition-primitive.spec.ts` | 신규 | **아니오** | self-test 6건 (plan.md §D 첫 산출물) |
| `e2e/reconciliation-ime.spec.ts` | 신규 | **아니오 (skip)** | AC-WS-019~022 — M8 차단 |
| `src/editor/MarkdownEditor.tsx` | 수정 | — | 게이트를 `view.contentDOM`에 배선 |

| AC | ↔ REQ | 상태 | 근거 |
|---|---|---|---|
| AC-WS-023b | 023, 020 | **PASS (jsdom)** | 실제 `CompositionEvent` → 조정 계층이 `held-composition` 진입, 표면은 status·무버튼·포커스 불변 |
| AC-WS-019 | 020 | **BLOCKED (M8)** | spec 작성 완료·skip. 프리미티브는 CI 검증됨 |
| AC-WS-020 | 021 | **BLOCKED (M8)** | 동일 |
| AC-WS-021 | 021 | **BLOCKED (M8)** | 동일 |
| AC-WS-022 | 022 | **BLOCKED (M8)** | 동일 |

**프리미티브 self-test: CI 검증 완료 (PR #10)**

| 실행 | 결과 |
|---|---|
| 1차 (`29aa561`) | 202 passed / **2 failed** / 9 skipped — P3·P5 실패 |
| 2차 (`d81776d`) | **206 passed / 0 failed / 9 skipped** (2.6m), P0~P5 전부 통과 |

1차 실패의 근거와 수정은 아래 §M5a에 기록한다.

### M5a — self-test가 잡은 프리미티브 결함 (CI 1차 실행)

**증상**: P3에서 `counts.ends >= 1`은 통과하는데 `.cm-content`가 빈 문자열.
조합은 종료되나 커밋 텍스트가 문서에 남지 않았다. P5도 `composeKorean`을
통해 같은 경로로 실패.

**근거 (CDP 프로토콜 정의)** — `playwright-core/types/protocol.d.ts`
`Input.imeSetComposition`:

```
Use imeCommitComposition to commit the final text.
Use imeSetComposition with empty string as text to cancel composition.
```

빈 문자열은 **취소**다. 취소도 `compositionend`를 발생시키므로 end 횟수
단언만으로는 커밋 여부를 구분할 수 없다. 기존 `composeKorean` 주석은
"empty imeSetComposition just finalizes"라고 적고 있었으나 호출부가 0곳이라
**한 번도 실행된 적 없는 주장**이었고, 실행하자마자 거짓임이 드러났다.
같은 주석의 "insertText는 위에 덧붙인다"도 미검증이었으며 실제로는 Chromium이
`ImeCommitText`로 라우팅해 진행 중인 조합을 **교체**한다.

`Input.imeCommitComposition`은 이 프로토콜 버전에 **없다** — 위 산문에만
등장하고 커맨드 맵에 항목이 없다(`grep -c` → 1, 커맨드 맵 0건). 따라서 커밋
경로는 `insertText`뿐이다.

**수정**:
- `endComposition`: `insertText(handle.composingText)`로 커밋 후 detach.
  핸들이 마지막 조합 텍스트를 기억한다.
- `cancelComposition` 신설 — 빈 문자열의 실제 semantics를 이름으로 고정.
- P3b(마지막 update 문자열이 그대로 커밋), P3c(취소는 커밋하지 않음) 추가.
  P3c가 "end 횟수만으로는 부족하다"를 회귀로 고정한다.
- `withEditor` 헬퍼: 단언 실패가 `shutdownClean`을 건너뛰어
  `Worker teardown timeout`이 진짜 원인을 덮던 부수 결함을 `finally`로 해소.

**이 결함이 증명한 것**: self-test가 없었다면 AC-WS-019~022가 이 프리미티브
위에서 전부 통과했을 것이다 — 아무것도 입력되지 않았으므로 "버퍼 불변"이
자동으로 참이 되고, 조정 게이트가 깨져 있어도 초록이 나온다. plan.md §D가
self-test를 M5의 첫 산출물로 지정한 판단이 실제 결함으로 입증됐다.

**실행 불가의 두 원인 (서로 다른 문제다)**

1. **환경** — `node_modules/.../electron/dist/`에 Electron 바이너리가 없다
   (`LICENSE`·`version`만 존재). `electron.launch: ... ENOENT`로 **기존 31개
   spec 203건 전부** 동일하게 실패한다. 이 SPEC이 만든 문제가 아니며
   `tech.md` §13.2/§13.3이 기록한 상태다.
2. **의존** — `grep -rn "external-change" src/ electron/` → 조정 스토어 정의
   외 **0건**. 확정 이벤트를 렌더러로 나르는 IPC가 아직 없다(M8).

원인 2가 더 중요하다: 바이너리가 있어도 AC-WS-019~022는 **공허하게 통과**한다.
외부 파일 쓰기가 렌더러에 아무 영향을 주지 못하므로 "버퍼가 변경되지 않았다"가
자동으로 참이 되고, 조합 중 버퍼를 갈아엎는 구현도 똑같이 통과한다. 그래서
초록을 만들지 않고 `test.skip(true, ...)`로 차단했다 — M8 완료 후 skip 한 줄
제거로 활성화된다.

**self-test가 막는 공허한 통과**: 프리미티브가 조합을 실제로 열지 못하면
`compositionend === 0`은 자동으로 참이다. 그래서 카운터를 양방향으로 만들고
(`starts`/`ends`) P0가 `starts >= 1`을 **먼저** 단언한다. 이 단언이 없으면
AC-WS-019/022의 관측 수단 자체가 무의미하다.

**게이트의 핵심 설계 — compositionend에서 동기 드레인 금지**: 브라우저는
`compositionend` 다음에 확정 텍스트를 담은 `input` 이벤트를 별도 태스크로
보낸다. 그 전에 문서를 바꾸면 IME의 composing-range 추적이 어긋난다
(`pendingInlineFormat.ts:12-32`의 v0.2.29 실증 기록). 게이트는 드레인을
매크로태스크로 **예약만** 하고, 실행 전에 다음 `compositionstart`가 오면
취소한다 — 한글은 음절이 연달아 조합되므로 이 취소가 없으면 음절 사이의 틈으로
조정이 비집고 들어간다. 마이크로태스크는 확정 `input`보다 먼저 실행되므로
쓸 수 없다.

### M6 — 최소 diff 적용과 캐럿 보존

산출물 (신규 4 / 수정 1):

| 파일 | 상태 | 내용 |
|---|---|---|
| `src/editor/minimalDiff.ts` | 신규 | 최소 차이 산출 (순수) — 줄 LCS + 문자 축약 + 서로게이트 안전 |
| `src/editor/applyExternalChange.ts` | 신규 | 실행자 — 트랜잭션 구성·실행 취소 주석·스토어 배선 |
| `tests/editor/minimalDiff.test.ts` | 신규 | 16 테스트 |
| `tests/editor/applyExternalChange.test.ts` | 신규 | 19 테스트 |
| `src/editor/MarkdownEditor.tsx` | 수정 | 실행자를 스토어에 배선 (M2의 미연결 effect 해소) |

| AC | ↔ REQ | 상태 | 근거 테스트 |
|---|---|---|---|
| AC-WS-026 | 026 | PASS | 80번째 줄 캐럿이 5번째 줄 2줄 삽입 후 82번째 줄에서 같은 텍스트 지점 |
| AC-WS-027 | 026 | PASS | 교체 영역 내부 캐럿 → 경계, 문서 범위 밖으로 나가지 않음 |
| AC-WS-028 | 025 | PASS | 타이핑 → 조정 → undo 1회는 조정만, 2회가 사용자 편집 |

**네 가지 보존 속성 — 각각의 증거**

| 속성 | 방식 | 증거 |
|---|---|---|
| 캐럿 | `selection`을 지정하지 않고 CodeMirror 매핑에 맡김 | 삽입 지점 뒤 캐럿이 같은 텍스트 유지, 앞 캐럿은 오프셋 불변, 다지점 변경 사이의 캐럿도 보존 |
| 선택 | 동일 | 선택 범위가 같은 텍스트를 계속 감쌈. 다중 선택도 각각 매핑 |
| 스크롤 | `scrollIntoView`·`effects`·`selection` 모두 미지정 | 명세에 세 필드가 모두 없음을 단언. jsdom에 레이아웃이 없어 구조적 단언으로 고정 |
| 실행 취소 | `isolateHistory('full')` | `undoDepth`가 정확히 1 증가, undo 1회는 조정만 되돌림, 타이핑 직후 조정이 병합되지 않음 |

**실행 취소 결정**: `isolateHistory('full')`. 세 선택지 중 (1) `addToHistory:false`는
조정을 되돌릴 수 없게 만들고 — 문서가 바뀌었는데 이전 상태로 갈 수단이 없다 —
(2) 기본값은 history의 newGroupDelay 창 안에서 직전 타이핑과 **병합**될 수 있어
Cmd+Z 한 번이 사용자 작업까지 날린다. (3)은 이력에 남기되 앞뒤 경계를 세워
어느 항목과도 병합되지 않는다. 되돌린 결과가 디스크와 달라지는 것은 정의된
상태이며(미저장 편집) REQ-WS-027의 배너가 이미 담당한다.

**접두·접미 축약으로 충분했는가 — 측정 결과 아니다**

먼저 축약만 구현해 측정했다. RED 관측:

```
× 멀리 떨어진 두 지점 사이의 텍스트를 건드리지 않는다
  → expected 1 to be greater than or equal to 2
× 덮는 총 범위가 전체 교체보다 훨씬 작다
  → expected 397 to be less than 39.7
```

양 끝 6자만 바뀐 400자 문서에서 **397자짜리 단일 교체**가 나왔다 — 가운데
변하지 않은 50줄이 통째로 범위에 들어간다. 정확성 문제가 아니라 REQ-WS-026
위반이다: 그 안의 캐럿이 경계로 밀려난다.

단일 지점 변경(AC-WS-026의 실제 시나리오)은 축약만으로 **이미 정확했다** —
"줄 삽입은 삽입 지점만 건드린다"가 확장 전에 통과했다. 즉 확장은 다지점
변경만을 위한 것이며, 줄 단위 LCS를 얹어 해소했다. 비용은 공통 접두·접미
**줄**을 먼저 걷어내 차이 블록으로 좁히고, `MAX_DIFF_CELLS`(1e6)를 넘으면
단일 교체로 물러선다 — 전체 재작성에서는 캐럿 보존이 애초에 의미가 없다.

## §E.3 Run-phase Audit-Ready Signal

```yaml
run_status: in-progress            # M1~M6 구현, M7~M8 미착수
milestones_complete: [M1, M1a, M2, M3, M3a, M4, M4a, M6]
milestones_partial: [M5]           # 프리미티브 CI 검증 완료, AC-WS-019~022는 M8 차단
run_commit_sha: pending-backfill
ac_pass_count: 70                  # ... + M6 3 (AC-WS-026, 027, 028)
ac_blocked: 4                      # AC-WS-019~022 — M8 IPC 부재로 실행 시 공허 통과
ac_fail_count: 0
requirements_pass:
  m1: 20
  m1a: 3
  m2: 8
  m3: 7
  m4: 10
  m4a: 1
  m5: 1
  m6: 2                            # REQ-WS-025, 026
new_warnings_or_lints_introduced: 0
typecheck: "tsc --build && tsc --noEmit -p tsconfig.test.json → exit 0"
lint: "eslint . --ext .ts,.tsx → exit 0"
test: "vitest run → 192 files / 2103 tests passed"
e2e: "CI(PR #10) 206 passed / 0 failed / 9 skipped"
coverage_command: "pnpm test:coverage"
coverage_gate: "statements/lines 85%, perFile → exit 0"
coverage_new_modules:
  src/editor/minimalDiff.ts: "100% stmts / 90.9% branch"
  src/editor/applyExternalChange.ts: "100% stmts / 100% branch"
  src/editor/compositionGate.ts: "100% stmts / 100% branch"
  electron/changeConfirmation.ts: "96.55% stmts / 100% branch"
  electron/watchScope.ts: "100% stmts / 96% branch"
  electron/projectDiscovery.ts: "100% stmts / 100% branch"
  shared/reconciliation.ts: "100% stmts / 97.5% branch"
legacy_debt_files: 97
undo_decision: >
  isolateHistory('full'). addToHistory:false는 조정을 되돌릴 수 없게 만들고,
  기본값은 직전 타이핑과 병합돼 Cmd+Z 한 번이 사용자 작업까지 날린다.
  full은 이력에 남기되 어느 항목과도 병합되지 않는다.
diff_algorithm_evidence: >
  접두·접미 축약만으로 측정: 양 끝 6자가 바뀐 400자 문서에서 397자 단일 교체
  (10배 과다). 다지점 변경에서 REQ-WS-026 위반. 단일 지점 변경은 축약만으로
  이미 정확했으므로 줄 LCS 확장은 다지점 전용. MAX_DIFF_CELLS 초과 시 단일 교체.
blockers:
  - "AC-WS-019~022: external-change IPC 부재(M8). 실행하면 공허 통과하므로 test.skip 유지"
newly_required_not_yet_met:
  - "AC-WS-070 / REQ-WS-056 (M1 배정): 읽을 수 없는 bibliography 폴백 시 보고 의무 — 현재 조용히 폴백, 미충족"
  - "AC-WS-031b (M2 배정): 사라짐 해제 불가 + 배너 해제 가능 대조 — 구현은 만족하나 대조 검사 없음"
stubbed_producers:
  - "IPC·메뉴 진입점(REQ-WS-047a / AC-WS-058b)은 M8 소관"
  - "main→렌더러 확정 이벤트 전달은 M8 소관 — 실행자는 렌더러 안쪽까지 연결됨"
  - "open-diff effect의 표면은 SPEC-4 소관 — 실행자가 의도적으로 무시한다"
total_run_phase_files: 39
```

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_

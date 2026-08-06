---
id: SPEC-V03-WORKSPACE-001
title: "진행 기록 — v0.3 워크스페이스 골격"
version: "0.2.1"
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
| AC-WS-008 | 010 | PASS | `projectFolders.test.ts` — 재정의된 경로를 사용한다 |
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
| AC-WS-043 | 040 | PASS (부분) | `workspaceManifest.test.ts` — 키 부재 시 null 반환(walk-up 위임). walk-up 결과 동일성은 M3 |
| AC-WS-055 | 039 | PASS | `workspaceManifest.test.ts` — 인라인 엔트리 매핑·시퀀스 모두 스키마 위반 |
| AC-WS-044 | 041 | PASS | `manuscriptMetadata.test.ts` — 프로젝트 없이 3값 반환 |
| AC-WS-045 | 042 | PASS | `manuscriptMetadata.test.ts` — 무음 대체 + 입력 불변 |
| AC-WS-046 | 043 | PASS | `manuscriptMetadata.test.ts` — 본문 바이트 diff 0 |
| AC-WS-047 | 044 | PASS | `manuscriptMetadata.test.ts` — `shared/` 전수 스캔, 위반 0 |

M1 범위 밖(미착수): AC-WS-001~006, 010~037, 048~051, 056~060, 066 — M2~M8 소관.

## §E.3 Run-phase Audit-Ready Signal

```yaml
run_status: in-progress          # M1 완료, M2~M8 미착수
milestone_complete: M1
run_commit_sha: 5b55216
ac_pass_count: 25                # M1 범위 AC (AC-WS-043은 부분 PASS)
ac_fail_count: 0
requirements_in_scope: 20        # REQ-WS-001,002,003,009,010,034~044,050~053
requirements_pass: 20
new_warnings_or_lints_introduced: 0
typecheck: "tsc --build && tsc --noEmit -p tsconfig.test.json → exit 0"
lint: "eslint . --ext .ts,.tsx → exit 0"
test: "vitest run → 183 files / 1914 tests passed"
coverage_new_modules:            # v8, tests/shared 범위
  yamlKeyRange.ts: "96.96% stmts / 91.83% branch"
  projectFolders.ts: "100% stmts / 100% branch"
  workspaceManifest.ts: "100% stmts / 97.29% branch"
  manuscriptMetadata.ts: "100% stmts / 96.49% branch"
  frontMatterFenced.ts: "100% stmts / 100% branch"
coverage_tooling_note: >
  저장소에 커버리지 프로바이더가 설치되어 있지 않다(@vitest/coverage-v8 부재).
  위 수치는 임시 설치 후 측정하고 package.json / pnpm-lock.yaml을 원복해 얻었다.
  C-5의 85% 목표를 CI에서 상시 검증하려면 의존성 추가 결정이 필요하다.
total_run_phase_files: 7         # 신규 4 + 수정 3 (테스트 4 별도)
```

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_

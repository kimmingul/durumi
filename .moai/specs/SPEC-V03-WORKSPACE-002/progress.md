---
id: SPEC-V03-WORKSPACE-002
title: "진행 기록 — v0.3 멀티패널 셸"
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
tags: "progress, multipanel, plan-phase, audit-ready"
---

# 진행 기록 — SPEC-V03-WORKSPACE-002

> **섹션 문자·토큰 보존 경고.** `§E.1` / `§E.2` / `§E.3` / `§E.4` 헤딩 토큰과 `sync_commit_sha` 필드명은 era 분류 엔진이 문자열로 매칭한다. 이름을 바꾸면 이 SPEC이 조용히 오분류된다. **헤딩과 필드명을 개정하지 말 것** — 내용만 채운다.
>
> **소유 경계.** `§E.1`은 manager-spec(plan 단계), `§E.2`·`§E.3`은 manager-develop(run 단계), `§E.4`는 manager-docs(sync 단계)가 채운다. `§F`는 오케스트레이터가 첫 run-phase spawn 전에 채운다. 이 문서의 plan 단계 판은 `§E.1`만 채우고 나머지는 자리표시자로 남긴다.

---

## §E.1 Plan-phase Audit-Ready Signal

```yaml
plan_status: audit-ready
plan_complete_at: 2026-08-08
tier: L
artifacts:
  - spec.md         # 요구사항 59개 (REQ-PANEL-070~073 + 070a + 001~065)
  - plan.md         # 확정 결정 + 미해결 결정 9건(OQ-1~OQ-9) + 마일스톤 M0~M8
  - acceptance.md   # Given/When/Then AC 92개 (AC-PANEL-001~095)
  - design.md       # 설계 결정 + 기각된 대안 (Tier L)
  - research.md     # 코드베이스 조사 8영역 + 위험 목록 (Tier L)
  - progress.md     # 이 문서
plan_artifact_commits:
  - 310c04d  # 판 0.1.0 — plan 단계 아티팩트 5파일
  - 637398d  # AC 항목 수 정정
  - 88baf2d  # 판 0.2.0 — 출하 중인 결함 2건을 M0으로 승격
  - 6545480  # 판 0.2.1 — OQ-8 기계 재현 반영 + progress.md 신설
  - 91a0e1f  # 판 0.3.0 — OQ-1·2·5·6 확정, 논거 5건 정정
  - fdd6b66  # 판 0.3.1 — Plan Audit FAIL 대응 (Blocking 4 + Medium/Low 11)
blocking_decisions:
  total: 9
  confirmed: [OQ-1, OQ-2, OQ-5, OQ-6]       # 외부 검토 2인 + 사용자 승인 (2026-08-08)
  open: [OQ-3, OQ-4, OQ-7, OQ-8, OQ-9]
  m0_blocked_by: none          # M0은 결정 무의존 — 즉시 착수 가능
  m1_blocked_by: none          # OQ-1·OQ-2 확정으로 해제
  m2_blocked_by: [OQ-7]        # 탭 축이 레이아웃 형태를 규정
  m3_blocked_by: [OQ-8]        # 창 축 AC 범위 (핵 결함은 M0이 닫음)
  m4_blocked_by: [OQ-3, OQ-4]
  m5_blocked_by: none          # OQ-6 확정으로 해제
  m6_blocked_by: none          # OQ-6 확정으로 해제
  m7_blocked_by: none          # OQ-5 확정으로 해제
  m8_blocked_by: [OQ-9]
external_review:
  reviewers: [codex, grok]     # 2인 수렴 — 3인이 아니다
  gemini: ineligible           # IneligibleTierError, Antigravity 리디렉트(CLI 없음)
reproduction_first_milestone: M0
```

### §E.1a 계획 요약

| 항목 | 값 |
|---|---|
| 요구사항 | **59개** (`REQ-PANEL-070~073` + `070a` = 출하 중인 결함, `001~065` = 기능) |
| 수용 기준 | **92개** (`AC-PANEL-001~095`) |
| 마일스톤 | **M0**(출하 중인 결함 재현 우선) → M1~M8 |
| 결정 | **확정 4건**(OQ-1·2·5·6) / 미해결 5건(OQ-3·4·7·8·9) — `plan.md` §A.2 |
| 제약 | 13건 (`spec.md` §C C-1~C-13) |

### §E.1b M0을 최우선에 둔 근거 (plan 단계 확정 사항)

M0은 v0.2.31에 **이미 출하된** 결함 두 건을 닫는다. 기능 마일스톤보다 앞서고, **어떤 미해결 결정에도 의존하지 않으므로 승인 대기 중에도 착수 가능**하다.

| 결함 | 요구 | 검증 상태 |
|---|---|---|
| 무성 버퍼 덮어쓰기 — 경로 미대조로 열지도 않은 파일의 내용이 깨끗한 버퍼에 적용되고 조정 상태가 `idle`로 정착 | REQ-PANEL-070 | **렌더러 절반 기계적 재현 완료.** 증거: `.moai/state/verify/goal-spec12345/oq8-repro.log`, `…/oq8-repro-source.ts.txt`. main 절반(`getAllWindows()` 브로드캐스트)은 정적 소스 사실이며 **실행하지 않았다** |
| 전역 조합 플래그 공유 — 다른 표면의 `compositionend`가 진행 중인 조합의 보류를 해제 | REQ-PANEL-071 | **코드 직독 확정, 실행 재현 미수행.** M0의 RED 단계(AC-PANEL-081)가 처음 재현하게 된다 |

### §E.1b-1 확정된 4개 결정 (2026-08-08)

| 결정 | 확정 내용 | 논거 상태 |
|---|---|---|
| OQ-1 | 중앙 영역 분할 (사이드바 보존) | **논거 교체** — 소유권 분리(전역 저작 표면 vs 문서 국소). 초판의 "폭 SSOT 유출"·"테스트 841줄" 논거 철회 |
| OQ-2 | 축 분리 유지 + **v0.3 dual-open 금지**(v0.4 연기) + revision 파생 dirty | 검토 반론을 우회가 아니라 **해소**. `design.md:57` 정정, §2.5에 v0.4 5개 의무 기록 |
| OQ-5 | 트리를 신뢰 범위로 좁혀 표시 · **동의 배너 기각** | 내 잠정 권고(후보 2) 기각됨. main 다이얼로그를 통과하지 않는 동의는 자동 승격 |
| OQ-6 | (i) 채널 분리 **3겹**(분리+main 검증+import 부재) · (ii) **(B′)** 보조 파일 EOL 복원 | (i) "분리만으로 표현 불가능" 주장 정정. (ii) 내 Residual-risk 과장 — 기존 코드·테스트가 이미 이 모델을 문서화·증명 |

**신규 요구 5건이 확정에서 파생되었다**: REQ-PANEL-011a(별칭 한계), 015(revision 파생 dirty), 036b/036c(트리 신뢰 범위 + 읽기 표면 구속), 044a(세 쓰기 진입점), 048/048a(EOL + 탐지 정책), 065(사이드바 재배선).

라우팅 계층의 **위치는 선택 사항이 아니다**: `tests/electron/extensionIndependence.test.ts:34-65`(조정 코어 5파일의 확장자 판독 수단 부재) + `:171-174`(`applyExternalChange` arity 2)가 강제하므로 라우팅 키는 `src/store/` 계층에 산다 — REQ-PANEL-072 / C-12 / `design.md` §6.2a.

### §E.1b-2 Plan Audit Gate 이력

| 판 | 결과 | 조치 |
|---|---|---|
| 0.3.0 | **FAIL, 총계 0.75** (Tier L 임계 0.85). Clarity 0.78 / Completeness 0.72 / Testability 0.72 / Traceability 0.78. must-pass 7항목 전부 통과 — 실패는 총계이며 Blocking-M0 4건이 원인 | 0.3.1에서 4건 + Medium/Low 11건을 아티팩트 편집으로 해소. **새 결정은 필요하지 않았다** |

**Blocking-M0 4건과 그 해소**:

| # | 지적 | 해소 |
|---|---|---|
| D1 | 라우팅 키가 마운트 시점 경로에 고착 — 재키잉 의무 부재 | REQ-PANEL-070a 신설 + AC-PANEL-080e + `design.md` §6.2a에 주입된 setter 클로저와 `filePath` 결속 명시 |
| D2 | AC-PANEL-080b가 **반증 불가능** — `'idle'`이 세 시점 모두의 값 | 전이 관측(리듀서 호출 횟수 + 상태 객체 참조 동일성 + Map 항목 부재)으로 재작성. REQ-PANEL-070 조항도 수정 |
| D3 | **"dirty 경로는 이미 올바르게 동작한다"가 거짓** — dirty 문서는 배너 클릭 1회 뒤 오염 | AC-PANEL-080c 전면 재작성(`pending` 오염 + 배너 동작 단언), `spec.md` 영향 범위 표 정정, `research.md` §7.3a-3 신설 |
| D4 | `compositionGate.detach()`가 `composing`을 영구 latch — 어느 요구에도 없었다 | REQ-PANEL-071에 detach 해제 의무 + AC-PANEL-081b 신설. 스케줄러는 PRESERVE 유지 |

**D3·D4는 감사가 기계 재현했다** — 증거 `.moai/state/verify/goal-spec12345/d3d4-repro.log`, `…/d3d4-repro-source.ts.txt`. `research.md` §10.0 등급 표에서 두 항목을 코드 직독 → **기계 재현**으로 승격했고, **그 둘만 올렸다**(나머지 코드 직독 항목은 그대로).

**Medium/Low 11건**: D5(§6.2b의 "이미 계산된 boolean" 오진술 + OR 억제 의무) / D6(REQ-PANEL-036c 미커버 → AC-PANEL-036d 신설) / D8(OoS 개수 7→9) / D9(요구 수 자기모순 + 커밋 누락) / D10(REQ-PANEL-072 근거 과장) / D11(AC-PANEL-082 예외 철회) / D12(⟨OQ-8⟩ 표시 범위 축소) / D13(AC-PANEL-080d를 쓰기 채널 값 단언으로) / D14(선언 순서) / D15(REQ-PANEL-043b 오인용).

**감사가 확인해 준 것 (유지)**: 라우팅 키의 `src/store/` 배치는 옳다(주입된 setter가 승인된 메커니즘) · SPEC-1 D-2/D-3/D-6과 `EPIC:34`에 모순 없음 · 4개 사용자 결정이 모두 요구로 표현됨 · 검증 등급 기록이 "대체로 매우 정직" · **어떤 미해결 결정도 M0을 막지 않는다**(막은 것은 M0 자신의 명세 결함이었다) · `↔ C-` 6건 카운트는 정확했다(감사 초기 7건 지적은 철회됨).

### §E.1c plan 단계 자기 검증 (실행 관측)

| 항목 | 명령 | 결과 |
|---|---|---|
| 보호 경로 무변경 | `git diff HEAD --name-only -- .moai/specs/SPEC-V03-WORKSPACE-001/ src/ electron/ shared/ tests/ e2e/ docs/` | 출력 없음 |
| 원칙 문서 불변식 (C-9) | `git diff --quiet -- docs/DOCUMENT_MODE_PRINCIPLES.md` | exit 0 |
| 조정 코어 테스트 무변경 (C-12) | `git diff --quiet -- tests/electron/extensionIndependence.test.ts` | exit 0 |
| frontmatter 스키마 | canonical 12필드 + `tier` + `depends_on`, snake_case 별칭 0건 | PASS |
| spec-lint 헤딩 규약 | `### Out of Scope —` h3 하위 섹션 **9개**, 각각 `-` bullet 보유 | PASS |

**미검증 (정직한 공백)**: `pnpm test` / `pnpm typecheck` / `pnpm lint`는 plan 단계에서 실행하지 않았다. baseline(199 테스트 파일 / 33 e2e spec)은 오케스트레이터 제시값을 전제로 삼았고 파일 수만 실측했다. spec-lint 도구는 이 저장소에 없어 헤딩 규약은 SPEC-1의 통과 형태 복제로 달성했다.

---

## §E.2 Run-phase Evidence

_<pending run-phase>_ — manager-develop이 채운다. M0의 RED 실패 출력과 GREEN 통과 출력 양쪽이 여기 기록된다(REQ-PANEL-073).

---

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_ — manager-develop이 채운다.

---

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_ — manager-docs가 채운다.

```yaml
sync_commit_sha: <pending sync-phase>
```

---

## §F Phase 4 Mode Selection

_<pending — 오케스트레이터가 첫 run-phase `Agent()` spawn 전에 채운다>_

> 섹션 문자 예약용 자리표시자다. `§E.*` 네임스페이스는 era 분류 엔진이 파싱하므로 Mode Selection이 그것을 재사용해서는 안 된다. 내용 계약은 `.claude/rules/moai/workflow/orchestration-mode-selection.md` §D가 소유한다.

---

## §G 참조

- `spec.md` / `plan.md` / `acceptance.md` / `design.md` / `research.md` — 동일 디렉터리
- `.moai/specs/EPIC-V03-WORKSPACE.md` — Epic 개요
- `.moai/specs/SPEC-V03-WORKSPACE-001/` — 선행 SPEC (`status: completed`)
- `docs/v0.3-signoff.md` — SPEC-1 sync 종결 감사
- `.moai/state/verify/goal-spec12345/` — OQ-8 재현 증거 (로그 + 소스)

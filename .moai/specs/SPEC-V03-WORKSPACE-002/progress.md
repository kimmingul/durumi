---
id: SPEC-V03-WORKSPACE-002
title: "진행 기록 — v0.3 멀티패널 셸"
version: "0.3.11"
status: in-progress
created: 2026-08-08
updated: 2026-08-10
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
  - spec.md         # 요구사항 62개 (REQ-PANEL-070~073 + 070a·070b·071a + 001~065, 005a 포함)
  - plan.md         # 결정 10건 OQ-1~OQ-10 (확정 6 / 미해결 4) + 마일스톤 M0~M8
  - acceptance.md   # Given/When/Then AC 97개 (AC-PANEL-001~095 + 005a·005b)
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
  - 2541727  # progress.md 커밋 SHA 백필
  - 9417ec0  # 판 0.3.2 — D7 실질 해소 + F1~F14
  - 7e5ca6f  # progress.md 커밋 SHA 백필
  - 0da38ed  # 판 0.3.3 — High 3건 (N1 배정 축 / N2 예외 / N3 뷰 준비)
  - 8ff7f3d  # progress.md 커밋 SHA 백필
  - 710ba13  # 판 0.3.4 — N11~N15 복원 + 배정 도출 미검토 명시 (기록 전용)
  - 94266c2  # progress.md 커밋 SHA 백필
  - bd1ece5  # 판 0.3.5 — R1~R5
  - 040df4a  # progress.md 커밋 SHA 백필
  - 92d621d  # 판 0.3.6 — R2 정정 + R7~R9 + 규약 + 외부 주장 전수 (plan 단계 최종판)
  - e569d05  # progress.md 커밋 SHA 백필
  - aaacd35  # 판 0.3.7 — revision 메커니즘 정정 + 등급 승격 2건 (M1 되먹임, 기록 전용)
  - d1b3866  # progress.md 커밋 SHA 백필
  - 9f5c3da  # 판 0.3.8 — 규약에 분석적 귀결/전제 구분 추가
  - ddeae2d  # progress.md 커밋 SHA 백필
  - 9321b0a  # 판 0.3.9 — 앵커 만료(003b) + §C.0 세 번째 조항(판정 대상의 생산자)
  - 2543ea0  # progress.md 커밋 SHA 백필
  - 15456c9  # 판 0.3.10 — REQ-005a 진입점 + AC-005a/005b + §C.0 네 번째 조항(도달)
  - 1b64c86  # progress.md 커밋 SHA 백필
  - ef7dfcf  # 판 0.3.11 — OQ-3·OQ-4 확정 + 계획 인용 정정 2건 (정정 A·B)
  - cc61048  # 판 0.3.11 보완 — OQ 개수 자기모순 3곳 + research.md 판 표기 (판 수 미상승)
blocking_decisions:
  total: 10
  confirmed: [OQ-1, OQ-2, OQ-5, OQ-6, OQ-3, OQ-4]   # OQ-1·2·5·6: 외부 검토 2인 + 사용자 승인 (2026-08-08) / OQ-3·4: 사용자 결정 (2026-08-10, 판 0.3.11)
  open: [OQ-7, OQ-8, OQ-9, OQ-10]
  m0_blocked_by: none          # M0은 결정 무의존 — 즉시 착수 가능
  m1_blocked_by: none          # OQ-1·OQ-2 확정으로 해제
  m2_blocked_by: [OQ-7]        # 탭 축이 레이아웃 형태를 규정
  m3_blocked_by: [OQ-8]        # 창 축 AC 범위 (핵 결함은 M0이 닫음)
  m4_blocked_by: none          # 판 0.3.11에서 OQ-3(후보 1)·OQ-4(후보 1) 확정으로 해제
  m5_blocked_by: [OQ-10]       # OQ-6은 해제됐으나 REQ-042 allowlist 전환으로 24항목 전수 분류가 새 전제
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
| 요구사항 | **62개** (`REQ-PANEL-070~073` + `070a`·`070b`·`071a` = 출하 중인 결함, `001~065` = 기능. 판 0.3.10에서 `005a` 신설) |
| 수용 기준 | **97개** (`AC-PANEL-001~095` + 판 0.3.10 신설 `005a`·`005b`) |
| 마일스톤 | **M0**(출하 중인 결함 재현 우선) → M1~M8 |
| 결정 | **확정 6건**(OQ-1·2·**3**·**4**·5·6) / 미해결 4건(OQ-7·8·9·**10**) — `plan.md` §A.2. OQ-3·OQ-4는 판 0.3.11에서 확정(둘 다 후보 1)되어 M4가 차단 해제되었다. OQ-10은 판 0.3.6 전수 실측에서 파생(extension 3항목의 층 귀속, M5 진입 전 확정) |
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
| 0.3.1 | **FAIL, 총계 0.85 — 임계 도달** (Clarity 0.84 / Completeness 0.84 / Testability 0.82 / Traceability 0.90), must-pass 7항목 전부 통과, 15건 중 11건 완전 해소. **실패 사유는 점수가 아니라 Retry Loop Contract의 회귀 규칙** — iteration-1 D7이 모든 아티팩트에서 미기재 | 0.3.2에서 D7 실질 해소(REQ-PANEL-006 `shall not` + AC-PANEL-006c + OQ-9 후보 무관 조건) + F1~F14 해소. 감사 판정: **"M0 실질은 견고하다"** |
| 0.3.2 | **FAIL, 총계 0.83.** must-pass 7항목 통과. 세 규칙 각각으로 실패 — 회귀 규칙(D11 부분 해소) / 단독 차단 신규 지적(N1) / 총계 미달. **0.85 → 0.83은 정체가 아니다**: iteration 2가 Gaps에 `plan.md` §B·§C M3-M8·§D·§E와 `design.md` §4·§6.4-6.5·§7 미독을 공시했고 **신규 차단 지적이 전부 그 구간에서 나왔다** — 아티팩트가 나빠진 게 아니라 감사 표면이 넓어졌다 | 0.3.3에서 High 3건(N1·N2·N3) 처리. Medium/Low(N4~N15)는 사용자 결정으로 이월(§E.1b-3에 기록) |
| 0.3.3 | (재감사 대기 — 델타 + 배정 점검 결과 제출) | 0.3.4는 **기록 전용**(N11~N15 원문 복원 + 배정 도출의 미검토 상태와 반증 조건 4건 명시) |
| 0.3.4 | **FAIL, 총계 0.86 — 임계 초과.** 실패는 점수가 아니라 **회귀 규칙 단독**: R1(철회한 허가가 다른 말로 §A.5에 생존) | 0.3.5에서 R1~R5 전부 해소 |
| 0.3.5 | **FAIL, 총계 0.85** (Testability 0.82 → 0.78, 신규 지적 반영). 임계는 유지, 판정은 여전히 **R1 단독**. 추가 지적 R7(Major)·R8·R9 + **R2 지시 오류** + 다섯 번째 반증 조건 부재 | 0.3.6에서 전부 해소. **사용자 결정: 다섯 번째 감사를 돌리지 않고 M0 착수** |

**Blocking-M0 4건과 그 해소**:

| # | 지적 | 해소 |
|---|---|---|
| D1 | 라우팅 키가 마운트 시점 경로에 고착 — 재키잉 의무 부재 | REQ-PANEL-070a 신설 + AC-PANEL-080e + `design.md` §6.2a에 주입된 setter 클로저와 `filePath` 결속 명시 |
| D2 | AC-PANEL-080b가 **반증 불가능** — `'idle'`이 세 시점 모두의 값 | 전이 관측(리듀서 호출 횟수 + 상태 객체 참조 동일성 + Map 항목 부재)으로 재작성. REQ-PANEL-070 조항도 수정 |
| D3 | **"dirty 경로는 이미 올바르게 동작한다"가 거짓** — dirty 문서는 배너 클릭 1회 뒤 오염 | AC-PANEL-080c 전면 재작성(`pending` 오염 + 배너 동작 단언), `spec.md` 영향 범위 표 정정, `research.md` §7.3a-3 신설 |
| D4 | `compositionGate.detach()`가 `composing`을 영구 latch — 어느 요구에도 없었다 | REQ-PANEL-071에 detach 해제 의무 + AC-PANEL-081b 신설. 스케줄러는 PRESERVE 유지 |

**D3·D4는 감사가 기계 재현했다** — 증거 `.moai/state/verify/goal-spec12345/d3d4-repro.log`, `…/d3d4-repro-source.ts.txt`. `research.md` §10.0 등급 표에서 두 항목을 코드 직독 → **기계 재현**으로 승격했고, **그 둘만 올렸다**(나머지 코드 직독 항목은 그대로).

**Medium/Low 11건**: D5(§6.2b의 "이미 계산된 boolean" 오진술 + OR 억제 의무) / D6(REQ-PANEL-036c 미커버 → AC-PANEL-036d 신설) / **D7**(REQ-PANEL-006이 OQ-9의 D-6/C-4 조건을 담지 않음 — 아래 참조) / D8(OoS 개수 7→9) / D9(요구 수 자기모순 + 커밋 누락) / D10(REQ-PANEL-072 근거 과장) / D11(AC-PANEL-082 예외 철회) / D12(⟨OQ-8⟩ 표시 범위 축소) / D13(AC-PANEL-080d를 쓰기 채널 값 단언으로) / D14(선언 순서) / D15(REQ-PANEL-043b 오인용).

**D7 기록 누락에 대한 정직한 고지 (판 0.3.2에서 해소)**: 판 0.3.1은 "Medium/Low 11건"이라 적고 **10건만 열거했다** — 빈 슬롯이 D7이었다. iteration-1 보고서가 디스크에 보존되지 않아 그 항목을 복원할 수 없었고, 재감사는 그것을 실질 실패로 단정하지 않고 **UNVERIFIED로 표시**했다. 오케스트레이터가 원문을 제공해 판 0.3.2에서 해소했다.

**D7의 실질 내용과 해소**: `plan.md` §A.2 OQ-9은 "`panels` 경로를 `pathGuard` 신뢰 소스로 쓰지 않는다는 것을 **함께 확정해야 한다**"고 적었으나 **REQ-PANEL-006에 그 금지가 없었다.** 이것은 OQ-5와 **같은 공격 형태**다 — persist된 패널 경로가 신뢰 판정의 입력이 되면 손상된 렌더러가 `prefs:set`으로 임의 경로를 심어 스스로 신뢰를 넓힌다. 게다가 `prefs:set` 가드는 `workspaceFolders`/`recentFiles`/`recentFolders` **세 필드만** 검사하므로(`electron/pathGuard.ts:188`) 신규 `panels` 필드는 **기본적으로 검사 밖이다.** → REQ-PANEL-006에 `shall not` 조항 추가(C-4 · SPEC-1 D-6 인용) + AC-PANEL-006c 신설 + OQ-9 후보 표에 "어떤 prefs 슬롯이든 신뢰 판정에서 **구조적으로 제외**되어야 한다"는 조건 명시.

**감사가 확인해 준 것 (유지)**: 라우팅 키의 `src/store/` 배치는 옳다(주입된 setter가 승인된 메커니즘) · SPEC-1 D-2/D-3/D-6과 `EPIC:34`에 모순 없음 · 4개 사용자 결정이 모두 요구로 표현됨 · 검증 등급 기록이 "대체로 매우 정직" · **어떤 미해결 결정도 M0을 막지 않는다**(막은 것은 M0 자신의 명세 결함이었다) · `↔ C-` 6건 카운트는 정확했다(감사 초기 7건 지적은 철회됨).

### §E.1b-2a 감사 보고서 경로 (R5)

이월 항목의 **요약이 아니라 원문**에 도달할 수 있게 경로를 남긴다. 판 0.3.4까지 어떤 아티팩트도 감사 보고서를 참조하지 않았다(`grep 'plan-audit|review-'` → 0).

| 반복 | 보고서 | 판정 |
|---|---|---|
| 1 | `.moai/reports/plan-audit/SPEC-V03-WORKSPACE-002-review-1.md` | FAIL 0.75 — D1~D15 |
| 2 | `.moai/reports/plan-audit/SPEC-V03-WORKSPACE-002-review-2.md` | FAIL 0.85(임계 도달, 회귀 규칙) — F1~F14 |
| 3 | `.moai/reports/plan-audit/SPEC-V03-WORKSPACE-002-review-3.md` | FAIL 0.83 — N1~N15 |
| 4 | `.moai/reports/plan-audit/SPEC-V03-WORKSPACE-002-review-4.md` | FAIL 0.86(임계 초과, 회귀 규칙) — R1~R5 |

**도달성의 정확한 상태 (실측)**: 이 경로들은 **gitignore 대상은 아니지만**(`git check-ignore` exit 1) **커밋되지도 않았다** — `git ls-files .moai/reports/plan-audit/` → **0건**, `git status`에 `?? .moai/reports/`로 남아 있다. Section D가 이 디렉터리를 커밋 금지 스캐폴딩으로 지정했으므로 이 SPEC이 커밋하지 않는다.

**따라서 `.moai/state/verify/`의 재현 증거와 같은 한계를 갖는다**: 이 기계에서는 읽히지만 **새 클론에는 없다.** 그것이 §E.1b-3의 N11~N15를 **포인터가 아니라 원문 인라인으로** 복원한 이유이며, 감사도 인라인이 포인터보다 강하다고 판정했다. 이 표는 **전체 findings에 도달하기 위한 보조 수단**이지 보존 수단이 아니다 — 보존은 인라인이 한다.

### §E.1b-3 이월된 감사 지적 (판 0.3.3 시점 미해소 — 다음 패스 대상)

> **D7이 기록 없이 사라져 복원 불가가 된 전례가 있으므로**(§E.1b-2) 이월 항목은 심각도와 함께 **전부 남긴다.** 사용자 결정으로 iteration 3에서는 High 3건(N1·N2·N3)만 처리하고 아래는 M0을 막지 않으므로 이월했다.

| # | 심각도 | 내용 |
|---|---|---|
| N4 | Medium | `design.md` §2.4가 "같은 파일의 중복 열기를 금지한다"를 **기각된 대안으로** 열거하는데 OQ-2가 그것을 **채택**했다. 기각 사유도 어느 흐름이 막히는지 잘못 지목한다 |
| N5 | Medium | `acceptance.md` §I.3의 OQ-9 행이 `panels` 신뢰 금지를 "후보가 **추가할** 것"으로 기술 — D7이 후보 무관 조건으로 만들었고 AC-PANEL-006c가 이미 있다 |
| N6 | Low | 마운트 deps `[]`는 `:175`이며 `:176`이 아니다. 그 외 off-by-one 범위 3건 |
| N7 | Low | `design.md:591`이 직렬화 주석을 `applyExternalChange.ts:51-52`로 인용 — 실제 `:82-83`. 내용은 일치하고 위치만 30줄 어긋난다 |
| N8 | Medium | `AC-PANEL-080f`의 Save As When이 `file:saveAs`(**세 번째 브리지**)에 닿아 D13이 고정한 밀폐 범위를 넘는다 — **D13과 같은 형태가 새 AC에서 재발** |
| N9 | Low | `design.md` §2 선언 순서 §2.4a → §2.5 → §2.4 |
| N10 | Low | `AC-PANEL-092`의 "85% 목표를 **향하며**"는 이진 판정이 아니다 |
| N11 | Nit | `REQ-PANEL-070b`가 `(Where)`로 라벨되어 있으나 GEARS 정의상 `While`이 맞다. 감사는 이것을 결함이 아니라 **SPEC 자체 라벨링 관례의 드리프트**로 읽었고 **MP-2 실패로 계수하지 않았다** |
| N12 | Nit | `AC-PANEL-006c`의 `⟨OQ-9⟩` 주석이 "판정 문구는 어느 후보에서도 동일하다"고 적는데 **후보 3(persist 자체를 하지 않음)을 빠뜨렸다** — 그 후보에서는 `REQ-PANEL-006`이 사라지므로 이 AC는 판정 대상이 없어진다 |
| N13 | Nit | `AC-PANEL-080e`가 등록이 `[]`-deps effect로 "**옮겨졌다**"고 기술 — 등록은 **이미 거기 있으므로** 일어나지 않는 이동을 함의한다 |
| N14 | Nit | `acceptance.md:755-756`, `:762-763` 서식 잔재 |
| N15 | Nit | `AC-PANEL-095`가 `.cm-content` e2e 파일 수 **34를 고정값으로 단언**한다. `research.md` §10 4b가 이미 34는 `grep -rl`로 얻은 **상한**이라고 공시했으므로, **AC가 그 뒤의 측정보다 강한 주장을 한다** |

#### R1~R5 처분 (판 0.3.5에서 전부 해소)

| # | 심각도 | 처분 |
|---|---|---|
| **R1** | High | **해소 — 네 번째 시도에서 확정.** `plan.md` §A.5의 "등록 방식은 바뀐다 — arity 단언 대상이 아니다"를 삭제하고 "무변경이다 — 예외 없다"로 교체. **D11 → N2 → R1이 세 번 살아남은 이유는 철회한 문장을 지웠을 뿐 같은 허가를 다른 말로 주는 문장이 남았기 때문**이며, R1은 "예외"라는 단어를 쓰지 않아 문구 검색을 통과했다. `design.md` §6.2a-1에 그 3단계 이력과 **검색 질문의 형태**를 기록했고, §6.2a 표의 `허용` 열 이름을 **"이미 있는 것 — 파일 밖에서 쓴다 (편집 허가가 아니다)"** 로 바꿔 오독 표면을 없앴다. `design.md:423`의 "무변경일 **수 있다**"도 "무변경이다"로 조였다 — 가능성 표현이 같은 여지를 남긴다 |
| **R2** | Medium | **해소.** `AC-PANEL-001`·`011`을 M1 → **M2**로 이동. 둘 다 렌더된 편집 표면(캐럿·선택·스크롤·실행 취소 / `EditorView` 인스턴스 수·오류 표시 부재)을 요구하는데 M1 밀폐성은 "편집 표면 없이 검증 가능"이다. **AC-013은 이동하지 않았다**(스토어+스파이로 판정 가능, 감사가 후보에서 철회). **개수 불일치를 기록한다**: 지시는 4건이었으나 M1의 AC 10건을 Given/When으로 개별 검사한 결과 **표면 요구는 2건**이었고, 개수를 맞추려 추가 이동하지 않았다 |
| **R3** | Medium | **해소 — 의미 확정이 곧 수정이었다.** "마운트되면"은 **React 컴포넌트 마운트가 아니라 등록 생명주기의 시작점**을 뜻했다. 문구를 "뷰가 준비되면"으로 바꾸고, M0 유닛 판정에서는 **주입된 `DispatchTarget`의 준비 신호**가 그 시점임을 AC와 `design.md` §6.2a 양쪽에 적었다 — 밀폐성 선언과 충돌하지 않는다 |
| **R4** | Low | **해소.** `REQ-PANEL-073`을 `AC-PANEL-080`·`081`의 `↔`에 추가했다 — 두 AC의 `RED 선행 (필수)` 절이 그 요구를 실제로 판정하는 지점이다. `:27`이 `↔`를 대응의 유일 근거로 선언하므로 산문 커버리지만으로는 부족했다 |
| **R5** | Low | **해소 (한계 명시 포함).** §E.1b-2a에 감사 보고서 4건의 경로를 남겼다. 다만 **실측 결과 커밋되지 않은 상태**(`git ls-files` 0건)이므로 `.moai/state/verify/`의 증거와 같은 도달성 한계를 갖는다 — **보존은 N11~N15 인라인 복원이 하고 이 표는 보조 수단이다** |

#### R2 정정 · R7~R9 처분 (판 0.3.6 — 델타 재감사 추가분, 총계 0.85)

> 오케스트레이터의 **R2 지시 절반이 틀렸고 판 0.3.6이 되돌렸다.** 아래 첫 행이 그 기록이다 — 지시를 그대로 따랐다면 새 결함을 만들었을 것이므로 지시-실행 이력 자체를 남긴다.

| # | 심각도 | 처분 |
|---|---|---|
| **R2 정정** | High (신규 결함 방지) | **AC만 옮기는 처방은 orphan을 만든다.** `REQ-PANEL-001`을 검증하는 AC는 `AC-PANEL-001` **하나뿐**이므로 판 0.3.5는 M1에 **AC 0건인 요구**를 남겼다 — 결함 하나를 다른 결함과 맞바꾼 것이다. **`REQ-PANEL-001`도 M2로 함께 이동**했고, `AC-PANEL-011`에는 같은 검사를 적용해 **REQ-PANEL-011이 `AC-PANEL-011a`를 M1에 유지**하므로 이동 불필요임을 확인했다. **분할 기각**: M1 절반을 판정할 새 AC를 만들어야 하고(배정 결함을 고치려 AC 집합을 키운다), 남을 스토어 축 내용은 `REQ-PANEL-010`이 이미 규범으로 담아 중복이 된다 |
| **다섯 번째 반증 조건** | — (축 신설) | 기존 4개 조건이 **전부 AC→마일스톤 변만 감사**했다 — 도출의 두 번째 전제인 **REQ→마일스톤 배정**을 보는 조건이 없었다. 신설: *"어떤 REQ를 검증하는 AC가 전부 그 REQ의 마일스톤 밖 → **REQ 배정이 틀렸다**"*. **실측: 판 0.3.4 = 0건 · 판 0.3.5(AC만 이동) = 1건 · 판 0.3.6 = 0건** — 공허하지 않음이 증명되었다. 이것은 내가 "열거를 다 했다고 보장 못 한다"고 적은 바로 그 부류였다 |
| **R7** | Major | **해소 — 오케스트레이터 측정을 내가 독립 재현했다.** `REQ-PANEL-041`이 `.py`/`.csv`/`.bib`/`.bibtex`/`.json`/`.yaml`을 `@codemirror/language-data`에서 조달한다고 `shall`로 적었으나 **`.csv`·`.bib`·`.bibtex`가 카탈로그에 없다**(143개 언어, "bib" 문자열 0건). 요구 자신의 `shall not`(개별 패키지 금지)과 함께 **통과 불가능한 AC**였다. `.csv`는 REQ-041 열거에서 제거(plan·AC-045가 이미 폴백으로 정확) · `.bib`는 **REQ-PANEL-045 폴백으로 이관 + 한계 명시**(참고문헌 파일이 하이라이팅 없이 열리는 것이 규정된 정상 동작). `.bib → LaTeX/sTeX` 수동 매핑은 기각하되 **가독성을 측정하지 않았음을 함께 적었다** |
| **R8** | Medium | **해소.** `AC-PANEL-036c`의 "제시된 모든 항목은 클릭 시 **실제로 열린다**"를 **"`PathNotAllowedError`가 발생하지 않는다"** 로 좁혔다. 신뢰 트리 필터가 보장하는 것은 경로 허용 판정뿐이고, 신뢰 트리 안의 디코드 불가 파일 하나로 `AC-PANEL-046`("편집 패널을 만들지 않는다")과 동시 성립이 불가능했다. **감사가 조건부로 등급했다는 사실도 함께 적었다** — 트리가 무엇을 제시하는지는 아직 없는 M2 산출물이다 |
| **R9** | Low | **해소.** `AC-PANEL-036c`의 채널 부재 단언이 **의미론적**인데 검사는 리터럴 grep(`trust`/`promote`)이었다 — `allowFolder`·`grantAccess`가 통과한다. 판정을 **(a) 선별기(필요조건, 자동 grep + `allow`/`grant` 추가)** 와 **(b) 판정(충분조건, 수동 — 추가된 채널 전건을 `allowSessionPath`/`allowSessionTree`/`setPreferences` 도달 가능성으로 검사)** 로 나눴다. AC-PANEL-006c의 중복 방어도 기록 |
| **과잉주장 금지 규약** | — (규약 신설) | 같은 계열 지적 **7회**(D2·D13 Blocking + N8·N12·N15·R7·R8) 끝에 규약화. `acceptance.md` 표기 규약이 정본이고 `spec.md` §B가 **요구 축으로 인용**한다 — **R7이 AC가 아니라 요구에서 발생했으므로** AC 작성 시점 점검만으로는 부족했다. 검사 시점은 **마일스톤 진입 시 그 마일스톤의 `대상 AC:` 전건**(95건 전수 일괄이 아니다). 규약은 발명이 아니라 **추출**이다 — AC-011b·036d·048b가 이미 올바른 형태였다 |
| **외부 메커니즘 주장 전수 확인** | — (감사 Gap 1) | `research.md` **§10.1** 신설, 9건 확인. **거짓 1건(R7)** · **불완전 1건(REQ-042의 9항목 열거가 최상위 24항목을 못 덮음 → allowlist 판정으로 전환)** · **부정확 1건("30여 항목"의 세는 방법 미기재)** · 나머지 6건 참(`WIDTH_BOUNDS` main 절반 근거는 보강). **파생 신규 항목 OQ-10** — allowlist 전환으로 24항목 전수 분류가 판정의 전제가 되었는데 `design.md` §5.2가 21항목만 분류하고 있었다 |
| **R6 / N15 계열 의심** | — | **감사가 철회했다.** R6(baseline-timing)은 판 0.3.3 실질로 재귀속, AC-034 의심은 `grep -roh "durumi:[a-zA-Z-]*" src/ | sort -u`가 **정확히 열거된 6개 이벤트**를 돌려주어 철회. **손대지 않았다** |

**N11~N15 내용은 복원되었다** (오케스트레이터가 iteration 3 원문에서 제공, 2026-08-09). 판 0.3.3 시점에는 번호만 있고 내용이 없어 D7과 같은 복원 불가 위험이 있었으나 해소되었다. **이 항목들은 여전히 미해소 이월이며 기록만 완결되었다** — 사용자 결정에 따라 수정하지 않았다.

**다음 패스 우선순위 (권고)**:

1. **N8** (Medium) — D13과 **동일한 결함 형태가 새로 만든 AC에서 재발**했다. 개별 수정보다 **밀폐 범위를 AC 작성 시 기계 점검하는 규약**이 필요하다는 신호다. N1의 배정 축과 같은 계열 — 검사되지 않는 축이 있으면 그 축의 위반은 반복된다.
2. **N15** (Nit이나 성격이 다름) — AC가 근거 측정보다 강한 주장을 하는 형태다. 상한을 고정값으로 단언하는 것은 D2(반증 불가능)·D13(밀폐 범위 초과)과 같은 **"AC가 실제로 지지되는 것보다 많이 주장한다"** 계열이므로, Nit 등급이지만 계열 재발로 볼 여지가 있다.
3. **N12** — 후보 열거 누락. AC의 판정 가능성 주장이 실제보다 넓다는 점에서 N15와 같은 계열.
4. N4·N5 (Medium, 서술 정합) → N11·N13·N14·N6·N7·N9·N10 (라벨·문구·인용·서식).

### §E.1c plan 단계 자기 검증 (실행 관측)

| 항목 | 명령 | 결과 |
|---|---|---|
| 보호 경로 무변경 | `git diff HEAD --name-only -- .moai/specs/SPEC-V03-WORKSPACE-001/ src/ electron/ shared/ tests/ e2e/ docs/` | 출력 없음 |
| 원칙 문서 불변식 (C-9) | `git diff --quiet -- docs/DOCUMENT_MODE_PRINCIPLES.md` | exit 0 |
| 조정 코어 테스트 무변경 (C-12) | `git diff --quiet -- tests/electron/extensionIndependence.test.ts` | exit 0 |
| frontmatter 스키마 | canonical 12필드 + `tier` + `depends_on`, snake_case 별칭 0건 | PASS |
| **배정 점검 (N1)** | `plan.md` §C의 `^대상 요구:` / `^대상 AC:` 파싱 후 인벤토리와 차집합 | **REQ 62/62 배정 (미배정 0)** · **AC 92/97 배정** — 나머지 5건은 §C.0이 **의도된 교차 마일스톤 항목**으로 선언한 AC-PANEL-090/091/092/093(품질 게이트, 모든 마일스톤의 완료 조건) + 094(릴리스 게이트) · **ghost 참조 0** |
| 배정 점검 — 사전 상태 | 같은 방법, 판 0.3.2 트리 | REQ 미배정 **2**(070b·071a), AC 미배정 **85** — **M0만 `대상 AC:` 줄을 갖고 M1~M8은 배정 축이 아예 없었다** |
| M0 소속 일치 | `plan.md` §C M0 `대상 AC:` / `acceptance.md` §0 구성원 / §I.3 목록 | 세 곳 모두 **12건** 일치 |
| **다섯 번째 반증 조건 (판 0.3.6 신설)** | 각 REQ에 대해 "검증 AC 중 그 REQ와 같은 마일스톤에 있는 것이 하나라도 있는가" | **위반 0건.** 시계열 실측: 판 0.3.4 = **0** / 판 0.3.5(AC만 이동) = **1**(`REQ-PANEL-001 @M1` → 유일 검증 AC가 M2) / 판 0.3.6 = **0**. 그 위반 1건이 이번 판의 R2 정정 대상이었다 |
| **↔ 검증 AC 0건인 REQ** | 같은 파싱 | **0건** (61 REQ 전부 최소 1개 AC가 인용) |
| **외부 메커니즘 주장 전수 확인** | `research.md` §10.1 — 9건을 패키지 런타임 조회·소스 직독·인용 라인 대조로 검사 | **거짓 1 / 불완전 1 / 부정확 1 / 참 6.** 거짓은 R7(`.csv`·`.bib` 부재). 기준선은 **커밋 `040df4a`** — 워킹 트리가 아니다(아래 주의) |
| **M1~M8 배정의 검토 상태** | — (여전히 사람이 전수 검토하지 않았다) | **도출값이다.** AC↔REQ 매핑은 iteration 3이 orphan 0 / uncovered 0으로 검증했고 **도출 규칙 자체는 이제 반증 조건 5건**으로 감사된다(`plan.md` §C.0). 판 0.3.5의 R2와 판 0.3.6의 다섯 번째 조건이 **각각 실제 위반을 잡았으므로** 조건들이 공허하지 않음은 실증되었다. 그럼에도 **M3~M8의 개별 배정 타당성은 여전히 미검토** — 권고: **각 마일스톤 진입 시 그 마일스톤의 `대상 AC:` 전건만 대조한다**(과잉주장 금지 규약의 검사 시점과 같은 리듬) |
| spec-lint 헤딩 규약 | `### Out of Scope —` h3 하위 섹션 **9개**, 각각 `-` bullet 보유 | PASS |

**기준선 주의 — 판 0.3.6은 M0 구현과 병행 작성되었다.** 이 판을 쓰는 동안 `dev-m0`가 `src/editor/MarkdownEditor.tsx` 등 4개 소스 파일을 수정 중이었다(워킹 트리 dirty). §10.1의 첫 측정을 워킹 트리에서 뜬 결과 줄 번호 2건을 틀렸고(`:118`/`:124` → 실제 `:120`/`:125`), `git show 040df4a:<path>` 로 재측정해 정정했다. **plan 아티팩트의 인용은 커밋 기준이어야 한다** — 병행 구현 중에는 워킹 트리가 안정된 기준선이 아니다. 보호 경로 무변경 검사 두 줄(§E.1c 1·2행)도 판 0.3.5 시점 결과이며, 판 0.3.6 시점에는 `src/`가 M0에 의해 정당하게 dirty하다.

**미검증 (정직한 공백)**: `pnpm test` / `pnpm typecheck` / `pnpm lint`는 plan 단계에서 실행하지 않았다. baseline(199 테스트 파일 / 33 e2e spec)은 오케스트레이터 제시값을 전제로 삼았고 파일 수만 실측했다. spec-lint 도구는 이 저장소에 없어 헤딩 규약은 SPEC-1의 통과 형태 복제로 달성했다.

### §E.1d 구현이 계획으로 되먹인 것 (판 0.3.7 — M1 착륙 후 기록)

> **소유 경계**: 이 절은 구현 결과가 **plan 아티팩트의 서술을 고치게 만든 사건**만 담는다. 구현 증거 자체는 `§E.2`(manager-develop 소유)에 있고 여기서 중복하지 않는다. 아래 세 항목은 아티팩트 본문에 반영되었으며 이 절은 그 사유를 한곳에 모은 색인이다.

**1. §2.3의 "올린다"가 `AC-PANEL-010b`와 모순이었다 — 구현이 발견했다.** 단조 카운터는 원복 단언을 통과할 수 없고, **그 실패 형태가 곧 issue #12 sticky**이므로 `REQ-PANEL-015`가 파생 모델을 정당화한 근거 1과 §2.3이 시사한 메커니즘이 서로 반대를 가리키고 있었다. 채택 형태는 **내용 동일성**(branded string, 해시 아님). `design.md` §2.3에 근거·기각 대안 표를 넣었고, `spec.md` REQ-015 근거 문단의 동사도 함께 고쳤다 — **같은 오해를 한 표면에서만 고치면 다른 표면에 남는다는 것이 R1의 교훈**이므로 두 곳을 함께 처리했다. 요구의 규범 내용(필드 이름 + 부등식)은 옳으므로 바꾸지 않았다.

**2. 등급 승격 2건 · 미승격 2건 (`research.md` §10.0).** 저장 await 창과 sticky dirty가 **코드 직독 → 기계 재현**으로 올라갔다(실제 `useFileMenuCommands`를 preload 브리지만 대체해 구동, `.moai/state/verify/m1/red-0-awaitwindow-repro.log`). **올리지 않은 둘**: `getAllWindows()` main 절반(창 두 개를 띄운 실행이 M0 구현자 18건·오케스트레이터 4건 어디에도 없다 — **정적 소스 사실 유지**)과 StrictMode effect 순서(**코드 직독 유지**). 표가 그 약속을 명시한다.

**3. greenfield 마일스톤에서 RED의 정직한 형태.** M1의 8개 AC 중 결함 거동 RED를 가진 것은 **`AC-PANEL-010b` 하나뿐**이고 나머지 일곱의 "이전 상태"는 **구조적 부재**다 — 새 모듈에는 결함 형태의 RED가 존재할 수 없다. 구현자는 그 부재를 *단언*으로 때우지 않고 `appStore`의 필드 집합을 출력하는 **일회용 프로브로 관측 가능하게** 만든 뒤 삭제했다(`.moai/state/verify/m1/red-1-axes-absent.log`). **M0의 어댑터 공시와 같은 규율**이다. 이후 greenfield 마일스톤(M2·M8)에 같은 형태를 권고한다 — RED가 없다고 적는 것과, 없음을 관측했다고 적는 것은 다르다.

**4. 커버리지 게이트가 설계대로 동작한 사건 (사고가 아니다).** `appStore.ts`에서 문서 필드를 걷어내자 파일이 줄면서 **묻혀 있던 미커버 라인(모드 전환 분기 2개)이 드러나** per-file 커버리지가 82.14%로 떨어졌다. 구현자는 **게이트를 낮추지도 제외 목록에 넣지도 않고** 테스트를 추가해 100%로 올렸다. `vitest.config.ts`가 `perFile: true`를 둔 이유를 주석으로 논증하는 바로 그 상황이며, **비율이 아니라 분모가 바뀔 때 진짜 커버리지가 드러난다**는 사례로 남긴다.

**6. 기준선 앵커가 소비되기 전에 만료되었다 (M2, 판 0.3.9).** `AC-PANEL-003b`의 DOM 스냅샷 앵커를 `2541727` → **`bd62b80`** 으로 교체했다. 양쪽 절반: (a) M0·M1이 렌더 트리를 **정당하게** 바꿨다 — 두 커밋 사이 JSX 요소 수준 차이는 `<ReconciliationSurface path={filePath} />` **하나뿐**이며(실측) 옛 앵커는 M2와 무관한 이유로 실패한다, (b) `bd62b80`은 **사용자가 실제로 실행해 확인한 트리**로 아무도 실행하지 않은 기준선보다 강하다. **내가 추가로 확인한 것**: `bd62b80`은 **Electron 31.7.7 → 43.3.0 업그레이드 커밋**이다 — 교체를 더 강하게 만들지만(옛 앵커는 앱이 더 이상 실행되지 않는 렌더러 엔진 기준선이었다) 픽스처가 **Chromium 43 기준**임을 뜻하므로, 향후 Electron 메이저 업그레이드가 이 픽스처를 정당하게 깨뜨릴 수 있다. **일반 교훈**: 커밋 앵커는 중간 마일스톤이 기준선 대상을 바꾸면 소비 전에 죽는다. **F9의 설계 결함이 아니다** — 필요한 것은 소비 시점의 재선택 + 델타 명시이며, 커밋에 앵커하는 모든 향후 AC가 이 의무를 상속한다.

**7. 판정 대상에 생산자가 없었다 — §C.0 세 번째 조항 신설 (M2, 판 0.3.9).** `AC-PANEL-036 / 036b / 036c`가 판정하는 프로젝트 트리 표면이 저장소에 **없다**(`projectDiscover` 렌더러 호출부 0곳, `resolveWatchScope`/`registerWatchScope` 프로덕션 호출부 0곳 — 실측). **원인은 "몰랐다"가 아니다**: §A.4가 두 표면을 정확히 열거하고 "이 SPEC의 산출물"이라 적었으나, **그 배선을 의무화하는 요구가 §B에 없었다** — REQ-036/036b/036c는 셋 다 **트리에 걸리는 제약**이고 트리를 만들라는 긍정 능력 요구가 아니다. M2 산문에는 있었으나 **산문은 `대상 요구:`가 아니고 판정되지 않는다.** N1과 형제이되 서명이 다르다 — N1은 축은 있는데 항목이 빠진 경우, 이것은 항목은 배정되었는데 판정 대상에 소유자가 없는 경우. 둘 다 **계획 자체에 돌려본 적 없는 검사**다. 진단은 `plan.md` §C.0a, 조항은 §C.0(§A.4 전수 대조 + 생산 요구 부재 탐지 두 가지 기계 점검). **정정 하나**: 이 공백에 걸리는 것은 **셋이지 넷이 아니다** — `AC-PANEL-036d`는 Given이 "이 SPEC의 아티팩트"인 **문서 게이트**라 트리 없이도 판정 가능하다. 배정은 바꾸지 않았다.

**8. 같은 계열의 세 번째 — 이번엔 사용자가 실행 중인 앱에서 잡았다 (판 0.3.10).** **패널을 분할할 방법이 없었다.** `workspaceStore`에 `openInNewPanel`/`closePanel`/`setActivePanel`이 있었으나 `src/`·`shared/`·`electron/` 전체에 **UI 호출부 0곳** — 메뉴도 단축키도 버튼도 없었다. **테스트 2,256개가 초록인 채로 기능에 도달 불가**였고, 원인은 **M2의 모든 AC가 스토어 액션을 직접 호출한 것**이다. 형태는 앞의 둘과 같다 — 산문("분할·닫기·공간 재배분을 구현한다")에는 있고, 요구는 제약형이며(`REQ-PANEL-005` "요청**하면** … 수행한다", `REQ-PANEL-004` "마지막 패널은 닫을 수 없다"), **긍정 능력 요구가 없었다.** 해소: **`REQ-PANEL-005a`** + **`AC-PANEL-005a`**(호출 경로 판정) + **`AC-PANEL-005b`**(마지막 패널 무동작). 구현이 고정한 두 동작을 AC가 **발명하지 않고 따랐다** — 분할은 **빈 패널**을 열고(열린 문서로 분할하면 `reused: true`가 되어 아무 일도 없어 보이므로, dual-open 금지를 우회하는 대신 v0.3 분할을 "두 번째 파일을 열 자리"로 정의), 마지막 패널 닫기는 **무동작**이다(비활성화하려면 main이 렌더러의 패널 수를 알아야 하고 그 IPC 표면이 이득보다 크다). **§C.0 네 번째 조항이 여기서 나왔다** — *AC가 전부 스토어를 직접 호출하면 진입점 부재가 구조적으로 보이지 않는다.* 세 조항은 **배정 → 생산 → 도달**의 사슬이며 셋 다 코드가 아니라 **계획에 돌리는 검사**다(`plan.md` §C.0 비교 표). **세 사례 중 어느 것도 이 검사를 통과하지 못했을 것이다.**

**9. 하니스의 대가를 표기 규약에 적었다 (판 0.3.10, 구현자 공시).** `tests/_helpers/appHarness.tsx:45-51`의 프록시는 **모르는 IPC 채널에 조용히 `{ ok: false }`를 돌려준다.** 채널이 추가될 때마다 하니스가 깨지지 않게 해 주는 **의도된 대가**이자, **렌더러가 존재하지 않는 채널을 부르는 것을 숨기는** 성질이다. 따라서 하니스 기반 AC는 "렌더러가 이 채널을 부른다"는 판정해도 **"그 채널이 존재한다"는 판정하지 못한다** — 후자는 IPC 계약 검증 계층의 몫이다. 공짜 성질이 아니므로 한 줄로 명시했다.

**5b. 규약이 한 문장 자라났다 — 분석적 귀결과 그 전제 (판 0.3.8).** §2.3에 "해시가 아니므로 충돌 경로가 없다"고 적고 **등급을 붙여야 하는지 판단을 구했다**. 답은 **둘로 쪼개는 것**이었다 — "구현이 내용 동일성이다"는 **코드 직독**(리팩터가 무너뜨릴 수 있다), "그 전제 아래 충돌은 불가능하다"는 **분석적 귀결**(등급 없음, 정의를 등급 매기는 것은 "정사각형은 변이 넷"을 등급 매기는 것과 같다). 규약에 한 문장을 더했고, **무게중심은 두 번째 절**이다 — 첫 절만 있으면 "자명하다"가 면제 통로가 되고, 두 절이 함께 있어야 **누군가 해시로 바꿨을 때 주장이 조용히 거짓이 되는 경로**가 막힌다. §10.1의 기준선 교훈과 같은 계열이다.

**5. `AC-PANEL-014`의 "임의 순서"는 순서 하나로 판정되었다.** 순열 전수도 property-based도 아니다. AC 본문에 그 경계를 적었다 — 불변식의 성격상 순서 무관이 기대되지만 **기대는 증거가 아니다.**

---

## §E.2 Run-phase Evidence

### M0 — 출하 중인 결함 두 건의 재현 우선 해소

**증거 파일**: `.moai/state/verify/m0/` (런타임 상태이므로 커밋되지 않는다 — 아래 표의 출력이 저장소 안의 기록이다)

| 로그 | 내용 |
|---|---|
| `red-0-defect-repro.log` | 보관된 재현 소스 2건을 그대로 되살려 실행한 결과 (세 결함의 verbatim 재현) |
| `red-1-permanent-tests.log` | 영구 AC 테스트의 수정 전 실패 출력 |
| `green-1-m0-tests.log` / `green-3-m0-verbose.log` | 수정 후 통과 출력 |
| `gate-test.log` / `gate-typecheck.log` / `gate-lint.log` / `gate-coverage.log` | 전체 게이트 |

#### 0단계 — 결함의 기계 재현 (REQ-PANEL-073)

`plan.md` §C M0과 `spec.md` §B.0이 기록한 관측을 **바이트 동일하게** 재생산했다. 실제 모듈 3건(`attachExternalChangeChannel` / `useReconciliationStore` / `registerReconciliationExecutor`)과 실제 `EditorState`를 구동했고, 대체한 것은 preload 브리지와 `DispatchTarget`뿐이다.

```
[OQ-8] emit 후 b.md 버퍼 = "A의 내용\n"
[OQ-8] 조정 상태 = "idle"
[OQ-8/dirty] emit 후 b.md 버퍼 = "B의 내용\n"
[OQ-8/dirty] 조정 상태 = "held-notify"
[D3] 배너 상태 = "held-notify"
[D3] pending.path = "/w/a.md"
[D3] emit 직후 버퍼 = "B의 내용\n"
[D3] 불러오기 후 버퍼 = "A의 내용\n"
[D4] 조합 시작 후 composing = true
[D4] detach 후 composing = true
[D4] 이후 조정 상태 = "held-composition"
[D4] 버퍼 = "B의 내용\n"
```

#### AC 판정 표 (12건)

수정 전 실패 출력과 수정 후 통과 출력을 함께 싣는다. 실행 명령은 두 가지뿐이다:

- `npx vitest run tests/store/reconciliationRouting.test.ts`
- `npx vitest run tests/editor/compositionRouting.test.ts`

| AC | 상태 | 수정 전 실제 출력 (RED) | 수정 후 실제 출력 (GREEN) |
|---|---|---|---|
| AC-PANEL-080 | PASS | `expected 'A의 내용\n' to be 'B의 내용\n'` | `✓ b.md만 연 창에 a.md의 확정 변경이 와도 b.md 버퍼가 불변이다` |
| AC-PANEL-080b | PASS | `리듀서가 호출되었다: expected "reduceReconciliation" to not be called at all, but actually been called 1 times` | `✓ 리듀서가 호출되지 않고, 상태 객체 참조도 Map 항목도 그대로다` |
| AC-PANEL-080c | PASS | `a.md의 변경이 b.md의 pending에 심겼다: expected { path: '/w/a.md', …(3) } to be null` | `✓ 다른 경로의 변경은 pending에 심기지 않고 배너도 뜨지 않는다` / `✓ 정상 경로 회귀 …` |
| AC-PANEL-080d | PASS | `expected [ [ '/w/b.md', 'A의 내용\n' ] ] to deeply equal [ [ '/w/b.md', 'B의 내용\n' ] ]` | `✓ 저장 시 쓰기 채널에 전달된 바이트가 원래 버퍼와 동일하다` |
| AC-PANEL-080e | PASS | `옛 경로의 변경이 도달했다: expected [ 'A의 새 내용\n' ] to deeply equal []` | `✓ 재바인딩 후 옛 경로는 도달하지 않고 새 경로만 도달한다` / `✓ 경로를 이미 가진 상태에서 뷰가 준비되면 …` |
| AC-PANEL-080f | PASS | `expected [] to deeply equal [ '/w/saved-as.md' ]` (경로 획득 분기) | `✓` 3건 (Map 항목 부재 / 키 비공유 / 경로 획득 시 등록) |
| AC-PANEL-081 | PASS | `다른 표면의 조합 종료가 A의 보류를 풀었다: expected 'idle' to be 'held-composition'` | `✓ 표면 B의 compositionend가 표면 A의 보류를 풀지 않는다` |
| AC-PANEL-081b | PASS | `detach 후에도 composing이 참이다: expected true to be false` | `✓ 조합 중 detach하면 보류가 해제되고 큐가 드레인된다` / `✓ PRESERVE …` |
| AC-PANEL-081c | PASS | `보류분이 실행자에 도달하지 않았다: expected [] to have a length of 1` · `해제가 실행자 분리보다 뒤에 있다: expected 7414 to be less than 7390` | `✓ 패널 정리에서 보류분의 apply-to-buffer가 실행자에 도달한다` / `✓ 규정이 소스에서 확인 가능하다` |
| AC-PANEL-082 | PASS | (회귀 방어 — 수정 전후 모두 통과) | `npx vitest run tests/electron/extensionIndependence.test.ts` → `10 passed`, 파일 무변경(`git diff --quiet` exit 0) |
| AC-PANEL-083 | PASS | `경로 → 상태 Map이 없다: expected '…' to match /Map<string,\s*ReconciliationState>/` | `✓ 경로 키 Map이 src/store/ 아래에 산다` / `✓ 다섯 조정 코어 파일 어디에도 경로 키 라우팅이 없다` |
| AC-PANEL-084 | PASS | (의도된 회귀 방어 — 수정 전에도 통과) | `✓ main은 여전히 모든 창에 브로드캐스트한다` |

**수정 전에 통과한 AC (정직한 기록)**: `AC-PANEL-084`(의도된 회귀 방어, `acceptance.md`가 명시) 하나와, 분할된 하위 단언 중 회귀 방어 성격인 것들 — `080c`의 "정상 경로 회귀" 팔, `080e`의 "뷰 준비" 팔(오늘은 경로 필터가 아예 없어 도달한다 — F2가 정정한 형태 그대로), `081b`의 PRESERVE 팔. `080f`의 구조 단언 2건은 수정 전에는 **관측 수단 자체가 없어** 어댑터가 빈 목록을 돌려주는 형태로 통과했으므로 **의미 있는 RED가 아니었다**; 판별력을 갖는 것은 세 번째 팔(경로 획득 시 등록)이며 그것은 RED에서 실패했다.

**RED의 형태에 대한 정직한 기술**: 영구 테스트는 스토어 API 형태에 매이지 않도록 파일 상단에 **어댑터 블록**을 둔다. RED 실행에서는 그 어댑터가 수정 전 API(`setEffectHandler` / `dispatch` / `state`)를 가리켰고, GREEN에서 경로 키 API(`setEffectHandlerFor` / `dispatchFor` / `stateFor`)로 바뀌었다. **AC 단언 본문은 RED와 GREEN에서 바이트 동일하다** — 바뀐 것은 어댑터 5~7줄뿐이다.

#### 구현 — 라우팅 계층 (`design.md` §6.2a 그대로)

| 위치 | 내용 |
|---|---|
| `src/store/reconciliationStore.ts` | 라우팅 키 3종: `states: Map<string, ReconciliationState>` (리액티브), `effectHandlers: Map<string, ReconciliationEffectHandler>`, `openDocuments: Set<string>`. 열린 문서가 아닌 경로의 이벤트는 **리듀서를 호출하지 않고 폐기**한다 |
| `src/store/externalChangeChannel.ts` | 세 갈래 모두 `dispatchFor(change.path, …)`로 라우팅 |
| `src/editor/compositionGate.ts` | `detach()`가 보유 중인 조합 보류를 해제(REQ-PANEL-071). `attachReconciliationCompositionGate(target, resolvePath, options)` — 게이트마다 식별자를 갖고 자기 문서에 OR로 합류한다 |
| `src/editor/MarkdownEditor.tsx` | 등록이 `[filePath, readyView]`에 결속(REQ-PANEL-070a·070b). 정리 순서는 **해제 → 실행자 분리** |
| `src/hooks/useExternalChangeWiring.ts` | 감시 등록과 같은 지점에서 `openDocument` / `closeDocument` |
| `src/components/ReconciliationSurface.tsx` · `src/App.tsx` | 알림 표면이 `path` prop으로 어느 문서의 알림인지 받는다 |

**시그니처 무변경 확인**: `registerReconciliationExecutor(view, (h) => setEffectHandlerFor(filePath, h))` — 두 번째 인자가 이미 주입된 setter이므로 경로는 호출부 클로저에 담긴다. `applyExternalChange`의 arity 2와 조정 코어 5파일은 **무변경**이다.

#### REQ-PANEL-071a — 택한 teardown 규정

**택한 것: 조합 보류 해제가 실행자 분리보다 먼저 일어난다.** ("해제는 드레인하지 않는다"는 대안은 기각했다 — `AC-PANEL-081b`가 detach 시 큐 드레인을 요구하므로 두 AC가 충돌한다.)

소스에서의 위치: `src/editor/MarkdownEditor.tsx`의 `[filePath, readyView]` effect 정리 클로저 — `compositionGate.detach(); detachExecutor?.();` 순서와 `REQ-PANEL-071a` 주석. `AC-PANEL-081c`의 두 번째 테스트가 그 순서를 소스 스캔으로 고정한다.

#### 불변식

| 검사 | 명령 | 결과 |
|---|---|---|
| 조정 코어 5파일 무변경 (C-12) | `git diff --quiet -- <각 파일>` | 5건 모두 exit 0 |
| 확장자 독립 테스트 무변경 통과 | `git diff --quiet -- tests/electron/extensionIndependence.test.ts` + 실행 | exit 0 / `10 passed` |
| 문서모드 원칙 무변경 (C-9, AC-WS-037) | `git diff --quiet -- docs/DOCUMENT_MODE_PRINCIPLES.md` | exit 0 |

#### 전체 게이트

| 명령 | 결과 | 기준선 대비 |
|---|---|---|
| `pnpm test` | exit 0 — `Test Files 201 passed (201)` / `Tests 2209 passed (2209)` | 199/2191 → **+2 파일 / +18 테스트** (신규 AC 테스트 2파일 13+5건과 정확히 일치) |
| `pnpm typecheck` | exit 0 | 변화 없음 |
| `pnpm lint` | exit 0 | 변화 없음 |
| `pnpm test:coverage` | exit 0 — `All files 96.11%` statements/lines (파일 단위 85% 게이트 통과) | — |

---

### M1 — 문서 축과 패널 축의 분리

**증거 파일**: `.moai/state/verify/m1/` (런타임 상태 — 커밋되지 않는다)

| 로그 | 내용 |
|---|---|
| `red-0-awaitwindow-repro.log` | 저장의 await 창 결함 + issue #12 sticky의 **기계 재현** |
| `red-1-axes-absent.log` | 축 분리 이전 상태 계층의 구조 관측 |
| `green-1-workspace.log` | 새 축의 AC 통과 출력 |
| `gate-test.log` / `gate-coverage.log` | 전체 게이트 |

#### 0단계 — 검증 등급 승격: await 창 결함을 재현했다

`spec.md` REQ-PANEL-015와 `design.md` §2.3은 이 결함을 **코드 직독 등급**으로 기록했다(“재현하지 않았다”). 실제 훅 모듈(`useFileMenuCommands`)을 구동해 실행 관측으로 올렸다 — 대체한 것은 preload 브리지(`window.api`)뿐이다.

```
[AW] 디스크에 쓰인 내용 = "원래 내용\n"
[AW] 저장 후 버퍼      = "저장 중에 타이핑한 내용\n"
[AW] 저장 후 isDirty   = false        <- 버퍼와 디스크가 다른데 clean
[STICKY] 원복 후 isDirty = true        <- issue #12
```

**등급 갱신 제안(내 소관 아님)**: 이 두 결함은 이제 **기계 재현**이다. `research.md` §10의 등급 표와 REQ-PANEL-015 / AC-PANEL-010b의 “검증 등급” 문구는 manager-spec 소관이므로 건드리지 않았다.

#### AC 판정 표 (8건)

실행 명령: `npx vitest run tests/store/workspaceStore.test.ts`

| AC | 상태 | 수정 전 관측 (RED) | 수정 후 |
|---|---|---|---|
| AC-PANEL-010 | PASS | `appStore 상태 필드 = ["filePath","content","isDirty","theme","themePreference","systemTheme","editMode","lastNonMarkdownMode","headingHint"]` — 문서 축·패널 축·창 전역이 한 객체에 섞여 판정 대상 자체가 없었다 | `✓ 경로·내용·미저장 여부·파일 종류는 문서에만, 표시 모드는 패널에만 있다` / `✓ 조정 상태는 문서 축이며 패널에 없다` |
| AC-PANEL-010b | PASS | `[AW] 저장 후 isDirty = false` (await 창) · `[STICKY] 원복 후 isDirty = true` (issue #12) | `✓` 3건 (await 창 / 가변 boolean 부재 / 원복 시 clean 복귀) |
| AC-PANEL-011a | PASS | `panels/documents 필드 존재 = { panels: false, documents: false }` — 참조 구조가 없었다 | `✓ 패널이 문서를 참조하는 형태이며 1:1이 강제되지 않는다` / `✓ 저장은 문서 단위, 폐기 확인은 마지막 참조 패널 판정` |
| AC-PANEL-011b | PASS | 동일 (중복 판정 자체가 없었다) | `✓` 3건 (별칭 두 패널 / 동일 경로 재사용 / 한계의 소스 기록) |
| AC-PANEL-012 | PASS | 저장이 `markClean()`으로 끝나 문서 식별자가 등장하지 않았다 | `✓ 쓰기 1회 + 대상이 문서 식별자` / `✓ 저장 API가 패널 식별자를 받지 않는다` |
| AC-PANEL-013 | PASS | 패널 개념이 없어 "마지막 참조 패널" 판정이 불가능했다 | `✓` 3건 (확인 호출 / 취소 시 보존 / 깨끗하면 확인 없음) |
| AC-PANEL-013b | PASS | 동일 | `✓ 폐기 확인 조건이 참조 수로 표현된다` |
| AC-PANEL-014 | PASS | 동일 | `✓ 분할·닫기 취소·활성 전환·외부 변경을 임의 순서로 해도 내용이 보존된다` |

**수정 전 통과한 AC: 0건.** 8개 전부 수정 전에는 판정 대상이 없었거나(구조 부재) 결함 동작을 보였다.

**RED의 형태 (정직한 기술)**: `AC-PANEL-010b`만 **결함 동작**의 RED를 갖는다 — 위 0단계가 실제 모듈로 재현했다. 나머지 7건의 “수정 전”은 **구조의 부재**이며, 그것을 주장이 아니라 관측으로 남기려고 `appStore` 필드 집합을 찍는 임시 프로브를 돌렸다(`red-1-axes-absent.log`). 새 모듈에 대한 테스트는 원리상 결함 형태의 RED를 가질 수 없고, 그 사실을 숨기지 않는다.

#### 구현

| 위치 | 내용 |
|---|---|
| `src/store/workspaceStore.ts` (신규) | 문서 축 `{id, path, content, currentRevision, savedRevision, kind}` + 패널 축 `{panelId, documentId, displayMode}`. 두 필드 집합의 교집합은 공집합이고 `documentId`는 소유가 아니라 참조다 |
| 〃 | `isDirty(doc) = currentRevision !== savedRevision` — 파생값. `saveDocument`가 쓰기 **전에** revision을 붙잡고 완료 후 대입하므로 await 창이 구조적으로 닫힌다 |
| 〃 | `panelsReferencing` / `isLastReferencingPanel` / `needsDiscardConfirm` — 폐기 확인 판정을 참조 **수**로 표현. v0.3에서 도달 불가한 분기를 도달 불가한 채로 남긴다 |
| 〃 | `samePath` — 경로 동일성 한 곳. 별칭 미탐지가 정의된 한계이며, REQ-PANEL-051의 완전한 정규화가 들어올 교체 지점이다 |
| `src/store/appStore.ts` | 문서 필드 3종 + `setFile`/`setContent`/`markClean` 제거. 창 전역(테마·모드·안내 플래그)만 남았다 |
| `useFileMenuCommands` · `useAppCloseGuard` | 저장이 `saveDocument`를 탄다. `markClean()` 호출 2곳 소멸 |
| 소비처 8개 | `useAppStore((s) => s.filePath)` → `useActiveDocument((d) => d?.path ?? null)` 형태의 기계적 교체 |

#### revision의 형태 — SPEC 내부 긴장 1건과 그 해소

`REQ-PANEL-015`는 dirty를 `currentRevision !== savedRevision`으로 규정하고 `design.md` §2.3은 편집이 revision을 “올린다”고 적어 **단조 증가 카운터**를 시사한다. 그러나 카운터로 두면 `AC-PANEL-010b`의 세 번째 단언(**편집 후 원복하면 미저장 여부가 거짓으로 돌아온다**)이 실패한다 — 원복해도 카운터는 되돌아가지 않기 때문이다. 그리고 그 실패 형태가 **issue #12 sticky 그 자체**이므로, 카운터는 REQ-PANEL-015가 스스로 내건 근거(“파생값은 sticky일 수 없다”)를 성립시키지 못한다.

**해소**: revision을 **내용의 정체성**으로 정의했다(같은 내용 ⇒ 같은 revision). 필드 이름은 SPEC 그대로이고 부등식도 그대로이며, 원복이 clean으로 돌아오고 await 창도 닫힌다. 해시가 아니라 내용 자체이므로 충돌로 dirty 문서를 clean으로 오판할 여지도 없다. **SPEC 본문은 고치지 않았다** — 문구 조정이 필요하다면 manager-spec 소관이다.

#### 경계 — M1이 하지 않은 것

| 항목 | 왜 |
|---|---|
| `editMode`를 패널 축으로 이관 | 모드 값의 출처는 **OQ-3 미해결**이고 M4 소관이다. 패널의 `displayMode` 필드는 만들되 배선하지 않았다 |
| 소비처를 패널 지목 형태로 재작성 | **OQ-4 미해결**(활성 뷰 접근자 vs ref vs 패널 ID). 지금은 "활성 패널의 문서"를 읽는 형태이며, M4가 그 결정을 담는다 |
| 파일 종류 판정 함수 | `kind` 필드는 문서 축에 있으나 확장자 판정은 M5 소관(REQ-PANEL-040~042, OQ-10) |
| `AC-PANEL-001` / `011` | 렌더된 편집 표면을 요구하므로 M2 소속(판 0.3.6 R2) |

#### 불변식

| 검사 | 결과 |
|---|---|
| 조정 코어 5파일 (`git diff --quiet 040df4a`) | 5건 모두 exit 0 |
| `docs/DOCUMENT_MODE_PRINCIPLES.md` | exit 0 |
| `tests/electron/extensionIndependence.test.ts` | exit 0 (무변경) |
| `MarkdownEditor.tsx`의 extension 배열 (AC-PANEL-042 allowlist 전제) | 추가·삭제 줄 **0건** |

#### 전체 게이트

| 명령 | 결과 | 기준선 대비 |
|---|---|---|
| `pnpm test` | exit 0 — `Test Files 203 passed (203)` / `Tests 2237 passed (2237)` | M0 종료 시점 201/2209 → **+2 파일 / +28 테스트** (신규 테스트 21 + 7과 정확히 일치) |
| `pnpm typecheck` | exit 0 | — |
| `pnpm lint` | exit 0 | — |
| `pnpm test:coverage` | exit 0 — `All files 96.06%` | `appStore.ts`가 문서 필드 제거로 82.14%까지 떨어져 게이트를 깼다. **게이트를 낮추지 않고** 미커버였던 모드 전환 2갈래에 테스트를 붙여 100%로 올렸다 |

---

### M2 — 레이아웃 셸과 단일 패널 축퇴 (부분 완료)

**증거**: `.moai/state/verify/m2/`. 기준선 픽스처는 저장소 안 `tests/fixtures/singlePanelLayout.json`.

#### 기준선 앵커 — `bd62b80`을 택했다

`AC-PANEL-003b`는 앵커로 `2541727`(M0 착수 전)을 지목했으나 **M2 착수 직전 커밋 `bd62b80`** 에서 픽스처를 떴다. 근거 둘: (1) `git diff 2541727 bd62b80 -- src/App.tsx src/components/` 의 JSX 요소 수준 변화는 `<ReconciliationSurface path={filePath} />` **prop 추가 한 건뿐**이고 요소·형제 순서·flex 스타일은 그대로다(M0·M1은 상태 계층 변경이었다). (2) `bd62b80`은 **사용자가 실제 구동으로 동작을 확인한 트리**다.

#### 설계 긴장 1건 — 실측으로 드러났고, 택한 쪽을 기록한다

초판은 패널이 하나면 래퍼 없이 렌더해 DOM을 오늘과 **바이트 동일**하게 만들었다. 그러자 `AC-PANEL-005`가 실패했다 — **분할했다 닫으면 살아남는 패널의 캐럿이 3에서 0으로 돌아갔다**. 패널 수가 1↔2로 오갈 때 컨테이너 노드가 `<>`↔`<div>`로 바뀌어 살아남는 서브트리가 재부모화되고, React가 그것을 재마운트해 `EditorView`가 새로 만들어지기 때문이다.

**두 성질은 동시에 성립할 수 없다.** 살아남는 패널의 서브트리는 (a) 단일 패널일 때 통과용 노드를 한 겹 얻거나, (b) 전환 때 재부모화되거나 둘 중 하나다.

**(a)를 택했다.** `AC-PANEL-005`는 사용자가 실제로 잃는 것(캐럿·스크롤)을 막는 **동작** 기준이고, `AC-PANEL-003b`의 문언은 "가로 **배치**"와 "패널 다중화를 시사하는 **시각 요소**"를 말한다 — 스타일 없는 통과용 노드 한 겹은 둘 다 바꾸지 않는다. 분할할 때마다 캐럿이 문서 맨 앞으로 튀는 것은 사용자가 확실히 알아채는 회귀이고, 보이지 않는 `<div>` 한 겹은 그렇지 않다.

**픽스처를 재기준화하지 않았다.** 새로 뜨면 기준선이 구현을 따라가 회귀 방어선이 사라진다. 픽스처는 `bd62b80` 그대로 두고, 테스트가 **허용하는 델타를 이름으로 명시**한다 — 통과용 노드 한 겹을 걷어낸 뒤 기준선과 완전히 같아야 하며, 다른 어떤 차이도 검사를 깨뜨린다.

#### AC 판정 (11/15 PASS, 4건 미착수)

| AC | 상태 | 근거 |
|---|---|---|
| 001 | PASS | 두 패널의 캐럿·선택·문서·`EditorState`가 독립 |
| 002 | PASS | 사이드바 4파일 `git diff --quiet 040df4a` exit 0 + 무변경 통과 |
| 002b | PASS | 패널 2개 상태에서 좌·우 폭이 `WIDTH_BOUNDS` 상수로 clamp |
| 002c | PASS | 분할·닫기 반복에도 사이드바 `prefsSet` 0건, 값 불변 |
| 003 | PASS | 프로젝트 없음에서 패널 1개, 오류·경고 없음 |
| 003b | PASS | 통과용 노드 한 겹 제외하고 픽스처와 완전 일치 + `layoutFacts` 일치 |
| 004 | PASS | 마지막 패널 닫기 거부, 문서 닫기는 빈 버퍼로 축퇴 |
| 005 | PASS | 분할→닫기 후 내용·revision·캐럿·스크롤 보존. **폭 등식은 구성으로만 판정** (아래 Gap) |
| 007 | PASS | 패널 3개까지 늘려도 사이드바 불변, 역방향도 불변 |
| 011 | PASS | 재열기 시 `reused: true`, `EditorView` 수·문서 맵 항목 수 불변, 오류 없음 |
| 065 | PASS | B가 왼쪽·A가 활성인 배치에서 사이드바가 **A**를 겨냥 |
| 036 / 036b / 036c / 036d | **미착수** | 프로젝트 트리 표면 자체가 없다 (아래) |

#### 전체 게이트

`pnpm test` exit 0 — `205 passed / 2256 passed` (M1 종료 203/2237 → **+2 파일 / +19 테스트**, 신규 7+12와 일치). `typecheck`·`lint`·`coverage`(All files 96.22%) 전부 exit 0.

#### 불변식

조정 코어 5파일 · `docs/DOCUMENT_MODE_PRINCIPLES.md` · `extensionIndependence.test.ts` 전부 `git diff --quiet 040df4a` exit 0. `MarkdownEditor.tsx`의 extension 배열 추가·삭제 줄 **0건**.

#### 미착수 — 프로젝트 트리 (AC-036 / 036b / 036c / 036d)

`window.api.projectDiscover`의 렌더러 호출부가 **0곳**이므로 프로젝트 트리 표면은 이 저장소에 아직 존재하지 않는다(사이드바의 `FileTree`는 워크스페이스 폴더 축이며 매니페스트 소유 프로젝트 축이 아니다). 네 AC는 그 표면을 새로 만들어야 판정 가능하고, 그중 `036c`는 신뢰 트리 필터링까지 요구한다. **손대지 않았다** — 절반 만든 표면을 남기는 것보다 없는 편이 낫고, 후속 위임에서 온전히 다루는 것이 맞다고 판단했다.

---

### M2 후속 — 분할·닫기의 진입점 (도달 불가 기능 해소)

**사용자 확인에서 드러났다**: "분할을 어떻게 하는지 모르겠어요." 실측 결과 `openInNewPanel`/`closePanel`의 **UI 호출부가 0곳**이었다 — 메뉴 항목도 단축키도 버튼도 없이 기능만 있었다. 2,256개 테스트가 초록이었던 이유는 **모든 AC가 스토어 액션을 직접 호출**했기 때문이다.

이 SPEC에서 같은 형태가 세 번째다(프로젝트 트리, 감시 배선, 분할 진입점). 공통점은 **제약 형태의 요구는 있는데 능력을 만들라는 요구가 없다**는 것이다. `plan.md` M2 산문은 "분할·닫기를 구현한다"고 적지만 산문은 `대상 요구:`가 아니고 판정되지 않는다.

#### 단축키 — 실측으로 충돌 없음 확인

`electron/menu.ts`의 accelerator 42개를 전수 추출하고 `src/editor/`의 keymap 키를 전수 추출해 대조했다. Alt 계열은 메뉴에 `CommandOrControl+Alt+F`·`+M` 둘, 에디터에 `Mod-Alt-m` 하나뿐이다.

| 커맨드 | 단축키 | 위치 |
|---|---|---|
| 패널 분할 | `CommandOrControl+Alt+\` | 보기 메뉴 (사이드바 토글 옆) |
| 패널 닫기 | `CommandOrControl+Alt+W` | 동일 |

VS Code 관용인 `Cmd+\`는 이미 사이드바 토글이라 쓸 수 없어 `\` 니모닉만 물려받았다. 테스트가 **accelerator 중복 0건**을 전수로 단언한다 — 같은 조합을 두 항목이 쓰면 하나가 조용히 죽는다.

#### 분할의 의미 — 빈 패널을 연다 (제약을 우회하지 않았다)

`REQ-PANEL-011`이 dual-open을 금지하므로 활성 문서를 새 패널에 열면 경로 동일성 판정에 걸려 **아무 일도 일어나지 않는다.** 따라서 v0.3의 분할은 **빈 패널을 여는 것**으로 정의했다 — "두 번째 파일을 열 자리를 만드는 것"이다.

같은 파일을 나란히 보는 것은 v0.4의 문서↔뷰 동기화 프로토콜(`design.md` §2.5의 다섯 의무)이 들어와야 가능하다. **그 전까지는 표현 불가능하며, 우회하지 않고 그렇게 적는다.** 테스트가 분할 후 경로가 `['/w/a.md', null]`이고 같은 경로의 문서 항목이 여전히 1개임을 단언한다.

#### 닫기 — 무동작을 택했다

마지막 패널에서 `closePanel` 커맨드는 **무동작**이다(REQ-PANEL-004). 메뉴 항목 비활성화 대신 무동작을 택한 이유: 비활성화하려면 main이 렌더러의 패널 수를 알아야 하고, 그 채널 하나가 얻는 것보다 늘리는 표면이 크다. 테스트가 마지막 패널에서 패널 수·식별자 불변을 단언해 고정한다.

미저장 편집이 있으면 `requestClosePanel`이 폐기 확인을 거치고(REQ-PANEL-013), 취소하면 패널도 내용도 그대로다.

#### 이 마일스톤에 없던 단언 계열

`tests/layout/panelCommands.test.tsx`는 **커맨드 경로를 통과해서** 판정한다 — 메뉴 커맨드를 발신하고 패널 수와 렌더된 편집 표면 수가 바뀌는지 본다. 스토어를 직접 부르지 않는 것이 요점이며, 이것이 초록불 2,256개가 놓친 단언 계열이다.

#### 게이트

`pnpm test` exit 0 — `206 passed / 2266 passed` (직전 205/2256 → **+1 파일 / +10 테스트**). `typecheck`·`lint`·`coverage`(96.23%) exit 0. **단일 패널 축퇴 7건 재확인 통과** — 사용자가 방금 확인한 화면은 그대로다. 조정 코어 5파일·원칙 문서·확장자 독립 무변경, extension 배열 무접촉.

---

### M3 — 조정 계층의 문서 축

**증거**: `.moai/state/verify/m3/`. 커밋 `f04c53b`(감시 등록의 문서 축·경로 대조) + `eb652fd`(문서별 조정·창 단위 정책의 판정).

#### 중력 중심은 감시 등록이었다 — 나머지는 M0이 이미 닫아 두었다

M3의 여섯 요구 중 실제로 **구현이 없던 것은 REQ-PANEL-050 하나**다. `useExternalChangeWiring`이 스칼라 `filePath` 하나를 받아 한 문서만 등록하고 있었고, 호출부는 `App.tsx` 한 곳이었다. 나머지 넷(051·052·055·056)은 M0이 조정 상태와 실행자를 경로별로 바꾸면서 구조적으로 이미 성립해 있었다 — **다만 그것을 판정하는 테스트가 하나도 없었다**(`grep -rn "AC-PANEL-05[0-9]" tests/` → 0건). M3가 그 판정을 붙였다.

**통과를 만들기 위한 리팩터는 하지 않았다.** AC-PANEL-055·055b는 처음 쓴 판정이 곧바로 통과했고, 그 사실을 아래 표에 그대로 적는다.

#### AC 판정 (10/10 PASS)

| AC | 상태 | 판정 명령 | 근거 |
|---|---|---|---|
| 050 | PASS | `pnpm vitest run tests/hooks/useExternalChangeWiring.test.tsx` | 서로 다른 문서 셋을 연 패널 셋이 전부 등록되고 `unwatchOpenFile` 호출 0건 |
| 050b | PASS | 동일 | 두 패널이 같은 문서 참조 시 등록 1회, 첫 패널 닫힘에 해제 0건, 마지막 참조 닫힘에 해제 1회 |
| 051 | PASS | `pnpm vitest run tests/store/reconciliationDocumentAxis.test.ts` | a.md 확정 변경이 a.md에만 적용, b.md 버퍼 바이트 동일. 열지 않은 z.md는 어떤 버퍼도 안 바꿈 |
| 051b | PASS | `pnpm vitest run tests/shared/pathIdentity.test.ts` | 논리 관계 5종을 macOS·Windows 표기로 각각 대조해 **판정 일치**. 흡수하는 차이(구분자·대소문자·드라이브)는 플랫폼별로 따로 고정 |
| 052 | PASS | `pnpm vitest run tests/store/reconciliationDocumentAxis.test.ts` | dirty a.md는 `held-notify`+버퍼 불변, clean b.md는 자동 반영. 전이 후 상대 문서의 **상태 객체 참조**가 그대로 |
| 055 | PASS **(M0이 닫았고 M3가 판정을 붙였다)** | 동일 | 첫 판정에서 곧바로 통과. 두 번째 패널 마운트 후에도 첫 패널의 실행자가 살아 있고, 세 패널이 동시에 조정을 받는다 |
| 055b | PASS **(M0이 닫았고 M3가 판정을 붙였다)** | 동일 | 첫 판정에서 곧바로 통과. B 언마운트 후 A의 조정 생존 + 언마운트한 경로에는 더 이상 적용되지 않음(과다 해제·과소 해제 양방향) |
| 056 | PASS | 동일 | 정책 1회 주입으로 문서 3개 전부 알림 상태. **주입 뒤 열린 네 번째 문서도 재주입 없이 적용**. 문서별 정책 맵 부재를 소스로 고정 |
| 057 | PASS | `pnpm vitest run tests/layout/panelWatchScope.test.tsx` | 패널 3개에서 `excluded` 정확히 1개 = `folders`가 data 역할로 해석한 경로. 패널 1개일 때와 `excluded`·`folders` 동일 |
| 057b | PASS | 동일 | data 역할 폴더는 감시 제외 유지 + 그 안의 `data/raw.csv`를 **보조 패널로 열면** 등록됨 (`splitPanel` → `open` 메뉴 커맨드 경로 통과) |

#### 뒤집은 단언 (plan.md §B.8의 계약 산출물)

`tests/hooks/useExternalChangeWiring.test.tsx:93` **"파일이 바뀌면 이전 파일의 감시를 먼저 푼다"** 를 지우지 않고 뒤집었다. 그 자리에 들어온 것은 참조 카운트 규칙이고, 옛 시나리오는 **규칙의 한 사례**로 남겼다 — 해제의 근거가 "경로가 바뀌었다"에서 **"그 경로를 참조하는 패널이 하나도 없다"** 로 옮겨졌다. 두 규칙을 갈라놓는 사례를 새로 세웠다: *다른 패널이 그 문서를 붙들고 있으면 갈아타도 풀리지 않는다* — 옛 규칙이면 여기서 보조 패널의 문서가 감시를 잃는다.

#### 판정력 검증 — 새 판정이 실제로 결함을 잡는가

`tests/layout/panelWatchScope.test.tsx`는 훅을 고친 **뒤에** 썼으므로 RED를 관측하지 못했다. 그래서 `openDocuments`에 "활성 패널만" 회귀를 일시 주입해 실측했다 — 그 파일 1건 + 훅 파일 10건이 실패했고, 특히 *보조 패널의 등록이 원고 패널의 감시를 풀었다* 단언이 잡았다. 회귀는 `git checkout`으로 되돌렸고 이후 전 게이트를 다시 통과시켰다.

관련해 판정 형태를 한 번 바꿨다: 초판은 "원고 경로가 등록 이력에 있다"로 단언했는데, 그것은 **"등록됐다가 방금 풀렸다"를 통과시킨다.** 해제 부재(`unwatched`에 없음)로 바꿔야 지금 살아 있음을 말한다.

#### 설계 긴장 1건 — 경로 대조를 라우팅에 실제로 꽂을 것인가

`AC-PANEL-051b`의 판정 대상은 **순수 함수**다. 함수만 만들고 라우팅은 문자열 동일성으로 두어도 AC는 통과한다. 그러나 그러면 추출이 장식이고, Windows에서 main이 보낸 `C:\…` 표기와 렌더러가 연 `C:/…` 표기가 어긋나 **확정 변경이 열린 문서를 찾지 못하고 조용히 폐기된다** — 오류가 나지 않으므로 조정이 통째로 죽은 것을 알 수단이 없다.

**꽂는 쪽을 택했다.** 대가는 `reconciliationStore`의 Map 키가 경로 문자열이 아니라 대조 키가 되는 것이고, POSIX에서는 항등이라 M0의 기존 단언(`statePaths()`가 `/w/b.md`를 담는다 등)이 그대로 통과한다. `ReconciliationSurface`가 `states.get(path)`를 직접 쓰던 것을 `stateFor(path)`로 바꾼 것이 이 선택의 유일한 파급이다 — 접는 규칙의 소유자를 스토어 하나로 유지한다.

기각한 쪽: 함수만 추출하고 라우팅은 그대로 두기. 기각 근거는 위의 무성 실패이며, "AC는 통과하지만 요구는 성립하지 않는" 상태를 남긴다.

#### 배선하지 않은 것 (관측으로만 기록)

`resolveWatchScope` / `registerWatchScope`는 여전히 **프로덕션 호출부 0곳**이다(`plan.md` §A.4). M3의 `대상 요구:` 여섯 중 그 배선을 생산하는 요구가 없어 **손대지 않았다** — AC-PANEL-057의 문언이 "감시 범위를 해석한다"이므로 순수 함수 판정이 문언에 맞고, 배선을 끼워 넣는 것은 소유자 없는 범위 확장이다. 이 관측은 M3 진입 점검(§F)에 이미 기록되어 있고 여기서 되풀이한다.

#### 전체 게이트

`pnpm test` exit 0 — `209 passed / 2315 passed` (M2 후속 종료 206/2266 → **+3 파일 / +49 테스트**). 신규 44건(pathIdentity 21 + 문서 축 15 + 감시 범위 5 + 훅 재작성 순증 3 = 44)에 훅 파일 재작성의 옛 10건 제거를 더하면 `2266 − 10 + 18 + 21 + 15 + 5 = 2315`로 일치한다. `typecheck`·`lint` exit 0(신규 경고 0). `coverage` exit 0 — All files 96.24%(직전 96.22%), per-file 85% 게이트에서 신규·수정 파일 전부 통과(`pathIdentity.ts` 100%, `useExternalChangeWiring.ts` 100%, `reconciliationStore.ts` 100%, `ReconciliationSurface.tsx` 100%, `workspaceStore.ts` 90.33%).

`multiPanelShell.test.tsx`의 `act` 경고 46건은 **기존 것이다** — 기준선 `1b64c86`에서 실측 46건, M3 적용 후에도 46건으로 동일하다.

#### 불변식

조정 코어 5파일 · `docs/DOCUMENT_MODE_PRINCIPLES.md` · `extensionIndependence.test.ts` 전부 `git diff --quiet 040df4a` exit 0. `applyExternalChange`는 arity 2 유지(라우팅은 스토어가 target을 고르는 것으로 성립). `MarkdownEditor.tsx`는 M3에서 **한 줄도 바뀌지 않았고**(`git diff 1b64c86` 출력 0줄) extension 배열 추가·삭제 0건. 사이드바 보존 집합 9파일 전부 무변경 통과.

#### 범위 밖으로 남긴 것

REQ-PANEL-053(패널별 배너 표면)·054(IME 게이트 합류)는 M4다 — 편집 표면과 조합 관찰이 필요하다. 배너는 여전히 창 전역 1개(`App.tsx`의 `<ReconciliationSurface path={filePath} />`)이며 M3는 그것을 옮기지 않았다.

---

## §E.3 Run-phase Audit-Ready Signal

```yaml
run_complete_at: 2026-08-09
run_commit_sha: 48aa799        # M0 구현 커밋
m1_commit_sha: 66ddffa       # M1 구현 커밋
m2_commit_sha: 6e7259f       # M2 구현 커밋
m2_entrypoint_commit_sha: 48ffc7d   # 분할·닫기 진입점
m3_commit_sha: f04c53b       # M3 감시 등록의 문서 축 + 경로 대조
m3_routing_commit_sha: eb652fd   # M3 문서별 조정 · 창 단위 정책 판정
run_status: milestone-partial   # M0·M1·M3 완료, M2 부분 완료(11/15). M4~M8 미착수
milestone: M0+M1+M2(부분)+M3
ac_pass_count: 41               # M0 12 + M1 8 + M2 11 + M3 10
ac_fail_count: 0
ac_scope: >-
  M0: AC-PANEL-080 / 080b / 080c / 080d / 080e / 080f / 081 / 081b / 081c / 082 / 083 / 084
  M1: AC-PANEL-010 / 010b / 011a / 011b / 012 / 013 / 013b / 014
  M2: AC-PANEL-001 / 002 / 002b / 002c / 003 / 003b / 004 / 005 / 007 / 011 / 065
  M2 미착수: AC-PANEL-036 / 036b / 036c / 036d (프로젝트 트리 표면 부재)
  M3: AC-PANEL-050 / 050b / 051 / 051b / 052 / 055 / 055b / 056 / 057 / 057b
reproduction_first: true         # REQ-PANEL-073 — M0 3건 + M1 await 창·sticky 2건 재현
preserve_list_post_run_count: 0  # PRESERVE 목록 위반 0건
reconciliation_core_unchanged: true   # 5파일 git diff --quiet 전부 exit 0
document_mode_principles_unchanged: true
extension_independence_unchanged: true
extension_array_untouched: true       # AC-PANEL-042 allowlist 전제 보존
new_warnings_or_lints_introduced: 0   # M3 실측: act 경고 46건은 1b64c86에서도 46건(기존)
teardown_discipline: release-before-executor-detach
dirty_model: derived-content-revision  # 단조 카운터가 아니다 — §E.2 M1의 긴장 해소 참조
watch_registration_model: reference-counted-open-document-set  # M3 — 경로당 1회, 마지막 참조에서 해제
path_identity: injectable-pure-function  # shared/pathIdentity.ts — 플랫폼을 인자로 받는다(C-7)
reconciliation_policy_scope: window-single   # 문서별 정책 맵 없음 (REQ-PANEL-056)
test_files: 209                  # 기준선 199 → M0 201 → M1 203 → M2 205 → M2e 206 → M3 209
tests: 2315                      # 기준선 2191 → M0 2209 → M1 2237 → M2 2256 → M2e 2266 → M3 2315
coverage_gate: pass              # per-file 85%, All files 96.24%
cross_platform_build:
  performed: false
  reason: "Electron 렌더러 유닛 범위. Windows e2e 부재는 C-7로 승계된 기존 공백"
  m3_mitigation: "경로 대조를 순수 함수로 떼고 양 플랫폼을 유닛에서 재현 (AC-PANEL-051b)"
total_run_phase_files: 39        # M0 15 + M1 16 + M3 8(소스 5 + 테스트 3, progress.md 별도)
m1_to_mN_commit_strategy: "마일스톤별 단일 커밋 + SHA 백필 커밋. M4~M8은 후속 위임"
deferred_by_open_decision:
  - "패널별 배너 표면 — REQ-PANEL-053 (M4). 배너는 여전히 창 전역 1개다"
  - "IME 게이트의 문서 축 합류 — REQ-PANEL-054 (M4)"
  - "resolveWatchScope/registerWatchScope 프로덕션 배선 — 소유 요구 없음. 관측으로만 기록"
  - "editMode의 패널 축 이관 — OQ-3 (M4)"
  - "소비처의 패널 지목 배선 — OQ-4 (M4)"
  - "파일 종류 판정 함수 — OQ-10 (M5)"
  - "프로젝트 트리 표면 — M2 미착수분, 후속 위임 (AC-036/036b/036c/036d)"
  - "패널 폭 등식의 픽셀 단언 — jsdom 레이아웃 부재, e2e 이관 (AC-005)"
  - "같은 파일을 두 패널에 — v0.4 문서↔뷰 동기화 프로토콜 (REQ-PANEL-011이 v0.3에서 금지)"
```

---

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_ — manager-docs가 채운다.

```yaml
sync_commit_sha: <pending sync-phase>
```

---

## §F Phase 4 Mode Selection

> 섹션 문자 예약용이다. `§E.*` 네임스페이스는 era 분류 엔진이 파싱하므로 Mode Selection이 그것을 재사용해서는 안 된다. 내용 계약은 `.claude/rules/moai/workflow/orchestration-mode-selection.md` §D가 소유한다.

### M3 (2026-08-09)

**입력 파라미터**

| 항목 | 값 |
|---|---|
| tier | L |
| 예상 파일 수 | 6~9 (`useExternalChangeWiring.ts` · `reconciliationStore.ts` · 경로 대조 순수 함수 신설 · `App.tsx` · `PanelContainer.tsx` 인접 + 테스트 4~5) |
| 도메인 수 | 2 (렌더러 상태 계층 / 훅 배선) — 3 미만 |
| 언어 구성 | TypeScript 100% |
| 병렬 이득 | LOW — 구현 중심이며 파일 간 의존이 있다 (라우팅 키 → 훅 배선 → 테스트) |

**모드 평가**

| 모드 | 선택 | 근거 |
|---|---|---|
| 1 trivial | 미선택 | 의미 변경이 있는 다중 파일 구현 |
| 2 background | 미선택 | 쓰기 작업 |
| 3 agent-team | 미선택 | RETIRED (톰스톤) |
| 4 parallel | 미선택 | 도메인 2개(<3), 파일 9개 이하(<10). 게다가 구현 중심이라 Anthropic coding-task 병렬성 유보 조항이 적용된다 |
| 5 sub-agent | **선택** | 기본 폴백이며 위 조건이 이것을 가리킨다 |
| 6 workflow | 미선택 | ~30 파일 미만이고 기계적 단일 변환 규칙이 아니다 |

**Decision: sub-agent**

**정당화**: M3는 라우팅 키 도입 → 훅 배선 재작성 → 테스트 부착의 순서 의존이 있는 구현 작업이다. 도메인 2개·파일 9개 이하로 Mode 4 임계(3 도메인 / 10 파일) 아래이며, 경계 근처도 아니다. Anthropic의 coding-task 병렬성 유보("most coding tasks involve fewer truly parallelizable tasks than research")에 따라 구현 중심 작업은 순차 sub-agent가 안전한 기본값이다. Tier L이므로 `manager-develop-prompt-template.md` Section A-E 전체 템플릿을 적용한다.

### M3 진입 — §C.0 기계 점검 결과 (2026-08-09)

`plan.md` §C.0이 마일스톤 진입 시 의무화한 점검을 실행했다.

| 점검 | 결과 | 근거 |
|---|---|---|
| 점검 1 — §A.4 전수 대조 | **위반 1건** | 아래 |
| 점검 2 — 생산 요구 부재 탐지 | 통과 | M3의 `REQ-PANEL-050`(Ubiquitous)·051·052·056이 긍정 능력 요구다. 제약형만으로 구성되지 않았다 |
| 네 번째 조항 — 도달 가능한 진입점 | **위반 아님 (실측으로 기각)** | 아래 |

**점검 1 위반 — 감시 범위 배선에 생산 요구가 없다 (§C.0a 계열 네 번째 사례).**

`resolveWatchScope` / `registerWatchScope`는 §A.4(`plan.md:448`)가 "프로덕션 호출부 0곳"으로 열거한 두 표면 중 하나이며, **지금도 0곳이다** — `src`·`shared`·`electron` 전수 grep에서 정의 파일(`electron/watchScope.ts`) 외 매치 없음. 그런데 이 둘을 생산하게 만드는 요구가 **어느 마일스톤의 `대상 요구:`에도 없다**: M3의 `REQ-PANEL-057`은 Unwanted 제약형("패널 수 증가는 … 무효화하지 않아야 한다", `spec.md:554`)이고, 나머지 8개 마일스톤의 `대상 요구:` 어디에도 "규약 폴더 감시를 등록하라"는 긍정 능력 요구가 없다.

결과: `AC-PANEL-057`은 `resolveWatchScope`를 유닛에서 직접 호출해 **판정 가능하고 초록이 된다** — 그 함수가 프로덕션에서 한 번도 불리지 않는 채로. 사슬 **배정 → 생산 → 도달** 중 **생산**에서 새는 형태이며, 프로젝트 트리(§C.0a) · 감시 배선 · 분할 진입점(판 0.3.10)에 이은 네 번째다.

**택한 처리 (사용자 승인, 2026-08-09)**: **관측만 기록하고 M3를 계획대로 진행한다.** M3의 밀폐성은 깨지지 않으며 `AC-PANEL-057`/`057b`는 `openFiles` 3개 대 1개의 순수 함수 대조로 판정 가능하다. **배선 소유는 이 마일스톤이 잡지 않는다** — 배선 지점이 main 프로세스의 프로젝트 열기 경로여서 M3 대상 AC 10건 밖이고, 넣으면 판정할 AC가 없는 코드가 M3에 들어온다. 프로젝트 트리 표면 위임(M2 미착수분, `progress.md` M2 §미착수)과 함께 범위를 잡는다.

**네 번째 조항이 위반이 아닌 이유 (의심 후 실측으로 기각).** `AC-PANEL-057b`가 "그 파일을 **보조 패널로 연다**"를 요구해 진입점 부재를 의심했다. 실측 결과 호출 경로가 실재한다 — 보기 메뉴 `splitPanel` → `openInNewPanel(null, '')`로 빈 패널이 활성이 되고(`src/hooks/useMenuCommandRouter.ts:150`), 파일 메뉴 열기가 `openInActivePanel(r.path, r.content)`로 그 패널에 적재한다(`src/hooks/useFileMenuCommands.ts:107`). **결함으로 기록하지 않는다** — 텍스트 패턴 추론을 도구 실측 없이 결함으로 승격하지 않는다는 규약을 따랐다.

### M3 진입 — 전제 검증 (2026-08-09)

| 검사 | 명령 | 결과 |
|---|---|---|
| HEAD·브랜치·원격 | `git rev-parse --short HEAD` / `git rev-list --count --left-right` | `1b64c86` / `feat/v0.3-workspace` / `0 0` |
| 테스트 기준선 | `pnpm test` | exit 0 — `206 passed (206)` / `2266 passed (2266)` |
| 코어 5파일 불변식 | `git diff --quiet 040df4a` ×7 | 코어 5파일 + `extensionIndependence.test.ts` + `docs/DOCUMENT_MODE_PRINCIPLES.md` 전부 exit 0 |
| M3 대상 목록 | `plan.md:839-840` | 요구 6건 / AC 10건 — 일치 |

**OQ-8 차단 해제 판정**: `blocking_decisions.m3_blocked_by: [OQ-8]`은 같은 줄 주석대로 **핵 결함이 M0에서 닫힌** 뒤 남은 항목이 `AC-PANEL-084`(창 축 e2e 추가 여부, M0 소속)뿐이다. M3의 AC 10건 중 OQ-8을 인용하는 것은 0건이므로 M3는 차단되지 않는다.

### M3 종료 — 오케스트레이터 독립 검증 + e2e 기준선 대조 (2026-08-09)

manager-develop 보고와 별개로 오케스트레이터가 직접 실행했다. 증거: `.moai/state/verify/m3-orch/`.

| 검사 | 결과 |
|---|---|
| `pnpm test` | exit 0 — `209 passed (209)` / `2315 passed (2315)` (기준선 206/2266 → **+3 파일 / +49 테스트**, 회귀 0) |
| `pnpm typecheck` / `pnpm lint` | 둘 다 exit 0, 출력 없음 |
| `pnpm test:coverage` | exit 0 — All files **96.24%** (M2 96.22% → 상승) |
| 코어 5파일 + `extensionIndependence.test.ts` + `DOCUMENT_MODE_PRINCIPLES.md` | `git diff --quiet 040df4a` 전부 exit 0 |
| 사이드바 preserve 9파일 | 전부 exit 0 |
| 원격 | `0 0` — 커밋 3건 푸시 완료 |

**`MarkdownEditor.tsx` 불변식 표기 주의.** 이 파일에 `git diff --quiet 040df4a`를 돌리면 **exit 1**이 나온다 — M0·M1·M2가 정당하게 고쳤기 때문이다. 이 파일의 불변식은 "파일 무변경"이 아니라 **"extension 배열 추가·삭제 0줄"**이며, `git diff 040df4a HEAD -- src/editor/MarkdownEditor.tsx`에서 extension 관련 추가·삭제 줄을 뽑아 **0건**임을 확인했다. M3는 이 파일을 아예 열지 않았다(`git diff 1b64c86..HEAD` 무출력). **exit 1을 불변식 위반으로 읽지 말 것.**

#### e2e 실사용 확인 — 실패 3건은 전부 기존 결함이다 (기준선 대조로 확정)

`pnpm test:e2e`(Playwright가 실제 Electron을 띄운다)를 HEAD에서 실행: **210 passed / 3 failed / 4 skipped**, exit 1.

| 실패 스펙 | HEAD (`b3843c6`) | 기준선 (`1b64c86`, M3 착수 전) |
|---|---|---|
| `b2-features.spec.ts:64` outline 탭 헤딩·클릭 점프 | ✘ (30.0s 타임아웃) | ✘ (30.0s 타임아웃) |
| `pending-assets-migration.spec.ts:133` `durumi-asset://` pending 이미지 | ✘ | ✘ |
| `round-trip.spec.ts:289` HTML export 이미지 data: URI 인라인 | ✘ | ✘ |

**대조 방법**: `git worktree add <tmp> 1b64c86` → `pnpm build` → 같은 3개 스펙만 재실행. 기준선 결과 `3 failed / 4 passed`로 **동일한 세 건이 동일한 형태로 실패**했다. 증거: `.moai/state/verify/m3-orch/6-e2e-baseline-1b64c86.log`. 워크트리는 제거했고 트리는 clean이다.

**판정: M3의 e2e 회귀는 0건이다.** 다만 **브랜치에 기존 e2e 실패 3건이 빨간 채로 남아 있다** — M3 소관이 아니지만 v0.3 릴리스 게이트 전에 처리되어야 한다. 세 건 모두 M3가 건드리지 않은 영역이다(`git diff 1b64c86..HEAD -- e2e/ src/hooks/useDocOutline.ts src/components/sidebar/` 무출력).

**주의 — e2e 실행은 추적 파일을 더럽힌다.** `e2e/screenshots/v0.2-smoke/{49,50,51}-*.png` 3개가 재생성되어 바이트가 바뀐다. 검증 산출물이므로 `git restore`로 되돌렸다. e2e를 돌린 뒤에는 이 3개를 확인할 것 — 무심코 커밋하면 검증 실행의 바이트 churn이 SPEC 커밋에 섞인다.

#### 정정 — 위 e2e 기준선 대조는 **무효였다** (2026-08-09, 같은 날 늦게)

**위 「e2e 실사용 확인」 절의 측정 방법이 틀렸다.** `pnpm test:e2e`는 `DURUMI_E2E=1 … playwright test`일 뿐 **빌드를 하지 않는다**(`package.json`). Playwright는 `out/`의 번들을 띄우므로, 소스를 고쳐도 이전 번들을 계속 측정한다.

그 결과 위 대조는 **HEAD의 소스를 잰 적이 없다**: HEAD 쪽은 언제 빌드됐는지 모르는 `out/`을 쟀고, 기준선 쪽만 워크트리에서 `pnpm build`를 돌려 잰 것이다. 즉 「stale 번들 대 신선한 `1b64c86`」을 비교했다. **"210 passed"와 "실사용 확인 해소"는 그 측정 위에 선 진술이므로 철회한다.**

**신선한 빌드로 다시 재면 IME e2e 5건이 실패한다** (`pnpm build` 후 실행, 증거 `.moai/state/verify/m3-orch/8-verify-fresh-build.log`):

| 스펙 | HEAD (신선 빌드) | M1 `66ddffa` (신선 빌드) |
|---|---|---|
| `reconciliation-ime.spec.ts:133` AC-WS-019 | ✓ | ✓ |
| `:179` AC-WS-020 조합 종료 시 보류 변경 라우팅 | **✘** | ✓ |
| `:202` AC-WS-020b 취소된 조합 | **✘** (30s) | ✓ |
| `:238` AC-WS-021 다중 변경 합류 | **✘** (30s) | ✓ |
| `:260` AC-WS-023c 무성 소실 금지 | **✘** (30s) | ✓ |
| `:288` AC-WS-022 조합 경계·커밋 텍스트 훼손 금지 | **✘** | ✓ |

M1 지점은 오케스트레이터가 워크트리에서 직접 빌드해 재확인했다 — **6 passed** (증거 `9-ime-at-m1-66ddffa.log`). 위임 에이전트의 bisect는 도입 지점을 **`6e7259f` (M2 — 레이아웃 셸)** 로 지목했고 Electron 43을 고정한 채 M0·M1이 통과함을 보여 **Electron 업그레이드가 원인이 아님**도 함께 배제했다.

**무엇이 참으로 남는가**: M3가 e2e 회귀를 **추가하지 않았다**는 결론 자체는 유지된다 — M2 지점과 HEAD가 같은 5건에서 같은 형태로 실패하기 때문이다. 그러나 그것을 뒷받침한 **측정은 무효였고**, 유효한 근거는 위임 에이전트의 bisect와 오케스트레이터의 M1 재확인이다.

**드러난 결함 자체가 더 크다.** SPEC-1의 IME 수용 기준 5건이 **M2에서 깨진 채 판정을 통과했다.** M2의 AC 15건은 유닛·컴포넌트로 판정되었고 그 층은 지금도 초록이다(2315건 통과). 깨진 것은 실제 앱에서만 관측되는 층이고, 그 층을 재는 명령이 stale 번들을 재고 있었으므로 **아무도 빨간불을 보지 못했다.** IME 안전은 이 제품의 최우선 축이며 v0.2.19~.28 계열이 다섯 번 출하된 지점이다.

**교훈 두 가지**:
1. `pnpm test:e2e`를 **단독으로 신뢰하지 말 것** — 반드시 `pnpm build && pnpm test:e2e`로 돌린다. 스크립트에 빌드를 넣을지는 미결(아래 결정 대상).
2. 기준선 대조는 **양쪽을 같은 방법으로** 재야 한다. 한쪽만 빌드한 대조는 대조가 아니다. 이번 오류가 정확히 그 형태였다.

#### IME 회귀 해소 — 원인은 조정 계층이 아니라 dirty 신호였다 (`2221706`)

**결론부터**: `PanelContainer.tsx`의 `Panel.handleChange`가 **렌더 스코프의 `doc`을 클로저에 가둔** 것이 원인이다. 조정 계층·IME 게이트·채널은 모두 정상이었다.

**범위를 좁힌 관측**: 6건 중 `AC-WS-019`(조합 **중** 불변) 하나만 통과했다. 조합 중에 `held-composition`이 뜬다는 것은 채널도 게이트도 살아 있다는 뜻이고, 나머지 5건이 전부 조합 **종료 후**에 떨어진다는 것은 남은 분기가 해제 시점의 정책 판정 하나뿐임을 뜻한다. 그 판정이 읽는 값은 `isDirty` 하나다. 이 한 가지 사실이 게이트·실행자 등록·채널 배선을 후보에서 전부 배제했다.

**메커니즘 사슬**:
1. 편집 표면은 문서를 갈아타며 **재사용된다** — `MarkdownEditor`는 `key`를 받지 않고, 그 안의 CodeMirror `updateListener`는 마운트 시점의 `onChange`를 영구히 붙든다(마운트 이펙트 deps `[]`).
2. 파일을 열면 `openInActivePanel`의 `bind`가 새 문서를 만들고 아무도 참조하지 않게 된 **마운트 시점 문서를 거둬 간다**.
3. 그래서 편집이 **사라진 문서 식별자**로 가고, `editDocument`는 없는 문서를 `withDocument`의 이른 반환으로 **조용히 무시한다** — 오류도 경고도 없다.
4. 문서는 영원히 clean이므로 `useExternalChangeWiring`이 `dirty-changed: true`를 보내지 못한다.
5. `shared/reconciliation.ts`의 `apply` 분기(`!state.isDirty`)가 외부 변경을 확인 없이 반영한다 → **REQ-WS-028 위반, 미저장 편집 소실**.

M2 이전 `App.setContent`는 `useCallback([])`이면서 호출 시점에 `activeDocument(getState())`를 조회해 **두 축 모두** 면역이었다. M2가 둘 다 잃었다. 수정은 호출 시점 조회를 패널 범위로 되돌린 것이며(`documentOf(getState(), panel.panelId)`), **동결 경로는 하나도 건드리지 않았다** — 결함도 수정도 M2가 새로 만든 파일 안에 있다.

**30초 타임아웃 3건도 같은 원인이었다.** 실패 형태가 갈린 것은 관측 경로 차이다. `reconcileStatus`가 쓰는 `locator.getAttribute()`는 `playwright.config.ts`에 `actionTimeout`이 없어 기본값 0(무제한)이며, 자동 반영으로 상태 표면이 사라지면 그 await가 영영 풀리지 않는다. 버퍼를 먼저 보는 2건은 즉시 단언 실패했고, 상태를 먼저 보는 3건은 데드라인까지 멈춰 있었다. **한 원인, 두 관측** — 한 줄 수정으로 다섯 건이 함께 풀렸고 3건은 30.0s → 2.9s로 떨어졌다.

**오케스트레이터 독립 검증** (증거 `.moai/state/verify/ime-orch/`):

| 검사 | 결과 |
|---|---|
| `pnpm test` | exit 0 — `2319 passed` (수정 전 2316 + 가드 3건) |
| 동결 7파일 + 보존 8파일 `git diff --quiet 040df4a` | 전부 exit 0 |
| `MarkdownEditor.tsx` | `805e1b7..HEAD` 무접촉 — extension 배열 무변경 |
| `reconciliation-ime.spec.ts` | **6/6 통과** (수정 전 1/6) |
| `pnpm test:e2e` 전체 (빌드 선행) | exit 0 — **213 passed / 0 failed / 4 skipped** |

**가드의 판정력을 직접 확인했다.** `tests/layout/panelDocumentBinding.test.tsx`의 수정을 일시적으로 되돌려 회귀를 재도입한 뒤 가드를 돌렸더니 **3건 중 2건이 실패**했고(`편집이 이전 문서로 갔다`), 복원하니 3건 전부 통과했다. 가드는 내용뿐 아니라 **`isDirty`가 뒤집히는지**를 함께 고정한다 — 정책이 실제로 읽는 값이 그것이므로 내용만 보면 다시 놓친다.

**왜 유닛 2316건이 전부 초록인 채로 이것이 나갔는가.** 깨진 경로가 조용했다(`editDocument`의 이른 반환). 그리고 그 조용함을 잡을 층이 두 군데서 동시에 막혀 있었다 — 로컬 `pnpm test:e2e`는 빌드를 안 해 stale 번들을 쟀고(`805e1b7`에서 수정), CI `e2e.yml`은 빌드를 하지만 **트리거가 `main` 대상 push/PR뿐**이라 이 기능 브랜치에서 한 번도 돌지 않았다. 로컬은 빌드를 안 하고 CI는 안 도는 조합이라 회귀가 드러날 자리가 없었다.

**남은 위험 (수정하지 않았고, 이유가 있다)**:
- `MarkdownEditor`의 `[]`-deps 마운트 이펙트는 `onChange`·`onReady`를 영구 포획한다. 이것은 **의도된 설계**다 — `EditorView`를 다시 만들면 캐럿·스크롤·실행 취소를 잃으며, 그것이 M2가 통과용 노드를 넣어 해결한 바로 그 긴장이다. 그러나 앞으로 `MarkdownEditor`에 넘기는 **어떤 콜백이든** 렌더 스코프 상태를 닫으면 같은 방식으로 조용히 실패한다. 이번 가드는 `onChange` 하나만 덮으며 **계열 전체를 덮지 않는다.**
- `editDocument`의 이른 반환이 이 결함을 보이지 않게 만들었다. `workspaceStore.ts`는 동결 대상이 아니므로 개발 모드 경고를 붙일 수 있으나, 수정을 최소로 유지하려 하지 않았다.
- `actionTimeout` 미설정은 프로젝트 전역이라 같은 형태의 30초 행이 앞으로도 재발한다.

#### OQ-3 · OQ-4 인용 재확인 (M4 선행 결정용) — 정정 2건

`plan.md` §A.2의 두 OQ 후보표는 `040df4a` 기준으로 작성되었고 이후 M0~M3가 같은 파일을 고쳤으므로 HEAD에서 전수 재측정했다.

**OQ-3**: 줄 번호는 어긋났으나(`appStore.ts:65-71` → 실제 `:29`/`:41`, `useMenuCommandRouter.ts:126,131` → 실제 `:135`/`:140`) 사실은 유지된다 — 모드는 여전히 창 전역이다. `usePreferencesInit.ts:58`은 정확히 일치.

**정정 A — 후보 1의 비용이 표보다 싸다.** M1이 `PanelState.displayMode: EditMode`를 **이미 만들어 두었다**(`workspaceStore.ts:102`). `'wysiwyg'`로만 설정되고(`:287`, `:352`) 읽는 곳이 없다 — M1이 "필드는 만들되 배선하지 않았다"고 적은 그대로다. 후보 1의 "모드 필드 이관"은 신설이 아니라 **이미 있는 필드를 잇는 일**이다. 현재 모드 필드는 `appStore.editMode`(살아 있음, 전역)와 `PanelState.displayMode`(만들어졌으나 죽어 있음) 둘이다.

**정정 B — OQ-4의 "5개 훅"은 4개다.** `editorViewRef`를 받는 훅은 `useAiPalette` · `useCitationInsertFlow` · `useMenuCommandRouter` · `usePickAndInsertImage` **4개**다. `useMemoCaretFocus`는 ref가 아니라 **값**을 받는다(`App.tsx:114`). 그리고 이것은 M0~M3의 드리프트가 **아니다** — `git show 040df4a:src/App.tsx`의 `:97`에서도 이미 값 전달이었다. **plan을 쓸 때부터 틀린 개수**다. 후보 1의 비용("5개 훅 시그니처")과 후보 3의 비용("5개 훅 테스트 전부")이 각각 한 파일씩 과대 계상되어 있다.

**권고는 뒤집히지 않는다.** 후보 1의 근거는 훅 개수가 아니라 낡은 ref 위험이고, 그것은 실측으로 확인했다 — `useMenuCommandRouter.ts:107`의 `const view = editorViewRef.current`가 `async` 핸들러 첫 줄이고 그 아래로 `await` 분기가 여럿이다(plan은 `:98`로 적었으나 9줄 밀렸을 뿐 구조는 동일). 다만 결정은 참인 숫자 위에서 내려야 하므로 적어 둔다. **두 정정은 SPEC 본문 수정이 필요하므로 판 0.3.11에서 manager-spec이 반영한다** — 오케스트레이터는 본문을 고치지 않는다.

**M0·M2가 이미 만든 것 (M3 작업면 축소)**: `reconciliationStore.ts`는 M0에서 경로 키잉으로 전환되어 `effectHandlers: Map<string, handler>`(`:68`) · `openDocuments: Set<string>`(`:72`) · `setEffectHandlerFor(path, handler)`(`:160-166`)를 갖추었고, `MarkdownEditor.tsx:188-190`이 `path`를 클로저로 묶어 등록한다. `AC-PANEL-055`(마운트 탈취)·`055b`(언마운트 무장 해제)가 지목한 두 경로는 **구조적으로 이미 닫힌 것으로 보인다 — 다만 두 AC를 판정하는 테스트는 0건이므로 미검증이다**(`grep -rn "AC-PANEL-05[0-9]" tests/` 무매치). 반면 `AC-PANEL-050`의 핵심 결함은 그대로다: `useExternalChangeWiring(filePath, content, isDirty)`가 `src/App.tsx:110`에서 **스칼라 경로 하나로 단 한 번** 호출된다 — `REQ-PANEL-050`이 대체 대상으로 지목한 바로 그 지점이다.

---

### M4 (2026-08-11) — 분할 착수 결정 + Phase 4 모드

**사용자 결정 (Implementation Kickoff Approval)**: M4를 **두 덩어리로 분할**해 착수한다. 대상 AC 21건을 한 위임에 넣지 않는다.

| 덩어리 | 대상 요구 | 대상 AC |
|---|---|---|
| **M4-1 포커스·라우팅·모드** | REQ-PANEL-020, 021, 022, 023, 024, 030, 031, 032, 033, 034, 035 | AC-PANEL-020 / 021 / 022 / 023 / 024 / 030 / 030b / 031 / 032 / 032b / 033 / 034 / 035 (13건) |
| **M4-2 배너·IME 게이트·셀렉터 이관** | REQ-PANEL-053, 054, 058 | AC-PANEL-053 / 053b / 053c / 053d / 054 / 054b / 058 / 095 (8건) |

**분할 근거**: M2의 IME 회귀가 정확히 "큰 마일스톤 + 유닛만으로 판정"에서 났다. 두 덩어리 사이에 실사용 확인 지점을 둔다. **`plan.md` §C의 M4 배정은 바꾸지 않는다** — 이것은 위임 단위의 분할이지 마일스톤 재구성이 아니며, 21건 전부 여전히 M4 소속이다.

**Phase 4 모드 (M4-1)**

| 항목 | 값 |
|---|---|
| tier | L |
| 예상 파일 수 | 12~15 (`appStore` · `StatusBar` · `workspaceStore`(displayMode 배선) · `PanelContainer` · `App.tsx` · `usePreferencesInit` + ref→접근자 훅 4개 + 테스트) |
| 도메인 수 | 3 (스토어 / 컴포넌트 / 훅) |
| 병렬 이득 | LOW — 구현 중심이며 접근자 도입 → 훅 시그니처 → 호출부 순서 의존이 있다 |

| 모드 | 선택 | 근거 |
|---|---|---|
| 1 trivial / 2 background | 미선택 | 다중 파일 쓰기 작업 |
| 3 agent-team | 미선택 | RETIRED |
| 4 parallel | 미선택 | 도메인 3·파일 12~15로 임계를 넘지만 **구현 중심**이다. §B.2 타이브레이커 "coding-heavy + multi-domain → Mode 5" 가 적용된다 |
| 5 sub-agent | **선택** | 위 타이브레이커의 지정 |
| 6 workflow | 미선택 | ~30 파일 미만, 단일 기계적 변환 규칙 아님 |

**Decision: sub-agent**

**정당화**: 도메인 수·파일 수는 Mode 4 임계를 넘지만, Anthropic의 coding-task 병렬성 유보에 따라 **구현 중심 다도메인 작업은 Mode 5가 기본**이다(`orchestration-mode-selection.md` §B.2). M4-1은 `getActiveView()` 접근자 도입 → 훅 4개 시그니처 → 호출부 → 모드 축 이관의 순서 의존이 실재하므로 병렬 팬아웃이 이득을 내지 못한다.

### M4 진입 — §C.0 기계 점검 결과 (2026-08-11)

| 점검 | 결과 |
|---|---|
| 점검 1 — §A.4 전수 대조 | **해당 없음** — M4의 대상 요구 어느 것도 `projectDiscover`·`resolveWatchScope`를 다루지 않는다. 두 공백은 기록된 채 남고 M4는 소유자가 아니다 |
| 점검 2 — 생산 요구 부재 탐지 | **통과, 유의 1건**(아래) — `REQ-PANEL-053`이 긍정 능력 요구이므로 제약형 전용이 아니다 |
| 네 번째 조항 — 도달 가능한 진입점 | **통과** |

**네 번째 조항이 M4에서 통과하는 이유 — M2와의 대조가 요점이다.** M2는 모든 AC가 스토어를 직접 호출해 진입점 부재가 구조적으로 보이지 않았다. M4는 다르다: `AC-PANEL-024`가 **상태바 모드 표시를 검사**하고, `AC-PANEL-030`이 **편집 표면에 실제 포커스**를 주며, `AC-PANEL-030b`가 **툴바·사이드바·상태바 컨트롤에 차례로 포커스**를 주고, `AC-PANEL-035`가 **분할→활성화→닫기**를 수행한다. 네 건 모두 호출 경로를 통과한다.

**유의 — `AC-PANEL-095`의 전제가 산문에만 있다 (M4-2 소관).** 그 Given은 "패널 지목 수단이 도입된 상태 (M4 계약 산출물)"인데, 이 AC는 `↔ C-13`(제약)을 인용하고 REQ를 인용하지 않는다. "패널 지목 수단을 만들라"는 긍정 능력 요구가 M4의 `대상 요구:` 14건 어디에도 없고, 그 의무는 `plan.md` §B.8과 `design.md` §9.2 **산문**에만 있다 — §C.0 세 번째 조항이 "산문은 배정이 아니다"라고 못박은 서명이다. **다만 M2·M3의 세 사례와 달리 판정 AC의 Given이 전제를 명시하고 있어** 구현자가 놓치기 어렵다. M4-2 착수 시 재평가한다.

**전제 하나는 실측으로 해소했다.** `AC-PANEL-035`가 요구하는 "조합 유지형 프리미티브"는 자동 메모리가 2026-08-07에 "먼저 구축해야 한다"고 적어 둔 항목이나, **이미 존재한다** — `e2e/_helpers.ts`의 `startComposition(page, commitText)`이 CDP 세션을 detach하지 않고 `CompositionHandle`을 돌려주고 `endComposition(handle)`이 커밋한다. 호출부도 실재한다(`e2e/reconciliation-ime.spec.ts` 6건, `e2e/composition-primitive.spec.ts`). 실제로 M2 회귀 5건을 잡아낸 것이 그 스펙이다.

---

## §G 참조

- `spec.md` / `plan.md` / `acceptance.md` / `design.md` / `research.md` — 동일 디렉터리
- `.moai/specs/EPIC-V03-WORKSPACE.md` — Epic 개요
- `.moai/specs/SPEC-V03-WORKSPACE-001/` — 선행 SPEC (`status: completed`)
- `docs/v0.3-signoff.md` — SPEC-1 sync 종결 감사
- `.moai/state/verify/goal-spec12345/` — OQ-8 재현 증거 (로그 + 소스)

---
id: SPEC-V03-WORKSPACE-002
title: "진행 기록 — v0.3 멀티패널 셸"
version: "0.3.6"
status: in-progress
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
  - spec.md         # 요구사항 61개 (REQ-PANEL-070~073 + 070a·070b·071a + 001~065)
  - plan.md         # 확정 결정 + 미해결 결정 10건(OQ-1~OQ-10) + 마일스톤 M0~M8
  - acceptance.md   # Given/When/Then AC 95개 (AC-PANEL-001~095)
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
blocking_decisions:
  total: 10
  confirmed: [OQ-1, OQ-2, OQ-5, OQ-6]       # 외부 검토 2인 + 사용자 승인 (2026-08-08)
  open: [OQ-3, OQ-4, OQ-7, OQ-8, OQ-9, OQ-10]
  m0_blocked_by: none          # M0은 결정 무의존 — 즉시 착수 가능
  m1_blocked_by: none          # OQ-1·OQ-2 확정으로 해제
  m2_blocked_by: [OQ-7]        # 탭 축이 레이아웃 형태를 규정
  m3_blocked_by: [OQ-8]        # 창 축 AC 범위 (핵 결함은 M0이 닫음)
  m4_blocked_by: [OQ-3, OQ-4]
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
| 요구사항 | **61개** (`REQ-PANEL-070~073` + `070a`·`070b`·`071a` = 출하 중인 결함, `001~065` = 기능) |
| 수용 기준 | **95개** (`AC-PANEL-001~095`; 항목 수와 최대 번호의 일치는 우연) |
| 마일스톤 | **M0**(출하 중인 결함 재현 우선) → M1~M8 |
| 결정 | **확정 4건**(OQ-1·2·5·6) / 미해결 6건(OQ-3·4·7·8·9·**10**) — `plan.md` §A.2. OQ-10은 판 0.3.6 전수 실측에서 파생(extension 3항목의 층 귀속, M5 진입 전 확정) |
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
| **배정 점검 (N1)** | `plan.md` §C의 `^대상 요구:` / `^대상 AC:` 파싱 후 인벤토리와 차집합 | **REQ 61/61 배정 (미배정 0)** · **AC 90/95 배정** — 나머지 5건은 §C.0이 **의도된 교차 마일스톤 항목**으로 선언한 AC-PANEL-090/091/092/093(품질 게이트, 모든 마일스톤의 완료 조건) + 094(릴리스 게이트) · **ghost 참조 0** |
| 배정 점검 — 사전 상태 | 같은 방법, 판 0.3.2 트리 | REQ 미배정 **2**(070b·071a), AC 미배정 **85** — **M0만 `대상 AC:` 줄을 갖고 M1~M8은 배정 축이 아예 없었다** |
| M0 소속 일치 | `plan.md` §C M0 `대상 AC:` / `acceptance.md` §0 구성원 / §I.3 목록 | 세 곳 모두 **12건** 일치 |
| **다섯 번째 반증 조건 (판 0.3.6 신설)** | 각 REQ에 대해 "검증 AC 중 그 REQ와 같은 마일스톤에 있는 것이 하나라도 있는가" | **위반 0건.** 시계열 실측: 판 0.3.4 = **0** / 판 0.3.5(AC만 이동) = **1**(`REQ-PANEL-001 @M1` → 유일 검증 AC가 M2) / 판 0.3.6 = **0**. 그 위반 1건이 이번 판의 R2 정정 대상이었다 |
| **↔ 검증 AC 0건인 REQ** | 같은 파싱 | **0건** (61 REQ 전부 최소 1개 AC가 인용) |
| **외부 메커니즘 주장 전수 확인** | `research.md` §10.1 — 9건을 패키지 런타임 조회·소스 직독·인용 라인 대조로 검사 | **거짓 1 / 불완전 1 / 부정확 1 / 참 6.** 거짓은 R7(`.csv`·`.bib` 부재). 기준선은 **커밋 `040df4a`** — 워킹 트리가 아니다(아래 주의) |
| **M1~M8 배정의 검토 상태** | — (여전히 사람이 전수 검토하지 않았다) | **도출값이다.** AC↔REQ 매핑은 iteration 3이 orphan 0 / uncovered 0으로 검증했고 **도출 규칙 자체는 이제 반증 조건 5건**으로 감사된다(`plan.md` §C.0). 판 0.3.5의 R2와 판 0.3.6의 다섯 번째 조건이 **각각 실제 위반을 잡았으므로** 조건들이 공허하지 않음은 실증되었다. 그럼에도 **M3~M8의 개별 배정 타당성은 여전히 미검토** — 권고: **각 마일스톤 진입 시 그 마일스톤의 `대상 AC:` 전건만 대조한다**(과잉주장 금지 규약의 검사 시점과 같은 리듬) |
| spec-lint 헤딩 규약 | `### Out of Scope —` h3 하위 섹션 **9개**, 각각 `-` bullet 보유 | PASS |

**기준선 주의 — 판 0.3.6은 M0 구현과 병행 작성되었다.** 이 판을 쓰는 동안 `dev-m0`가 `src/editor/MarkdownEditor.tsx` 등 4개 소스 파일을 수정 중이었다(워킹 트리 dirty). §10.1의 첫 측정을 워킹 트리에서 뜬 결과 줄 번호 2건을 틀렸고(`:118`/`:124` → 실제 `:120`/`:125`), `git show 040df4a:<path>` 로 재측정해 정정했다. **plan 아티팩트의 인용은 커밋 기준이어야 한다** — 병행 구현 중에는 워킹 트리가 안정된 기준선이 아니다. 보호 경로 무변경 검사 두 줄(§E.1c 1·2행)도 판 0.3.5 시점 결과이며, 판 0.3.6 시점에는 `src/`가 M0에 의해 정당하게 dirty하다.

**미검증 (정직한 공백)**: `pnpm test` / `pnpm typecheck` / `pnpm lint`는 plan 단계에서 실행하지 않았다. baseline(199 테스트 파일 / 33 e2e spec)은 오케스트레이터 제시값을 전제로 삼았고 파일 수만 실측했다. spec-lint 도구는 이 저장소에 없어 헤딩 규약은 SPEC-1의 통과 형태 복제로 달성했다.

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

## §E.3 Run-phase Audit-Ready Signal

```yaml
run_complete_at: 2026-08-09
run_commit_sha: 48aa799        # M0 구현 커밋
m1_commit_sha: pending-backfill-m1
run_status: milestone-partial   # M0·M1 완료. M2~M8은 미착수
milestone: M0+M1
ac_pass_count: 20               # M0 12 + M1 8
ac_fail_count: 0
ac_scope: >-
  M0: AC-PANEL-080 / 080b / 080c / 080d / 080e / 080f / 081 / 081b / 081c / 082 / 083 / 084
  M1: AC-PANEL-010 / 010b / 011a / 011b / 012 / 013 / 013b / 014
reproduction_first: true         # REQ-PANEL-073 — M0 3건 + M1 await 창·sticky 2건 재현
preserve_list_post_run_count: 0  # PRESERVE 목록 위반 0건
reconciliation_core_unchanged: true   # 5파일 git diff --quiet 전부 exit 0
document_mode_principles_unchanged: true
extension_independence_unchanged: true
extension_array_untouched: true       # AC-PANEL-042 allowlist 전제 보존
new_warnings_or_lints_introduced: 0
teardown_discipline: release-before-executor-detach
dirty_model: derived-content-revision  # 단조 카운터가 아니다 — §E.2 M1의 긴장 해소 참조
test_files: 203                  # 기준선 199 → M0 201 → M1 203
tests: 2237                      # 기준선 2191 → M0 2209 → M1 2237
coverage_gate: pass              # per-file 85%, All files 96.06%
cross_platform_build:
  performed: false
  reason: "Electron 렌더러 유닛 범위. Windows e2e 부재는 C-7로 승계된 기존 공백"
total_run_phase_files: 31        # M0 15 + M1 16(소스 8 + 테스트 7 + progress.md 1)
m1_to_mN_commit_strategy: "마일스톤별 단일 커밋 + SHA 백필 커밋. M2~M8은 후속 위임"
deferred_by_open_decision:
  - "editMode의 패널 축 이관 — OQ-3 (M4)"
  - "소비처의 패널 지목 배선 — OQ-4 (M4)"
  - "파일 종류 판정 함수 — OQ-10 (M5)"
```

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

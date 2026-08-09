---
id: SPEC-V03-WORKSPACE-002
title: "진행 기록 — v0.3 멀티패널 셸"
version: "0.3.5"
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
  - spec.md         # 요구사항 61개 (REQ-PANEL-070~073 + 070a·070b·071a + 001~065)
  - plan.md         # 확정 결정 + 미해결 결정 9건(OQ-1~OQ-9) + 마일스톤 M0~M8
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
  - bd1ece5  # 판 0.3.5 — R1~R5 (plan 단계 최종판)
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
| 요구사항 | **61개** (`REQ-PANEL-070~073` + `070a`·`070b`·`071a` = 출하 중인 결함, `001~065` = 기능) |
| 수용 기준 | **95개** (`AC-PANEL-001~095`; 항목 수와 최대 번호의 일치는 우연) |
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
| 0.3.1 | **FAIL, 총계 0.85 — 임계 도달** (Clarity 0.84 / Completeness 0.84 / Testability 0.82 / Traceability 0.90), must-pass 7항목 전부 통과, 15건 중 11건 완전 해소. **실패 사유는 점수가 아니라 Retry Loop Contract의 회귀 규칙** — iteration-1 D7이 모든 아티팩트에서 미기재 | 0.3.2에서 D7 실질 해소(REQ-PANEL-006 `shall not` + AC-PANEL-006c + OQ-9 후보 무관 조건) + F1~F14 해소. 감사 판정: **"M0 실질은 견고하다"** |
| 0.3.2 | **FAIL, 총계 0.83.** must-pass 7항목 통과. 세 규칙 각각으로 실패 — 회귀 규칙(D11 부분 해소) / 단독 차단 신규 지적(N1) / 총계 미달. **0.85 → 0.83은 정체가 아니다**: iteration 2가 Gaps에 `plan.md` §B·§C M3-M8·§D·§E와 `design.md` §4·§6.4-6.5·§7 미독을 공시했고 **신규 차단 지적이 전부 그 구간에서 나왔다** — 아티팩트가 나빠진 게 아니라 감사 표면이 넓어졌다 | 0.3.3에서 High 3건(N1·N2·N3) 처리. Medium/Low(N4~N15)는 사용자 결정으로 이월(§E.1b-3에 기록) |
| 0.3.3 | (재감사 대기 — 델타 + 배정 점검 결과 제출) | — |

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
| **M1~M8 배정의 검토 상태** | — (검토하지 않았다) | **도출값이며 사람이 검토하지 않았다.** AC↔REQ 매핑은 iteration 3이 orphan 0 / uncovered 0으로 검증했으나 **그 위의 도출 규칙**("AC는 자기 REQ의 마일스톤에 속한다")은 미검토. 반증 조건 4건은 `plan.md` §C.0에 기록 — 핵심 편향은 도출이 **REQ 소유권**을 키로 삼고 **AC의 실행 전제조건**을 보지 않는다는 점이다 |
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

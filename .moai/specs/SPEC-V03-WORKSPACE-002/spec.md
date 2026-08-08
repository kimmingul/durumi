---
id: SPEC-V03-WORKSPACE-002
title: "v0.3 멀티패널 셸 — 패널 레이아웃·모드·커맨드 라우팅·비마크다운 편집 표면"
version: "0.3.2"
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
tags: "multipanel, layout, editmode, focus, menurouting, nonmarkdown, language, reconciliation"
---

# SPEC-V03-WORKSPACE-002 — v0.3 멀티패널 셸

## HISTORY

| 일자 | 버전 | 변경 |
|---|---|---|
| 2026-08-08 | 0.1.0 | 최초 작성 — `EPIC-V03-WORKSPACE`의 2번 SPEC. SPEC-1(`status: completed`, 커밋 `3a51f72`)의 D-1~D-7을 승계하고 D-5가 비워 둔 비마크다운 편집 표면을 채운다 |
| 2026-08-08 | 0.2.0 | **오케스트레이터가 코드 직독으로 확인한 출하 중인 결함 2건을 §B.0으로 승격.** ① 크로스-윈도 무성 버퍼 덮어쓰기(REQ-PANEL-070) — 확정 이벤트가 모든 창에 브로드캐스트되고 렌더러가 `path`를 대조하지 않아 깨끗한 버퍼가 다른 파일 내용으로 덮어써지고 저장 시 데이터 손실. ② 전역 조합 플래그 공유(REQ-PANEL-071) — 다른 표면의 `compositionend`가 진행 중인 조합의 보류를 해제. 두 건 모두 `plan.md` §C **M0**이 재현 우선(REQ-PANEL-073)으로 닫는다. **라우팅 계층의 위치를 하드 제약으로 고정**(REQ-PANEL-072 / C-12): `tests/electron/extensionIndependence.test.ts:34-65, 171-174`가 조정 코어 5파일의 확장자 독립과 `applyExternalChange` arity 2를 강제하므로 라우팅 키는 `src/store/` 계층에 산다(`design.md` §6.2a). C-13(`.cm-content` 이중 스타일링 + e2e 34파일 셀렉터 이관) 신설, REQ-PANEL-055에 언마운트 무장 해제 경로 추가, REQ-PANEL-062에 사이드카 재바인딩 플러시 위험 추가. `plan.md`에 OQ-9(패널 배치 persist 슬롯 부재) 신설 |
| 2026-08-08 | 0.2.1 | **OQ-8이 기계적으로 재현되어 확정 결함이 되었다.** 오케스트레이터가 실제 모듈 3개(`attachExternalChangeChannel`/`useReconciliationStore`/`registerReconciliationExecutor`) + 실제 `EditorState`로 구동해 관측: 열지도 감시 등록하지도 않은 경로의 확정 변경이 깨끗한 버퍼를 교체하고 **조정 상태가 `idle`로 정착**하며, dirty 선행 시에만 보호된다. 증거 `.moai/state/verify/goal-spec12345/oq8-repro.log` + `…/oq8-repro-source.ts.txt`. REQ-PANEL-070에 **미등록 경로 폐기 조항과 `idle` 정착 금지 조항**을 추가하고, AC를 4건으로 분할(080 깨끗한 버퍼 / 080b `idle` 정착 금지 / 080c dirty 보호 회귀 / 080d 디스크 전파 금지). **검증 범위 분할을 정직하게 기록**: 렌더러 절반은 실행 관측, main 절반(`getAllWindows()` 브로드캐스트)은 정적 소스 사실이며 엔드투엔드 다중 창 실행은 수행되지 않았다 — AC-PANEL-084가 소스 스캔에서 멈춘다. 결함이 창 축 문제보다 넓다는 정정(창 하나로 재현됨). OQ-8 잠정 권고를 후보 1(유닛 재현 + main 소스 단언)로 유지·강화. **`progress.md` 신설** — `§E.1` 채움 + `§E.2`/`§E.3`/`§E.4` 자리표시자 + `sync_commit_sha` + `§F` 예약 |
| 2026-08-08 | 0.3.0 | **외부 검토(codex + grok, 2인 수렴 — gemini는 `IneligibleTierError`로 불참) + 사용자 결정으로 OQ-1·2·5·6 확정.** ① **OQ-1** 중앙 영역 분할 — **논거 교체**: 소유권 분리(사이드바=전역 저작 표면 / 패널=문서 국소). 초판의 "폭 SSOT 유출"·"테스트 841줄" 논거는 잘못된 전제에서 파생되어 **철회**. 실제 비용은 **사이드바 데이터 재배선**(REQ-PANEL-065)이며 `RightSidebar`는 활성 원고 패널에 귀속된다(가장 왼쪽 패널 아님). ② **OQ-2** 축 분리 유지 + **v0.3 dual-open 금지**(v0.4 연기) — `design.md:57`의 "1문서 N뷰 공유" 정정(CM6가 하지 않는 일이며 오늘 전파는 문서 전체 교체), §2.5에 v0.4 5개 의무 기록, 별칭 탐지 한계 명시(REQ-PANEL-011a), **revision 파생 dirty**로 sticky(issue #12)와 저장 await 창 결함을 함께 해소(REQ-PANEL-015). ③ **OQ-5** 트리를 신뢰 범위로 좁혀 표시 — **동의 배너 기각**(내 잠정 권고 철회): main 다이얼로그를 통과하지 않는 동의는 자동 승격이다. 신뢰 확대가 asset 읽기 표면도 확대함을 기록(REQ-PANEL-036c). ④ **OQ-6** (i) 채널 분리 **3겹**(분리 + main 대상 검증 + import 부재) — "분리만으로 표현 불가능" 주장 정정, 세 쓰기 진입점 전부(REQ-PANEL-044a); (ii) **(B′)** 보조 파일 EOL 복원 — 내 Residual-risk 과장 정정(`applyExternalChange.ts:51-52` 주석과 `reconcileIntegrity.test.ts:90-97`이 이미 이 모델을 문서화·증명), 혼합 줄 끝 보존은 범위 밖 명시(REQ-PANEL-048a). REQ 50 → 58, AC 79 → 89 |
| 2026-08-09 | 0.3.1 | **Plan Audit Gate FAIL(총계 0.75 / 임계 0.85) 대응 — Blocking-M0 4건 + Medium/Low 11건 해소. 새 결정은 필요하지 않았다.** ① **D1** 라우팅 키가 마운트 시점 경로에 고착되는 공백 — `src/App.tsx:153-160`이 `key`를 주지 않고 마운트 effect deps가 `[]`(`MarkdownEditor.tsx:176`)이며 `filePath`는 별개 effect(`:166`)가 처리하므로 하나의 `EditorView`가 문서를 갈아탄다. **REQ-PANEL-070a**(재키잉 의무) + **AC-PANEL-080e** 신설, `design.md` §6.2a에 승인 메커니즘(주입된 setter 클로저 — 시그니처 무변경)과 `filePath` 결속 명시. ② **D2** AC-PANEL-080b가 **반증 불가능**했다 — `'idle'`이 이벤트 이전·수정 전 사후·수정 후 사후 세 시점 모두의 값(`shared/reconciliation.ts:164-177`). 전이 관측(리듀서 호출 횟수 + 상태 객체 참조 동일성 + Map 항목 부재)으로 재작성하고 REQ-PANEL-070 조항도 수정. ③ **D3** **"dirty 경로는 이미 올바르게 동작한다"는 거짓이었다** — notify 분기가 다른 경로의 `change`를 `pending`에 심고(`:206`) `user-load-from-disk`가 그것을 적용한다(`:251-257`). 즉 dirty 문서는 **배너 클릭 1회 뒤** 오염되며, REQ-WS-028의 "사용자 확인"이 형식만 충족된 채 대상이 틀린다. AC-PANEL-080c 전면 재작성 + 영향 범위 표 정정 + `research.md` §7.3a-3 신설. 초판이 확립한 것은 **emit 시점 버퍼 불변**뿐이었고 `pending`을 관측하지 않았다. ④ **D4** `compositionGate.detach()`가 `sink.onCompositionEnd()`를 호출하지 않아 `composing`을 **영구 latch**한다(`:88-93`) — 오늘은 세션 전체, M0 후에는 그 문서, OR 합류 후에는 한 패널의 언마운트가 문서를 동결시킨다. **REQ-PANEL-071에 detach 해제 의무** + **AC-PANEL-081b** 신설(스케줄러는 PRESERVE 유지). **D3·D4는 감사가 기계 재현** — `research.md` §10.0에서 두 항목만 코드 직독 → 기계 재현으로 승격. Medium/Low: D5(§6.2b의 "이미 계산된 boolean" 오진술 정정 — 리듀서가 스스로 계산하므로 스토어가 `composition-end` dispatch를 억제해야 한다 + §6.2c에 OR는 safety에서 옳고 liveness는 D4가 담보함을 기록) / D6(REQ-PANEL-036c 미커버 → AC-PANEL-036d, 문서·검토 게이트 형태임을 명시) / **D7(판 0.3.1에서 누락 — 판 0.3.2에서 해소)** / D8(OoS 7→9) / D9(요구 수 자기모순 + 커밋 누락) / D10(REQ-PANEL-072 근거를 테스트 강제분과 SPEC 추가분으로 분리) / D11(AC-PANEL-082의 `applyExternalChange.ts` 예외 철회 — 클로저 형태가 그 파일을 무변경으로 남긴다) / D12(⟨OQ-8⟩을 "추가 AC 여부만 미해결"로 축소 + 일괄 판정불가 규칙에 예외) / D13(AC-PANEL-080d를 디스크 SHA에서 **쓰기 채널 전달값**으로 — M0 밀폐성과의 모순 해소) / D14(선언 순서 048/048a→047 뒤, 095→094 뒤) / D15(REQ-PANEL-043b 오인용 → REQ-PANEL-043, AC-PANEL-043b). REQ 58 → 59, AC 89 → 92 |
| 2026-08-09 | 0.3.2 | **재감사 0.85(임계 도달) 후속 — iteration-1 **D7** 실질 해소 + F1~F14.** ① **F5/D7** `plan.md` OQ-9이 요구한 D-6/C-4 조건이 REQ-PANEL-006에 없었다 — **persist된 패널 경로는 신뢰 판정의 입력이 되어서는 안 된다**는 `shall not` 추가(C-4 · SPEC-1 D-6 인용) + **AC-PANEL-006c** 신설 + OQ-9에 후보 무관 조건 명시. `prefs:set` 가드가 `workspaceFolders`/`recentFiles`/`recentFolders` 세 필드만 검사하므로(`pathGuard.ts:188`) 신규 `panels` 필드는 **기본적으로 검사 밖**이라는 점을 근거로 적었다 — "명시하지 않으면 취약"이다. 판 0.3.1이 "Medium/Low 11건"이라 적고 10건만 열거한 빈 슬롯도 채웠다. ② **F1** 네 아티팩트가 `MarkdownEditor.tsx:166`을 "별개 effect"로 인용했으나 그 줄은 `[]`-deps 마운트 effect **안의** 마운트 시점 시드이고 `:165` 주석이 스스로 그렇다고 적는다 — 따라가면 **D1을 정확히 재현한다.** 실제 `[filePath]`-deps effect는 **`:74-81`이며 이미 존재하고 문서 전환마다 이미 재실행된다** → D1의 의무가 "새 effect 추가"에서 "이미 있는 effect 안에서 등록"으로 좁아졌다(구현이 더 싸고 오구현 여지도 작다). 4곳 정정 + `design.md` §6.2a에 그 사실 기록. ③ **F4** D3이 철회한 거짓 진술이 3곳에 남아 있었다 — `acceptance.md`의 같은 AC 안에서 19줄 간격으로 자기모순. 삭제하고 **남는 참을 정확히** 적었다: 재현이 확립한 것은 **emit 시점 버퍼 불변**뿐이고 `!state.isDirty`는 "유일한 보호막"이 아니라 **즉시 적용만** 막는다. ④ **F2** AC-PANEL-080e의 RED 형태 정정 — 오늘은 경로 필터가 **아예 없어** 둘 다 도달하며, "정확히 반대"는 **반쪽 키잉** 구현의 형태다(그것이 이 AC가 방어하는 회귀임을 별도로 적었다). ⑤ **F3** teardown 순서 미규정 — 오늘 `detachExecutor(); compositionGate.detach();` 순(`:169-172`)에서 해제가 드레인하면 `effectHandler?.()`(`reconciliationStore.ts:45`)가 **조용히 삼키고** 상태만 `settled`가 된다. **REQ-PANEL-071a** + **AC-PANEL-081c** 신설, 단계별 심각도 기술. ⑥ **F8** null-path 문서 키잉 미규정 → **REQ-PANEL-070b** + **AC-PANEL-080f**. ⑦ **F9** AC-003b에 기준선 앵커 부재 → M0 착수 전 커밋(`2541727`) DOM 스냅샷 픽스처를 M2 산출물로. 나머지: F6(요구 수 4곳) / F7(AC §E 순서) / F10(등급 요약에 081b) / F11(§8.1 orphan) / F12(중복 문단) / F13(폭 합 허용 오차) / F14(off-by-one 2건). REQ 59 → 61, AC 92 → 95 |

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

**그리고 이 결함은 미래형이 아니다.** 다중 창은 v0.2.31에 이미 출하되어 있으므로(`electron/main.ts:103`, `shared/ipc-contract.ts:310`) 위 사슬은 **오늘 성립한다** — 창 B의 깨끗한 버퍼가 창 A 파일의 내용으로 덮어써지고, 저장하면 A가 B를 지운다. 조합 플래그(`shared/reconciliation.ts:57`)도 같은 형태로 창 전역 단일이다. 두 결함은 §B.0이 REQ-PANEL-070~073으로 다루며 `plan.md` §C의 **M0**가 재현 우선으로 소유한다. 즉 이 SPEC은 기능 추가 전에 **출하 중인 데이터 손실 경로를 먼저 닫는다.**

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
| 라우팅 키(routing key) | 확정 이벤트를 어느 문서·어느 표면에 보낼지 결정하는 값. **조정 코어 밖에** 산다(REQ-PANEL-072의 구조 제약) |

---

## §B 요구사항 (GEARS)

### §B.0 출하 중인 결함의 해소 — 최우선

> 이 절은 v0.2.31에 **이미 출하된** 두 결함을 다룬다. 멀티패널이 만드는 결함이 아니라, 멀티패널이 곱하는 기존 결함이며 오케스트레이터가 코드 직독으로 확인했다. `plan.md` §C의 M0가 이 절을 소유하고 **재현 우선(reproduction-first)** 으로 진행한다.
>
> 두 결함은 같은 뿌리를 갖는다: **확정 이벤트의 라우팅 계층이 존재하지 않는다.** SPEC-1은 조정 코어를 의도적으로 경로 무지(path-blind)로 설계하고 라우팅을 위 계층에 남겼는데, 그 계층이 아직 만들어지지 않았다.

**REQ-PANEL-070** (Event-driven — 출하 중인 결함, **기계적으로 재현됨**) — 확정 이벤트는 대상 문서를 벗어나 적용되지 **않는다**
**When** 확정된 외부 변경이 렌더러에 도달하면, 앱은 그 변경을 **그 경로에 해당하는 문서에만** 적용**해야 하며(shall)**, 다른 문서의 버퍼에 적용하지 **않아야 한다(shall not)**.

**When** 어떤 문서도 그 경로를 열고 있지 않으면, 앱은 그 이벤트를 폐기**해야 하며(shall)** 어떤 버퍼에도 적용하지 **않아야 한다(shall not)**.

**폐기된 이벤트는 어떤 문서의 조정 상태에도 전이를 일으켜서는 안 된다(shall not)** — 리듀서가 그 이벤트로 호출되지 **않아야 하며(shall not)**, 미등록 경로에 대한 Map 항목이 생성되어서도 **안 된다(shall not)**.

> **판정은 상태 *값*이 아니라 *전이 발생*으로 한다.** 초판은 이 조항을 "`idle`로 정착시키지 않는다"로 적었는데 **그것은 반증 불가능하다**: `initialReconciliationState()`가 `status: 'idle'`을 반환하고(`shared/reconciliation.ts:164-173`) `settled()`도 `'idle'`을 반환하므로(`:175-177`), `'idle'`은 이벤트 **이전**·수정 **이전 사후**·수정 **이후 사후** 세 시점 모두의 값이다. 값 비교로는 세 시점이 구분되지 않는다(감사 지적 D2, 수용). 전이 관측(리듀서 호출 여부 또는 문서 상태 객체의 참조 동일성)만이 판별력을 갖는다.

**REQ-PANEL-070a** (Event-driven) — 패널이 문서를 재바인딩하면 라우팅 키도 재키잉**되어야 한다(shall)**
**When** 어떤 패널이 다른 문서로 재바인딩되면, 앱은 그 시점에 경로→조정 상태 / 경로→적용 대상 매핑을 **재키잉해야 한다(shall)**. 이전 경로에 대한 등록은 해제**되고(shall)**, 새 경로에 대한 등록이 수립**된다(shall)**.

**왜 이것이 M0의 핵심인가**: 오늘 `MarkdownEditor`의 마운트 effect는 deps가 `[]`이고(`src/editor/MarkdownEditor.tsx:176`), `filePath`는 prop으로 들어와 **`[filePath]`-deps effect(`:74-81`)가 처리한다**. 상위에서 `key` prop도 주지 않으므로(`src/App.tsx:153-160`) **하나의 `EditorView`가 문서를 갈아타며 재사용된다.**

> **`:166`을 등록 지점으로 오해하지 말 것.** 그 줄은 `[]`-deps 마운트 effect **안의** 마운트 시점 시드이며, `:165` 주석이 스스로 `Subsequent changes go through the filePath effect`라고 적는다. `:166`을 따라가면 마운트 시점 경로를 클로저에 캡처해 **이 요구가 닫으려는 결함을 정확히 재현한다.**

따라서 등록을 그 `[]`-deps effect에 두면 **경로가 첫 마운트 시점에 캡처되어 갱신되지 않는다.** 파일을 바꾼 뒤에는 (a) 새 경로의 변경이 아무 데도 라우팅되지 않고 (b) **옛 경로의 변경이 그 패널로 들어온다** — M0이 닫으려는 결함 계열이 다른 형태로 재발한다. 등록·해제는 **`filePath` 변화에 결속되어야 하며 `[]`에 결속되어서는 안 된다(shall not)**. 구현 형태는 `design.md` §6.2a가 확정한다.

**재현 근거 (실행 관측)**: 실제 모듈(`attachExternalChangeChannel`, `useReconciliationStore`, `registerReconciliationExecutor`)과 실제 `EditorState`로 재현되었다. `/w/b.md`를 깨끗하게 열고 있는 창에 그 창이 **열지도 감시 등록하지도 않은** `/w/a.md`의 확정 변경 1건을 투입한 결과:

```
[OQ-8]       emit 후 b.md 버퍼 = "A의 내용\n"      ← 버퍼가 교체됨
[OQ-8]       조정 상태 = "idle"                    ← 오적용이 정상 완료로 정착
[OQ-8/dirty] emit 후 b.md 버퍼 = "B의 내용\n"      ← emit 시점만 불변 (배너 경유로는 오염됨 — D3)
[OQ-8/dirty] 조정 상태 = "held-notify"
```

증거: `.moai/state/verify/goal-spec12345/oq8-repro.log`, `.moai/state/verify/goal-spec12345/oq8-repro-source.ts.txt`.

**결함은 "두 창의 경쟁"보다 넓다**: 재현에서 창이 하나였고 문제의 파일을 열지도 않았다. 즉 **어떤 창이든 도착한 브로드캐스트를 무조건 자기 버퍼에 적용한다.**

**검증된 결함 사슬** (v0.2.31 출하본, 다중 창은 이미 지원됨 — `electron/main.ts:103` `onNewWindow`, `shared/ipc-contract.ts:310` `MenuCommand 'newWindow'`):

| # | 지점 | 사실 |
|---|---|---|
| 1 | `electron/ipc/project.ts:40-44` | `broadcast()`가 `project:externalFileChange`를 `BrowserWindow.getAllWindows()` — **모든 창**에 보낸다 |
| 2 | `src/store/externalChangeChannel.ts:28-50` | 그 변경을 창 전역 조정 스토어로 dispatch하며 **`change.path`를 현재 문서와 대조하지 않는다** |
| 3 | `src/store/reconciliationStore.ts:39` | 기본 정책이 `autoApplyPolicy` |
| 4 | `shared/reconciliation.ts:192-197` | `decision.kind === 'apply' && !state.isDirty` → `effects: [{kind:'apply-to-buffer', content: change.content}]`. **경로 검사 없이** 내용이 버퍼로 직행한다 |

**귀결**: 창 A가 `a.md`를, 창 B가 `b.md`를 열고 있고 창 B의 버퍼가 깨끗할 때, `a.md`에 외부 쓰기가 들어오면 **`a.md`의 내용이 창 B의 `b.md` 버퍼에 적용된다.** 이때 `appStore.filePath`는 여전히 `b.md`이므로, 사용자가 저장하면 **A의 내용이 B의 파일을 덮어쓴다 — 데이터 손실이다.**

**영향 범위 — 정정 (감사 지적 D3, 수용)**: 초판은 "미저장 편집이 있는 버퍼는 보호된다"고 적었다. **틀렸다.** dirty 문서도 오염되며, 손실이 **사용자 클릭 한 번만큼 지연될 뿐이다.**

| 문서 상태 | 오염 시점 | 사슬 |
|---|---|---|
| **깨끗한 문서** | **즉시** | `!state.isDirty` 통과 → `apply-to-buffer` → 버퍼 교체 |
| **dirty 문서** | **배너 동작 경유 (클릭 1회 후)** | notify 분기가 `pending: change`를 심는다(`shared/reconciliation.ts:206`) — 그 `change`는 **다른 경로의** 확정 변경이다. 사용자가 "디스크에서 불러오기"를 누르면 `:251-257`이 `state.pending.content`를 적용한다 |

**기계 재현으로 확정되었다** (관측 출력):

```
[D3] 배너 상태 = "held-notify"
[D3] pending.path = "/w/a.md"          ← b.md 문서의 상태에 a.md의 변경이 심겼다
[D3] emit 직후 버퍼 = "B의 내용\n"      ← 즉시 오염은 없다
[D3] 불러오기 후 버퍼 = "A의 내용\n"    ← 클릭 한 번 뒤 오염된다
```

증거: `.moai/state/verify/goal-spec12345/d3d4-repro.log`, `…/d3d4-repro-source.ts.txt`.

**dirty 경로가 더 나쁜 이유**: 사용자에게 `b.md`의 배너가 보이고, 사용자는 `b.md`를 불러오겠다고 **명시적으로 동의한다.** 그런데 적용되는 것은 `a.md`의 내용이다. SPEC-1 REQ-WS-028의 "사용자 확인"이 **형식적으로 충족된 채 대상이 틀린다** — 확인 없는 손실보다 나쁠 수 있다.

**초판이 확립한 것의 정확한 범위**: 첫 재현(`[OQ-8/dirty]`)은 **emit 시점의 버퍼 불변**만 관측했고 `pending`을 관측하지 않았다. 그것으로 "dirty 보호"를 결론한 것은 증거를 넘어선 주장이었다.

**수용 기준에 대한 귀결**: AC는 **깨끗한 문서 케이스와 dirty 문서의 `pending`·배너 동작을 모두 다뤄야 한다(shall)**. 어느 한쪽만 검사하면 결함의 절반이 통과한다.

**검증 범위의 정직한 분할**: 위 재현은 **렌더러 절반**(경로 미대조 → 무조건 적용 → `idle` 정착)을 실행으로 확정했다. **main 절반**(`broadcast()`가 그 경로를 등록하지 않은 창에도 전달 — `electron/ipc/project.ts:40-44` `BrowserWindow.getAllWindows()`)은 **정적 소스 사실이며 실행하지 않았다.** 엔드투엔드 다중 창 실행은 수행되지 않았다.

**REQ-PANEL-070b** (Where) — 경로 없는 문서(null path)의 키잉이 규정**되어야 한다(shall)**
**Where** 문서가 디스크 경로를 갖지 않는 경우(untitled / 새 빈 버퍼), 그 문서는 경로 키 Map에 **어떤 항목도 갖지 않아야 한다(shall not)** — null이나 빈 문자열을 키로 삼지 **않는다(shall not)**. 경로 없는 문서에는 감시 등록도 조정 대상도 없으므로 라우팅 키가 존재할 이유가 없다.

**When** 경로 없는 문서가 경로를 획득하면(다른 이름으로 저장), 앱은 그 시점에 **새 경로로 등록을 수립해야 한다(shall)** — REQ-PANEL-070a의 재키잉과 동일한 경로를 탄다.

**왜 명시하는가**: 프로젝트 없음은 1급 상태이고(REQ-PANEL-003, C-1) 빈 버퍼는 REQ-PANEL-004가 정의하는 정상 상태다. `design.md` §6.2a의 클로저 형태는 `filePath`가 null이면 등록을 건너뛰는 것이 자연스러우므로 **우연히 안전하지만**, 그것을 고정하는 요구가 없으면 구현이 null을 키로 쓰는 쪽으로 갈 수 있다 — 그 경우 서로 다른 untitled 문서가 같은 키를 공유한다(감사 지적 F8, 수용).

**REQ-PANEL-071** (State-driven — 출하 중인 결함) — 조합 플래그는 표면을 벗어나 공유되지 **않는다**
**While** 어떤 편집 표면에서 IME 조합이 진행 중인 동안, 다른 편집 표면의 `compositionend`가 그 조합의 보류 상태를 해제**해서는 안 된다(shall not)**.

**검증된 결함**: `shared/reconciliation.ts:57`의 `composing`은 **창 전역 단일 boolean**이고, 어느 뷰의 게이트든 그것을 쓴다(`src/editor/compositionGate.ts:109, 112` ← `src/editor/MarkdownEditor.tsx:155`). 패널이 둘이면 패널 B의 `compositionend`가 패널 A가 아직 조합 중인 동안 플래그를 지운다.

**게이트가 detach되면 그 게이트가 보유한 조합 보류는 해제되어야 한다(shall)**. detach가 조합 보류를 **영구화해서는 안 된다(shall not)**.

**기계 재현으로 확정된 결함 (감사 지적 D4)**: `src/editor/compositionGate.ts:88-93`의 `detach()`는 리스너 2개를 제거하고 `clearPending()`으로 예약된 드레인을 **취소하지만 `sink.onCompositionEnd()`를 호출하지 않는다.** 그리고 `src/editor/MarkdownEditor.tsx:168-176`의 정리 함수가 `compositionGate.detach()`를 호출한다. 관측 출력:

```
[D4] 조합 시작 후 composing = true
[D4] detach 후 composing = true        ← 해제되지 않는다
[D4] 이후 조정 상태 = "held-composition"
[D4] 버퍼 = "B의 내용\n"                ← 이후 어떤 외부 변경도 적용되지 않는다
```

증거: `.moai/state/verify/goal-spec12345/d3d4-repro.log`, `…/d3d4-repro-source.ts.txt`.

**영향 범위는 단계마다 다르다**: 오늘(전역 플래그 1개)은 조합 중 언마운트가 **세션의 모든 조정을 영구 동결**시킨다 — 외부 변경이 다시는 적용되지 않는다. M0의 문서별 키잉 후에는 **그 문서가** 동결된다. §6.3의 OR 합류가 얹히면 **한 패널의 언마운트가 그 문서를 동결**시킨다.

**이 결함은 REQ-PANEL-055가 실행자에 대해 다루는 언마운트 무장 해제의 대칭 형태이며, 초판의 어느 요구에도 없었다.** IME 안전이 최우선 축이고 v0.2.19~.28 계열이 다섯 번 출하되었으므로 작은 공백이 아니다.

**수정 범위 제한**: `compositionGate.ts`의 지연 드레인·연속 조합 취소 로직은 **PRESERVE 대상 그대로다**(`plan.md` §A.5). 고치는 것은 **detach 시 해제**이며 스케줄러 재작성이 아니다.

**REQ-PANEL-071a** (Ubiquitous) — 해제와 실행자 분리의 **순서가 규정되어야 한다(shall)**
detach 시 조합 보류를 해제하는 동작은 **그 문서의 조정 실행자가 아직 부착된 상태에서** 수행**되어야 한다(shall)**. 또는 해제가 보류분을 드레인하지 **않도록(shall not)** 규정한다. 둘 중 하나를 **명시적으로 선택해야 하며(shall)**, 순서를 규정하지 않은 채 두어서는 **안 된다(shall not)**.

**근거 — 오늘의 순서가 해제를 조용히 손실시킨다**: 현재 정리 함수는 `detachExecutor(); compositionGate.detach(); view.destroy();` 순이다(`src/editor/MarkdownEditor.tsx:169-172`). REQ-PANEL-071의 해제 의무가 그대로 얹히면:

1. `detachExecutor()`가 먼저 실행되어 실행자가 이미 분리된다
2. `compositionGate.detach()`의 해제가 보류분을 드레인한다
3. 산출된 `apply-to-buffer` effect가 `src/store/reconciliationStore.ts:45`의 `effectHandler?.(effect)`에 도달하는데 **핸들러가 null이므로 옵셔널 체이닝이 조용히 삼킨다**
4. 문서 상태는 `settled`(= `idle`)로 정착한다

**결과: 버퍼는 변경을 받지 못했는데 상태는 완료를 주장한다** — 정확히 REQ-PANEL-070의 세 번째 조항(폐기된 이벤트가 전이를 일으키지 않아야 한다)이 막으려는 결함 계열이며, 이번에는 **teardown 순서를 통해** 재도입된다.

**단계별 심각도** (D4와 같은 형태로 기술한다): v0.3은 문서당 패널 1개이므로 그 문서가 닫히는 중이라 **실질 피해가 없다.** §6.2c의 OR 합류가 얹히면 **같은 문서를 참조하는 다른 패널이 남아 있는 상태에서** 이 손실이 일어나 그 패널이 변경을 받지 못한다 — 그때 실재한다.

이것은 **`src/editor/compositionGate.ts:9-25`가 막기 위해 작성된 실패 계열을 한 계층 위에서 재도입하는 것이다.** 그 파일의 주석은 `compositionend` 직후 확정 `input` 이벤트가 별도 태스크로 오므로 그 사이에 문서를 바꾸면 IME의 composing-range 추적이 어긋난다고 기록하고, 연속 조합의 틈을 막기 위해 드레인을 예약·취소하는 구조를 만들었다. 플래그가 공유되면 그 정교한 방어가 **다른 패널에 의해** 무효화된다. 최우선 요구다 — `docs/DOCUMENT_MODE_PRINCIPLES.md` §0의 우선순위(소스 무결성 > IME 안전)와 SPEC-1 REQ-WS-020~022의 계열이다.

**REQ-PANEL-072** (Unwanted) — 라우팅 계층은 조정 코어의 확장자 독립을 깨뜨리지 **않는다**
REQ-PANEL-070·071을 해소하는 라우팅 계층은 다음 다섯 파일에 **경로 매개변수를 추가하거나 확장자 판독 수단을 도입해서는 안 된다(shall not)**: `electron/changeConfirmation.ts`, `electron/watchScope.ts`, `shared/reconciliation.ts`, `src/editor/minimalDiff.ts`, `src/editor/applyExternalChange.ts`.

**근거 — 테스트가 강제하는 부분과 이 SPEC이 더하는 부분을 구분한다 (감사 지적 D10, 수용)**:

| 조항 | 누가 강제하는가 |
|---|---|
| 다섯 파일에 **확장자 판독 수단 6종**(`extname` 호출 / `endsWith('.'` / 확장자 정규식 / `split('.')` / `isMarkdownFile` / 확장자 리터럴 비교)이 없다 | **테스트가 강제한다** — `tests/electron/extensionIndependence.test.ts:34-40`(`LAYER_FILES`) + `:42-65` |
| **`applyExternalChange`의 arity가 2**(`target`, `nextContent`)다 | **테스트가 강제한다** — `:171-174` `expect(applyExternalChange.length).toBe(2)` |
| 다섯 파일의 **다른 export에도 경로 매개변수를 추가하지 않는다** | **이 SPEC이 더하는 조항이다.** 테스트는 `applyExternalChange` 하나의 arity만 고정하므로, 예컨대 `buildReconcileTransaction`에 `path: string`을 추가하면 테스트는 **통과한다** |

초판은 이 세 번째 조항까지 테스트에 귀속시켰다 — **과장이었다.** 요구 자체는 유효하지만 근거는 다르다: 그것은 `:162` 주석이 밝힌 **설계 의도**("조정 계층은 경로를 아예 받지 않는다 — 그 자체가 확장자 독립의 증거다")를 이 SPEC이 요구로 승격시킨 것이며, 한번 경로를 받으면 확장자 분기가 **한 줄 거리**가 되어 `:42-65`의 방어가 관례로 전락한다는 판단에 근거한다.

즉 조정 코어의 경로 무지는 **의도된 설계**이고, 경로 기반 라우팅은 **위 계층의 책임으로 남겨진 것**이다. 그 계층이 없는 것이 REQ-PANEL-070의 결함이다. 라우팅 키가 어디 사는지는 `design.md` §6.2a가 확정한다.

**REQ-PANEL-073** (Ubiquitous) — 해소는 재현 우선으로 진행**한다(shall)**
REQ-PANEL-070·071의 수정은 **결함을 실증하는 실패 테스트를 먼저 작성하고 그 실패를 확인한 뒤** 수행**되어야 한다(shall)**. 수정 후 그 테스트가 통과함이 해소의 증거**다(shall)**. 결함을 재현하지 않은 채 수정하면 무엇을 고쳤는지 알 수 없고, 두 결함 모두 조용히 재발할 수 있는 형태다(경로 미대조·플래그 공유는 컴파일 오류를 내지 않는다).

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

**persist된 패널 경로는 신뢰 판정의 입력이 되어서는 안 된다(shall not)** — `pathGuard`의 신뢰 소스(`sessionAllowed` / `sessionAllowedTrees` / `workspaceFolders` / `recentFiles` / `recentFolders`)에 패널 경로가 추가되어서도, `isAllowedPath`가 그 값을 참조해서도 **안 된다(shall not)**. 패널 경로는 **복원 후보 목록일 뿐이며 권한의 근거가 아니다(shall)**.

**근거 — OQ-5와 같은 공격 형태다** (C-4, SPEC-1 D-6): persist된 패널 경로가 신뢰 판정의 입력이 되면, 손상된 렌더러가 `prefs:set`으로 임의 경로를 패널 배치에 심어 **스스로 신뢰를 넓힐 수 있다.** 그것이 `assertPrefsPatchAllowed`(`electron/pathGuard.ts:183-215`)가 막기 위해 존재하는 형태다.

**추가 위험 — 기본적으로 검사 밖이다**: `prefs:set` 가드는 현재 `workspaceFolders` / `recentFiles` / `recentFolders` **세 필드만** 검사한다(`:188`). 따라서 신규 `panels` 필드는 **기본적으로 그 검사를 통과한다** — 금지를 요구로 명시하지 않으면 구현이 자연스럽게 취약해진다. `plan.md` §A.2 OQ-9이 이 조건을 후보 선택과 함께 확정한다.

이 금지는 REQ-PANEL-006b(복원 실패 경로 표시)와 **양립한다**: 복원 시 `assertAllowedPath`가 각 경로를 검증하므로 신뢰되지 않은 경로는 빈 버퍼 + 오류가 된다. 즉 persist된 경로는 **검증을 받는 입력**이며 검증의 **근거**가 아니다.

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

**REQ-PANEL-011** (Event-driven) — **v0.3에서 dual-open은 금지된다** (사용자 결정, OQ-2)
**When** 이미 다른 패널이 열고 있는 파일을 어떤 패널이 열려 하면, 셸은 **새 뷰를 만들지 않고(shall not)** 그 파일을 이미 열고 있는 패널을 **활성화해야 한다(shall)**. 사용자에게는 오류가 아니라 그 패널로의 이동으로 제시**된다(shall)**.

**왜 금지인가 — 구조적 근거**: 오늘의 문서→뷰 전파는 **문서 전체 교체**다. `src/editor/MarkdownEditor.tsx:177-182`가 `value` prop 변화에 `changes: {from: 0, to: doc.length, insert: value}`를 dispatch한다. 그 경로 위에서 같은 파일을 두 뷰가 참조하면 **패널 A의 키 입력 하나가 패널 B에서 문서 전체 교체가 되어** B의 선택 매핑을 파괴하고 거대한 undo 항목 하나를 남긴다. 문서↔뷰 트랜잭션 동기화 프로토콜(§B.2a) 없이 dual-open을 출하하는 것은 **공유된 것처럼 보이면서 조용히 발산하는 두 에디터**를 출하하는 것이다.

**축은 붕괴시키지 않는다(shall not)**: 이 금지는 v0.3의 동작 제약이며 **상태 모델의 축을 합칠 근거가 아니다.** 문서 축과 패널 축은 v0.3에서 1:1로만 쓰이되 구조로는 1:N을 표현할 수 있게 남**아야 한다(shall)** — 축을 합치면 v0.4의 dual-open이 재작성이 된다.

**REQ-PANEL-011a** (Ubiquitous) — 중복 판정의 보장 범위와 한계
중복 열기 판정은 **경로 동일성**으로 수행**된다(shall)**. 판정은 다음을 보장**한다(shall)**: 정규화 후 동일한 절대 경로는 같은 문서로 인식된다.

판정은 다음을 보장하지 **않는다(shall not)**: 같은 파일을 가리키는 **심볼릭 링크·하드 링크 별칭**은 서로 다른 경로로 인식된다. `electron/pathGuard.ts:55-60`이 `fs.realpath`를 **의도적으로 호출하지 않기** 때문이며(모든 guarded 호출에 비동기 디스크 접근을 추가하지 않기 위한 기록된 수용 위험), 이 SPEC은 그 결정을 완화하지 **않는다(shall not)**.

즉 앱은 **바이트 수준 파일 동일성 탐지를 주장하지 않는다(shall not)**. 별칭 경로로 같은 파일이 두 패널에 열리면 REQ-PANEL-011의 금지를 우회하며, 그 경우의 동작은 정의되지 않은 상태로 **기록된다(shall)** — v0.4의 동기화 프로토콜이 그 경로까지 덮는다.

**REQ-PANEL-012** (Ubiquitous)
저장은 **문서 단위**로 수행**되어야 한다(shall)**. v0.3에서는 문서:패널이 1:1이므로 이 요구는 자명하게 성립하지만, **저장을 패널 상태에 매지 않는다(shall not)**는 구조 제약으로서 유효하다 — 패널에 매면 v0.4의 dual-open에서 어느 패널이 저장 권한을 갖는지 재정의해야 한다.

**REQ-PANEL-013** (Event-driven)
**When** 사용자가 미저장 편집이 있는 문서를 표시하는 패널을 닫으려 하면, 셸은 기존 폐기 확인 흐름(`confirmDiscard`)을 거쳐**야 한다(shall)**.

**v0.4 확장 지점**: 그 문서를 참조하는 다른 패널이 남아 있으면 확인을 요구하지 **않는다(shall not)** — 편집이 소실되지 않기 때문이다. v0.3에서는 1:1이므로 이 분기가 도달 불가하나, 판정을 "**마지막 참조 패널인가**"로 표현**해야 한다(shall)** — "패널을 닫는가"로 표현하면 v0.4에서 재작성된다.

**REQ-PANEL-014** (Unwanted)
셸은 사용자 확인 없이 어떤 패널의 미저장 편집도 폐기해서는 **안 된다(shall not)**. 이는 SPEC-1 REQ-WS-028의 패널 축 확장이며 동일하게 **타협 불가다**.

**REQ-PANEL-015** (Ubiquitous) — dirty는 파생값이**어야 한다(shall)**, 가변 플래그가 아니다
문서의 미저장 여부는 **`currentRevision !== savedRevision`으로 파생**되어야 하며(shall), 별도의 가변 boolean으로 보관되지 **않아야 한다(shall not)**.

**근거 1 — sticky 결함을 복제하지 않는다**: `src/store/appStore.ts:54`의 `isDirty: s.content !== content || s.isDirty`는 sticky다(issue #12). 이 형태를 문서 축으로 베끼면 **문서마다 결함이 복제된다.** 파생값은 sticky일 수 없다.

**근거 2 — await 창 결함을 구조적으로 닫는다 (외부 검토 발견)**: 오늘 두 저장 진입점이 **낡은 내용을 저장하고 무조건 clean으로 표시하는** 형태를 갖는다:

| 진입점 | 형태 |
|---|---|
| `src/hooks/useFileMenuCommands.ts:51-64` | 클로저에서 `content` 캡처 → `await window.api.fileSave(...)` → `await useMemoSidecarStore…saveIfDirty()` → **무조건** `markClean()` |
| `src/hooks/useAppCloseGuard.ts:24-33` | `state.content` 캡처 → `await window.api.fileSave(...)` → `markClean()` |

두 await를 건너는 동안 타이핑된 편집이 **clean으로 표시된다.** 이는 단일 패널 앱에 오늘 이미 존재하며 패널화가 만드는 것이 아니지만, 문서 축 `isDirty`가 이것을 더 중대하게 만든다.

`markClean()`이라는 "지금을 clean으로 선언하는" **명령형 연산 자체가 결함의 형태**다. revision 파생으로 바꾸면 저장은 `savedRevision = <저장을 시작한 시점의 revision>` 대입이 되고, await 창 안의 편집은 `currentRevision`을 올려 부등식이 참으로 남는다 — **결함이 무료로 닫힌다.** 따라서 이 요구는 별개 SPEC으로 넘기지 않고 SPEC-2가 (부수 효과로) 해소**한다(shall)**.

**검증 등급 (정직한 구분)**: 이 결함은 **코드 직독으로 확인되었고 재현하지 않았다.** 결함 A(REQ-PANEL-070, 기계 재현)와 등급이 다르며, 조합 플래그 결함(REQ-PANEL-071)과 같은 등급이다.

---

### §B.2a v0.4로 연기된 문서↔뷰 동기화 프로토콜 (범위 밖 — 의무만 기록)

> REQ-PANEL-011이 v0.3에서 dual-open을 금지하므로 이 프로토콜은 **이 SPEC의 범위 밖이다.** 그러나 "문제가 없다"가 아니라 "**연기되었다**"이므로, v0.4가 재발견하지 않도록 다섯 의무를 이름 붙여 남긴다.

dual-open이 성립하려면 다음 다섯 가지가 **모두** 필요하다:

| # | 의무 |
|---|---|
| 1 | 패널의 트랜잭션이 **정본 문서 revision**을 갱신한다 |
| 2 | 정확한 변경(exact changes)이 형제 뷰로 **origin annotation과 함께** 미러링되고, 그 뷰들의 **undo에서는 제외**된다 |
| 3 | 각 패널의 자기 undo 항목이 **이후의 형제 변경을 통해 매핑**된다 |
| 4 | undo가 사적으로 발산하지 않고 **정본 문서 트랜잭션을 방출**한다 |
| 5 | 저장이 정본 revision을 **한 번** clean으로 표시하고, 참조하는 모든 패널이 **같은 전이를 관측**한다 |

**dual-open은 전용 interleaving 테스트 없이 출하되어서는 안 된다(shall not)** — 위 다섯 의무는 순서 의존적이며, 단일 시나리오 테스트로는 A 편집 → B 편집 → A undo 같은 교차 순서에서의 발산을 잡지 못한다.

REQ-PANEL-011의 금지, REQ-PANEL-011a의 별칭 한계, REQ-PANEL-012/013의 "문서 단위"·"마지막 참조 패널" 표현이 이 프로토콜의 **확장 지점을 열어 둔 채** v0.3을 닫는 형태다.

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

**REQ-PANEL-036b** (Ubiquitous) — **확정: 프로젝트 트리는 신뢰 범위로 좁혀 표시한다** (OQ-5)
프로젝트 트리 표면은 **실제로 열 수 있는 경로만 제시해야 한다(shall)** — 클릭했을 때 `PathNotAllowedError`가 나는 대상을 제시하지 **않아야 한다(shall not)**.

신뢰 모델은 **손대지 않는다(shall not)**: 신뢰 IPC를 추가하지 않고, 동의 배너를 도입하지 않으며, 다이얼로그 유도 힌트도 두지 **않는다(shall not)**. SPEC-1 D-6은 쓰인 그대로 유지**된다(shall)**.

**왜 동의 배너가 기각되었는가 (외부 검토 2인 수렴, 내 잠정 권고 철회)**: 렌더러 배너가 클릭 시 신뢰 승격 IPC를 호출한다면 그것은 **자동 편입에 클릭 가능한 라벨을 붙인 것**이다 — 손상된 렌더러는 이미 모든 클릭과 모든 preload API를 통제하며, 권한 대상은 여전히 매니페스트가 공급한다. 오늘 새 신뢰가 들어오는 경로는 **main이 소유한 OS 다이얼로그 하나뿐**이다(`electron/ipc/shell.ts:122-125` `dialog:openFolder` → `allowSessionPath`). **main 프로세스 다이얼로그를 통과하지 않는 동의는 D-6 보존이 아니라 UX를 입힌 자동 승격이다.**

**마찰은 수용된 비용이며 문서화된 사용자 경로다(shall)**: `X/scripts/`에 도달하려면 기존 폴더 열기 다이얼로그로 그 폴더(또는 프로젝트 루트)를 등록한다. 이것은 결함이 아니라 정의된 경로**다(shall)**.

**REQ-PANEL-036c** (Ubiquitous) — 신뢰 확대는 읽기 표면도 확대한다 (향후 제안에 대한 구속)
향후 어떤 신뢰 승격 제안도 **파일 열기만이 아니라 렌더러 읽기 표면을 함께 논증해야 한다(shall)**. `electron/assetProtocol.ts:124`가 `durumi-asset://`를 **같은 `isAllowedPath` boolean**으로 게이트하고, 통과하면 `fs.readFile(absPath)` 후 확장자 기반 MIME 추측으로 바이트를 **크기 제한 없이** 응답한다(`:128-130`). 즉 신뢰 트리가 넓어지면 렌더러가 그 트리의 임의 파일 바이트를 프로토콜로 읽어낼 수 있다.

읽기/쓰기 신뢰 축 분리는 **원리적으로 옳은 장기 모델이나** `isAllowedPath`가 단일 boolean을 반환하므로(`electron/pathGuard.ts:132`) 모든 `assertAllowedPath` 호출부 + 위 asset 게이트를 바꾼다. **별개의 향후 보안 SPEC이며 이 SPEC의 범위 밖이다**(§D).

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

**REQ-PANEL-044** (Unwanted) — **확정: 채널 분리 + main 측 검증 + import 부재** (OQ-6(i))
마크다운 문법을 인식하는 저장 시 변환은 비마크다운 문서에 적용되어서는 **안 된다(shall not)**. 오늘의 저장 경로는 파일 종류와 무관하게 마크다운 이미지 링크 정규식 재작성을 거친다(`electron/ipc/files.ts:64` → `electron/pendingAssets.ts:157, 175-176`). 실제 치환이 pending 경로 조건(`pendingAssets.ts:162`)에 걸려 드물게 일어난다는 사실은 이 요구를 면제하지 **않는다(shall not)** — 구조적으로 적용 가능한 경로가 남아 있으면 언젠가 적용된다.

이 요구는 **세 겹으로** 충족**되어야 한다(shall)**. 채널 분리 하나만으로는 부족하다 — preload가 두 채널을 모두 노출하는 동안 렌더러 버그가 `.py`에 대해 마크다운 채널을 호출할 수 있다:

| # | 겹 | 검증 형태 |
|---|---|---|
| 1 | 마크다운 쓰기 경로와 raw 쓰기 경로가 **별개 채널**이다 | IPC 계약 선언 |
| 2 | **main이 마이그레이션 채널의 대상이 마크다운임을 검증**하고, 아니면 거부**한다(shall)** | 런타임 거부 단언 |
| 3 | **raw 채널에는 마이그레이션 import가 아예 없다** | 소스 스캔 단언 |

초판이 "채널 분리만으로 표현 불가능성을 얻는다"고 쓴 것은 **과장이었다**(외부 검토 지적, 수용). 표현 불가능성은 위 세 겹이 함께 만든다.

**REQ-PANEL-044a** (Ubiquitous) — 두 쓰기 경로 모두와 닫기 라우팅
분리는 **모든 쓰기 진입점**에 적용**되어야 한다(shall)**. 오케스트레이터가 확인한 세 곳:

| 지점 | 사실 |
|---|---|
| `electron/ipc/files.ts:78-112` `file:saveAs` | 같은 위치에서 `migratePendingInContent(content, dirname(result.filePath))`를 호출한다 — `file:save`만 분리하면 이 경로로 새어 나간다 |
| `electron/ipc/files.ts:92-97` Save As 필터 | `filters: [{ name: 'Markdown', extensions: ['md'] }]` 하드코딩. `.py` 패널에서 "다른 이름으로 저장" 시 `.md`만 제시된다 — **보조 파일에 맞는 필터가 이 요구의 일부다(shall)** |
| `src/hooks/useAppCloseGuard.ts:26-33` | 닫기 시 저장을 라우팅한다. 갱신하지 않으면 **가장 나쁜 시점에** 보조 파일 내용을 마크다운 경로로 보낸다 |

**REQ-PANEL-045** (Where)
**Where** 문서 종류에 대응하는 문법 정의가 없는 경우, 보조 패널은 그 문서를 **평문(plain text)** 으로 열어**야 한다(shall)** — 열기를 거부하지 **않는다(shall not)**. 알 수 없는 확장자는 오류가 아니**다(shall)**.

**REQ-PANEL-046** (Event-driven — 실패 모드 감지)
**When** 문서 내용이 유효한 텍스트로 디코드되지 않으면, 셸은 그 문서를 편집 가능한 패널로 열지 **않아야 하며(shall not)** 사용자에게 사유를 보고**해야 한다(shall)**. 손상된 내용을 대체 문자로 때워 버퍼에 담지 **않는다(shall not)** — SPEC-1 REQ-WS-031이 조정 경로에 대해 세운 것과 같은 자세이며, 열기 경로에서 이를 어기면 저장 시 파일이 파괴된다.

**REQ-PANEL-047** (Ubiquitous)
`docs/DOCUMENT_MODE_PRINCIPLES.md`는 문서모드 마크다운 편집에만 범위가 걸려 있다(그 문서 §0). 이 SPEC이 비마크다운 편집 표면을 도입하면 **원칙 문서가 덮지 않는 편집 표면이 처음으로 실재한다**. 이 SPEC은 그 공백을 **기록만 하며(shall)**, 해당 문서를 수정하지 **않는다(shall not)** — SPEC-1 AC-WS-037이 그 파일의 무변경을 불변식으로 고정했다. 비마크다운 바이트 무결성은 REQ-PANEL-043·044와 이 SPEC의 자체 수용 기준이 고정**한다(shall)**.


**REQ-PANEL-048** (Ubiquitous) — **확정: (B′) 문서에 EOL 저장, 직렬화 시 복원** (OQ-6(ii))
**Where** 문서가 보조 파일인 경우, 앱은 열기 시 그 파일의 **지배적 줄 끝(EOL)** 을 탐지해 **문서 상태에 보관해야 하며(shall)**, raw 저장 시 버퍼의 LF를 그 EOL로 **복원해야 한다(shall)**.

| 단계 | 동작 |
|---|---|
| 열기 (보조 파일만) | 지배적 EOL 탐지 → 문서 상태에 `eol: '\n' \| '\r\n' \| '\r'` 보관 |
| 버퍼 | **내부적으로 LF 유지** — 오늘의 CodeMirror 현실 그대로 |
| raw 저장 | LF를 보관된 EOL로 복원 |
| 조정 계층 | **손대지 않는다(shall not)** — 문서 좌표 접기(`toDocumentSpace`)와 `lineSeparator` 미설정 상태를 그대로 둔다 |

**이것이 기존 코드가 이미 문서화한 설계다**: `src/editor/applyExternalChange.ts:51-52`의 주석이 `구분자는 출력 시 직렬화에만 쓰인다`고 적는다. 그리고 `tests/editor/reconcileIntegrity.test.ts:90-97`이 CRLF 에디터에서 조정이 좌표를 어긋내지 않음을 **이미 green으로 증명한다.** 새 전제를 도입하지 않는다.

**결정적 근거**: `EPIC-V03-WORKSPACE.md:34`가 `.py`/`.bib`/`.csv`/`.json`의 바이트 무결성을 **end-state 요구**로 못박는다. 첫 저장에서 모든 줄 끝을 다시 쓰는 보조 편집 표면은 각주가 아니라 **Epic 위반이다.** "편집 없이 열었다 닫으면 바이트 보존"(REQ-PANEL-043, AC-PANEL-043b)은 참이지만 불충분하다 — **저장이 에디터의 목적이다.**

**REQ-PANEL-048a** (Ubiquitous) — 탐지 정책과 명시적 한계
지배적 EOL 탐지는 다음을 따라**야 한다(shall)**:

- `\r\n` / `\n` / `\r` 각각의 출현 수를 세어 **가장 많은 것**을 택한다.
- **동수 처리**: `\r\n`과 `\n`이 같은 수면 **`\r\n`을 택한다(shall)**. 근거는 비대칭이다 — `\r\n`을 포함한 파일에서 LF를 택하면 **모든** CRLF 줄이 손상되는 반면, LF 파일에서 CRLF를 택하는 오판은 혼합 파일에서만 발생한다.
- 줄 끝이 하나도 없으면(단일 줄 파일) 플랫폼 기본이 아니라 **LF를 택한다(shall)** — 줄 끝이 없으므로 복원 대상도 없고, 사용자가 줄을 추가할 때 LF가 보수적이다.

**명시적 범위 밖 — 혼합 줄 끝**: 파일당 EOL 하나로는 **혼합 줄 끝을 담은 파일을 바이트 보존할 수 없다.** 이 SPEC은 혼합 파일의 바이트 보존을 약속하지 **않으며(shall not)**, 혼합 파일에서 저장은 모든 줄 끝을 지배적 EOL로 정규화**한다(shall)**. 이것은 메커니즘의 한계이며 **AC가 제공할 수 없는 것을 약속하지 않게** 명시한다.

**EOL 목적상 보조로 세는 확장자**: REQ-PANEL-040의 마크다운 집합(`md` / `markdown` / `txt`)에 **속하지 않는** 모든 확장자**다(shall)**. **마크다운은 의도적으로 오늘 동작을 유지한다** — issue #11(마크다운 전 구간 CRLF 보존)은 이 SPEC의 범위 밖이며 `spec.md` §D.2가 그대로 유효하다.
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
조정 결과를 버퍼에 적용하는 실행자는 **창 전역 싱글턴이어서는 안 된다(shall not)**. 실행자는 패널(또는 문서)별로 해소**되어야 하며(shall)**, 다음 두 경우 모두에서 어떤 패널의 실행자도 무효화되지 **않아야 한다(shall not)**:

| 경우 | 오늘의 동작 |
|---|---|
| **마운트 탈취** | 두 번째 `MarkdownEditor`의 `registerReconciliationExecutor`(`MarkdownEditor.tsx:159-162`)가 모듈 수준 단일 슬롯 `effectHandler`(`src/store/reconciliationStore.ts:35`)를 조용히 가져간다 — 첫 번째 패널은 조정을 잃는다 |
| **언마운트 무장 해제** | 어느 패널이든 언마운트되면 정리 클로저가 `setEffectHandler(null)`(`src/editor/applyExternalChange.ts:131`)을 호출해 **그 시점에 슬롯을 쥐고 있던 패널**의 조정을 끈다 — 자기 것이 아니어도 끈다 |

두 경우 모두 컴파일 오류를 내지 않고 조용히 실패하므로 전용 AC가 필요하다.

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

**재바인딩이 조용한 플러시를 유발하지 않아야 한다(shall not)**: `useMemoSidecarStore.loadFor`(`src/store/memoSidecarStore.ts:70-84`)는 한 번에 `docPath` 하나만 붙들고, 재바인딩 시 이전 문서의 dirty 사이드카를 `await window.api.memoSidecarWrite(prev.docPath, prev.sidecar)`로 **먼저 플러시한다**. 패널 전환마다 이 경로가 돌면 사용자가 활성 패널을 오갈 때마다 사이드카 쓰기가 발생하고, 그 쓰기는 SPEC-1의 감시 계층에 외부 변경 이벤트로 되돌아온다. 활성 패널 전환은 사이드카 디스크 쓰기를 유발하지 **않아야 하며(shall not)**, 패널별 사이드카 상태를 동시에 보유하거나 전환이 아닌 실제 편집 시점에만 쓰기가 일어**나야 한다(shall)**.

**REQ-PANEL-063** (Ubiquitous)
목차와 검색 히트는 **어느 패널에 작용하는지 결정 가능해야 한다(shall)**. 목차는 활성 원고 패널의 문서 구조를 표시하고 그 패널로 이동**시키며(shall)**, 검색 히트 열기는 활성 패널에 문서를 열거나 이미 그 문서를 연 패널로 이동**한다(shall)** — 새 패널을 사용자 요청 없이 만들지 **않는다(shall not)**.

**REQ-PANEL-064** (Ubiquitous)
SPEC-1이 남긴 미구현 표면 두 가지의 **소유권은 이 SPEC에 있다**(`docs/v0.3-signoff.md` §6):
1. 조정의 `open-diff` effect(`shared/reconciliation.ts:70`)는 오늘 방출되지만 소비되지 않는다(`src/editor/applyExternalChange.ts:128`). 이 SPEC은 그 effect가 **어느 패널의 문서에 대한 요청인지 식별 가능하게** 해야 하며(shall), diff 표시 UI 자체는 SPEC-4 소관으로 남긴다(shall).
2. `BibliographyResolution.fallback`(SPEC-1 REQ-WS-056)의 사용자 표시. 반환값에는 이미 실려 있으므로 표시 표면만 필요**하다(shall)**. 표시는 활성 원고 패널 종속**이다(shall)**(REQ-PANEL-060과 같은 이유 — 원고마다 서지가 다를 수 있다).


**REQ-PANEL-065** (Ubiquitous) — 사이드바 데이터 재배선은 명시적 작업**이다(shall)** (OQ-1 확정의 귀결)
좌/우 사이드바와 그 하위 표면은 **활성 원고 패널의 문서·뷰를 대상으로 재배선되어야 한다(shall)**. 이는 패널화의 부수 결과가 아니라 **필수 작업이며 전용 수용 기준을 갖는다(shall)**.

오늘 이들은 전역 에디터 하나를 겨냥한다:

| 표면 | 오늘의 형태 |
|---|---|
| `Sidebar` | 스칼라 `content` / `view` prop — `src/App.tsx:124-127` |
| `RightSidebar` | 동일 — `src/App.tsx:163-166` |
| 목차 / 인용 / "검색 히트 → 줄 이동" | `editorViewRef.current` + 50ms `setTimeout` 후 dispatch — `src/App.tsx:129-142` |

**`RightSidebar`의 귀속은 "활성 원고 패널"이며 "가장 왼쪽 패널"이 아니다(shall not)** — 레이아웃 순서가 데이터 소유권을 결정하면 사용자가 패널을 재배치할 때 서지·메모가 조용히 다른 원고를 가리킨다. REQ-PANEL-060~063의 활성 원고 패널 축과 일치**시킨다(shall)**.
---

## §C 제약

| # | 제약 | 근거 |
|---|---|---|
| C-1 | 다음 요구는 **프로젝트 없음 상태에서도 완전히 동작해야 한다**: REQ-PANEL-001, 003~007, 010~015, 020~024, 030~035, 040~048a, 050~056, 058, 060~065, 070~073. 본질적으로 프로젝트 조건부인 것은 REQ-PANEL-036/036b/036c(수동 새로고침 어포던스 + 트리 신뢰 범위 표시), REQ-PANEL-057(규약 폴더 제외)뿐이며, 그 상태에서 올바른 동작은 "적용되지 않음"이다 | `EPIC-V03-WORKSPACE.md` §2.2 — 단일 파일 열기 보존, 프로젝트 없음은 1급 상태 |
| C-2 | 3-프로세스 경계를 변경하지 않는다. 패널 레이아웃·패널 상태는 `src/`에만 존재하며, 파일시스템·감시는 main, 타입·순수 함수는 `shared/` | `.moai/project/structure.md` §2, `EPIC-V03-WORKSPACE.md` §6 |
| C-3 | 렌더러는 Node API를 갖지 않는다(`sandbox: true`, `contextIsolation: true`). 신규 IPC 채널은 `shared/ipc-contract.ts`에 선언되어야 하며 구독형 API는 구독 해제 클로저를 반환한다 | `EPIC-V03-WORKSPACE.md` §6, SPEC-1 C-3 |
| C-4 | `pathGuard` 4-tier 신뢰 모델을 **완화하지 않는다**. 새 신뢰 승격 경로를 만들지 않으며 기존 Tier 1~4와 `allowSessionPath` 동작에 의존한다. 프로젝트 발견이나 패널 열기가 그 자체로 새 경로를 신뢰시켜서는 안 된다 | SPEC-1 D-6/REQ-WS-012, `electron/pathGuard.ts:183-215` `assertPrefsPatchAllowed` |
| C-5 | CodeMirror 6를 유지한다. ProseMirror/Lexical/Slate 마이그레이션, 3-모드 모델 재설계, `RenderedSpan` 양방향 소스맵은 범위 밖이다 | `EPIC-V03-WORKSPACE.md` §2.1, §7 |
| C-6 | 개발 방법론은 TDD(RED-GREEN-REFACTOR), 커버리지 목표 85%, 커밋당 최소 80% | `.moai/config/sections/quality.yaml`, SPEC-1 C-5 |
| C-7 | macOS와 Windows 모두 출하 대상. Windows e2e CI가 없으므로 플랫폼 차이는 유닛 계층에서 검증 가능한 형태로 설계해야 한다 | `.moai/project/tech.md` §9, §13.1, SPEC-1 C-6 |
| C-8 | IME 조합에 닿는 코드 변경은 SPEC-1이 구축한 조합 유지형 CDP e2e 프리미티브 기반 검증이 의무이며, 릴리스 전 수동 한글 스모크를 대체하지 않는다 | `docs/DOCUMENT_MODE_PRINCIPLES.md` §2, SPEC-1 C-7, `docs/v0.3-signoff.md` §3 |
| C-9 | `docs/DOCUMENT_MODE_PRINCIPLES.md`를 수정하지 않는다 (SPEC-1 AC-WS-037 불변식) | `docs/v0.3-signoff.md` §5 |
| C-10 | 기존 테스트 baseline(199 테스트 파일, 33 e2e spec)을 근거 없이 깨뜨리지 않는다. 사이드바 스토어·탭 구조 테스트(`tests/store/{sidebarStore,rightSidebarStore}.test.ts`, `tests/sidebar/*.test.tsx`)를 깨는 설계는 REQ-PANEL-002 위반으로 간주한다. **이 제약은 회귀 검사이며 레이아웃 선택의 논거가 아니다** — OQ-1 확정 논거는 테스트 개수가 아니라 사이드바(전역)와 패널(문서 국소)의 소유권 분리다. 반대로 조정·감시 계층 테스트(`tests/hooks/useExternalChangeWiring.test.tsx`, `tests/components/reconciliationBanner.test.tsx`, `e2e/reconciliation-ime.spec.ts`)는 문서 축 도입에 따라 **의도적으로 재작성된다** | `research.md` §8 |
| C-11 | 새 런타임 의존성을 추가하지 않는다. 언어 문법은 이미 의존성인 `@codemirror/language-data`에서 조달한다 | REQ-PANEL-041, `package.json:39` |
| C-12 | **조정 코어 5파일의 확장자 독립을 깨뜨리지 않는다.** `electron/changeConfirmation.ts`, `electron/watchScope.ts`, `shared/reconciliation.ts`, `src/editor/minimalDiff.ts`, `src/editor/applyExternalChange.ts` 에 확장자 판독 수단을 넣지 않으며 `applyExternalChange`의 arity를 2로 유지한다. `tests/electron/extensionIndependence.test.ts`는 무변경 통과해야 한다 | REQ-PANEL-072, 해당 테스트 `:34-65`(구조적 단언) + `:171-174`(arity 단언) |
| C-13 | `.cm-content`는 전역 CSS(`src/styles/global.css:32`)와 뷰별 테마(`src/editor/theme.ts:10-15`) 양쪽에서 스타일링되며 전역 규칙이 문서 전체에 걸린다. 패널별로 다른 측정폭이 필요하면 **전역 규칙을 패널 스코프로 좁혀야 하고**, 그 변경은 `.cm-content`를 유일 요소로 가정하는 e2e 34개 파일의 셀렉터 이관을 수반한다 — 부수 효과가 아니라 명시적 작업이다 | REQ-PANEL-042, `plan.md` §C M4 + §B.8, `acceptance.md` AC-PANEL-095 |

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
- **마크다운 파일의 CRLF 전 구간 보존(issue #11)** — CodeMirror 문서 좌표계가 줄바꿈을 항상 1 위치로 계산하는 구조적 제약이며, 마크다운 경로는 **의도적으로 오늘 동작(열기 시 LF 접기)을 유지한다**. **정정 (판 0.3.0)**: 초판은 CRLF를 전면 범위 밖으로 두었으나, OQ-6(ii) 확정으로 **보조 파일의 EOL 복원은 범위 안**이다(REQ-PANEL-048) — `EPIC-V03-WORKSPACE.md:34`가 `.py`/`.bib`/`.csv`/`.json` 바이트 무결성을 end-state 요구로 못박기 때문이다. 범위 밖으로 남는 것은 (a) 마크다운 경로, (b) **혼합 줄 끝 파일의 바이트 보존**(REQ-PANEL-048a가 명시), (c) CM `lineSeparator` 도입
- **sticky dirty 플래그(issue #12)** — `appStore.isDirty`가 `|| s.isDirty`로 latch되는 기존 결함. REQ-PANEL-010이 dirty를 문서에 매면서 이 결함이 문서 축으로 복제되지 않도록 주의해야 하나, 결함 해소는 별개다

### Out of Scope — 원칙 문서와 문서화

- `docs/DOCUMENT_MODE_PRINCIPLES.md` 자체의 개정·확장 (C-9). 비마크다운 편집 표면이 그 문서의 범위 공백을 실재화하지만, 이 SPEC은 **기록만 한다**(REQ-PANEL-047)
- `CONTRIBUTING.md` / `structure.md`의 파일명 드리프트 정정 (SPEC-1이 기록만 하고 남긴 항목)

### Out of Scope — 다중 창과 세션

- **다중 창(BrowserWindow) 간의 조정 조율.** 창 축은 오늘 이미 존재하며(`electron/main.ts:46, 103`), 확정 이벤트가 모든 창에 브로드캐스트된다(`electron/ipc/project.ts:40-44`). 이 SPEC은 **창 안의 패널 축**을 정의하고, REQ-PANEL-051의 경로 대조가 부수적으로 창 간 오적용도 막지만, 창 간 소유권 모델(어느 창이 어느 파일의 감시를 소유하는가)은 별개 작업이다
- 창별 패널 배치의 창 간 동기화
- 탭(tab) UI로서의 문서 목록 관리 — 이 SPEC은 패널 분할을 정의하며, 패널 하나 안에 여러 문서를 탭으로 쌓는 모델은 `plan.md` §A.2 OQ-7의 미해결 결정이다

### Out of Scope — dual-open과 문서↔뷰 동기화 (v0.4)

- **같은 파일을 두 패널에 여는 것(dual-open)** — 사용자 결정으로 v0.3에서 금지되고 v0.4로 연기되었다(OQ-2). REQ-PANEL-011이 금지를, §B.2a가 v0.4의 다섯 의무를 기록한다
- 문서↔뷰 트랜잭션 동기화 프로토콜 (§B.2a의 5개 의무)
- 심볼릭·하드 링크 별칭의 동일 파일 탐지 — REQ-PANEL-011a가 한계를 명시하며, 해소에는 `fs.realpath`가 필요하고 `electron/pathGuard.ts:55-60`이 그것을 의도적으로 회피한다

### Out of Scope — 신뢰 모델의 읽기/쓰기 축 분리

- `isAllowedPath`를 단일 boolean에서 읽기/쓰기 축으로 분리하는 작업 — 원리적으로 옳은 장기 모델이나(외부 검토 2인 동의) 모든 `assertAllowedPath` 호출부 + `electron/assetProtocol.ts:124`의 asset 게이트를 바꾼다. **별개의 향후 보안 SPEC이며 이 SPEC의 범위 밖이다**(REQ-PANEL-036c가 향후 제안에 대한 구속만 남긴다)
- 프로젝트 루트의 자동 신뢰 편입, 동의 배너 경유 승격 — OQ-5에서 기각됨

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

- §B의 요구사항(REQ-PANEL-070~073 + 070a·070b·071a, 001~007, 010~015, 020~024, 030~036c, 040~048a, 050~058, 060~065 — **총 61개**, 실측 `grep -c '^\*\*REQ-PANEL-' spec.md`)이 모두 관측 가능한 수용 기준으로 매핑된다(`acceptance.md`, 모든 AC가 REQ ID 또는 제약 ID를 인용). **단 REQ-PANEL-036c는 향후 제안에 대한 구속이므로 AC-PANEL-036d가 문서·검토 게이트 형태로 커버한다** — 실행 가능한 단언이 아님을 그 AC가 명시한다
- **확정된 4개 결정(OQ-1·2·5·6)의 귀결이 요구사항으로 표현된다**: dual-open 금지(011/011a) + revision 파생 dirty(015) + 트리 신뢰 범위 표시(036b/036c) + 저장 채널 3겹(044/044a) + 보조 파일 EOL 복원(048/048a) + 사이드바 재배선(065)
- **§B.0의 출하 중인 결함 두 건이 재현 우선으로 해소된다** — 실패 테스트 선행, 수정, 통과 확인. 이것이 M0이며 기능 마일스톤보다 앞선다
- `tests/electron/extensionIndependence.test.ts`가 무변경 통과한다 (C-12)
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
- `tests/electron/extensionIndependence.test.ts` `:34-65`(조정 5파일 확장자 독립 구조 단언), `:171-174`(`applyExternalChange` arity 2 단언) — C-12·REQ-PANEL-072의 하드 제약 출처
- 코드: `src/editor/MarkdownEditor.tsx:86-175`(유일한 마운트·조립 지점), `src/editor/decorations/index.ts:32-76`(`liveDecorations` 43항목 평면 배열), `src/App.tsx:122-190`(레이아웃), `src/store/{appStore,reconciliationStore,sidebarStore,rightSidebarStore,memoSidecarStore}.ts`, `src/hooks/useMenuCommandRouter.ts`, `src/hooks/useExternalChangeWiring.ts`, `src/editor/compositionGate.ts:9-25, 109-112`, `shared/reconciliation.ts:57, 192-197`, `electron/ipc/{project,files}.ts`, `electron/pathGuard.ts`, `electron/pendingAssets.ts:150-181`, `src/styles/global.css:32` + `src/editor/theme.ts:10-15`(`.cm-content` 이중 스타일링)

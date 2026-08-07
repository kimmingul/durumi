---
id: SPEC-V03-WORKSPACE-001
title: "구현 계획 — v0.3 워크스페이스 골격"
version: "0.2.3"
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

# 구현 계획 — SPEC-V03-WORKSPACE-001

> 마일스톤은 **결정 번복 가능성이 높은 순서**로 배열했다. 앞쪽일수록 데이터 모델·사용자 흐름 결정을 담고 있어 검토 가치가 크고, 뒤쪽일수록 기계적이다.
>
> **미해결 clarification 마커는 0건이다.** 이전 판의 6건은 §A에 확정 결정으로 기록되었다.

---

## §A 확정된 결정 (이전 판의 미해결 마커 6건)

### D-1 매니페스트: `durumi.project.yaml` + 키 단위 range-splice 갱신 (사용자 결정)

파일명은 `durumi.project.yaml`, 포맷은 YAML. 갱신은 전체 재직렬화가 아니라 **대상 키의 바이트 범위만 교체**하는 방식(REQ-WS-003).

**왜 라운드트립 보존 파서가 아니라 range-splice인가** — 구현자가 알아야 할 추론:
`shared/frontMatter.ts`는 이미 범위 기반 접근의 선례를 갖고 있다. `frontMatterRange(fm)`(`:72-77`)가 front matter 영역을 `{from, to}` 바이트 범위로 반환하고 `parseFrontMatterFenced`가 `endOffset`을 계산한다. 같은 발상 — **"파싱은 위치를 알아내는 데 쓰고, 쓰기는 그 위치만 건드린다"** — 을 매니페스트에 적용하면 `js-yaml`(이미 의존성)만으로 주석·키 순서·모르는 키를 보존할 수 있다. 라운드트립 보존 YAML 파서를 새로 들일 이유가 없다.

**단, 정확한 범위를 오해하지 말 것.** 코드를 읽어 확인한 사실:
- `shared/frontMatter.ts`가 export하는 것은 `parseFrontMatter`, `frontMatterString`, `frontMatterRange`, `frontMatterFenced` 재export가 전부다. **쓰기·갱신 함수는 존재하지 않는다** — 이 모듈은 range-splice를 *수행*하지 않고, 그것을 만들 *재료*(범위 계산)만 제공한다.
- `frontMatterRange`는 `{from: 0, to: endOffset}` — **블록 전체 범위**다. 이 입도로 스플라이스하면 "front matter 밖 본문"은 보존되지만 "front matter 안의 다른 키·주석"은 보존되지 않는다.
- 따라서 REQ-WS-003이 요구하는 **키 단위(line/key-level) 범위 계산은 신규 구현**이다. 기존 코드는 패턴의 선례이지 재사용 가능한 구현이 아니다.

### D-2 충돌 정책: 사용자 편집 유지 + 비침습 배너 (사용자 결정)

미저장 편집이 있는 파일에 외부 쓰기가 들어오면 버퍼를 교체하지 않는다. 해제 가능한 배너가 "차이 보기 / 디스크에서 불러오기"를 제공한다. **모달 금지**(REQ-WS-049).

근거: (a) 타이핑 중 뜨는 모달은 포커스를 빼앗아 IME 조합을 중단시킬 수 있다 — `pendingInlineFormat.ts:12-32`가 기록한 실패 계열과 같은 위험이다. (b) 이 배너가 SPEC-4의 승인 UI가 확장할 표면이다.

3-way 병합은 계속 범위 밖이다. **spec.md §D의 "3-way 자동 병합 알고리즘" 제외 항목은 수정 불필요임을 확인했다** — REQ-WS-027은 병합을 요구하지 않고 사용자 편집 유지 + 알림만 요구하므로 제외 문구와 모순되지 않는다.

### D-3 감시 범위: 열린 파일 + 규약 폴더, `data/` 제외 (사용자 결정)

열린 파일은 위치 무관 전부 감시(REQ-WS-013). 프로젝트가 있으면 규약 폴더를 추가 감시(REQ-WS-045). `data/`는 감시하지 않음(REQ-WS-046) — 의학연구 원자료는 수 GB. `data/` 하위 변경은 수동 새로고침으로 표면화(REQ-WS-047).

이 결정은 감시 범위를 "열린 파일만"보다 넓히므로 **요구사항을 신설해 표현**했다(045~047). 기존 REQ-WS-013의 문장을 늘려 쓰지 않았다.

### D-4 메타데이터 정본: front matter (사용자 결정 — 이전 판의 반전)

이전 판은 매니페스트를 정본으로, front matter를 오버라이드로 두었다. **반전됨**: front matter가 정본, 매니페스트는 문서가 선언하지 않을 때 쓰이는 프로젝트 기본값.

근거: 한 연구가 본문·보충자료·리뷰어 응답서 등 여러 원고를 갖고 저자 목록이 서로 다른 것이 흔하다. 또한 `shared/manuscriptTemplates.ts`가 **이미** `author:`(`:22`)와 `registration:`(`:70`, `:168`) front matter 키를 출하하고 있다 — 정본을 매니페스트에 두면 출하 중인 키가 이류 시민이 된다.

이 반전으로 §B.3이 재작성되었고(REQ-WS-034~038, 041~042), front matter 키 스키마가 명시되었다(REQ-WS-050~053).

#### D-4a 억제는 값 기반이다 — M1 구현이 드러낸 결함의 정정 (사용자 결정, 판 0.2.2)

**결함**: 판 0.2.1의 REQ-WS-042는 front matter가 키를 **선언하면** 매니페스트 값을 억제했다. 그런데 `shared/manuscriptTemplates.ts:22`는 **모든** 템플릿에 `author: `를 발행한다. 두 규칙을 문자 그대로 합치면 **템플릿에서 만든 어떤 원고에도 매니페스트 기본값이 적용될 수 없다** — 기본값 계층이 정상 생성 경로에서 죽는다. 판 0.2.1의 AC는 키 존재(AC-WS-038)와 키 부재(AC-WS-038b)만 다뤄 이 경우를 잡지 못했다.

**정정**: 억제는 **값 기반**이다. 미기입 값(REQ-WS-054)은 억제를 발동시키지 않고 매니페스트 기본값이 채택된다. 저자를 프로젝트 수준에 한 번 쓰면 모든 원고가 상속하고, 다른 저자 목록이 필요한 원고만 스스로 선언해 그것이 이긴다 — D-4의 원고별 저자 동기가 그대로 유지되면서 기본값 계층이 살아난다.

**수용된 대가**: "의도적으로 저자 없음"을 표현할 수단이 사라진다. 빈 값은 언제나 "아직 안 씀"으로 해석된다. 인지된 상태로 수용한다(REQ-WS-042 본문에 기록).

**구현자가 반드시 알아야 할 파싱 사실 (실측)**: 템플릿의 `'author: '`는 빈 문자열이 **아니라 `null`로 파싱된다**.

```
$ node -e "const y=require('js-yaml'); ..."
"author: "        -> null   object
"author:"         -> null   object
"author:   "      -> null   object
"author: \"\""    -> ""     string
"author: []"      -> []     object
```

미기입 판정을 빈 문자열로만 구현하면 **출하 템플릿의 실제 형태가 걸러지지 않아** 결함이 그대로 재발한다. REQ-WS-054가 다섯 형태를 열거하고 AC-WS-068이 이를 고정한다.

**파생 정정 — `registration`에도 같은 결함이 있었다**: CONSORT / PRISMA 템플릿은 `registration: ClinicalTrials.gov NCT` / `PROSPERO CRD`를 발행한다. 이 placeholder는 빈 값이 아니므로 REQ-WS-054만으로는 미기입이 아니고, 따라서 매니페스트 기본값을 억제한다 — `author`에서 방금 고친 것과 동일한 결함이다. REQ-WS-055가 이 placeholder를 `registration`의 미기입 형태로 규정해 해소한다. 이는 REQ-WS-053(placeholder에 경고를 내지 않음)과 같은 결론의 두 측면이다.

### D-5 비마크다운 파일 열기: SPEC-2 (오케스트레이터 결정)

`EPIC-V03-WORKSPACE.md:101`이 이미 비마크다운 편집 표면을 SPEC-2에 배정하고 있다. SPEC-1은 **조정 계약만** 정의한다(REQ-WS-032). 이에 따라 AC-WS-034는 에디터 표면 없이 유닛 계층에서 검증 가능한 형태로 재작성되었다.

### D-6 pathGuard: 기존 Tier 2 자동 편입 유지 (오케스트레이터 결정, 사용자 재검토 가능)

새 신뢰 승격 경로를 만들지 않는다. 파일을 열면 그 부모 디렉터리가 세션 신뢰 트리에 들어가는 기존 `allowSessionPath` 동작에 의존한다(C-4, REQ-WS-012).

근거: 매니페스트 발견을 근거로 프로젝트 루트를 자동으로 Tier 3에 넣으면 **손상된 렌더러가 매니페스트를 심어 스스로 신뢰를 넓히는 경로**가 생긴다. `assertPrefsPatchAllowed`(`electron/pathGuard.ts:183-215`)가 막고 있는 바로 그 공격 형태다.

한계 기록: 이 결정 아래에서는 열린 파일보다 상위에 있는 프로젝트 루트 전체가 신뢰되지 않으므로, 프로젝트 트리 UI의 접근 범위는 기존 워크스페이스 폴더 등록(다이얼로그 경유)에 의존한다. 실사용에서 마찰이 확인되면 "이 프로젝트를 워크스페이스로 추가할까요?" 확인 후 Tier 3 편입하는 안으로 사용자가 재검토할 수 있다.

---

### D-7 M1~M4 구현이 드러낸 7건의 정정 (판 0.2.3)

구현이 사양의 결함을 드러낸 두 번째 라운드다. 마일스톤 대상 요구 매핑에 영향을 주는 항목만 여기 기록한다.

| # | 정정 | 영향 마일스톤 |
|---|---|---|
| 1 | **REQ-WS-014 2단계 확정** — 전 경로 크기+수정시각(1단계) → 열린 파일만 내용 대조(2단계). AC-WS-013과의 모순 해소 | M4 (확정 계층), M6 (내용 읽기 재사용) |
| 2 | AC-WS-069 템플릿 계열↔`id` 대응표 추가 (요구 변경 없음) | M1 |
| 3 | REQ-WS-055 자체 대가 기록 (요구 변경 없음) | M1 |
| 4 | REQ-WS-004 정지 조건 차이 명시 (요구 변경 없음) | M3 |
| 5 | **REQ-WS-056 신설** — 읽을 수 없는 `bibliography` → 표시 동반 폴백 | M1 (메타데이터·서지 해석) |
| 6 | REQ-WS-030 사라짐 표시 해제 불가 명시 | M2 |
| 7 | **AC-WS-023 → 023a/023b 분할** — 상태·표면(M2 밀폐)과 조합 진입(M5 의존) 분리 | M2, M5 |

#### 왜 REQ-WS-014를 2단계로 나눴는가 (1번 항목 상세)

판 0.2.2까지 REQ-WS-014는 확정 근거를 "크기와 수정 시각"으로 단정했고, AC-WS-013은 "내용 동일 재작성은 확정하지 않는다"를 요구했다. **내용이 같아도 mtime은 바뀌므로 두 문장은 동시에 성립할 수 없다.** 구현은 사양대로 크기+수정시각을 구현하고 AC-WS-013을 "재검사 결과가 기준값과 같으면 미확정"으로 읽어 해석 PASS로 표시했다 — 즉 사양의 모순이 구현이 아니라 판정 문구로 흡수되고 있었다.

해결의 열쇠는 **확정 계층에 소비자가 둘이라는 사실**이다:

| 소비자 | 필요한 것 | 이미 지불하는 비용 |
|---|---|---|
| 열린 파일 조정 | "내용이 정말 바뀌었는가" | 최소 diff(REQ-WS-025)와 차이 보기(REQ-WS-027)를 위해 **디스크 내용을 어차피 읽는다** |
| 규약 폴더 트리 갱신 | "뭔가 바뀌었는가" | 읽기 없음 — 재열거만 |

따라서 열린 파일에만 내용 대조를 붙이면 AC-WS-013이 문자 그대로 성립하면서 **새 읽기 비용이 0**이다. 해싱을 도입할 필요도 없다(버퍼의 마지막 로드 내용과 직접 비교하면 된다).

`data/` 배제(REQ-WS-046)와의 충돌도 없다: 2단계 대상은 **열린 파일**뿐이고, 열린 파일은 정의상 이미 편집기 버퍼에 전량 적재되어 있다. REQ-WS-046이 피하려던 비용은 "열지도 않은 수 GB 파일을 감시 때문에 읽는 것"이며 2단계는 그 경로에 발을 들이지 않는다. AC-WS-013b가 이 경계를 읽기 호출 횟수 단언으로 고정한다.

**이것은 사용자 결정이 아니다** — 세 후보(AC 축소 / 크기 상한 붙인 내용 검사 / 발산 수용) 중 어느 것도 고를 필요가 없었다. 요구사항들 자체에서 무비용 해법이 도출되므로 사양 오류를 고치는 문제였다.

## §B 기술 접근

### B.1 계층 배치

| 계층 | 위치 | 책임 |
|---|---|---|
| 매니페스트 스키마·검증·키 범위 계산 | `shared/` 신규 모듈 | 타입, 파싱, 검증, 키 단위 범위 산출(D-1), 기본 폴더 규약 상수 |
| 프로젝트 discovery | `electron/` 신규 모듈 | walk-up 탐색(32단계 상한) — 기존 `electron/bibliography.ts`와 같은 형태 |
| 감시·변경 확정 | `electron/fs.ts` 확장 | 경로 단위 구독 + mtime/size 재검사 + **경로별** debounce + 규약 폴더 등록(`data/` 제외) |
| IPC 채널 | `shared/ipc-contract.ts` | `project:*` invoke 채널 + `onProjectChanged` / `onFileChangedExternally` push 채널(구독 해제 클로저 반환) |
| 조정 정책·IME 게이트·배너 | `src/` 신규 훅 + 스토어 | 조합 상태 관찰, 보류 큐, 최소 diff 적용, 배너 상태 |
| 메타데이터 유효값 계산 | `shared/` | front matter(정본) + 매니페스트(기본값) 병합 — 순수 함수 |

#### 함정 — `shared/`는 `electron/`을 import할 수 없다 (실측 확인)

폴더 규약 상수를 `shared/`에 두는 위 배치에는 제약이 따른다. `tsconfig.web.json`은 `composite: true`(`:17`)에 `include: ["src/**/*.ts", "src/**/*.tsx", "shared/**/*.ts"]`(`:21`)이므로, `shared/`의 파일이 `electron/referenceFs.ts`를 import하면 그 모듈이 프로젝트 밖이라 **TS6307로 실패**한다(해당 모듈이 `node:fs` / `node:path`를 끌어오는데 web 프로젝트에는 node 타입도 없다).

이것이 AC-WS-053(reference 폴더명이 `REFERENCE_DIR_NAME`과 일치)에 미치는 영향과 해결:

- **제품 코드에서**: `shared/`의 폴더 규약 모듈은 `REFERENCE_DIR_NAME`을 import할 수 **없다**. 상수 값을 `shared/`에서 독립 선언하거나, `REFERENCE_DIR_NAME`을 `shared/`로 옮기고 `electron/referenceFs.ts`가 그것을 재export하는 방향 중 하나를 M1에서 택한다. (후자가 SSOT 관점에서 낫지만 기존 import 경로 변경을 수반한다.)
- **단언은 테스트 계층에 둔다**: `tsconfig.test.json`은 composite가 아니고 `types: ["node"]`(`:23`)에 `include: ["tests/**", "e2e/**"]`(`:27`)이므로 **양쪽 트리를 모두 import할 수 있다**. `tests/electron/` 아래 기존 테스트들이 이미 그렇게 하고 있다. 따라서 AC-WS-053의 "두 값이 문자열 동일" 단언은 `tests/` 안에 두면 그대로 성립한다.

`toolbar-ime-composition.spec.ts` 파일명 드리프트(§C M5)와 같은 성격의 함정이므로 같은 위치에 기록한다.

### B.2 IME 게이트의 위치와 조합 관찰 선례 (실측 정정)

조합 상태는 **렌더러에만** 존재한다. 따라서 IME 게이트는 main이 아니라 조정 계층(`src/`)에 있어야 한다. main은 "외부 변경이 확정됨"만 알리고, 적용 시점 판단은 렌더러가 한다.

**실측한 선례 — 이전 판의 수치는 틀렸고 브리핑 수치도 정정 대상이다:**

| 측정 | 값 | 명령 |
|---|---|---|
| `src`+`electron`+`shared`에서 `IME`를 단어로 언급하는 파일 | **12** | `grep -rlw "IME" src electron shared` |
| composition API를 **실행 코드에서** 관찰하는 파일 | **1** — `src/editor/decorations/table.ts` | `grep -rn "compositionstart\|compositionend\|isComposing\|composing" src electron shared` (주석 라인 제외) |

`src/editor/keymap/pendingInlineFormat.ts`는 `IME` 언급 12개 파일에 포함되지만 **composition API를 전혀 호출하지 않는다** — 관련 라인(`:12-32`)은 전부 블록 주석이며 "조합 중 문서를 고쳐 IME가 깨졌다"는 **과거 실패 기록**이다. 즉 조합 관찰의 실제 선례는 `table.ts` 하나뿐이고 `pendingInlineFormat.ts`는 **하지 말아야 할 일의 기록**이다. 두 파일 모두 M5에서 읽되 역할이 다르다.

새 조합 관찰 메커니즘을 발명하지 말고 `table.ts` 방식(요소에 `compositionstart`/`compositionend` 리스너를 달고 `dataset.composing` 플래그를 유지, `ev.isComposing`도 함께 확인 — `:810-926`)과 일관되게 구현한다.

### B.3 조합 유지형 e2e 프리미티브 (M5 필수 산출물 — 현행 헬퍼로는 검증 불가)

**현행 `composeKorean()`(`e2e/_helpers.ts:241-281`)로는 이 SPEC의 IME 요구를 검증할 수 없다.** 코드를 읽어 확인한 사실:

- CDP 세션을 열고 → `Input.imeSetComposition`을 **최종 텍스트로 1회** 보내고 → 곧바로 빈 텍스트로 2회차를 보내 조합을 종료하고 → `finally`에서 `session.detach()` 한다.
- `void syllables;` — 중간 음절 인자는 문서화 목적으로만 받고 **버려진다**.
- 즉 이 헬퍼는 **원자적**이다. 조합을 열어둔 채 외부 파일 쓰기를 끼워 넣을 경계가 없다.

따라서 REQ-WS-020~023을 현행 헬퍼로 테스트하면 **조합 중 버퍼를 갈아엎는 구현도 통과한다** — `DOCUMENT_MODE_PRINCIPLES.md` §2가 v0.2.19~.28에 걸쳐 기록한 false-green 계열 그 자체다.

**M5 산출물: 조합 유지형 프리미티브.** 계약:

| API | 계약 |
|---|---|
| `startComposition(page, composingText)` | CDP 세션을 열고 `Input.imeSetComposition`(composingText)를 보낸 뒤 **세션을 detach하지 않고** 핸들을 반환한다. 반환 이후 임의의 `await`(외부 파일 쓰기 포함)를 끼워 넣을 수 있어야 한다 |
| `updateComposition(handle, composingText)` | 열린 세션에서 조합 텍스트를 교체한다 (다단계 조합 근사) |
| `endComposition(handle)` | 빈 텍스트 `Input.imeSetComposition`으로 조합을 종료한 뒤 세션을 detach한다 |
| `observeCompositionEnd(handle)` | `startComposition`이 설치한 `compositionend` 카운터를 노출한다. `startComposition`은 페이지에 `compositionend` 리스너를 걸어 발생 횟수를 누적하고, 이 함수(또는 `endComposition`의 반환값)가 그 횟수를 반환한다. **AC-WS-019/022가 "조합이 조기 종료되지 않았다"를 단언할 유일한 관측 수단이다** |
| `composeKorean(...)` | 시그니처를 **보존**한다 — 위 함수들의 얇은 래퍼로 재구현하되 외부 시그니처와 동작은 그대로 둔다. (호출부는 현재 0곳이지만 — 아래 참조 — 시그니처를 보존하면 향후 도입 비용이 없고 M5의 변경 범위가 좁아진다.) |

**관측 수단이 왜 계약의 일부인가 (SF-7)**: 세 함수만으로는 "조합이 열린 채 유지되었다"를 단언할 방법이 없다. 저장소에는 범용 조합 플래그가 없다 — `dataset.composing`은 `src/editor/decorations/table.ts:810-814`의 **표 셀 전용**이며 에디터 일반 표면에는 존재하지 않는다. 관측 수단 없이 프리미티브만 만들면 M5 구현자는 단언할 대상을 찾지 못해 최우선 AC를 "버퍼 불변"으로 약화시키게 된다. 따라서 `compositionend` 카운터를 계약에 포함시킨다.

**CDP IME e2e 커버리지는 현재 0이다 (실측).** `grep -rn 'composeKorean' e2e/ tests/` 결과는 정의부(`_helpers.ts:241`)와 JSDoc 예시 3줄이 전부이며 **호출부가 없다**. `imeSetComposition`도 `_helpers.ts` 안에서만 등장한다. `e2e/ime-composition.spec.ts`는 `launchClean` / `setMarkdownMode` / `setTyporaMode` / `setWysiwygMode` / `shutdownClean`만 import한다. 즉 헬퍼는 작성되었으나 **한 번도 호출된 적이 없다**.

이전 판이 "기존 e2e spec 31개가 의존한다"고 쓴 것은 **틀렸다** — 31은 `ls e2e/*.spec.ts | wc -l`의 값(spec 파일 개수)이지 `composeKorean` 의존 개수가 아니다. 두 가지 함의:

1. **M5는 확장이 아니라 최초 구축이다.** `DOCUMENT_MODE_PRINCIPLES.md` §2가 "v0.2.29~ CDP 기반 e2e 의무"라고 적고 있지만 실제로 그 계층은 비어 있다. M5의 위험도는 이에 따라 상향되어야 한다(§D 참조).
2. **하위호환 제약은 실재하지 않는다.** 프리미티브 시그니처를 `composeKorean` 호환에 맞춰 제약할 이유가 없다. 시그니처 보존은 비용이 0에 가까워 유지하되, 설계를 구속하는 요인으로 취급하지 않는다.

**정직한 한계 (AC 설계에 반영됨).** 현행 헬퍼 주석이 스스로 적고 있듯 CDP `imeSetComposition`의 교체 semantics는 실제 macOS 한글 IME의 `compositionupdate` 시퀀스와 1:1이 아니다. 따라서 `updateComposition`으로 만드는 다단계 조합은 **근사**이며 "음절 소실·중복 없음"을 OS 수준 충실도로 증명하지 못한다. AC-WS-022는 이 프리미티브로 **재현 가능한 것만** 단언하도록 좁혔고(조합 경계 유지 + 커밋 텍스트 바이트 일치), OS 수준 충실도는 AC-WS-024(수동 스모크)가 계속 담당한다.

### B.4 최소 diff 적용

REQ-WS-025는 버퍼 전체 교체를 금지한다. CodeMirror 6 트랜잭션은 변경 범위를 통해 selection을 자동 매핑하므로, 디스크 내용과 현재 버퍼의 공통 접두/접미를 잘라낸 **단일 replace 범위**만으로도 REQ-WS-026을 상당 부분 만족한다. 먼저 이 축약을 시도하고, 캐럿 보존이 불충분한 경우에만 라인 단위 diff로 확장한다.

### B.5 플랫폼 차이 흡수 + 경로별 debounce (실측 결함 근거)

현재 `electron/fs.ts::watchRoot`(`:110-163`)의 합류 로직에는 결함이 있다. 실측:

```
let pendingPath = rootPath;
entry.watcher = fs.watch(rootPath, { recursive: true }, (_event, filename) => {
  pendingPath = filename ? pathLib.join(rootPath, String(filename)) : rootPath;
  if (entry.pendingTimer) clearTimeout(entry.pendingTimer);
  entry.pendingTimer = setTimeout(() => { ... onChange(pendingPath); }, 200);
});
```

`pendingPath`는 **루트당 하나의 스칼라**이고 타이머도 하나다. 200ms 창 안에 두 파일이 바뀌면 뒤엣것이 앞엣것을 덮어써 **한 이벤트가 소실된다**. 에이전트가 `manuscript/a.md` → `manuscript/b.md`를 연달아 쓰는 것은 v0.4의 정상 흐름이므로 반드시 고쳐야 한다 → REQ-WS-016(경로별 독립 합류).

지금까지 문제가 드러나지 않은 이유는 이 이벤트의 유일한 소비자인 `useFolderTree`가 어차피 루트를 재열거하기 때문이다. 조정 계층은 경로 정확도를 요구하므로 사정이 다르다.

REQ-WS-018의 재검사 트리거에 "경로별 합류 용량 초과"를 명시적으로 포함시켜, debounce가 처리하지 못한 폭주도 복구 경로를 갖게 했다.

플랫폼 차이는 **이벤트를 신호로만 쓰고 진실은 항상 재검사(mtime+size)에서 얻는** 방식으로 흡수한다(REQ-WS-014). macOS는 FSEvents 기반이라 이벤트가 병합되고, Windows는 `ReadDirectoryChangesW` 기반이라 rename이 old/new로 갈라지며 중복 발행이 잦다. 재검사에 진실을 두면 이 차이가 확정 이벤트에 새지 않는다. 재검사 로직을 순수 함수로 분리하면 Windows e2e 없이 유닛에서 양 플랫폼 시나리오를 재현할 수 있다(C-6; `tests/electron/windowsPaths.test.ts` 선례).

참고: 현행 `watchRoot`는 Linux에서만 5초 폴링을 쓰고 macOS/Windows는 같은 `fs.watch({recursive:true})` 분기를 공유한다. 즉 이 SPEC이 다루는 macOS/Windows 차이는 **같은 분기 내부의 semantics 차이**다.

**Linux 폴링 분기의 처리 (M4가 결정해야 함)**: 현행 Linux 분기는 변경을 감지하면 `onChange(rootPath)` — 즉 **파일 경로가 아니라 루트 경로**를 방출한다(`electron/fs.ts:146`). 이는 REQ-WS-016의 경로별 보장과 구조적으로 호환되지 않는다. Linux는 C-6의 출하 대상이 아니지만 M4가 이 계층을 재작성하므로 방치하면 컴파일은 되고 계약만 조용히 깨지는 상태가 된다. M4는 다음 중 하나를 **명시적으로 선택**한다:

- **(a) 폴링을 경로 단위로 승격** — `pollSnapshot`이 이미 경로별 mtime 맵(`Map<string, number>`)이므로 변경된 키를 추려 경로별로 방출할 수 있다. 비용이 낮고 계약이 균일해진다 (권장).
- **(b) Linux에서 조정 계층을 비활성화** — 감시는 폴더 트리 UI 용도로만 남기고 열린 문서 조정을 끈다. 계약 위반은 없으나 플랫폼별 동작 분기가 생긴다.

"현행 그대로 둔다"는 선택지가 아니다 — 그것은 REQ-WS-016을 만족하지 않는 코드 경로를 남기는 것이다.

### B.6 자기 저장 에코 억제 (REQ-WS-015)

`writeFileAtomic`은 임시 파일 + `rename`이므로 감시 이벤트가 반드시 발생한다. 권장: 저장 직후 해당 경로의 mtime/size를 기록하고, 확정 재검사에서 그 값과 일치하면 외부 변경이 아님으로 판정 — 추가 상태가 적고 경쟁 조건에 강하다. (저장 중 감시 일시 중지는 창이 좁고 그 사이 진짜 외부 변경을 놓칠 수 있어 비권장.)

### B.7 front matter 키 스키마 — 출하 템플릿과의 정합

`shared/manuscriptTemplates.ts`가 이미 출하 중인 키를 그대로 쓴다(REQ-WS-050). 실측:

| 위치 | 출하 문자열 |
|---|---|
| `:22` | `'---', 'title: ', 'author: ', 'date: ', 'journal: ', ...extra, '---'` |
| `:70` (CONSORT) | `'registration: ClinicalTrials.gov NCT'` |
| `:168` (PRISMA) | `'registration: PROSPERO CRD'` |

두 가지 함의가 여기서 나온다:

1. **`registration:`은 NCT 전용이 아니다.** PRISMA 템플릿은 PROSPERO CRD를 발행한다. NCT 형식 검증을 무조건 적용하면 체계적 문헌고찰 원고가 전부 경고를 받는다 → REQ-WS-052(레지스트리 다형성).
2. **출하 값은 식별자가 비어 있는 placeholder다.** `ClinicalTrials.gov NCT`와 `PROSPERO CRD`는 사용자가 채워 넣으라는 뼈대다. 이를 형식 위반으로 처리하면 **템플릿에서 새 원고를 만들 때마다 경고가 뜬다** → REQ-WS-053(placeholder 무경고). 명백한 결함이므로 요구사항으로 못박았다.

`author:`는 단수형으로 출하되므로 키 이름을 바꾸지 않고 값 타입으로 복수를 표현한다(REQ-WS-051). 빈 문자열은 미기입이다.

---

## §C 마일스톤

> 우선순위 라벨만 사용한다. 기간 예측 없음.

### M1 — 메타데이터·매니페스트 데이터 모델 (Priority: High, 번복 가능성 최상)

`shared/`에 매니페스트 타입·스키마·검증, 키 단위 범위 산출(D-1), front matter 키 스키마, 메타데이터 유효값 병합(front matter 정본 + 매니페스트 기본값)을 순수 함수로 정의한다. 프로젝트 없음 상태의 front matter 단독 경로를 함께 정의한다. 이 마일스톤의 결정이 이후 전부를 규정한다.

대상 요구: REQ-WS-001, 002, 003, 009, 010, 034~044, 050~053

### M2 — 조정 흐름과 배너 UX (Priority: High, 번복 가능성 상)

사용자에게 보이는 흐름 — 조용한 자동 반영, 배너 알림(차이 보기 / 디스크에서 불러오기), 보류 표시, 사라진 파일 표시 — 을 상태 기계로 기술하고 검토받은 뒤 구현한다. 모달 금지를 구조적으로 보장한다.

대상 요구: REQ-WS-023, 024, 027, 028, 029, 030, 031, 049

### M3 — 프로젝트 discovery와 신뢰 경계 (Priority: High)

walk-up 탐색, 최근접 선택, 프로젝트 없음/손상 상태 진입, 규약 폴더 해석, pathGuard 불변(D-6).

대상 요구: REQ-WS-004~008, 011, 012

### M4 — 감시와 변경 확정 (Priority: High)

`electron/fs.ts` 확장: 파일 단위 구독, 규약 폴더 등록(`data/` 제외), **경로별 debounce로 교체**(B.5의 결함 수정), mtime/size 재검사, 자기 저장 에코 억제, 유실 복구 재검사, 플랫폼 차이 흡수, 수동 새로고침 경로.

대상 요구: REQ-WS-013~019, 045~047

### M5 — 조합 유지형 e2e 프리미티브 + IME 게이트 (Priority: High, 위험 최상)

두 산출물이 한 마일스톤에 묶인다:
1. **조합 유지형 e2e 프리미티브 + `compositionend` 관측 수단**(B.3의 4요소 계약) — 이것이 없으면 IME AC가 공허하게 통과한다. **이 저장소의 CDP IME e2e 커버리지는 현재 0이므로(B.3 실측) M5는 기존 하네스의 확장이 아니라 최초 구축이다.** `composeKorean`은 호출부가 없으므로 시그니처 보존은 저비용 예방책이지 제약이 아니다.
2. 조정 적용 지점의 조합 게이트 + 보류 큐 구현. 조합 관찰은 `table.ts:810-926` 방식을 따르되, 그 구현이 표 셀 전용이므로 **에디터 일반 표면용 조합 상태는 신규 구축**임에 유의한다.

**구현자 주의 (파일명 드리프트)**: `docs/DOCUMENT_MODE_PRINCIPLES.md:55`는 `e2e/toolbar-ime-composition.spec.ts`를 참조하지만 **실제 파일명은 `e2e/ime-composition.spec.ts`** 다. `structure.md` §11도 같은 드리프트를 기록하고 있다. 존재하지 않는 파일을 찾느라 시간을 쓰지 말 것. 이 SPEC은 해당 문서를 수정하지 않는다.

대상 요구: REQ-WS-020~023

### M6 — 최소 diff 적용과 캐럿 보존 (Priority: Medium)

공통 접두/접미 축약 기반 단일 replace, 캐럿·선택·스크롤·실행 취소 보존 검증. 필요 시 라인 diff로 확장.

대상 요구: REQ-WS-025, 026

### M7 — 파일 종류 무관 무결성 (Priority: Medium)

감시·확정·조정 계층이 확장자에 의존하지 않음을 유닛 계층에서 검증하고(D-5에 따라 에디터 표면 없이), 바이트 정규화 금지를 회귀 테스트로 고정한다. `DOCUMENT_MODE_PRINCIPLES.md` 범위 공백은 **기록만** 한다.

대상 요구: REQ-WS-032, 033

### M8 — IPC 배선과 통합 (Priority: Medium, 기계적)

`shared/ipc-contract.ts` 채널 선언, `electron/preload.ts` 브리지, `electron/ipc/` 모듈 배치(모듈당 200줄 이하 목표), 구독 해제 클로저 계약 준수.

대상 요구: C-3 (전 요구 횡단)

---

## §D 위험과 완화

| 위험 | 완화 |
|---|---|
| **IME AC가 공허하게 통과** (현행 헬퍼가 조합을 유지하지 못함) | M5에서 조합 유지형 프리미티브 + `compositionend` 관측 수단을 **선행 산출물**로 만들고 AC-WS-019~022를 그 위에 재작성(완료). OS 수준 충실도는 AC-WS-024 수동 스모크가 담당 |
| **CDP IME e2e 계층 자체가 부재** — 헬퍼는 있으나 호출부 0곳(B.3 실측). 문서(`DOCUMENT_MODE_PRINCIPLES.md` §2)는 이 계층이 존재한다고 전제 | M5를 최초 구축으로 취급하고 일정·검토 비중을 상향. 프리미티브가 실제로 조합을 유지하는지부터 검증하는 self-test spec을 M5의 첫 산출물로 둔다 (프리미티브 자체가 미검증 코드이므로) |
| **`shared/` → `electron/` import 불가**로 AC-WS-053이 제품 코드에서 성립 불가 | §B.1 함정 절 참조. 상수 배치를 M1에서 결정하고, 동일성 단언은 `tests/` 계층(비-composite, node 타입)에 배치 |
| **Linux 폴링 분기가 루트 경로를 방출**해 REQ-WS-016과 불일치 | §B.5 참조. M4가 (a) 경로 단위 승격 또는 (b) Linux 조정 비활성화를 명시 선택 |
| 조합 중 리로드가 조합을 파괴 | 게이트를 렌더러에 배치(B.2), `table.ts` 선례 준수, 모달 금지(REQ-WS-049) |
| 미저장 편집 소실 | REQ-WS-028 타협 불가 + D-2의 "편집 유지가 기본" 정책 |
| **경로별 debounce 미적용 시 이벤트 소실** | B.5의 실측 결함을 M4에서 수정. REQ-WS-016 + AC-WS-059로 고정 |
| Windows 감시 회귀가 CI에서 안 잡힘 | 재검사 로직을 순수 함수로 분리해 유닛에서 양 플랫폼 재현 |
| `data/` 대용량 이벤트 폭주 | D-3에서 `data/` 감시 배제 확정 + 경로별 debounce |
| 매니페스트 갱신이 주석·키 순서를 파괴 | D-1의 키 단위 스플라이스. **기존 `frontMatterRange`는 블록 단위라 그대로 못 쓴다** — 키 단위 범위 계산이 신규 구현임을 M1에서 인지 |
| 템플릿 placeholder가 매 원고마다 경고 | REQ-WS-053 + AC-WS-064로 고정 |
| 로컬 e2e 실행 불가 환경 | §E 참조 — 조건부 해소 상태 |

---

## §E 자기 검증

구현 완료 시 다음이 관측 가능해야 한다:

1. `pnpm typecheck` (`tsc --build` **및** `tsc --noEmit -p tsconfig.test.json` 양쪽), `pnpm lint`, `pnpm test` green
2. `pnpm test:e2e` green — 조합 유지형 프리미티브 기반 IME spec 포함, e2e 전체 스위트 green
3. 커버리지 85% 목표 / 커밋당 80% 최소
4. `acceptance.md`의 모든 AC가 PASS 증거와 함께 기록됨
5. 릴리스 전 수동 한글 IME 스모크 통과 (자동화로 대체 불가)

### 로컬 e2e 실행 환경 — 조건부 해소 (이전 판 정정)

이전 판은 `tech.md` §13.2(로컬 e2e 실행 불가)를 "해소되었다"고 단정했다. 정확히는 **조건부 해소**다:

- §13.2의 원인은 §13.3(ad-hoc 서명 Electron 바이너리의 notarization revoked)과 동일하며, 해소는 Developer ID 실서명 + 공증 전환에 의존한다.
- 그 전환은 저장소 시크릿 5종이 **모두** 설정되어야 CI에서 동작하며, 하나라도 없으면 electron-builder가 ad-hoc으로 되돌아가 같은 차단이 재현된다(`tech.md` §13.3).

**검증함** — `gh secret list` (exit 0):

```
APPLE_APP_SPECIFIC_PASSWORD	2026-07-31T11:34:54Z
APPLE_ID	2026-07-31T11:27:43Z
APPLE_TEAM_ID	2026-07-31T11:27:42Z
MAC_CSC_KEY_PASSWORD	2026-07-31T11:48:49Z
MAC_CSC_LINK	2026-07-31T11:48:48Z
```

5종 모두 존재하므로 CI 측 전제는 충족되어 있다. 다만 **Windows는 여전히 미해결**이고(`tech.md` §13.3 — NSIS 미서명), 로컬 개발 환경에서 서명된 Electron 바이너리를 실제로 확보했는지는 개발자별로 다르다. 따라서 M5의 IME 검증은 CI e2e를 기준선으로 잡고, 로컬 반복이 불가한 환경을 전제로 일정을 배치한다.

---

## §F 참조

- `spec.md` — 요구사항 원본 (53개; REQ-WS-001~047 + 047a + 049~053, **048은 결번**)
- `acceptance.md` — 수용 기준 (모든 항목이 REQ ID 또는 제약 ID 인용)
- `design.md` — 설계 결정과 구조 (Tier L 산출물; §A 결정 + §B 접근에서 추출)
- `research.md` — 코드베이스 조사 결과 (Tier L 산출물; SPEC-2~5 공용)
- `EPIC-V03-WORKSPACE.md` §6 — 프로세스·모듈 경계, `:101` 비마크다운 표면 = SPEC-2
- `e2e/_helpers.ts:241-281` — 현행 `composeKorean` (M5가 대체·확장)
- `electron/fs.ts:110-163` — 현행 `watchRoot` (M4가 경로별 debounce로 교체)
- `src/editor/decorations/table.ts:810-926` — 조합 관찰의 유일한 실행 코드 선례
- `src/editor/keymap/pendingInlineFormat.ts:12-32` — 조합 중 문서 변경 실패 기록 (반면교사, 주석)
- `shared/frontMatter.ts:59-77` — 범위 기반 접근의 선례 (쓰기 함수는 없음)
- `shared/manuscriptTemplates.ts:22, :70, :168` — 출하 중인 front matter 키
- `.moai/config/sections/quality.yaml` — TDD 설정, 커버리지 임계

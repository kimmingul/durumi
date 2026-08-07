---
id: SPEC-V03-WORKSPACE-001
title: "수용 기준 — v0.3 워크스페이스 골격"
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

# 수용 기준 — SPEC-V03-WORKSPACE-001

모든 AC는 관측 가능한 증거(테스트 출력, 바이트 비교, UI 상태, 명령 종료 코드)로 판정한다. 주관적 판단("자연스럽다", "빠르다")은 사용하지 않는다.

**표기 규약**

- 각 AC 제목 끝의 `↔ REQ-WS-0NN` 은 그 AC가 검증하는 요구사항이다. **제약(C-N)만 추적하는 AC**는 `↔ C-N` 으로 표기한다 — 이는 의도적이며, 품질 게이트·릴리스 게이트·문서 범위 공백처럼 요구사항이 아니라 제약에서 나오는 항목이 여기 해당한다. 해당 AC는 정확히 여섯 개다: **AC-WS-024, 037, 048, 049, 050, 051**.
- `[P]` 프로젝트 있음 / `[N]` 프로젝트 없음 / `[P+N]` 양쪽 모두. C-1이 정의한 범위를 따른다. **위 여섯 개의 제약 추적 AC는 상태 태그를 의도적으로 생략한다** — 품질 게이트와 릴리스 게이트는 프로젝트 유무와 무관하게 저장소 전체에 적용되므로 `[P]`/`[N]` 구분이 의미를 갖지 않는다.
- 총 **81개 항목**. 식별자는 AC-WS-001 ~ 070이며, 013 / 016 / 023 / 031 / 038 / 039 / 057 / 058 / 067 아홉 개가 분할되어(013·013b, 016a·016b, **023a·023b**, 031·031b, 038·038b·038c, 039·039b, 057·057b, 058·058b, 067·067b·067c) 항목 수가 최대 번호보다 11 많다. **AC-WS-023은 단독 식별자로 존재하지 않는다** — 023a/023b로 완전 대체되었다(마일스톤 밀폐성 확보).

---

## §A 프로젝트 매니페스트와 폴더 규약

### AC-WS-001 `[P]` 매니페스트가 프로젝트를 선언한다 ↔ REQ-WS-001
- **Given** 디렉터리 `X/`에 유효한 `durumi.project.yaml`이 있고 `X/manuscript/a.md`가 존재할 때
- **When** `X/manuscript/a.md`를 연다
- **Then** 앱은 `X/`를 소유 프로젝트 루트로 보고한다

### AC-WS-002 `[P]` walk-up 탐색이 32단계에서 멈춘다 ↔ REQ-WS-004
- **Given** 열린 파일에서 33단계 위에만 매니페스트가 있을 때
- **When** 파일을 연다
- **Then** 앱은 프로젝트 없음 상태로 보고하고 오류를 표시하지 않는다

### AC-WS-003 `[P]` 최근접 매니페스트가 이긴다 ↔ REQ-WS-005
- **Given** `X/`와 `X/sub/` 양쪽에 매니페스트가 있고 `X/sub/a.md`를 열 때
- **When** discovery가 수행된다
- **Then** 소유 프로젝트 루트는 `X/sub/`다

### AC-WS-004 `[N]` 매니페스트 부재는 오류가 아니다 ↔ REQ-WS-006
- **Given** 어떤 상위 디렉터리에도 매니페스트가 없는 `a.md`
- **When** 파일을 연다
- **Then** 파일이 정상적으로 열리고, 프로젝트 없음 상태이며, 오류·경고 UI가 표시되지 않는다

### AC-WS-005 `[P]` 손상된 매니페스트는 강등되지 않는다 ↔ REQ-WS-007
- **Given** 매니페스트가 유효하지 않은 YAML일 때
- **When** 프로젝트 하위 파일을 연다
- **Then** 앱은 "손상된 매니페스트" 상태를 보고하고 파싱 오류 메시지를 노출하며, 문서 편집·저장은 계속 가능하다
- **And** 매니페스트 파일의 바이트가 변경되지 않는다 (읽기 전후 SHA-256 동일)

### AC-WS-006 `[P]` 필수 키 결여는 손상과 동일 취급 ↔ REQ-WS-008
- **Given** 매니페스트가 유효한 YAML이지만 `name` 키가 없을 때
- **When** 프로젝트 하위 파일을 연다
- **Then** 앱은 손상된 매니페스트 상태를 보고한다 (프로젝트 없음이 아니다)

### AC-WS-007 `[P]` 키 단위 스플라이스가 주변을 보존한다 ↔ REQ-WS-003
- **Given** 매니페스트가 다음 순서로 구성될 때: 사용자 주석 1줄 → `name` → 앱이 정의하지 않은 최상위 키 `custom_field` → `authors`
- **When** 앱이 `authors` 키만 갱신하는 최소 쓰기 API를 호출한다
- **Then** 갱신 후 파일에서 (a) 주석이 원문 그대로 남아 있고, (b) `custom_field`가 값·위치 모두 그대로이며, (c) 키 순서가 보존되고, (d) `authors` 줄 범위 밖 바이트의 diff가 0이다
- **참고**: "매니페스트 갱신"은 REQ-WS-003이 정의하는 키 단위 최소 쓰기 동작을 가리킨다. 이 SPEC은 매니페스트 편집 GUI를 만들지 않으므로(spec.md §D), 검증 대상은 그 쓰기 API다

### AC-WS-008 `[P]` 폴더 재정의가 적용된다 ↔ REQ-WS-010
- **Given** 매니페스트 `folders.figures`가 `output/fig`로 재정의되었을 때
- **When** 앱이 figures 경로를 해석한다
- **Then** 해석 결과는 `<루트>/output/fig`다

### AC-WS-009 `[P]` 루트 밖 재정의는 무시된다 ↔ REQ-WS-010
- **Given** 매니페스트 `folders.data`가 `../elsewhere`로 재정의되었을 때
- **When** 앱이 data 경로를 해석한다
- **Then** 해석 결과는 기본값 `<루트>/data`이며 재정의는 무시된다

### AC-WS-010 `[P]` 규약 폴더를 자동 생성하지 않는다 ↔ REQ-WS-011
- **Given** 규약 폴더가 하나도 존재하지 않는 프로젝트
- **When** 프로젝트를 열고 닫는다
- **Then** 디스크에 새 디렉터리가 생성되지 않는다 (열기 전후 디렉터리 목록 동일)

### AC-WS-011 `[P]` 프로젝트 발견이 신뢰를 넓히지 않는다 ↔ REQ-WS-012
- **Given** 프로젝트 루트가 세션 신뢰 목록에 없는 상태에서 매니페스트가 발견되었을 때
- **When** 렌더러가 프로젝트 루트 하위의 미신뢰 경로를 IPC로 요청한다
- **Then** 요청이 `PathNotAllowedError`로 거부된다

### AC-WS-052 `[P]` 매니페스트 최상위 키 집합과 미정의 키 허용 ↔ REQ-WS-002
- **Given** `name`, `version`, `folders`, `authors`, `acknowledgements`, `registration`, `bibliography` 를 모두 담고 **추가로** 앱이 정의하지 않은 키 `future_key`를 담은 매니페스트
- **When** 앱이 매니페스트를 읽는다
- **Then** 정의된 7개 키가 모두 파싱되고, `future_key`의 존재가 파싱 실패나 경고를 유발하지 않는다

### AC-WS-053 `[P]` 기본 폴더 5종과 `reference/` 이름 정합 ↔ REQ-WS-009
- **Given** `folders` 재정의가 없는 매니페스트
- **When** 앱이 기본 폴더 규약을 해석한다
- **Then** 정확히 `data`, `scripts`, `figures`, `manuscript`, `reference` 다섯 개가 반환된다
- **And** reference 폴더명이 `electron/referenceFs.ts`의 `REFERENCE_DIR_NAME` 값과 문자열 동일하다 (상수를 직접 참조하는 단언)

---

## §B 감지와 변경 확정

### AC-WS-012 `[P+N]` 열린 파일의 외부 변경이 감지된다 ↔ REQ-WS-013
- **Given** 파일이 열려 있고 미저장 편집이 없을 때
- **When** 외부 프로세스가 그 파일의 내용을 바꿔 쓴다
- **Then** 앱이 변경 확정 이벤트를 산출한다

### AC-WS-013 `[P+N]` 열린 파일은 내용이 같으면 확정하지 않는다 ↔ REQ-WS-014 (2단계)
- **Given** 파일이 **열려 있을** 때
- **When** 외부 프로세스가 동일한 내용으로 파일을 덮어쓴다 (수정 시각이 갱신되어 1단계는 통과한다)
- **Then** 2단계 내용 대조에서 동일 판정이 나 변경 확정 이벤트가 산출되지 않고 버퍼가 변경되지 않는다
- **1단계만으로는 이 AC가 통과하지 않는다**: 내용 동일 재작성도 mtime을 바꾸므로 크기+수정시각 대조만으로는 확정된다. 이 AC는 2단계 내용 대조의 존재를 강제하는 검사다

### AC-WS-013b `[P]` 열려 있지 않은 경로는 1단계만 적용된다 ↔ REQ-WS-014
- **Given** 규약 폴더 안에 있지만 **열려 있지 않은** 파일
- **When** 외부 프로세스가 그 파일을 변경한다
- **Then** 1단계(크기+수정시각)만으로 폴더 수준 변경 신호가 산출되고, 그 파일의 내용을 읽는 호출이 발생하지 **않는다** (읽기 함수 스텁에 대한 호출 횟수 단언)
- **비용 경계 근거**: 2단계를 열려 있지 않은 파일까지 확장하면 REQ-WS-046이 `data/` 감시를 배제해 피한 대용량 읽기 비용이 규약 폴더 경로로 되돌아온다. 이 AC가 그 경계를 고정한다

### AC-WS-014 `[P+N]` 자기 저장이 외부 변경으로 오인되지 않는다 ↔ REQ-WS-015
- **Given** 파일이 열려 있고 편집되어 있을 때
- **When** 사용자가 저장한다 (원자적 쓰기로 감시 이벤트가 발생함)
- **Then** 외부 변경 확정 이벤트가 산출되지 않고 배너가 뜨지 않는다

### AC-WS-015 `[P+N]` 쓰기 진행 중 부분 상태를 확정하지 않는다 ↔ REQ-WS-014, REQ-WS-016
- **Given** 확정 계층에 주입 가능한 파일 읽기 함수와 시계(clock)가 있을 때
- **When** 테스트가 다음 시퀀스를 결정적으로 재생한다: 감시 이벤트 발생 → 합류 창 만료 이전 시점에 파일 크기가 최종 크기와 다른 중간 상태 → 합류 창 만료 후 최종 상태
- **Then** 산출된 확정 이벤트는 1건이며, 그 이벤트가 참조하는 내용은 최종 상태다 (중간 상태를 읽은 호출이 확정으로 이어지지 않는다)
- **검증 방법**: 실시간 경쟁이 아니라 주입된 시계 + 스텁 파일 읽기로 시퀀스를 재생한다. 실경쟁 단언은 비결정적이므로 사용하지 않는다

### AC-WS-016a `[P+N]` macOS 이벤트 형태를 흡수한다 ↔ REQ-WS-017
- **Given** macOS 스타일 감시 이벤트(병합된 단일 이벤트, 상대 경로 `filename`)가 주어질 때
- **When** 확정 계층이 이를 처리한다
- **Then** 정규화된 확정 이벤트가 산출된다

### AC-WS-016b `[P+N]` Windows 이벤트 형태를 흡수한다 ↔ REQ-WS-017
- **Given** Windows 스타일 감시 이벤트(중복 발행, rename old/new 분리, 대소문자 비정규화 경로)가 주어질 때
- **When** 확정 계층이 이를 처리한다
- **Then** AC-WS-016a와 **동일한** 정규화된 확정 이벤트가 산출된다
- **And** 이 판정이 유닛 계층에서 재현 가능하다 (Windows e2e 없이 검증 가능해야 함 — `tech.md` §9, C-6)

### AC-WS-017 `[P+N]` 이벤트 유실 후 재검사가 복구한다 ↔ REQ-WS-018
- **Given** 감시가 등록된 파일이 있고, 테스트가 감시자 수명주기 API에 접근할 수 있을 때
- **When** `unwatchRoot`(또는 파일 단위 대응 API)로 감시를 해제하고, 그 상태에서 파일을 외부에서 변경한 뒤, `watchRoot`(또는 대응 API)로 재등록한다
- **Then** 재등록 직후 재검사가 수행되어 변경이 확정된다
- **트리거 명시**: 재현 트리거는 **감시자 해제 → 외부 변경 → 재등록** 시퀀스다. 절전 복귀는 이 시퀀스의 실제 발생 원인 중 하나일 뿐이며, 테스트는 OS 절전을 시뮬레이션하지 않는다

### AC-WS-018 `[P+N]` 감시가 pathGuard를 우회하지 않는다 ↔ REQ-WS-019
- **Given** 신뢰되지 않은 경로
- **When** 감시 등록이 시도된다
- **Then** 등록이 거부된다

### AC-WS-056 `[P]` 규약 폴더가 감시된다 ↔ REQ-WS-045
- **Given** 프로젝트가 열려 있고 `manuscript/`에 열려 있지 않은 파일이 있을 때
- **When** 외부 프로세스가 `manuscript/`에 새 파일을 생성한다
- **Then** 확정 이벤트가 산출된다

### AC-WS-057 `[P]` data 역할 경로 하나만 감시에서 제외된다 ↔ REQ-WS-046
- **Given** `folders` 재정의가 없는 프로젝트
- **When** 감시 등록 목록을 조회한다
- **Then** 목록에 `data/`가 없고, `manuscript/` · `reference/` · `figures/` · `scripts/`는 모두 있다
- **And** `data/`에 열려 있지 않은 파일을 외부에서 생성해도 확정 이벤트가 산출되지 않는다

### AC-WS-066 `[P]` 역할 기반 제외가 이름 충돌에 오염되지 않는다 ↔ REQ-WS-046, REQ-WS-045
- **Given** 매니페스트가 `folders.data: archive` 와 `folders.manuscript: data` 를 함께 선언한 프로젝트
- **When** 감시 등록 목록을 조회한다
- **Then** 제외된 경로는 **정확히 `archive/` 하나**다
- **And** `data/`(이 설정에서는 manuscript 역할)가 감시 목록에 **포함된다** — 이름이 `data`라는 이유로 제외되지 않는다
- **회귀 근거**: 리터럴 경로 기준 제외로 구현하면 이 설정에서 원고 폴더 감시가 중단되어 REQ-WS-045를 정면으로 위반한다

### AC-WS-057b `[P]` `data/` 안이라도 열린 파일은 감시된다 ↔ REQ-WS-046, REQ-WS-013
- **Given** `data/notes.md`를 에디터에서 연 상태
- **When** 외부 프로세스가 그 파일을 바꿔 쓴다
- **Then** 확정 이벤트가 산출된다 (폴더 배제가 열린 파일 감시를 무효화하지 않는다)

### AC-WS-058 `[P]` 수동 새로고침이 `data/` 변경을 표면화한다 ↔ REQ-WS-047
- **Given** `data/`에 외부 프로세스가 새 파일을 만들었고 확정 이벤트가 산출되지 않은 상태
- **When** 사용자가 수동 새로고침을 요청한다
- **Then** 재열거 결과에 새 파일이 포함된다

### AC-WS-058b `[P]` 수동 새로고침 진입점이 존재한다 ↔ REQ-WS-047a
- **Given** 구현 완료 시점
- **When** IPC 계약(`shared/ipc-contract.ts`)과 메뉴 커맨드 라우터를 조회한다
- **Then** 수동 새로고침을 호출하는 진입점이 양쪽에 존재한다
- **범위 주의**: 시각적 어포던스(버튼 위치, 단축키)는 SPEC-2 소유이므로 이 AC는 **호출 가능성만** 검증한다. 현재 저장소에 새로고침 관련 UI 문자열이 없음을 확인했다(`grep -rn "새로고침" src/i18n/dict.ts` → 0건)

### AC-WS-059 `[P+N]` 경로별 debounce가 이벤트를 소실시키지 않는다 ↔ REQ-WS-016
- **Given** 두 파일 `manuscript/a.md`, `manuscript/b.md`가 감시 대상일 때
- **When** 하나의 합류 창(현행 구현 기준 200ms) 안에서 두 파일이 순차로 외부 변경된다
- **Then** 확정 이벤트가 **2건** 산출되고 각각 올바른 경로를 담는다
- **회귀 근거**: 현행 `electron/fs.ts:152-161`은 루트당 단일 `pendingPath` 스칼라를 last-wins로 덮어써 이 시나리오에서 1건만 산출한다. 이 AC는 그 결함의 수정을 고정한다

---

## §C IME 안전 (최우선)

> 이 절의 AC는 `docs/DOCUMENT_MODE_PRINCIPLES.md` §2에 따라 CDP `Input.imeSetComposition` 기반 e2e가 의무다.
>
> **선행 조건 — 조합 유지형 프리미티브.** 현행 `composeKorean()`(`e2e/_helpers.ts:241-281`)은 조합 시작과 종료를 한 호출 안에서 원자적으로 수행하고 `finally`에서 CDP 세션을 detach하므로, **조합을 열어둔 채 외부 파일 쓰기를 끼워 넣을 수 없다.** 아래 AC-WS-019~022는 plan.md §B.3이 정의한 `startComposition` / `updateComposition` / `endComposition` 프리미티브 위에서만 유효하다. 현행 헬퍼로 이 AC를 실행하면 조합 중 버퍼를 교체하는 구현도 통과하므로, **프리미티브 도입 전에는 이 절의 AC를 PASS로 기록할 수 없다.**

### AC-WS-019 `[P+N]` 조합 중에는 조정이 적용되지 않는다 ↔ REQ-WS-020
- **Given** 문서가 열려 있고 미저장 편집이 없으며, `const h = await startComposition(page, '한')`으로 조합이 **열린 채 유지되는** 상태
- **When** 외부 프로세스가 그 파일을 바꿔 쓰고 변경이 확정된다 (조합은 아직 종료되지 않음)
- **Then** 버퍼 내용이 변경되지 않는다
- **And** `observeCompositionEnd(h)`가 반환하는 `compositionend` 발생 횟수가 **0이다** (조합이 여전히 열려 있음)
- **관측 수단**: plan.md §B.3의 4번째 계약 요소. `startComposition`이 설치한 `compositionend` 카운터가 유일한 관측 경로다 — 저장소에 범용 조합 플래그가 없고 `dataset.composing`은 표 셀 전용(`table.ts:810-814`)이므로 그것에 의존할 수 없다

### AC-WS-020 `[P+N]` 조합 종료 후 보류된 조정이 적용된다 ↔ REQ-WS-021
- **Given** AC-WS-019의 상태에서
- **When** `endComposition(handle)`이 호출된다
- **Then** 보류된 조정이 적용되고, 최종 버퍼가 (디스크 내용 + 사용자가 커밋한 조합 텍스트)를 모두 반영한다

### AC-WS-021 `[P+N]` 보류 중 다중 변경은 최종 상태 1회만 적용된다 ↔ REQ-WS-021
- **Given** 조합이 열린 채 유지되는 동안 외부에서 같은 파일이 3회 바뀌어 3건이 확정된 상태
- **When** 조합이 종료된다
- **Then** 조정이 1회 적용되고 결과가 최종 디스크 상태와 일치한다

### AC-WS-022 `[P+N]` 조정이 조합 경계와 커밋 텍스트를 훼손하지 않는다 ↔ REQ-WS-022
- **Given** `startComposition` → `updateComposition` ×2 → 외부 변경 확정 → `endComposition` 순서로 진행할 때
- **When** 시퀀스가 완료된다
- **Then** (a) `endComposition` 호출 **직전**에 `observeCompositionEnd(h)`가 **0**을 반환하고 (즉 `startComposition`과 명시적 `endComposition` 사이에 `compositionend`가 발생하지 않았다), (b) 커밋된 텍스트가 마지막 `updateComposition`에 전달한 문자열과 **바이트 단위로 일치**한다
- **단언 범위 제한 (의도적)**: CDP `imeSetComposition`의 교체 semantics는 실제 macOS 한글 IME의 `compositionupdate` 시퀀스와 1:1이 아니다(`e2e/_helpers.ts:246-256` 주석). 따라서 이 AC는 프리미티브로 **재현 가능한 두 가지**(조합 경계 유지, 커밋 텍스트 일치)만 단언한다. OS 수준의 "음절 소실·중복 없음"은 AC-WS-024가 담당한다

### AC-WS-023a `[P+N]` 보류 상태의 표면이 비침습적이다 ↔ REQ-WS-023 — **M2에서 종료 가능**
- **Given** 보류 상태를 **직접 설정**한 조정 계층 (조합 관찰자를 경유하지 않고 상태를 주입)
- **When** UI를 관측한다
- **Then** 상태 표시가 존재하고, 모달이 아니며, `document.activeElement`가 표시 전후로 동일하다
- **밀폐성**: 이 AC는 상태와 그 표면만 검증하므로 M2 안에서 완결된다. 조합 관찰자(M5)에 의존하지 않는다

### AC-WS-023b `[P+N]` 실제 조합이 보류 상태로 진입시킨다 ↔ REQ-WS-023, REQ-WS-020 — **M5에서 종료**
- **Given** `startComposition`으로 조합이 열린 채 유지되는 상태
- **When** 외부 변경이 확정된다
- **Then** 조정 계층이 보류 상태로 진입하고, AC-WS-023a가 검증한 표면이 나타난다
- **분리 이유**: 판 0.2.2까지 이 두 단언이 한 AC에 묶여 있어 M2에서 상태·표면을 완성하고도 진입 경로가 M5 산출물이라는 이유로 AC 전체가 종료되지 못했다(부분 PASS). 밀폐 가능한 부분과 M5 의존 부분을 분리해 각 마일스톤이 자기 AC를 닫을 수 있게 한다

### AC-WS-060 `[P+N]` 조정 알림이 모달을 사용하지 않는다 ↔ REQ-WS-049
- **Given** 조정 알림(보류 표시, 외부 변경 배너, 사라진 파일 표시)이 표시된 상태
- **When** DOM을 조회한다
- **Then** 모달 역할 요소(`[role="dialog"]`, `[role="alertdialog"]`, `<dialog>`)가 존재하지 않는다
- **And** `document.activeElement`가 조정 알림 표시 전후로 동일하다

### AC-WS-024 릴리스 게이트 — 수동 한글 스모크 ↔ C-7, C-8
- **Given** AC-WS-019~023, AC-WS-060이 모두 자동으로 PASS한 상태
- **When** 릴리스 사인오프를 진행한다
- **Then** 실제 macOS 한글 2벌식 IME로 "다단계 조합 중 외부 파일 변경" 시나리오를 수동 검증한 기록이 존재한다 (음절 소실·중복 없음 포함)
- **And** 이 항목은 자동화로 대체될 수 없다 (`product.md` §8 게이트 3)

---

## §D 조정

### AC-WS-025 `[P+N]` 미저장 편집이 없으면 자동 반영된다 ↔ REQ-WS-024
- **Given** 파일이 열려 있고 미저장 편집이 없을 때
- **When** 외부 변경이 확정된다
- **Then** 버퍼가 디스크 내용과 일치하고 문서가 clean 상태를 유지한다

### AC-WS-026 `[P+N]` 캐럿이 문서상 같은 위치를 유지한다 ↔ REQ-WS-026
- **Given** 100줄 문서의 80번째 줄에 캐럿이 있고 미저장 편집이 없을 때
- **When** 외부에서 5번째 줄에 2줄이 삽입된다
- **Then** 조정 후 캐럿이 여전히 같은 텍스트 지점(이제 82번째 줄)을 가리킨다

### AC-WS-027 `[P+N]` 변경 영역 내부 캐럿은 경계로 이동한다 ↔ REQ-WS-026
- **Given** 캐럿이 곧 교체될 영역 내부에 있을 때
- **When** 조정이 적용된다
- **Then** 캐럿이 그 영역의 경계에 놓이고 문서 범위 밖으로 나가지 않는다

### AC-WS-028 `[P+N]` 조정이 실행 취소 이력을 파괴하지 않는다 ↔ REQ-WS-025
- **Given** 사용자가 편집 후 저장(clean)한 상태
- **When** 외부 변경이 조정된다
- **Then** 조정 이전 편집에 대한 실행 취소가 여전히 가능하다

### AC-WS-029 `[P+N]` 미저장 편집이 있으면 배너로 알린다 ↔ REQ-WS-027
- **Given** 파일이 열려 있고 미저장 편집이 있을 때
- **When** 외부 변경이 확정된다
- **Then** 버퍼가 변경되지 않고, 해제 가능한 배너가 표시되며, 배너가 "차이 보기"와 "디스크에서 불러오기" 두 동작을 제공한다

### AC-WS-030 `[P+N]` 미저장 편집이 조용히 사라지지 않는다 ↔ REQ-WS-028
- **Given** 미저장 편집이 있고 외부 변경이 확정된 상태
- **When** 사용자가 배너를 무시하거나 해제한다
- **Then** 버퍼가 사용자의 편집 내용을 그대로 유지한다

### AC-WS-031 `[P+N]` 파일 삭제 시 버퍼가 보존된다 ↔ REQ-WS-030
- **Given** 파일이 열려 있을 때
- **When** 외부에서 그 파일이 삭제된다
- **Then** 버퍼 내용이 유지되고 "디스크에서 사라짐" 상태가 표시되며 문서가 자동으로 닫히지 않는다

### AC-WS-031b `[P+N]` 사라짐 표시는 해제할 수 없다 ↔ REQ-WS-030
- **Given** "디스크에서 사라짐" 상태가 표시된 문서
- **When** 해제(dismiss) 동작을 호출한다
- **Then** 표시가 그대로 남는다 (해제는 무동작이다)
- **And** 같은 해제 동작을 REQ-WS-027의 외부 변경 배너에 호출하면 그 배너는 **사라진다** — 두 표면이 의도적으로 다르게 동작함을 한 검사에서 대조한다
- **근거**: 사라짐은 알림이 아니라 디스크의 현재 사실이다. 해제 가능하면 존재하지 않는 파일이 존재하는 것처럼 보인다

### AC-WS-032 `[P+N]` 디코드 불가 내용은 버퍼를 덮어쓰지 않는다 ↔ REQ-WS-031
- **Given** 파일이 열려 있을 때
- **When** 외부에서 그 파일이 유효한 텍스트로 디코드되지 않는 내용으로 바뀐다
- **Then** 조정이 중단되고 사용자에게 보고되며 버퍼가 변경되지 않는다

### AC-WS-033 `[P+N]` 조정 정책이 주입 가능하다 ↔ REQ-WS-029
- **Given** 조정 정책 인터페이스에 테스트용 "승인 대기" 정책을 주입한 상태
- **When** 확정 이벤트가 발생한다
- **Then** 이벤트가 자동 반영이 아니라 대기 큐로 라우팅되고, 버퍼가 변경되지 않는다
- **단언 범위 제한**: "조정 계층 코드 변경 불필요"는 리뷰 판단이므로 단언하지 않는다. 주입 가능성과 라우팅 결과만 검증한다

---

## §E 파일 종류 무관 무결성

### AC-WS-034 `[P+N]` 확정·조정 계층이 확장자에 의존하지 않는다 ↔ REQ-WS-032
- **Given** 확정·조정 계층에 `.py`, `.csv`, `.bib`, `.json`, `.md` 각각의 경로와 동일한 내용 변경을 입력할 때
- **When** 각 입력을 처리한다
- **Then** 다섯 경우 모두 동일한 확정 이벤트 형태와 동일한 조정 결과를 산출한다 (확장자별 분기가 관측되지 않는다)
- **검증 계층**: 유닛. 이 SPEC은 비마크다운 파일을 여는 편집 표면을 만들지 않으므로(SPEC-2 소유, `EPIC-V03-WORKSPACE.md:101`) 에디터 UI를 경유하지 않고 계층 API를 직접 구동한다

### AC-WS-035 `[P+N]` 조정이 줄바꿈을 정규화하지 않는다 ↔ REQ-WS-033
- **Given** CRLF 줄바꿈 파일이 열려 있을 때
- **When** 외부 변경이 조정되고 이후 저장된다
- **Then** 디스크 파일의 줄바꿈이 CRLF로 유지되고 바이트 비교 결과가 외부에서 쓴 내용과 일치한다

### AC-WS-036 `[P+N]` 조정이 후행 공백·인코딩을 바꾸지 않는다 ↔ REQ-WS-033
- **Given** 후행 공백과 비ASCII 문자를 포함한 파일
- **When** 조정 후 저장한다
- **Then** 바이트 단위 diff가 0이다

### AC-WS-037 문서 원칙 파일이 수정되지 않았다 ↔ C-7, spec.md §D
- **Given** 구현 완료 시점의 작업 트리
- **When** `git diff --quiet <BASE> -- docs/DOCUMENT_MODE_PRINCIPLES.md` 를 실행한다. **`<BASE>` 결정 규칙**: 이 SPEC의 첫 커밋의 부모, 즉 `git log --format=%H --reverse --grep='SPEC-V03-WORKSPACE-001' | head -1` 의 결과에 `^` 를 붙인 리비전. 전용 브랜치에서 작업하는 경우 `git merge-base HEAD main` 으로 대체 가능하다
- **Then** 종료 코드가 0이다 (해당 문서가 이 SPEC의 커밋 범위에서 변경되지 않았다)
- **참고**: 범위 공백의 "기록"은 spec.md §D의 Out of Scope 항목과 REQ-WS-033 본문이 담당하며, 이 AC는 **문서 미수정**만 기계적으로 검증한다

---

## §F 메타데이터 모델 (front matter 정본)

### AC-WS-054 `[P]` 메타데이터 3계층 우선순위 ↔ REQ-WS-034
- **Given** front matter가 `author`에 미기입이 아닌 값을 담고 매니페스트도 `authors`를 갖고 있으며, front matter의 `acknowledgements`는 미기입이고 매니페스트에는 값이 있을 때
- **When** 유효 메타데이터를 계산한다
- **Then** `author`의 유효값은 front matter에서, `acknowledgements`의 유효값은 매니페스트에서 온다

### AC-WS-038 `[P+N]` 비어 있지 않은 front matter 저자가 정본이다 ↔ REQ-WS-035
- **Given** front matter `author`에 저자 2명이 시퀀스로 선언되어 있고(미기입 아님), 매니페스트 `authors`에는 다른 3명이 있을 때
- **When** 유효 메타데이터를 계산한다
- **Then** front matter의 2명이 순서대로 반환된다 (매니페스트 값은 억제된다)

### AC-WS-038b `[P]` 키 부재 시 매니페스트 기본값이 채택된다 ↔ REQ-WS-035, REQ-WS-042
- **Given** front matter에 `author` 키가 **없고** 매니페스트 `authors`에 3명이 있을 때
- **When** 유효 메타데이터를 계산한다
- **Then** 매니페스트의 3명이 반환된다

### AC-WS-038c `[P]` 키가 있어도 값이 미기입이면 매니페스트 기본값이 채택된다 ↔ REQ-WS-042, REQ-WS-054
- **Given** 매니페스트 `authors`에 3명이 있고, 원고 front matter가 `author` 키를 **가지고 있으나 그 값이 미기입**일 때. 다음 다섯 형태 각각에 대해 반복한다:
  1. `author: ` (출하 템플릿 형태 — `null`로 파싱)
  2. `author:` (공백 없는 bare 키 — `null`)
  3. `author: ""` (빈 문자열)
  4. `author: "   "` (공백만)
  5. `author: []` (빈 시퀀스)
- **When** 각 경우에 유효 메타데이터를 계산한다
- **Then** **다섯 경우 모두** 매니페스트의 3명이 반환된다
- **이 AC는 문자 그대로의 이전 규칙 아래에서 실패한다**: 억제를 "키가 선언되어 있으면"으로 구현하면 다섯 경우 모두 키가 존재하므로 매니페스트 기본값이 억제되어 저자 0명이 반환된다. 특히 (1)은 출하 템플릿에서 만든 **모든** 원고의 형태이므로, 이 AC가 없으면 기본값 계층이 정상 생성 경로에서 죽은 채로 통과한다
- **null 커버리지 주의**: (1)(2)는 빈 문자열이 아니라 `null`로 파싱된다(`js-yaml` `JSON_SCHEMA` 실측). 미기입 판정을 빈 문자열로만 구현하면 (3)(4)만 통과하고 (1)(2)가 실패한다

### AC-WS-039 `[P]` 감사의 글이 계층에 따라 해석된다 ↔ REQ-WS-036, REQ-WS-042
- **Given** front matter `acknowledgements`에 미기입이 아닌 값이 있고 매니페스트에도 다른 값이 있을 때
- **When** 유효 메타데이터를 계산한다
- **Then** front matter 값이 반환된다

### AC-WS-039b `[P]` 미기입 감사의 글은 매니페스트 기본값을 채택한다 ↔ REQ-WS-036, REQ-WS-054
- **Given** front matter가 `acknowledgements:` 키를 가지되 값이 미기입(`null`)이고, 매니페스트에 값이 있을 때
- **When** 유효 메타데이터를 계산한다
- **Then** 매니페스트 값이 반환된다 — 억제 규칙이 `author`뿐 아니라 세 메타데이터 키 전부에 균일하게 적용됨을 고정한다

### AC-WS-040 `[P+N]` 유효한 NCT 등록번호가 통과한다 ↔ REQ-WS-037
- **Given** front matter `registration`이 `ClinicalTrials.gov NCT01234567`일 때
- **When** 검증한다
- **Then** 유효로 판정되고 경고가 없다

### AC-WS-067 `[P]` 채택되지 않은 매니페스트 값은 검증되지 않는다 ↔ REQ-WS-038, REQ-WS-042
- **Given** 매니페스트 `registration`이 낡은 placeholder `ClinicalTrials.gov NCT`이고, 원고 front matter `registration`이 미기입이 아닌 유효값 `ClinicalTrials.gov NCT01234567`일 때
- **When** 유효 메타데이터를 계산하고 검증한다
- **Then** 유효값은 front matter의 `NCT01234567`이고, **어떤 경고도 산출되지 않는다** (채택되지 않은 매니페스트 값은 검증 대상이 아니다)

### AC-WS-067b `[P]` 기본값으로 채택된 매니페스트 값은 검증된다 ↔ REQ-WS-038
- **Given** 매니페스트 `registration`이 `ClinicalTrials.gov NCT99`(형식 위반)이고, 원고 front matter에 `registration` 키가 **없을** 때
- **When** 유효 메타데이터를 계산하고 검증한다
- **Then** 매니페스트 값이 기본값으로 채택되고, 형식 경고가 산출되며, 원본이 보존된다

### AC-WS-067c `[P]` 출하 placeholder는 매니페스트 등록번호를 억제하지 않는다 ↔ REQ-WS-055, REQ-WS-042
- **Given** 매니페스트 `registration`이 유효한 `ClinicalTrials.gov NCT01234567`이고, 원고가 CONSORT 템플릿 출하 그대로의 `registration: ClinicalTrials.gov NCT`(placeholder)를 가질 때
- **When** 유효 메타데이터를 계산한다
- **Then** 유효값은 **매니페스트의 `NCT01234567`** 이다 (placeholder는 미기입이므로 억제를 발동시키지 않는다)
- **And** 형식 경고가 산출되지 않는다
- **And** PRISMA 템플릿의 `registration: PROSPERO CRD` placeholder에 대해서도 같은 결과가 나온다
- **회귀 근거**: placeholder를 "값 있음"으로 취급하면 CONSORT / PRISMA 템플릿에서 만든 원고에는 프로젝트 수준 등록번호가 결코 적용되지 않는다 — AC-WS-038c가 `author`에서 막는 것과 동일한 결함이 `registration`에서 재발한다

### AC-WS-041 `[P]` 형식 위반 등록번호가 보존된 채 경고된다 ↔ REQ-WS-038
- **Given** front matter `registration`이 `ClinicalTrials.gov NCT123`일 때
- **When** 검증한다
- **Then** 형식 경고가 산출되고 원본 문자열이 그대로 보존되어 반환된다

### AC-WS-065 `[N]` 프로젝트 없이도 형식 경고가 동작한다 ↔ REQ-WS-038, REQ-WS-041
- **Given** 프로젝트 없음 상태이고 원고 front matter `registration`이 `ClinicalTrials.gov NCT99`일 때
- **When** 유효 메타데이터를 계산한다
- **Then** 형식 경고가 산출되고 원본이 보존된다 (매니페스트 부재가 검증을 비활성화하지 않는다)

### AC-WS-061 `[P+N]` front matter 키 스키마가 출하 키와 일치한다 ↔ REQ-WS-050
- **Given** `shared/manuscriptTemplates.ts`가 생성하는 IMRaD / CONSORT / PRISMA 템플릿 원문
- **When** 메타데이터 계층이 각 템플릿의 front matter를 읽는다
- **Then** `author`와 `registration` 키가 인식된다
- **And** front matter 파싱 모듈이 노출하는 **인식 키 화이트리스트**가 정확히 `['author', 'registration', 'acknowledgements']` 이다 (모듈이 export하는 상수에 대한 직접 단언)
- **And** 그 화이트리스트에 `authors` 또는 `registry` 가 **포함되지 않는다**
- **단언 형태 주의**: 소스 트리 전역 grep으로 `authors` / `registry` 문자열의 부재를 단언해서는 **안 된다** — REQ-WS-002가 `authors`를 매니페스트 최상위 키로 요구하고 REQ-WS-035가 그것을 읽으라고 요구하므로, 전역 grep은 매니페스트 키와 front matter 키를 구별하지 못해 M1의 첫 커밋에서 실패한다. 단언 범위는 front matter 파싱 모듈이 노출하는 화이트리스트로 한정한다

### AC-WS-062 `[N]` `author`가 단수·복수·미기입을 모두 처리한다 ↔ REQ-WS-051
- **Given** 프로젝트 없음 상태(기본값 계층이 비어 있음)에서 세 가지 front matter: (a) `author: Kim`, (b) `author: [Kim, Lee]`, (c) 템플릿 출하 그대로의 `author: `
- **When** 각각 유효 메타데이터를 계산한다
- **Then** (a) 저자 1명, (b) 저자 2명 순서 보존, (c) 미기입(저자 0명, 오류 아님)
- **And** (a)의 경우 어떤 오류나 경고도 산출되지 않는다
- **상태 태그 주의**: 이 AC는 `[N]`으로 한정된다. 프로젝트가 있으면 (c)는 매니페스트 기본값을 끌어오므로(AC-WS-038c) 저자 0명이 아니다 — 두 AC는 서로 다른 계층을 검증한다

### AC-WS-068 `[P+N]` 미기입 판정이 다섯 형태를 모두 포함한다 ↔ REQ-WS-054
- **Given** 미기입 판정 함수와 다음 입력: `undefined`(키 부재), `null`, `""`, `"   "`, `[]`, `["", "  "]`
- **When** 각각을 판정한다
- **Then** 여섯 경우 모두 미기입으로 판정된다
- **And** `"Kim"`, `["Kim"]`, `["", "Kim"]` 는 미기입이 **아닌** 것으로 판정된다 (원소 하나라도 비어 있지 않으면 값이 있다)
- **파싱 근거**: `js-yaml`(`JSON_SCHEMA`)에서 `author: ` / `author:` / `author:   ` 는 모두 **`null`** 로, `author: ""` 는 `""` 로 파싱된다(실측). null과 빈 문자열은 서로 다른 값이므로 판정에 둘 다 열거해야 한다

### AC-WS-069 `[P]` 출하 템플릿에서 만든 원고가 프로젝트 저자를 상속한다 ↔ REQ-WS-042, REQ-WS-051, REQ-WS-054
- **Given** 매니페스트 `authors`에 저자 3명이 선언된 프로젝트
- **When** `shared/manuscriptTemplates.ts`의 **각 템플릿**(IMRaD / CONSORT / PRISMA / CARE / STROBE 계열 전부)이 생성하는 front matter 원문을 그대로 원고로 두고 유효 메타데이터를 계산한다
- **Then** **모든 템플릿에서** 저자 3명이 반환된다
- **회귀 근거 (이 AC의 존재 이유)**: 억제가 키 존재 기반이면 모든 템플릿이 `author: `를 발행하므로 이 AC는 전 템플릿에서 실패한다. 이것이 M1 구현에서 드러난 결함의 정확한 재현이며, 이 AC가 그 결함의 무성 재발을 막는 게이트다
- **템플릿 목록 고정 주의**: 특정 템플릿 하나가 아니라 `MANUSCRIPT_TEMPLATES` 배열을 순회해 단언한다 — 향후 템플릿이 추가되어도 자동으로 커버되도록
- **가이드라인 계열 ↔ `id` 대응 (grep 오판 방지)**: 계열 이름이 `id`에 그대로 나타나지 않으므로 `id`를 문자열로 찾으면 CARE·STROBE가 없는 것처럼 보인다. 실제 배열은 6개다:

  | 계열 | `id` | `label` |
  |---|---|---|
  | IMRaD | `imrad` | `IMRaD article` |
  | CONSORT | `consort` | `CONSORT (RCT)` |
  | PRISMA | `prisma` | `PRISMA (systematic review)` |
  | **CARE** | `case-report` | `Case report (CARE)` |
  | **STROBE** | `cohort` | `Cohort / observational (STROBE)` |
  | **STROBE** | `cross-sectional` | `Cross-sectional / survey (STROBE)` |

### AC-WS-063 `[P+N]` PROSPERO 등록값에 NCT 검증이 적용되지 않는다 ↔ REQ-WS-052
- **Given** front matter `registration`이 `PROSPERO CRD42024123456`일 때
- **When** 검증한다
- **Then** NCT 형식 경고가 산출되지 않는다

### AC-WS-064 `[P+N]` 템플릿 placeholder가 경고를 유발하지 않는다 ↔ REQ-WS-053
- **Given** CONSORT 템플릿 출하 그대로의 `registration: ClinicalTrials.gov NCT` 와 PRISMA 템플릿 출하 그대로의 `registration: PROSPERO CRD`
- **When** 각각 검증한다
- **Then** 두 경우 모두 형식 경고가 산출되지 않고 "미기입" 상태로 보고된다
- **회귀 근거**: 이 두 문자열은 `manuscriptTemplates.ts:70`, `:168`이 출하하는 placeholder다. 경고가 뜨면 새 원고를 만들 때마다 경고가 발생한다

### AC-WS-042 `[P]` 매니페스트 bibliography 경로가 walk-up보다 우선한다 ↔ REQ-WS-040
- **Given** 매니페스트가 `bibliography: refs/custom.bib`를 선언하고 문서 옆에 `references.bib`도 있을 때
- **When** 서지 경로를 해석한다
- **Then** `<루트>/refs/custom.bib`가 선택된다

### AC-WS-043 `[P+N]` bibliography 키가 없으면 기존 탐색이 그대로 동작한다 ↔ REQ-WS-040
- **Given** 매니페스트에 `bibliography` 키가 없거나 프로젝트가 없을 때
- **When** 서지 경로를 해석한다
- **Then** 기존 순서(`references.bib` → `references.bibtex` → `bibliography.bib`)의 walk-up 결과와 동일하다

### AC-WS-070 `[P]` 읽을 수 없는 bibliography 경로는 표시를 동반해 폴백한다 ↔ REQ-WS-056
- **Given** 매니페스트가 `bibliography: refs/typo.bib`를 선언하나 그 경로에 파일이 없고, 문서 옆에는 `references.bib`가 있을 때
- **When** 서지 경로를 해석한다
- **Then** walk-up 결과인 `references.bib`가 채택된다
- **And** 폴백이 일어났다는 사실과 읽을 수 없었던 선언 경로(`refs/typo.bib`)가 함께 보고된다
- **And** 권한 거부와 디렉터리를 가리키는 경우에도 같은 결과가 나온다
- **조용한 폴백은 실패다**: 보고 없이 폴백하면 매니페스트 오타가 다른 서지 파일로 조용히 해결되어 사용자가 잘못된 참고문헌을 쓰고도 알 수 없다. 이 AC의 두 번째 단언이 그것을 막는다

### AC-WS-055 `[P]` 매니페스트에 인라인 서지 항목을 허용하지 않는다 ↔ REQ-WS-039
- **Given** 매니페스트 `bibliography` 값이 문자열 경로가 아니라 서지 엔트리 구조(예: `title`/`author`/`doi` 필드를 가진 매핑 또는 그런 매핑의 시퀀스)일 때
- **When** 앱이 매니페스트를 검증한다
- **Then** 해당 값이 서지 경로로 채택되지 않고 스키마 위반으로 보고되며, 서지 해석은 기존 walk-up으로 폴백한다
- **And** 매니페스트에서 읽은 항목이 서지 캐시에 주입되지 않는다

### AC-WS-044 `[N]` 프로젝트 없이 front matter만으로 메타데이터가 동작한다 ↔ REQ-WS-041
- **Given** 프로젝트 없음 상태이고 원고 front matter에 `author`, `acknowledgements`, `registration`이 있을 때
- **When** 유효 메타데이터를 계산한다
- **Then** 세 값이 모두 반환된다

### AC-WS-045 `[P]` 비어 있지 않은 front matter 값이 매니페스트를 무음으로 대체한다 ↔ REQ-WS-042
- **Given** 매니페스트와 front matter가 서로 다른, **둘 다 미기입이 아닌** 저자 목록을 가질 때
- **When** 유효 메타데이터를 계산한다
- **Then** front matter 값이 반환된다
- **And** 충돌 경고가 산출되지 **않는다** (문서 수준 선언은 정상 동작이다)
- **And** 두 소스 중 어느 것도 자동으로 수정되지 않는다

### AC-WS-046 `[P+N]` front matter 갱신이 본문 바이트를 바꾸지 않는다 ↔ REQ-WS-043
- **Given** 원고에 front matter와 본문이 있을 때
- **When** 앱이 front matter의 한 필드를 갱신한다
- **Then** front matter 영역 밖 본문의 바이트 diff가 0이다

### AC-WS-047 `[P+N]` 두 번째 front matter 파서가 도입되지 않는다 ↔ REQ-WS-044
- **Given** 구현 완료 시점의 소스 트리
- **When** front matter 파싱 진입점을 검색한다
- **Then** `shared/frontMatter.ts` / `shared/frontMatterFenced.ts` 외의 신규 front matter 파서가 존재하지 않는다

---

## §G 품질 게이트

### AC-WS-048 CI 게이트 ↔ C-5, C-8
- `pnpm typecheck` (`tsc --build` **및** `tsc --noEmit -p tsconfig.test.json` 양쪽) 통과
- `pnpm lint` 통과
- `pnpm test` 통과

### AC-WS-049 e2e 게이트 ↔ C-7, C-8
- `pnpm test:e2e` 통과 — e2e 전체 스위트 green (§C의 조합 유지형 프리미티브 기반 IME spec 포함)
- `composeKorean`의 시그니처가 보존된다 (인자 3개: `page`, `syllables`, `commitText`; 반환 `Promise<void>`)
- **정정 기록**: 이전 판은 "기존 spec 31개 무회귀(래퍼 호환)"라고 적었으나, `composeKorean`의 호출부는 실제로 **0곳**이다(정의부 + JSDoc 예시 3줄이 전부). 31은 `e2e/*.spec.ts` 파일 개수였다. 호출부가 없는 함수에 대한 "무회귀" 단언은 공허하게 통과하므로, 검증 가능한 두 항목(전체 스위트 green + 시그니처 보존)으로 대체했다

### AC-WS-050 커버리지 ↔ C-5
- 프로젝트 전체 커버리지 85% 목표 달성
- 각 커밋에서 80% 최소선 유지

### AC-WS-051 LSP 게이트 ↔ C-5
- run 단계: errors 0, type errors 0, lint errors 0
- sync 단계: errors 0, warnings ≤ 10

---

## §H Definition of Done

- [ ] §A–§F의 모든 AC가 PASS 증거와 함께 기록됨
- [ ] 조합 유지형 e2e 프리미티브가 존재하고 §C의 AC가 그 위에서 실행됨 (현행 원자적 `composeKorean`만으로는 PASS 처리 금지)
- [ ] AC-WS-024 수동 한글 스모크 기록 존재
- [ ] C-1이 지정한 범위에 대해 `[P]`/`[N]` 두 상태가 모두 실행됨
- [ ] §G 품질 게이트 전부 통과
- [ ] AC-WS-037로 `docs/DOCUMENT_MODE_PRINCIPLES.md` 미수정 확인
- [ ] plan.md의 미해결 clarification 마커 잔여 0건 확인

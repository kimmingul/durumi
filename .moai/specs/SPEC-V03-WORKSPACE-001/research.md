---
id: SPEC-V03-WORKSPACE-001
title: "코드베이스 조사 — v0.3 워크스페이스 골격 (SPEC-2~5 공용)"
version: "0.2.2"
status: in-progress
created: 2026-08-07
updated: 2026-08-07
author: manager-spec
priority: P0
phase: "v0.3.0 target"
module: "shared/, electron/, src/"
lifecycle: spec-anchored
tier: L
tags: "research, workspace, file-watching, ime, metadata, tsconfig"
---

# 코드베이스 조사 — SPEC-V03-WORKSPACE-001

> Tier L 산출물. 이 문서는 SPEC-1 저작 과정에서 **실제로 실행한 조사**의 결과를 모은 것이며, 새로 작성한 내용이 아니라 `plan.md` §A/§B와 감사 대응에서 확인된 사실을 한곳에 모은 것이다.
> **EPIC-V03-WORKSPACE의 SPEC-2~5도 이 문서를 전제로 설계한다** — 특히 §2(감시 인프라), §3(IME 계층), §6(프로세스 경계 제약)은 멀티패널 셸과 에이전트 어댑터 설계에 직접 구속력을 갖는다.

기준: v0.2.31 (`package.json:4`). 프로젝트 문서(`.moai/project/*`)는 v0.2.29 기준으로 정지해 있어 일부 수치가 낡았다 — 아래 값은 모두 이 조사에서 재실측한 것이다.

---

## 1. 조사 방법

각 항목은 실행한 명령과 관측된 출력으로 기록한다. 추론만으로 얻은 항목은 그렇게 표시한다.

---

## 2. 파일 감시 인프라 — 존재하지만 문서 조정에는 쓰이지 않는다

### 2.1 현황

| 사실 | 근거 |
|---|---|
| 감시는 **워크스페이스 루트 트리 단위**로만 존재 | `electron/fs.ts:110-163` `watchRoot(rootPath, onChange)` |
| IPC 노출: `fs:watchRoot` / `fs:unwatchRoot` / `fs:unwatchAllRoots` | `electron/ipc/files.ts:151-158` |
| 이벤트는 `fs:change` push 채널로 브로드캐스트 | `electron/ipc/files.ts:154` |
| 계약 선언 | `shared/ipc-contract.ts:374` `onFsChange: (cb: (changedPath: string) => void) => () => void` |
| **소비자는 단 하나** — 폴더 트리 캐시 무효화 | `src/hooks/useFolderTree.ts:75-98` |

즉 **열린 문서를 디스크와 조정하는 경로는 존재하지 않는다.** 이것이 SPEC-1 §B.2가 채우는 공백이다.

### 2.2 플랫폼 분기

```
process.platform === 'linux'  → 5초 setInterval 폴링 (fs.ts:125-150)
그 외 (macOS / Windows)        → fs.watch(root, { recursive: true }) (fs.ts:151-161)
```

macOS와 Windows는 **같은 분기**를 공유한다. 따라서 SPEC-1이 다루는 두 플랫폼 차이는 분기 선택의 문제가 아니라 **같은 API의 semantics 차이**다 — macOS는 FSEvents 기반이라 이벤트가 병합되고, Windows는 `ReadDirectoryChangesW` 기반이라 rename이 old/new로 갈라지며 중복 발행이 잦다.

### 2.3 확인된 결함 — debounce가 루트당 스칼라

```
let pendingPath = rootPath;                                    // fs.ts:152
entry.watcher = fs.watch(rootPath, { recursive: true }, (_event, filename) => {
  pendingPath = filename ? pathLib.join(rootPath, String(filename)) : rootPath;
  if (entry.pendingTimer) clearTimeout(entry.pendingTimer);    // fs.ts:155
  entry.pendingTimer = setTimeout(() => { ... onChange(pendingPath); }, 200);
});
```

`pendingPath`와 `pendingTimer` 모두 **루트당 하나**다. 200ms 창 안에 두 파일이 바뀌면 뒤엣것이 앞엣것을 덮어써 한 이벤트가 소실된다.

지금까지 드러나지 않은 이유: 유일한 소비자 `useFolderTree`가 어떤 경로를 받든 루트를 재열거하기 때문이다. **에이전트가 여러 파일을 연달아 쓰는 v0.4 흐름에서는 정상 동작이 곧 데이터 손실 경로가 된다.**

### 2.4 Linux 폴링 분기의 경로 방출

폴링 분기는 변경 감지 시 `onChange(rootPath)`를 호출한다(`fs.ts:146`) — **파일 경로가 아니라 루트 경로**다. 스냅샷(`pollSnapshot`)은 이미 `Map<경로, mtimeMs>`이므로 경로 단위 방출로 승격할 재료는 갖고 있다. Linux는 출하 대상이 아니지만(C-6), 이 분기를 그대로 두면 경로별 계약을 만족하지 않는 코드 경로가 남는다.

### 2.5 원자적 쓰기 — 감시 이벤트가 반드시 발생

`electron/fs.ts::writeFileAtomic`과 `bibliographyWrite.ts`는 같은 디렉터리에 임시 파일을 쓴 뒤 `fs.rename`으로 교체한다. 따라서 **앱 자신의 저장도 항상 감시 이벤트를 만든다** — 자기 저장 에코 억제가 선택이 아니라 필수인 이유다.

---

## 3. IME 계층 — 자동화 커버리지가 0이다

### 3.1 `composeKorean` 헬퍼는 한 번도 호출된 적이 없다

```
$ grep -rn 'composeKorean' e2e/ tests/
e2e/_helpers.ts:236: *   await composeKorean(page, ['ㅎ', '하', '한'], '한');   ← JSDoc
e2e/_helpers.ts:238: *   await composeKorean(page, ['ㅎ', '하', '학'], '학');   ← JSDoc
e2e/_helpers.ts:239: *   await composeKorean(page, ['ㄱ', '교'], '교');        ← JSDoc
e2e/_helpers.ts:241:export async function composeKorean(                       ← 정의
```

호출부 0곳. `imeSetComposition`도 `_helpers.ts` 안에서만 등장한다. `e2e/ime-composition.spec.ts`는 `launchClean` / `setMarkdownMode` / `setTyporaMode` / `setWysiwygMode` / `shutdownClean`만 import한다.

`docs/DOCUMENT_MODE_PRINCIPLES.md:54`는 "v0.2.29~ CDP `Input.imeSetComposition` 기반 e2e **의무**"라고 적고 있으나, **그 계층은 실제로 비어 있다.** 헬퍼는 작성되었고 호출되지 않았다.

`e2e/*.spec.ts` 파일 개수는 31개이며, 이 숫자가 "31개 spec이 `composeKorean`에 의존한다"는 잘못된 진술의 출처였다.

### 3.2 헬퍼는 구조적으로 조합을 유지할 수 없다

`e2e/_helpers.ts:241-281`:
- CDP 세션 open → `Input.imeSetComposition`(최종 텍스트) 1회 → 빈 텍스트로 종료 → `finally { session.detach() }`
- `void syllables;` — 중간 음절 인자는 받아서 **버린다**
- 주석이 이유를 밝힌다: CDP의 교체 semantics가 실제 macOS 한글 IME의 `compositionupdate`와 1:1이 아니라 다단계 합성을 충실히 재현하지 못하므로, 결정성을 위해 1회 합성 + 커밋으로 단순화했다

**함의**: 조합을 열어둔 채 외부 파일 쓰기를 끼워 넣을 경계가 없다. "조합 중 리로드" 시나리오는 이 헬퍼로 재현 불가능하며, 그 위에 세운 AC는 조합 중 버퍼를 교체하는 구현도 통과시킨다.

### 3.3 조합 관찰 코드는 표 셀 전용 하나뿐

```
$ grep -rlw "IME" src electron shared | wc -l        → 12
$ grep -rn "compositionstart|compositionend|isComposing|composing" src electron shared
  (주석 라인 제외 시) → src/editor/decorations/table.ts 만
```

- **실행 코드 선례 1개**: `src/editor/decorations/table.ts:810-926`. `contentEditable` 셀에 `compositionstart`/`compositionend` 리스너를 달아 `dataset.composing` 플래그를 유지하고, 키 처리에서 `ev.isComposing`과 함께 확인한다.
- **범용 조합 플래그는 없다.** `dataset.composing`은 표 셀 DOM 요소에만 붙으므로 에디터 일반 표면의 조합 상태를 알 수단이 아니다.
- `src/editor/keymap/pendingInlineFormat.ts`는 `IME` 언급 12개 파일에 포함되지만 composition API를 호출하지 **않는다** — `:12-32`는 전부 블록 주석이다.

### 3.4 `pendingInlineFormat.ts`의 주석 — 이 SPEC의 위험을 실증하는 기록

> "…rewriting the doc during composition (even on the first event) confuses the IME's composing-range tracking." (`:23-25`)
> "This trades Word-like type-ahead UX for guaranteed IME safety." (`:32`)

**조합 중 문서를 바꾸면 한글 IME가 깨진다**는 것이 이 저장소에서 이미 실증되었고, 그 대가로 기능 하나를 포기했다. 외부 변경 조정은 정의상 같은 일을 시도한다. 이것이 REQ-WS-020~023과 REQ-WS-049의 근거다.

### 3.5 문서 파일명 드리프트

`docs/DOCUMENT_MODE_PRINCIPLES.md:55`와 `CONTRIBUTING.md:209`는 `e2e/toolbar-ime-composition.spec.ts`를 참조하지만 실제 파일명은 `e2e/ime-composition.spec.ts`다. `structure.md` §11도 같은 드리프트를 기록하고 있다.

---

## 4. 메타데이터 — 출하 중인 front matter 키

### 4.1 파서

`shared/frontMatter.ts` + `shared/frontMatterFenced.ts`:

| export | 성격 |
|---|---|
| `parseFrontMatter(source)` | `{data, body, raw, endOffset, error}` 반환. `js-yaml` `JSON_SCHEMA` |
| `frontMatterString(fm, key)` (`:59-66`) | 문자열 타입 필드 **읽기** 전용 조회 |
| `frontMatterRange(fm)` (`:72-77`) | `{from: 0, to: fm.endOffset}` — **블록 전체** 범위 |
| `parseFrontMatterFenced` 재export | 경계만 필요할 때(js-yaml 회피) |

**쓰기·갱신 함수는 존재하지 않는다.** 이 모듈은 범위 기반 접근의 *선례*이지 range-splice 구현이 아니다. 그리고 `frontMatterRange`의 입도는 블록 전체이므로, 매니페스트 안의 개별 키를 보존하며 갱신하려면 **키 단위 범위 계산을 새로 만들어야 한다**.

파서는 의도적으로 관대하다 — 종료되지 않은 여는 블록은 "front matter 없음"으로 처리해 타이핑 중 사용자 입력이 사라지지 않게 한다(`:28-30` 주석).

### 4.2 템플릿이 이미 발행하는 키

`shared/manuscriptTemplates.ts`:

| 위치 | 출하 문자열 |
|---|---|
| `:22` | `['---', 'title: ', 'author: ', 'date: ', 'journal: ', ...extra, '---', '', '[toc]', '', '']` |
| `:70` (CONSORT) | `'registration: ClinicalTrials.gov NCT'` |
| `:168` (PRISMA) | `'registration: PROSPERO CRD'` |

### 4.2a `author: ` 는 빈 문자열이 아니라 `null`로 파싱된다 (M1 후속 실측)

```
$ node -e "const y=require('js-yaml'); ..."   # schema: JSON_SCHEMA
"author: "          -> null           object
"author:"           -> null           object
"author:   "        -> null           object
"author: \"\""      -> ""             string
"author: []"        -> []             object
"author: Kim"       -> "Kim"          string
"author: [Kim, Lee]"-> ["Kim","Lee"]  object
```

모든 경우에 `hasOwnProperty('author')`는 `true`다. 따라서 **키 존재 여부로는 "값이 있는가"를 판정할 수 없다** — 출하 템플릿의 원고도 키는 항상 가지고 있다.

이 사실이 SPEC-1의 메타데이터 계층 규칙 전체를 규정한다(REQ-WS-042 / 054). 미기입 판정을 빈 문자열로만 구현하면 출하 템플릿의 실제 형태(`null`)가 걸러지지 않는다. SPEC-2~5도 front matter 값을 읽을 때 이 구분을 전제해야 한다.

세 가지 함의:

1. **`author`는 단수형**이고 빈 값(`null`)으로 출하된다. 키를 `authors`로 바꾸면 출하 템플릿과 어긋난다.
2. **`registration:`은 NCT 전용이 아니다.** PRISMA는 PROSPERO CRD를 쓴다. 무조건 NCT 검증을 걸면 체계적 문헌고찰 원고가 전부 경고를 받는다.
3. **출하 값은 식별자가 빈 placeholder다.** `ClinicalTrials.gov NCT` / `PROSPERO CRD`를 형식 위반으로 처리하면 템플릿에서 새 원고를 만들 때마다 경고가 뜬다.

### 4.3 기존 코드에 저자·등록번호 처리는 없다

`NCT` / `clinicaltrials` 문자열이 코드베이스에 없고, `manuscriptTemplates.ts`에도 저자 구조가 없다. 메타데이터 모델은 순수 신규다.

### 4.4 서지 관례 (변경 대상 아님)

| 사실 | 근거 |
|---|---|
| 탐색 후보 순서 | `['references.bib', 'references.bibtex', 'bibliography.bib']` — `electron/bibliography.ts:4`, `bibliographyWrite.ts:21` |
| walk-up 상한 32단계 | `electron/bibliography.ts:23-40` |
| 미발견 시 문서 옆에 `references.bib` 생성 | `bibliographyWrite.ts:65` |
| 참고문헌 폴더 상수 | `electron/referenceFs.ts:18` `REFERENCE_DIR_NAME = 'reference'` (**단수형**) |
| 파일 경로는 `.bib` 상대 (`reference/<key>.<ext>`) | `referenceFs.ts:27` |

---

## 5. 신뢰 경계 (pathGuard)

4-tier 모델 (`electron/pathGuard.ts`, 215줄):

| Tier | 내용 |
|---|---|
| 1 | 다이얼로그가 반환한 경로 (세션 allowlist) |
| 2 | 신뢰된 파일의 **부모 디렉터리 트리** — `allowSessionPath()`가 자동 등록 |
| 3 | `prefs.workspaceFolders` |
| 4 | `prefs.recentFiles` / `recentFolders` |

핵심 방어: `assertPrefsPatchAllowed()` (`:183-215`)가 손상된 렌더러의 `prefs:set`을 통한 자가 신뢰 확장을 막는다 — 패치의 새 항목이 이번 세션에 실제로 다이얼로그를 거쳤는지 확인한다.

**함의**: 매니페스트 발견을 근거로 프로젝트 루트를 자동 Tier 3에 넣는 설계는 이 방어가 막고 있는 공격 형태를 우회 가능하게 만든다(렌더러가 매니페스트를 심으면 신뢰가 넓어짐). SPEC-1은 기존 Tier 2 자동 편입에만 의존한다.

심볼릭 링크는 의도적으로 해석하지 않는다(`pathGuard.ts:55-60`) — 문서화된 수용 위험.

---

## 6. 프로세스 경계와 tsconfig 제약

### 6.1 3-프로세스 + shared 커널

import 그래프 스캔으로 검증된 사실(`codemaps/overview.md`): `src/`→`electron/` 0건, `shared/`→node/electron 0건, `electron/`→`src/` 0건.

### 6.2 `shared/`는 `electron/`을 import할 수 없다 — tsconfig가 강제

```
tsconfig.web.json:17   "composite": true
tsconfig.web.json:21   "include": ["src/**/*.ts", "src/**/*.tsx", "shared/**/*.ts"]

tsconfig.test.json:23  "types": ["node"]
tsconfig.test.json:27  "include": ["tests/**/*.ts", "tests/**/*.tsx", "e2e/**/*.ts"]
tsconfig.test.json:3-5 // Not composite: (주석이 이유를 기록)
```

`shared/`의 파일이 `electron/referenceFs.ts`를 import하면 그 모듈이 web 프로젝트 밖이라 **TS6307**로 실패한다(더불어 그 모듈이 끌어오는 `node:fs`/`node:path`의 타입도 web 프로젝트에 없다).

**해결 경로**: `tsconfig.test.json`은 composite가 아니고 node 타입을 가지며 `tests/`+`e2e/`를 포함하므로 **양쪽 트리를 모두 import할 수 있다**. `tests/electron/` 아래 기존 테스트들이 이미 그렇게 한다. 따라서 두 트리에 걸친 상수 동일성 단언은 테스트 계층에 두면 성립한다.

### 6.3 typecheck는 반드시 두 명령

```
tsc --build && tsc --noEmit -p tsconfig.test.json
```

루트 `tsconfig.json`은 `files: []` + `references`만 갖는 컨테이너라 단독 `tsc --noEmit`은 **아무것도 검사하지 않는다**. 이 함정이 v0.2.16 회귀를 숨겼다(`tsconfig.json:2-9` 주석, `tech.md` §4).

### 6.4 IPC 계약

`shared/ipc-contract.ts`(810줄)가 SSOT. invoke 채널 66개(`ipcMain.handle` 실측)와 push 채널 약 8개. **모든 구독형 API가 구독 해제 클로저를 반환**하는 것이 일관된 계약이다(`electron/preload.ts:32-36` 패턴).

---

## 7. 품질 게이트 현황

| 게이트 | 상태 |
|---|---|
| CI (`ci.yml`) | ubuntu + windows matrix, `typecheck` → `lint` → `test` |
| e2e (`e2e.yml`) | **macOS 전용**. Windows/Linux e2e 없음 |
| 수동 한글 IME 스모크 | 릴리스 사인오프 게이트, 자동화 대체 불가 |
| 테스트 파일 수 | `tests/` 180개, `e2e/` 31개 spec (실측; `structure.md`의 169는 낡음) |
| 개발 방법론 | TDD, 커버리지 목표 85%, 커밋당 최소 80% (`quality.yaml`) |

### 7.1 macOS 서명 시크릿 — 전제 충족 확인

`tech.md` §13.2(로컬 e2e 실행 불가)의 해소는 §13.3의 Developer ID 서명 전환에 의존하고, 그것은 저장소 시크릿 5종을 요구한다. `gh secret list` (exit 0):

```
APPLE_APP_SPECIFIC_PASSWORD	2026-07-31T11:34:54Z
APPLE_ID	2026-07-31T11:27:43Z
APPLE_TEAM_ID	2026-07-31T11:27:42Z
MAC_CSC_KEY_PASSWORD	2026-07-31T11:48:49Z
MAC_CSC_LINK	2026-07-31T11:48:48Z
```

5종 모두 존재 → CI 측 전제 충족. **Windows NSIS는 여전히 미서명·미해결**이다.

---

## 8. SPEC-2~5가 이 조사에서 가져가야 할 것

| SPEC | 구속되는 사실 |
|---|---|
| SPEC-2 (멀티패널) | §4.2 — 메타데이터 정본이 front matter이므로 메타데이터 표면은 **활성 원고 패널 종속**이어야 한다. §6.1 — 패널 상태는 `src/`에만. §3.3 — 패널마다 조합 상태 관찰이 필요하며 범용 플래그가 없다 |
| SPEC-3 (에이전트) | §5 — 에이전트 실행 경로의 신뢰 확장은 `assertPrefsPatchAllowed`가 막는 형태를 우회하지 않아야 한다. §2.3 — 에이전트가 연달아 쓰는 파일이 경로별 debounce 없이는 소실된다. §6.1 — `child_process`는 main 전용 |
| SPEC-4 (Diff 승인) | §2.5 — 승인 후 적용도 원자적 쓰기를 거치므로 자기 에코 억제가 필요하다. SPEC-1의 조정 정책 seam을 확장 대상으로 삼는다 |
| SPEC-5 (샌드박스) | §6.1 — 실행은 main. §2.2 — 산출물이 쏟아지는 `figures/` 감시 부하를 SPEC-1의 debounce 위에서 재평가해야 한다 |

---

## 9. 참조

- `spec.md` / `plan.md` / `design.md` / `acceptance.md` — 동일 SPEC 디렉터리
- `EPIC-V03-WORKSPACE.md` — Epic 개요
- `.moai/project/{structure,tech}.md` — v0.2.29 기준(일부 수치 낡음)

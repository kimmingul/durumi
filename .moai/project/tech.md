# Durumi — 기술 스택 (tech.md)

Electron 데스크톱 앱의 런타임, 의존성, 빌드/테스트/배포 파이프라인을 다룬다. 아키텍처적 맥락은 [structure.md](structure.md), 제품 관점은 [product.md](product.md)를 참고하라.

## 1. 런타임·언어·패키지 매니저

| 항목 | 값 | 근거 |
|---|---|---|
| 런타임 | Electron ^31.2.1 (Node 20.18 내장) | `package.json:79`, `electron.vite.config.ts:13` |
| 최소 Node | `>=20` | `package.json:91-93` |
| 언어 | TypeScript ^5.5.3, strict + `noUncheckedIndexedAccess` + `noFallthroughCasesInSwitch` + `isolatedModules` | `package.json:87`, `tsconfig.node.json`/`tsconfig.web.json` |
| 패키지 매니저 | pnpm 9 | `.github/workflows/ci.yml:17-20` |
| UI 프레임워크 | React ^18.3.1 | `package.json:60-61` |
| 상태관리 | zustand ^4.5.4 | `package.json:64` |
| 모듈 시스템 | ESM (`"type": "module"`), main/preload는 빌드 시 CJS로 강제 변환 | `package.json:17`, `electron.vite.config.ts:11-14` |

## 2. 목적별 의존성 그룹

| 그룹 | 패키지 | 선택 근거 |
|---|---|---|
| 에디터 코어 | `@codemirror/{state,view,commands,language,language-data,lang-markdown,search,autocomplete}` | CodeMirror 6은 확장 기반 아키텍처로 Durumi의 6단계 확장 계층(structure.md §6)을 지원. `language-data`는 코드블록 문법 하이라이팅을 지연 로드 |
| 마크다운 파싱 | `@lezer/{common,highlight,markdown}` | CodeMirror 6의 네이티브 파서 프레임워크. Durumi 고유 문법(인용, 메모, CriticMarkup 등)을 `src/editor/markdownExt/`의 Lezer 확장으로 직접 구현하는 기반 |
| 내보내기 파이프라인 | `markdown-it ^14.1.0` + `markdown-it-{attrs,footnote,github-alerts,mark,sub,sup,task-lists}`, `turndown ^7.2.4`, `@mixmark-io/domino`, `node-emoji`, `js-yaml` | 편집기 파서(Lezer)와 별개의 HTML 렌더 파이프라인. `turndown`은 참고문헌 다운로드 시 HTML→Markdown 변환(HTML 스크랩 폴백 경로)에 쓰인다 |
| 렌더링 | `katex ^0.16.45`(수식), `mermaid ^11.14.0`(다이어그램, 지연 로드 — "~700KB minified", `src/editor/mermaid/renderer.ts:3` 주석) | 두 라이브러리 모두 사실상 업계 표준. `mermaid`는 `securityLevel: 'strict'`로 인라인 SVG 렌더 |
| PDF | `pdfjs-dist ^5.7.284` (지연 로드 — "~2MB", `electron/pdfText.ts:11` 주석) | 로컬 PDF에서 DOI 추출(참고문헌 가져오기), PDF 텍스트 추출(AI 인용 제안 컨텍스트 보강)에 사용. HTML→PDF 자체 내보내기는 별도로 Electron 내장 `printToPDF`를 씀(서드파티 불필요) |
| 플랫폼 | `electron-updater ^6.8.3`, `simple-git ^3.36.0` | 자동 업데이트, git 상태 조회 |
| 빌드 | `electron-vite ^2.3.0`, `vite ^5.3.4`, `@vitejs/plugin-react`, `electron-builder ^24.13.3` | main/preload/renderer 3중 Rollup 빌드 + 패키징 |
| 테스트 | `vitest ^2.0.3`, `jsdom ^24.1.0`, `@playwright/test ^1.45.1` | 유닛(jsdom) + 실제 Electron 앱 구동 e2e |
| 린트 | `eslint ^8.57.0`, `@typescript-eslint/* ^7.16.1`, `prettier ^3.3.3` | 표준 TS/React 린트+포맷 |

## 3. 서드파티 없이 직접 구현한 영역

Durumi는 의도적으로 **서지 관리 라이브러리와 AI SDK를 쓰지 않는다**. 직접 구현한 영역과 그 함의:

- **BibTeX/RIS 파싱·포맷** — `shared/bibtex.ts`, `bibtexWriter.ts`, `ris.ts`, `citation.ts`(Vancouver 포맷터), `citationKey.ts`, `citationMerge.ts`. 서드파티 서지 라이브러리(예: `bibtex-parser`류)를 쓰지 않아 번들 크기를 억제하고, Durumi 고유 요구(예: 스마트 인용 병합 `[@a; @b]`, DOI 정규화 중복제거)에 정확히 맞춘 동작을 얻지만, BibTeX/RIS 스펙의 엣지케이스 커버리지는 전적으로 자체 테스트(`tests/shared/`)에 의존한다.
- **AI 클라이언트** — `electron/aiClient.ts`가 Anthropic Messages API와 OpenAI 호환 chat completions(OpenAI, Ollama, LM Studio, 커스텀 base URL) 두 프로토콜을 공식 SDK 없이 직접 HTTP로 구현한다. SDK 의존성 없이 두 프로바이더 형태를 하나의 추상화로 다룰 수 있지만, API 스펙 변경 시 자체적으로 추적해야 한다.
- **i18n** — 별도 i18n 프레임워크(i18next 등) 없이 `src/i18n/dict.ts`(1,093줄) + `t.ts`의 자체 사전 조회 방식. `shared/menuLabels.ts`가 네이티브 메뉴(main)와 렌더러(renderer) 양쪽의 메뉴 라벨 드리프트를 종식시키기 위한 단일 소스다.

## 4. tsconfig 프로젝트 레퍼런스 구조

```
tsconfig.json          files: [], references만 존재  ← 컨테이너, 단독으로는 아무것도 체크 안 함
├── tsconfig.node.json   composite: true, include: electron/**, shared/**, types: [node]
└── tsconfig.web.json    composite: true, include: src/**, shared/**, lib: DOM, jsx: react-jsx
tsconfig.test.json      composite 아님, include: tests/**, e2e/**  ← 별도 실행
```

루트 `tsconfig.json`은 `files: []`이고 `include`가 없다 — `references`만으로 구성된 컨테이너다. `tsconfig.json:2-9`의 주석이 그 이유를 직접 기록한다: 이 설정을 대상으로 맨 `tsc --noEmit`을 돌리면 **아무것도 체크하지 않는다**(`files`/`include`가 비어있으므로). 이 함정이 v0.2.16의 `aiHasKey` 회귀를 숨겼던 실제 원인이었다.

`tsconfig.test.json`은 의도적으로 `composite`가 아니다 — composite 프로젝트 경계는 임포트되는 모든 파일을 명시적으로 열거해야 하는데, `src/`/`electron/`/`shared/`를 넘나드는 테스트 파일에는 이것이 비현실적이기 때문이다(`tsconfig.test.json:2-7`). composite가 아니므로 TS는 이 설정 아래에서 임포트되는 모든 파일을 전이적으로 타입체크한다 — 즉 테스트가 임포트하는 renderer/main 버그도 함께 잡힌다.

이 때문에 `pnpm typecheck`는 **반드시 두 명령 모두**여야 한다:

```bash
tsc --build && tsc --noEmit -p tsconfig.test.json
```

`tsc --build`가 두 composite 프로젝트(node/web)를 순회하고, 별도의 `tsc --noEmit -p tsconfig.test.json`이 test 리프 프로젝트를 검사한다. 한쪽만 돌리면 잠재적 회귀를 놓친다는 것이 v0.2.16 사고가 남긴 교훈이다.

## 5. 빌드 파이프라인

`electron-vite build`가 독립된 3개의 Rollup 빌드를 만든다:

| 산출물 | 경로 | 포맷 |
|---|---|---|
| main | `out/main/main.cjs` | CJS |
| preload | `out/preload/preload.cjs` | CJS |
| renderer | `out/renderer/` | ESM(Vite 기본) |

main/preload가 CJS로 강제되는 이유는 `electron.vite.config.ts:11-14`의 주석에 명시되어 있다: Electron 31의 Node 20.18 런타임에서 `electron` 모듈 자체가 CJS이므로, ESM main 번들이 `import { app } from "electron"`에서 실패한다. 세 빌드 모두 `@shared` alias를 `<repo-root>/shared`로 해석한다(`electron.vite.config.ts:17,27,35`).

## 6. 패키징

`electron-builder.yml` 대상:

| 플랫폼 | 타깃 | 서명 상태 |
|---|---|---|
| macOS | DMG, `[x64, arm64]` | ad-hoc 서명 (`identity: null`, `hardenedRuntime: false`) — Gatekeeper 경고 우회 필요 |
| Windows | NSIS x64, non-oneClick | 미서명 (`verifyUpdateCodeSignature: false`) — SmartScreen 경고 발생 |

배포 provider는 GitHub(`kimmingul/durumi`, channel `latest`)이며 `electron-updater`가 이를 소비한다. **실제 서명을 활성화하는 경로는 이미 문서화되어 있다** — `electron-builder.yml`에 macOS(Apple Developer ID + 공증)와 Windows(EV 인증서) 실서명용 설정 블록이 활성화 절차 주석과 함께 주석 처리되어 있고, `.github/workflows/release.yml`에도 대응하는 시크릿 참조 블록이 미러링되어 있다. 즉 "언젠가 서명을 켠다"가 코드 없는 계획이 아니라, 주석 해제만 하면 되는 준비된 경로다.

## 7. 개발 환경 요구사항

- Node ≥ 20 (`package.json:92`)
- pnpm 9 (`.github/workflows/ci.yml:20`)
- 선택적 외부 도구: **pandoc** — DOCX/LaTeX 내보내기에 필요. `electron/pandoc.ts`(310줄)가 PATH와 알려진 설치 경로를 자동 탐지하고, macOS에서는 미설치 시 Homebrew 원클릭 설치를 진행률 스트리밍과 함께 제공한다(push 채널 `onPandocInstallProgress`). pandoc이 없어도 HTML/PDF 내보내기는 정상 동작한다.

## 8. 테스트 도구체인

- **Vitest** — `vitest.config.ts`: `environment: jsdom`, `globals: false`(테스트 파일에서 `describe`/`it`을 명시적으로 import해야 함), `setupFiles: tests/setup.ts`가 `ResizeObserver`와 `Range.getBoundingClientRect` 폴리필을 주입하고 `IS_REACT_ACT_ENVIRONMENT`를 설정한다.
- **Playwright** — `playwright.config.ts`: `fullyParallel: false`, `workers: 1`. 각 e2e spec이 `launchClean()`으로 실제 Electron 앱을 임시 `--user-data-dir`와 함께 새로 띄우므로(`e2e/_helpers.ts`), 병렬 실행은 프로세스 자원 경합과 상태 오염 위험이 있어 의도적으로 직렬화되어 있다.
- **CDP IME 하네스** — `e2e/_helpers.ts:241-281`의 `composeKorean(page, syllables, commitText)`이 Chrome DevTools Protocol의 `Input.imeSetComposition`을 사용해 실제 한글 조합 이벤트를 합성한다. 각 음절을 조합 상태로 보낸 뒤, 빈 텍스트의 조합으로 마무리한다(`Input.insertText`를 쓰지 않는 이유: 그것은 새 텍스트로 즉시 커밋되어 `compositionstart`/`compositionupdate`/`compositionend` 흐름 자체를 우회하기 때문). CDP가 IME를 지원하지 않는 미래 Electron 빌드에 대비한 graceful skip이 포함되어 있다.

## 9. CI/CD — 3개 워크플로

| 워크플로 | 트리거 | 러너 | 단계 |
|---|---|---|---|
| `ci.yml` | push/PR to `main` | `ubuntu-latest` | checkout → pnpm 9 셋업 → Node 20(캐시) → `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm lint` → `pnpm test` |
| `e2e.yml` | push/PR to `main` | **`macos-latest` 전용** | checkout → pnpm/Node 셋업 → `playwright install chromium` → `pnpm build` → `pnpm test:e2e` → 실패 시 `playwright-report/` + `test-results/` 업로드(14일 보관) |
| `release.yml` | 태그 `v*.*.*` push | macOS + Windows 병렬 | `electron-builder --publish always`로 DMG/NSIS를 GitHub Releases에 draft 게시 |

**커버리지 한계**: e2e는 macOS 전용으로만 실행되며 Windows/Linux는 CI에서 검증되지 않는다. `electron/pandoc.ts`에는 Windows 경로가 하드코딩되어 있지만 실행 검증은 존재하지 않는다(인터뷰 확정 제약사항).

## 10. 릴리스 절차

`scripts/release.sh`(62줄) — `pnpm run release:tag`로 실행:

1. 작업 트리가 dirty하면 즉시 거부(`git diff --quiet` 체크)
2. `pnpm version --no-git-tag-version <patch|minor|major>`로 `package.json` 버전만 bump
3. `chore: release vX.Y.Z` 커밋 생성
4. annotated 태그(`vX.Y.Z`) 생성
5. **push는 하지 않는다** — 스크립트가 두 개의 `git push` 명령을 출력만 하고, 실행 여부는 호출자가 결정한다

태그 push가 `.github/workflows/release.yml`을 트리거해 macOS + Windows 빌드를 병렬로 실행하고 draft 릴리스로 게시한다. 게시 후 노트 작성과 publish는 수동이다.

## 11. 외부 연동 시스템

인터뷰 확정 목록을 그대로 반영한다. **데이터베이스는 없다** — 설정과 서지 데이터는 파일(JSON, `.bib`)로 관리된다.

| 카테고리 | 시스템 | 용도 |
|---|---|---|
| 서지 API | Crossref, PubMed, KoreaMed, ORCID, Unpaywall, DOI resolver | 서지 검색, DOI→BibTeX, 저자 검증, 참고문헌 다운로드(`electron/bibliographyFetch.ts`, `referenceDownload.ts`) |
| LLM 엔드포인트 | Anthropic Messages API, OpenAI 호환 chat completions(Ollama, LM Studio 포함) | 선택 영역 재작성, 인용 제안, 고스트텍스트(`electron/aiClient.ts`) |
| 배포/도구 | GitHub Releases(`electron-updater` 경유), Homebrew(pandoc 설치) | 자동 업데이트, 선택적 도구 설치 |
| 로컬 | git(`simple-git`) | 워크스페이스 파일 변경 상태 표시 |

## 12. 보안 관련 기술 결정

- **Electron 프로세스 격리** — `sandbox: true` + `contextIsolation: true` + `nodeIntegration: false`(`electron/main.ts:56-66`). preload는 `contextBridge`만 사용.
- **`safeStorage`와 정직한 평문 폴백** — `electron/aiKeys.ts`가 API 키를 Electron `safeStorage`(OS 키체인 경유)로 암호화 저장한다. OS 키체인이 없는 환경(주로 헤드리스 Linux)에서는 `plain:` 접두사를 붙여 저장하고, UI에 `plaintext` 상태를 정직하게 보고해 사용자가 경고를 인지하도록 한다(`AiKeyStatus` 타입: `none | encrypted | plaintext`, `shared/ipc-contract.ts`).
- **원자적 쓰기** — `electron/fs.ts`와 `bibliographyWrite.ts`는 같은 디렉터리에 임시 파일을 쓴 뒤 `fs.rename`으로 교체한다. 쓰기 도중 크래시가 나도 원본 파일이 손상되지 않는다.
- **외부 URL / 경로 신뢰 게이트** — `pathGuard.ts`의 4-tier 모델(구조 상세는 `structure.md` §4)이 렌더러가 임의 경로를 요청하는 것을 막는다.
- **네트워크 격리** — 모든 외부 HTTP는 main 프로세스에서만 발생(`structure.md` §2). 렌더러의 유일한 예외는 로컬 asset을 base64로 인라인하는 `fetch()` 1건(`src/export/inlineImages.ts:82`)이다.

## 13. 알려진 결함 (드리프트·운영 공백)

문서화된 사실을 숨기지 않는다 — 코드 자체에 남아 있는 알려진 결함이다.

- **Windows는 빌드·배포되지만 검증되지 않는다** — `release.yml`이 `windows-latest`에서 NSIS 인스톨러를 게시하지만(§9), CI 어느 잡도 Windows에서 테스트를 실행하지 않고, `process.platform === 'win32'`를 모킹하는 유닛 테스트도 없다. `electron/pandoc.ts:13-14,56,66`과 `electron/pdf.ts:26-28`의 Windows 전용 코드 경로는 실행 검증 없이 존재한다(인터뷰 확정 제약 4).
- **`prefs:set` 값 도메인 미검증 / 렌더러 에러 경계 부재 / 로깅 서브시스템 부재** — 세부는 `structure.md` §10(모듈 경계 이슈)을 참고. 로깅은 파일 sink·레벨 구분 없는 ad-hoc `console.*` 호출 18건뿐이며, `src/i18n/dict.ts:39`가 사용자에게 약속하는 "see logs"에 대응하는 접근 가능한 로그가 실제로는 없다.

`dist-build/`(빌드 산출물)는 `.gitignore:257`에 정상적으로 등록되어 있으며 추적되지 않는다 — 결함이 아니라 정상적인 로컬 빌드 아티팩트다.

### 13.1 해소된 결함

- **아웃바운드 User-Agent 버전 3중 불일치** (해소: `b19a016`) — `bibliographyFetch.ts`/`referenceDownload.ts`/`aiClient.ts`가 각각 `'0.1.6'`/`'0.1.7'`/`'0.1.8'`을 하드코딩해 Crossref·PubMed·ORCID에 실제와 다른 버전을 보내고 있었다. `electron/userAgent.ts`가 `package.json`의 `version`을 named import(tree-shake 가능)해 단일 원천이 되고, 5개 UA 조립 지점이 전부 이를 쓴다. 중복이던 `buildUserAgent()`는 삭제. 회귀 방지는 `tests/electron/userAgent.test.ts` 15케이스 — 실제 송출 헤더를 `fetchImpl`로 캡처하는 재현 테스트와 소스 수준 하드코딩 금지 가드를 함께 둔다.
- **`README.md` 버전 드리프트** (해소: `b19a016`) — `Current version`을 `v0.2.29`로, 빌드 예시 파일명을 `0.1.13` → `0.2.29`로, 테스트 수를 `1250`(v0.1.13) → `1734`, e2e를 `16` → `203`(31 spec)으로 실측 갱신.

### 13.2 e2e 게이트 로컬 실행 불가 (환경 제약)

일부 개발 환경에서 `pnpm test:e2e`가 코드와 무관하게 전량 실패한다 — 202 테스트가 `launchClean()` 픽스처에서 막히며, 증상은 `electron.launch: ... ENOENT`(바이너리 부재) 또는 `Process failed to launch!`다.

원인은 `node_modules`의 Electron 바이너리가 존재하지 않는 것이다. `electron/dist/`에 `LICENSE`와 `LICENSES.chromium.html`(9.5 MB)은 있으나 `Electron.app`이 없다. `pnpm rebuild electron`은 exit 0으로 완료되고 `Electron.app`도 일시적으로 생성되지만, 관측된 환경에서는 1분 내에 다시 제거되었다 — 대용량 바이너리 쓰기를 되돌리는 샌드박스/도구 계층이 있는 것으로 보인다.

**코드 결함이 아니다**: 동일 커밋(`a943d1e`)에서 CI의 `E2E (macOS)` 워크플로가 `macos-latest` + fresh install로 **success**했다. 게이트 2는 CI에서 유효하게 검증된다.

실질적 제약: 그런 환경에서는 에디터·원자성·IME 관련 변경의 **로컬 반복 검증이 불가능**하고 매번 CI를 기다려야 한다. 릴리스 게이트 3(수동 한글 IME 스모크, §8)은 실제 앱 실행이 필요하므로 별도의 정상 환경이 요구된다.

---

관련 문서: [product.md](product.md) — 제품 정체성과 기능, [structure.md](structure.md) — 아키텍처와 모듈 경계.

생성: `/moai project` · 기준 버전 v0.2.29 (HEAD `b3272fd`)

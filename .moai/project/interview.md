# Project Interview

프로젝트: Durumi (두루미) — 의학연구용 마크다운 에디터
수집 시점 기준 버전: v0.2.29 (HEAD `b3272fd`)
인터뷰 유형: 기존 프로젝트 (Existing Project) — Phase 3 코드베이스 분석 선행

## Stage A Round 1: Ownership, Purpose, and Goal

Question: 이 프로젝트의 현재 상태와 앞으로의 주 목표는 무엇입니까?
Answer: v0.3 진입 준비 중인 활성 제품

Domain: desktop-markdown-editor (의학연구 원고 저작) *(auto-populated from codebase analysis)*
Goal: v0.2가 사인오프로 닫힌 상태에서 v0.3 진입을 준비하는 활성 제품. 문서는 현재 권능과 함께 v0.3 방향(RenderedSpan 양방향 소스맵 계약 도입 등)을 로드맵으로 기록해야 한다.

근거 (Phase 3 분석):
- `package.json` v0.2.29, HEAD `b3272fd chore: release v0.2.29`
- `docs/v0.2-signoff.md` — Phase D 클로즈아웃 완료
- `docs/DOCUMENT_MODE_PRINCIPLES.md` §7 — `RenderedSpan` 계약을 v0.3.x 마일스톤으로 제안 (`src/editor/renderedSpan.ts` 미존재)

## Stage A Round 2: Constraints and Non-Goals

Question: 문서에 명시되어야 할 하드 제약·비목표를 모두 골라 주세요. (복수 선택)
Answer: 4개 항목 전부 선택

Constraints:
1. **Document Mode 6원칙** — `docs/DOCUMENT_MODE_PRINCIPLES.md` §0 우선순위(소스 무결성 → IME 안전 → 코드섬 주권 → 렌더 의도/소스 백드 → 명시적 스코프 → 경계 원자성). 모든 기능이 지켜야 할 최상위 불변식이며, 원칙을 양보하려면 해당 문서에 예외를 명시 등록해야 한다.
2. **수동 한글 IME 스모크 릴리스 게이트** — unit + CDP e2e가 모두 green이어도 macOS 실제 한글 입력 수동 스모크를 통과해야 릴리스한다. CDP `Input.imeSetComposition`은 OS 변환 계층(한자 변환 등)을 재현하지 못하므로 대체 불가.
3. **Electron 보안 경계 불변식** — `sandbox: true` / `contextIsolation: true` / `nodeIntegration: false` 유지, 렌더러에서 직접 네트워크·`file://` 접근 금지(외부 HTTP는 전부 메인 프로세스), `pathGuard` 4-tier 신뢰 모델과 `assertPrefsPatchAllowed` 우회 차단 유지.
4. **크로스플랫폼 검증 공백** — e2e가 macOS 전용이고 Windows/Linux는 CI 미검증. `electron/pandoc.ts`에 Windows 경로가 하드코딩되어 있으나 실행 검증은 없다. 이 한계를 문서에 명시한다.

## Stage A Round 3: Scope, Boundaries, and Documentation Priority

Question (문서 우선순위): 생성될 문서가 가장 정확하게 담아야 할 측면은 무엇입니까?
Answer: 아키텍처·모듈 경계

Question (스코프 경계): 이 프로젝트의 in-scope / out-of-scope 경계를 선택해 주세요.
Answer: 로컬 데스크톱 저작 전체

Documentation priority: 아키텍처·모듈 경계 — 3-프로세스 경계, IPC 계약(`shared/ipc-contract.ts`), 에디터 확장 계층(파서 → 모드 → 데코레이션 → 원자성 → 이스케이프), `pathGuard` 신뢰 모델을 `structure.md`의 중심으로 삼는다.

Scope:
- **In-scope**: 3-모드 에디터(Document/Live/Source), 서지·참고문헌 관리, 메모/CriticMarkup, 내보내기(HTML·PDF·pandoc), AI 보조, 매크로, i18n(en/ko)
- **Out-of-scope**: 웹/모바일 클라이언트, 실시간 협업, 클라우드 동기화 서버, 자체 백엔드

## Stage B Round 4: Verification, Surfaces, and Sharing

Verification: 3단계 게이트 전체
1. CI 자동 검증 — `pnpm typecheck` (= `tsc --build && tsc --noEmit -p tsconfig.test.json`, 양쪽 모두 필수) → `pnpm lint` → `pnpm test` (vitest, 169파일 / ~1,745 케이스)
2. macOS e2e — `pnpm test:e2e` (Playwright + 실제 Electron, 31 spec / ~176 test)
3. 릴리스 전 수동 macOS 한글 IME 스모크 (대체 불가 게이트)

UI surface: has-ui (Electron BrowserWindow 기반 데스크톱 GUI, React 18 + CodeMirror 6)

External systems:
- 서지 API — Crossref, PubMed, KoreaMed, ORCID, Unpaywall, DOI resolver
- LLM 엔드포인트 — Anthropic Messages API, OpenAI 호환 chat completions (Ollama·LM Studio 포함)
- 배포/도구 — GitHub Releases (electron-updater), Homebrew (pandoc 설치)
- 로컬 — git (simple-git)
- **데이터베이스 없음** — 설정·서지는 파일(`.bib`, JSON)로 관리

Team sharing: solo — 단독 메인테이너가 개발하는 공개 OSS. 외부 기여 수용을 위해 CLA·CONTRIBUTING·PR 템플릿을 갖추고 있으나 상시 다인 협업 체제는 아니다.

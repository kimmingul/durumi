# Durumi (두루미) — 제품 개요

의학연구자를 위한 크로스플랫폼 마크다운 원고 저작 도구. 마크다운 소스를 진실의 원천으로 유지하면서 Word 같은 편집 경험을 제공하는 3-모드 에디터에, 서지 관리·인용·AI 보조·의학통계 매크로를 내장했다.

## 1. 기본 정보

| 항목 | 값 | 근거 |
|---|---|---|
| 프로젝트명 | Durumi (두루미) | `package.json:2` |
| 정의 | "a paper crane for medical research" — Typora 스타일 크로스플랫폼 마크다운 에디터 | `package.json:5` |
| 현재 버전 | v0.2.29 | `package.json:4`, HEAD `b3272fd chore: release v0.2.29` |
| 라이선스 | Apache-2.0 | `package.json:7`, `README.md:675-685` |
| 저장소 | github.com/kimmingul/durumi | `package.json:9-12` |
| 저자 | Min-Gul Kim | `package.json:6` |
| UI 표면 | Electron 데스크톱 GUI (macOS + Windows 11), React 18 + CodeMirror 6 | 인터뷰 `ui_surface` |
| 팀 구성 | 단독 메인테이너의 공개 오픈소스 — CLA/CONTRIBUTING/PR 템플릿을 갖춘 오픈코어 | `README.md:673-701`, `CONTRIBUTING.md`, 인터뷰 `team_sharing` |

**드리프트 참고**: `README.md:7`은 "Current version: v0.2.28"로 아직 갱신되지 않았다 — `package.json`의 0.2.29가 SSOT이며, 이 드리프트는 아래 `findings`에도 기록했다.

## 2. 문제와 대상 사용자

의학 논문·연구보고서를 작성하는 연구자는 (1) IMRaD/CONSORT/PRISMA 같은 보고 가이드라인 형식을 지켜야 하고, (2) Crossref/PubMed 같은 서지 데이터베이스를 오가며 인용을 관리해야 하며, (3) 최종적으로 저널 제출용 Word/PDF/LaTeX 산출물을 내보내야 한다. 범용 마크다운 에디터는 서지·통계 표기 워크플로를 지원하지 않고, Word는 버전관리·플레인텍스트 diff에 약하다.

Durumi는 이 간극을 겨냥한다는 근거가 코드에 직접 남아 있다:
- `shared/manuscriptTemplates.ts`(457줄)의 IMRaD/CONSORT/PRISMA/CARE/STROBE 보고 가이드라인 스켈레톤
- `docs/reference-management.md`의 서지 워크플로 가이드와 `electron/bibliographyFetch.ts`의 Crossref/PubMed/KoreaMed/ORCID 연동
- 매크로 프리셋(`electron/macros.ts:13-26` 기본 프리셋 총 12종 중, `p < 0.05`/`95% CI`/`mean ± SD`/`sample size`/`HR`/`OR`/`RR` 의학통계 프리셋 7종, `electron/macros.ts:17-23`)이 의학통계 표기를 겨냥

## 3. 핵심 가치 제안

1. **소스 무결성을 지키는 WYSIWYG** — 문서(Document) 모드는 시각적으로 Word처럼 보이지만, 버퍼는 항상 순수 마크다운이다. `src/editor/wysiwygEscape.ts`가 타이핑되는 마크다운 마커를 실시간으로 이스케이프해 소스가 오염되지 않게 한다. 이는 `docs/DOCUMENT_MODE_PRINCIPLES.md` §0의 최상위 원칙("소스 무결성")을 직접 구현한 결과다.
2. **서지·인용 워크플로 내장** — 로컬 `.bib` 자동탐지, 원격 서지 API 검색, PDF/초록 다운로드, DOI 중복 제거, `[@key]` 자동완성까지 서드파티 라이브러리 없이 직접 구현했다(`shared/bibtex.ts`, `bibtexWriter.ts`, `ris.ts`, `citation.ts` 등).
3. **로컬-우선, 데이터베이스 없음** — 모든 상태는 파일(마크다운, `.bib`, JSON)로 관리되고 원격 서버가 없다. 클라우드 동기화·실시간 협업은 명시적으로 out-of-scope다(§5).

## 4. 핵심 기능

각 기능은 사용자 관점에서 한 문단으로, 근거 파일과 함께 서술한다. 문법 상세는 `docs/durumi-markdown-reference.md`, 사용자 가이드는 `docs/editor-modes.md` / `docs/reference-management.md`를 참고하라. 모듈 경계는 `structure.md`를 참고하라.

- **3-모드 에디터(Document/Live/Source)** — 아래 §6 참고. `src/editor/MarkdownEditor.tsx`가 진입점.
- **메모(리뷰 노트)** — `%% memo %%` 소스 문법으로 Word 스타일 리뷰 코멘트를 남긴다. 태그(`@ai`, `@todo`, `@reviewer`, `@stats`)별로 색상이 구분되고, 스레드·작성자·타임스탬프·해결 상태가 사이드카 JSON(`<doc>.md.comments.json`)에 저장돼 마크다운 본문 자체는 순수하게 유지된다. 내보내기 시 기본적으로 제거된다. 근거: `shared/comments.ts`, `shared/memoSidecar.ts`, `src/components/MemoPanel.tsx`.
- **CriticMarkup 변경추적** — `{++삽입++}` / `{--삭제--}` / `{~~치환~>~~}` / `{==표시==}` / `{>>코멘트<<}` 5개 연산자로 검토 이력을 소스에 직접 남긴다. 내보내기는 "모두 수용"(기본) 또는 "주석 보존"(HTML `<ins>/<del>`, DOCX/LaTeX Pandoc span) 두 모드를 지원한다. 근거: `shared/criticMarkup.ts`, `src/editor/decorations/criticMarkup.ts`.
- **서지·참고문헌 관리** — 로컬 `.bib` 파일을 상위 32단계까지 walk-up 탐색하며, Crossref/PubMed/KoreaMed/ORCID/DOI resolver로 원격 검색·추가가 가능하다. 추가된 항목은 `reference/<key>.{pdf,md}`로 로컬 미러링되며(Crossref link → PMC → Unpaywall → HTML 스크랩 → 초록 스텁 순서로 시도), 사용자가 직접 `reference/`에 넣은 파일도 사이드바에서 등록할 수 있는 양방향 동기화가 있다. 근거: `electron/bibliography.ts`, `bibliographyFetch.ts`, `referenceDownload.ts`, `referenceFs.ts`, `referenceImport.ts`.
- **내보내기** — HTML(`markdown-it` 파이프라인 + KaTeX + Mermaid SVG 인라인), PDF(오프스크린 `printToPDF`), DOCX/LaTeX(Pandoc 경유)를 지원한다. 근거: `src/export/`, `electron/pdf.ts`, `electron/pandoc.ts`.
- **AI 보조** — Anthropic Messages API와 OpenAI 호환 엔드포인트(Ollama·LM Studio 포함) 두 종류의 프로바이더를 SDK 없이 직접 구현했다. 선택 영역 재작성(7개 명령), 문단 단위 인용 제안(할루시네이션 가드 포함), 옵트인 고스트텍스트 자동완성, 사용량/비용 대시보드를 제공한다. API 키는 `safeStorage`로 암호화 저장되며, 저장 실패 시 평문 폴백을 정직하게 표시한다. 근거: `electron/aiClient.ts`, `aiKeys.ts`, `src/editor/ai/ghostText.ts`.
- **매크로** — 기본 프리셋 12종(`electron/macros.ts:13-26`)을 포함한 키바인딩 스니펫 시스템. 그중 의학통계 표기(`p < 0.05`, `95% CI`, `mean ± SD`, sample size, `HR`/`OR`/`RR`) 7종(`electron/macros.ts:17-23`)이 의학통계 전용이고, 나머지 5종은 날짜/구분선/인용/각주/NOTE 콜아웃 등 범용 저작 헬퍼다. `macros.json`을 `fs.watch`로 라이브 리로드한다. 근거: `electron/macros.ts`, `src/editor/keymap/macros.ts`.
- **원고 템플릿** — IMRaD / CONSORT 2010 / PRISMA 2020 / CARE 2017 / STROBE(cohort, cross-sectional) 6종 보고 가이드라인 스켈레톤. 근거: `shared/manuscriptTemplates.ts`.
- **표 편집** — 셀 단위 `contentEditable` 편집과 인라인 마크 렌더링을 지원하는 전용 아키텍처. 근거: `src/editor/decorations/table.ts`, `markdownExt/tableEdit.ts`.
- **i18n** — 한국어/영어 UI, OS 로케일 자동감지. 근거: `src/i18n/dict.ts`(1,093줄), `shared/menuLabels.ts`.
- **git 상태 표시** — 워크스페이스 파일에 대한 simple-git 기반 변경 상태 배지. 근거: `electron/git.ts`, `src/components/sidebar/ChangesTab.tsx`.

## 5. In-scope / Out-of-scope

인터뷰 확정 스코프를 그대로 반영한다.

**In-scope** (로컬 데스크톱 저작 전체):
- 3-모드 에디터(Document/Live/Source)
- 서지·참고문헌 관리
- 메모/CriticMarkup
- 내보내기(HTML·PDF·pandoc 경유 DOCX/LaTeX)
- AI 보조
- 매크로
- i18n(en/ko)

**Out-of-scope**:
- 웹/모바일 클라이언트
- 실시간 협업
- 클라우드 동기화 서버
- 자체 백엔드

`README.md:678-689`는 향후 유료 호스팅 동기화/실시간 협업 티어가 AGPL v3로 별도 릴리스될 계획임을 밝힌다 — 그 서버 코드는 이 저장소의 범위 밖이다.

## 6. 3-모드 편집의 의도

| 모드 | 내부 id | 의도 |
|---|---|---|
| Document / 문서 (기본) | `wysiwyg` | Word 스타일. 마크다운 마커가 시각적으로 전혀 보이지 않고, 서식은 툴바/단축키로만 적용된다. 타이핑되는 마커는 `wysiwygEscape.ts`가 실시간으로 리터럴 문자로 이스케이프한다. |
| Live / 라이브 | `typora` | v0.1.0~v0.1.10의 기존 라이브 프리뷰 동작. 비활성 라인은 렌더링, 활성(캐럿) 라인은 원본 마크다운을 노출해 마커를 직접 편집할 수 있다. |
| Source / 소스 | `markdown` | 순수 마크다운 + 문법 하이라이팅. 라이브 프리뷰 데코레이션이 전부 꺼진다. |

내부 prefs 키(`wysiwyg | typora | markdown`)는 v0.1.13 사용자 대상 이름 변경(Document/Live/Source) 이후에도 하위호환을 위해 그대로 유지된다 (`src/editor/editMode.ts`, `README.md:29`). 아키텍처 관점의 계층 구조는 `structure.md` §6을 참고하라.

## 7. 제품 원칙 — Document Mode 6원칙

`docs/DOCUMENT_MODE_PRINCIPLES.md` §0이 정의하는 우선순위(낮은 번호가 이긴다)를 제품 차원의 약속으로 요약한다. 어떤 기능이 이 원칙 중 하나를 양보해야 한다면, 해당 문서에 예외를 명시적으로 등록해야 한다.

1. **소스 무결성** — 마크다운 버퍼는 항상 유효한 마크다운이어야 한다. 어떤 편집도 파싱 불가능한 상태를 만들면 안 된다.
2. **IME 안전** — 한국어/일본어/중국어 조합 입력(composition) 중에는 `Decoration.replace`를 활성 라인에 적용하지 않는 등, 조합 이벤트를 방해하지 않는다.
3. **코드섬 주권** — 코드 블록/인라인 코드/수식 등 "코드섬" 내부의 텍스트는 마크다운 파싱·데코레이션의 대상이 되지 않는다.
4. **렌더 의도 / 소스 백드** — 렌더링은 항상 실제 소스를 정확히 반영해야 하며, 표시와 저장 내용이 어긋나서는 안 된다.
5. **명시적 스코프** — 원칙을 양보하는 기능은 영향 범위를 명시적으로 한정해야 한다(예: 표 셀 편집만의 예외).
6. **경계 원자성** — 위젯(이미지, 인라인 마크 등)의 경계는 원자적으로 취급되어야 한다(한 번의 Backspace로 전체 위젯 삭제 등).

이 원칙들은 가이드라인이 아니라 릴리스 게이트다: `docs/DOCUMENT_MODE_PRINCIPLES.md` §8의 PR 체크리스트가 `.github/PULL_REQUEST_TEMPLATE.md`에 미러링되어 모든 PR에 강제된다.

## 8. 릴리스·품질 게이트 (3단계, 대체 불가)

인터뷰 `verification` 필드를 그대로 반영한다.

1. **CI 자동 검증** — `pnpm typecheck`(`tsc --build && tsc --noEmit -p tsconfig.test.json`, 양쪽 모두 필수) → `pnpm lint` → `pnpm test`(vitest, 169개 파일). CI 워크플로: `.github/workflows/ci.yml` (ubuntu-latest 단일 잡).
2. **macOS e2e** — `pnpm test:e2e`(Playwright + 실제 Electron 앱, 31개 spec 파일). 워크플로: `.github/workflows/e2e.yml` (macos-latest 전용, 직렬 실행).
3. **릴리스 전 수동 macOS 한글 IME 스모크** — CDP `Input.imeSetComposition`은 OS 변환 계층(한자 변환 등)을 재현하지 못하므로, 이 수동 게이트는 자동화로 대체할 수 없다. `CONTRIBUTING.md` 항목 13, `docs/DOCUMENT_MODE_PRINCIPLES.md` §2가 이를 명시한다.

이 세 게이트는 순서대로 통과해야 하며, unit + e2e가 모두 green이어도 3단계 없이는 릴리스하지 않는다 — v0.2.19/.20/.21/.23/.28에서 4연속 false-green이 발생했던 실제 사례가 이 게이트의 근거다(`CONTRIBUTING.md:183-211`).

## 9. 로드맵

우선순위 라벨만 사용하며 기간 예측은 하지 않는다.

| 우선순위 | 항목 | 근거 |
|---|---|---|
| High | `RenderedSpan` 양방향 소스맵 계약 도입 — 현재 `src/editor/renderedSpan.ts`는 존재하지 않으며, `docs/DOCUMENT_MODE_PRINCIPLES.md` §7이 v0.3.x 마일스톤으로 제안한 상태다. v0.2가 사인오프로 닫힌 지금, v0.3 진입의 최우선 후보다. | `docs/DOCUMENT_MODE_PRINCIPLES.md` §7, 인터뷰 Stage A |
| Medium | 렌더러 에러 경계·통합 IPC 에러 채널 도입 — 현재 `src/`/`electron/` 전체에 `ErrorBoundary`/`componentDidCatch`/`unhandledrejection` 핸들러가 전무하며, 토스트 인프라는 단 1개 에러 경로(`useAiPalette.ts:73`)에서만 쓰인다. `PathNotAllowedError` 등은 가드되지 않은 await 지점에서 unhandled rejection으로 새어나갈 수 있다. | `structure.md` §10, `tech.md` §13 |
| Low | 최소 로깅 서브시스템 도입 — 현재 파일 sink도 레벨 구분도 없는 ad-hoc `console.*` 호출 18건뿐이며, `src/i18n/dict.ts:39`는 사용자에게 "see logs"를 약속하지만 접근 가능한 로그가 없다. | `tech.md` §13 |
| Medium | AI 매뉴스크립트 리뷰 하네스 — 임상의/생명과학자/통계학자/윤리학자/리뷰어 관점의 독립 리뷰 에이전트 패널, 결과를 `%% @reviewer-clinician … %%` 메모로 표면화 | `README.md:361-368` |
| Medium | 배경 데이터 → 그림 파이프라인 — 데이터 분석용 AI 실행 샌드박스와 마크다운 블록 연동 자동 그림 생성 | `README.md:370-373` |
| Low | 지식 그래프/온톨로지 뷰 — 인용 네트워크의 Obsidian 스타일 그래프 뷰 | `README.md:375-377` |
| Low | 컴플라이언스·무결성 — AI 텍스트 탐지 인지형 작성 보조, 표절 스타일 중복 경고, 저널 제출 헬퍼 | `README.md:379-382` |
| Low | 실제 코드서명 — Apple Developer ID 공증, Windows OV/EV 인증서 (현재 macOS ad-hoc 서명 / Windows 미서명, 활성화 경로는 `electron-builder.yml`에 주석 처리된 템플릿으로 이미 문서화됨) | `electron-builder.yml`, `README.md:384-386` |

v0.2 사인오프는 `docs/v0.2-signoff.md`에 완료 상태로 기록되어 있으며, `docs/v0.2-audit-prep.md`는 v0.3 진입 전 v0.2 기능 전체를 검증하려는 후속 감사 핸드오프 문서다.

---

관련 문서: [structure.md](structure.md) — 아키텍처·모듈 경계, [tech.md](tech.md) — 기술 스택과 도구체인.

생성: `/moai project` · 기준 버전 v0.2.29 (HEAD `b3272fd`)

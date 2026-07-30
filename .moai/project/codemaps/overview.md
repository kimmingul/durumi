# Durumi — Overview 코드맵

`/moai project` Phase 9 산출물. 아키텍처의 *지도(map)* 역할을 하는 문서로, 서술은 [structure.md](../structure.md)/[tech.md](../tech.md)를 참고하고 여기서는 경계·관계를 그래프 형태로 압축한다. 기준 버전: v0.2.29 (HEAD `b3272fd`).

## 1. 3-프로세스 아키텍처 한 장 요약

```
┌───────────────────────────┐         IPC          ┌───────────────────────────┐
│  MAIN (Node, electron/)   │◄─────────────────────►│ RENDERER (React, src/)    │
│  42 files / ~6,891 lines  │  contextBridge only   │ 172 .ts+.tsx / ~29,558 L  │
│                            │  (electron/preload.ts │                           │
│  - fs 직접 접근            │   :148)               │ - Node API 접근 불가       │
│  - 모든 외부 HTTP           │                       │ - window.api로만 통신      │
│  - safeStorage 키 볼트     │                       │ - fetch() 1건뿐            │
│  - pathGuard 신뢰 판정      │                       │   (export/inlineImages.ts) │
│  - durumi-asset:// 핸들러   │                       │                           │
└─────────────┬─────────────┘                       └─────────────┬─────────────┘
              │                                                     │
              └───────────────────┬─────────────────────────────────┘
                                   │  @shared alias
                          ┌────────▼────────┐
                          │  shared/         │  20 files / ~4,530 lines
                          │  (process-agnostic kernel)
                          │  - ipc-contract.ts (SSOT, 810L)
                          │  - bibtex/citation 파싱
                          │  - manuscriptTemplates, tableStyle
                          └──────────────────┘
```

프로세스 경계는 디렉터리 이름이 아니라 **import 그래프 스캔으로 검증된 사실**이다: `src/`→electron import 0건, `shared/`→node/electron import 0건, `electron/`→`src/` import 0건, `src/` 42개 파일이 `@shared/`를 import(`grep -rl '@shared' src --include='*.ts' --include='*.tsx' | wc -l` 실측). main/preload/renderer 3개 빌드 각각이 독립된 `resolve.alias['@shared']`를 갖는다(`electron.vite.config.ts:17,27,35`). 강제 메커니즘은 두 개의 composite tsconfig 프로젝트(`tsconfig.web.json:17` `"composite": true` + `:21` `include`, `tsconfig.node.json:16` `"composite": true` + `:21` `include`)이며 루트 `tsconfig.json:11-14`는 `references`만 갖는 컨테이너다(`files: []`는 `:10`).

## 2. 핵심 설계 패턴 (3가지)

| 패턴 | 어디서 | 왜 |
|---|---|---|
| **3-프로세스 경계 + 공유 커널** | electron/ ↔ shared/ ↔ src/ | Electron sandbox 모델(§4 신뢰 경계 참고)에서 main만 Node API·외부 HTTP를 갖고, renderer는 신뢰 불가 코드로 취급됨 |
| **얇은 셸 + 훅 기반 기능 슬라이스** | `src/App.tsx:1-117`가 21개 훅(`src/hooks/`)으로 위임, `useMenuCommandRouter`(`src/hooks/useMenuCommandRouter.ts:57`)로 합류 | feature-sliced나 MVC가 아니라, "하나의 진입점 + 각 훅이 하나의 기능 영역을 소유"하는 구조 |
| **에디터 = 플러그인/방문자(visitor) 레지스트리** | `src/editor/decorations/framework.ts:36`의 `decorationPlugin(visitor)`가 `NodeVisitor` 인터페이스(`framework.ts:17-28`)를 받아 CodeMirror `ViewPlugin`으로 감싸고, 구성 루트 `src/editor/decorations/index.ts:32-76`가 33개 데코레이션 모듈을 `liveDecorations` 배열로 집계 | 새 마크다운 구성요소마다 `NodeVisitor` 하나만 작성하면 되는 확장점을 제공 |

이 프로젝트는 **NOT** feature-sliced (기능별 디렉터리 트리가 아니라 기술 계층 + 얇은 셸), **NOT** MVC(Model-View-Controller 명명 구조 부재).

## 3. 시스템 경계 (내부 vs 외부)

```
                     ┌─────────────────────────────┐
                     │   Durumi (Electron app)     │
                     │                              │
  로컬 파일시스템 ◄───┤  electron/fs.ts,             │
  (.md, .bib, assets) │  bibliographyWrite.ts        │
                     │  (원자적 쓰기: tmp+rename)   │
                     │                              │
  git(simple-git)  ◄──┤  electron/git.ts             │
                     │                              │
  외부 서지 API    ◄──┤  electron/bibliographyFetch.ts│──► Crossref / PubMed / KoreaMed
                     │  electron/referenceDownload.ts│    / ORCID / Unpaywall / DOI resolver
                     │                              │
  LLM 엔드포인트   ◄──┤  electron/aiClient.ts        │──► Anthropic Messages API /
                     │                              │    OpenAI 호환(Ollama, LM Studio 포함)
                     │                              │
  GitHub Releases  ◄──┤  electron-updater            │──► 자동 업데이트
  Homebrew         ◄──┤  electron/pandoc.ts          │──► pandoc 설치(macOS 전용)
                     └─────────────────────────────┘
```

인터뷰 확정 사실(tech.md §11): **데이터베이스 없음** — 설정·서지 데이터는 파일(JSON, `.bib`)로만 관리.

## 4. 문서 간 항법(Navigation)

| 궁금한 것 | 가야 할 codemap | 관련 SSOT 문서 |
|---|---|---|
| 각 모듈이 뭘 하는지, public 인터페이스는? | [modules.md](modules.md) | structure.md §1, §7 |
| 어떤 패키지가 왜 들어왔는지, 내부 모듈은 서로 어떻게 참조하는지 | [dependencies.md](dependencies.md) | tech.md §2 |
| 앱이 어디서 시작하고, IPC/메뉴 커맨드는 뭐가 있는지 | [entry-points.md](entry-points.md) | structure.md §2, §3 |
| 문서 저장/모드전환/보안검증이 어떻게 흐르는지 | [data-flow.md](data-flow.md) | structure.md §4, §6, §9 |

## 5. 알려진 아키텍처 공백 (v0.3 최우선 후보)

`docs/DOCUMENT_MODE_PRINCIPLES.md:166-193` §7이 제안하는 양방향 소스맵 계약(`RenderedSpan`, 주석 처리된 `src/editor/renderedSpan.ts (proposed)`)은 **아직 구현되지 않았다**. 오늘의 소스↔렌더 매핑은 구성요소별로 제각각이다:

- 일반 데코레이션: Lezer 노드 오프셋을 소스 범위로 직접 사용(`src/editor/decorations/framework.ts:68-92`의 `build()`가 `node.from`/`node.to`를 그대로 `VisitArgs`에 전달)
- 원자적 미디어(이미지/링크): `EditorView.atomicRanges` + `Prec.high` 삭제 키맵(`src/editor/atomicMedia.ts`)
- 표: 유일하게 진짜 2-레이어인 사례 — `contentEditable` div가 편집 표면이고, 셀 동기화 후 마크다운 소스가 canonical하여 DOM이 그로부터 재도출된다(`src/editor/decorations/table.ts:27-72` 상단 아키텍처 주석)

자세한 내용과 findings는 [data-flow.md](data-flow.md) §5를 참고.

---

생성: `/moai project` Phase 9 (codemaps) · 기준 버전 v0.2.29 (HEAD `b3272fd`)

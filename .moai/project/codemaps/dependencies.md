# Durumi — Dependencies 코드맵

`package.json` 기준 31개 `dependencies` + 23개 `devDependencies`(`package.json:33-65` dependencies 블록, `:66-90` devDependencies 블록). 선택 근거 서술은 [tech.md](../tech.md) §2/§3을 보라 — 이 문서는 **어느 프로세스가 어느 패키지를 쓰는지**와 **내부 모듈이 서로 어떻게 참조하는지**를 그래프로 정리한다.

## 1. 외부 패키지 — 프로세스별 사용처 (import 그래프 실측)

`grep -rl` 실측 기준(2026-07-29). 표시된 파일은 대표 사용처이며 전량 열거는 아니다.

### main 전용 (electron/에서만 import)

| 패키지 | 사용처 |
|---|---|
| `simple-git` | `electron/git.ts` |
| `pdfjs-dist` | `electron/pdfText.ts`, `electron/referenceImport.ts` (타입만 `shared/ipc-contract.ts`에도 등장) |
| `turndown` | `electron/referenceDownload.ts` (HTML→Markdown 변환, 참고문헌 다운로드 스크랩 폴백) |
| `electron-updater` | `electron/autoUpdater.ts` |
| `node-emoji` | — (실제로는 renderer측 `src/editor/keymap/emojiAutocomplete.ts`에서 사용됨. 아래 renderer 표로 이동) |

### renderer 전용 (src/에서만 import)

| 패키지 | 사용처 |
|---|---|
| `react` / `react-dom` | `src/main.tsx`, 모든 `.tsx` 컴포넌트 |
| `zustand` | `src/store/*.ts` 8개 |
| `katex` | `src/export/renderMath.ts` (+ CSS `src/editor/MarkdownEditor.tsx:1`) |
| `mermaid` | `src/export/renderMermaid.ts`, `src/editor/mermaid/renderer.ts` — 둘 다 `import('mermaid')` 동적 import(지연 로드) |
| `node-emoji` | `src/editor/keymap/emojiAutocomplete.ts` |
| `markdown-it` + 7개 플러그인(`-attrs`/`-footnote`/`-github-alerts`/`-mark`/`-sub`/`-sup`/`-task-lists`) | `src/export/renderHtml.ts` 계열(HTML 내보내기 파이프라인) |
| `@codemirror/*`(8) / `@lezer/*`(3) | `src/editor/` 전역(에디터 코어) |

### shared 또는 양쪽에서 참조

| 패키지 | 사용처 |
|---|---|
| `js-yaml` | `src/editor/decorations/frontMatter.ts`(renderer), `shared/frontMatter.ts`/`shared/frontMatterFenced.ts`(shared) — electron/에서는 미사용 |

### 확인되지 않은 직접 import — findings로 보고

- **`@mixmark-io/domino`**: `electron/`, `src/`, `shared/` 전체에 대해 `grep -rni domino`를 실행한 결과 **직접 import가 0건**이다(2026-07-29 실측). `tech.md:23`은 이를 `markdown-it` 내보내기 파이프라인과 같은 그룹으로 서술하지만, 실제 소비자는 아마도 `turndown`의 Node 환경 DOM 파서 내부 의존성으로 추정된다 — 확정하려면 `turndown`의 `package.json` `dependencies` 확인이 필요하다(본 감사 범위 밖, findings에 별도 기록).

## 2. 지연/동적 import (번들 분리 지점)

| 패키지 | 트리거 파일 | 방식 |
|---|---|---|
| `mermaid` | `src/editor/mermaid/renderer.ts:8,17`, `src/export/renderMermaid.ts:16,22` | `import('mermaid')` (첫 사용 시 1회) |
| `katex` | `src/editor/math/katexLoader.ts` | 동적 import |
| `pdfjs-dist` | `electron/pdfText.ts` | 지연 로드(tech.md §2 "~2MB" 주석 근거) |
| `node-emoji` | `src/editor/keymap/emojiAutocomplete.ts:14-22` | 지연 로드 |

## 3. 내부 모듈 의존 그래프 (개념도)

```
                    ┌─────────────────────────┐
                    │  shared/ (20 files)      │
                    │  ipc-contract.ts (SSOT)  │
                    │  bibtex/citation/*        │
                    │  manuscriptTemplates.ts   │
                    │  tableStyle.ts            │
                    └───────────▲────────▲──────┘
                     @shared alias        @shared alias
                                │                │
              ┌─────────────────┘                └──────────────────┐
              │                                                     │
   ┌──────────┴──────────┐                              ┌───────────┴──────────┐
   │  electron/ (main)    │        IPC (66 invoke +      │  src/ (renderer)      │
   │  ipc/*.ts             │◄────── 8 push channels ─────►│  hooks/*.ts           │
   │  preferences.ts       │        via preload.ts        │  store/*.ts           │
   │  pathGuard.ts         │        contextBridge         │  editor/*             │
   └───────────────────────┘                              └───────────────────────┘
```

- **electron/ → src/ import: 0건** (검증: `grep` 스캔, structure.md §2)
- **src/ → electron/ import: 0건**
- **양쪽 → shared/ import: 42개 파일**(structure.md 상단 요약), `@shared` alias는 `electron.vite.config.ts:17,27,35` 3곳에서 동일하게 `<repo-root>/shared`로 해석

### 대표 내부 edge (src/ 내부, 계층 간)

| From | To | 관계 |
|---|---|---|
| `src/App.tsx` | `src/hooks/*` (21개) | 얇은 셸이 동작을 위임 |
| `src/hooks/useMenuCommandRouter.ts` | `src/editor/keymap/*`, `src/editor/viewModes.ts`, `src/store/*` | 메뉴 커맨드를 에디터 커맨드/스토어 액션으로 라우팅(`useMenuCommandRouter.ts:1-32` import 목록) |
| `src/editor/MarkdownEditor.tsx` | `src/editor/decorations/index.ts`, `src/editor/markdownExt/*`(8개 확장), `src/editor/keymap/*`(3개), `src/editor/atomicMedia.ts`, `src/editor/atomicInlineMarks.ts` | 6단계 확장 계층 조립(`MarkdownEditor.tsx:1-35` import 블록) |
| `src/editor/decorations/index.ts` | `src/editor/decorations/*`(32개 개별 모듈) | `liveDecorations` 배열로 집계(`:1-30` import, `:32-76` 배열) |
| `src/editor/decorations/table.ts` | `src/editor/markdownExt/tableEdit.ts`, `tableTransform.ts`, `tableStylePlugin.ts`, `src/editor/keymap/tableNavigation.ts`, `shared/tableStyle.ts` | 표 위젯이 파서/키맵/공유 스타일 타입을 모두 참조(`table.ts:4-24`) |
| `electron/ipc.ts` | `electron/ipc/*`(9개 등록 함수 + `_shared.ts` 재export) | 조립만 하고 로직은 담지 않음(`ipc.ts:2-11` import) |
| `electron/ipc/files.ts` | `electron/pathGuard.ts`(`assertAllowedPath`), `electron/pendingAssets.ts`(`migratePendingInContent`), `electron/fs.ts`(`writeFileAtomic`), `electron/preferences.ts`(`addRecentFile`) | 저장 라운드트립(data-flow.md §3) |

## 4. 빌드 시스템의 의존성 처리

`electron-vite build`가 main/preload/renderer 3개의 독립 Rollup 빌드를 만들며, 각 빌드는 자신의 `resolve.alias['@shared']`를 갖는다(`electron.vite.config.ts:17,27,35`) — 즉 `shared/`는 컴파일되어 3곳에 **각각 번들**되고, 런타임에 공유되는 모듈이 아니다(빌드 시점에만 공유되는 소스).

---

생성: `/moai project` Phase 9 (codemaps) · 기준 버전 v0.2.29 (HEAD `b3272fd`)

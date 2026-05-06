# Durumi

> **Durumi** (두루미, *Korean for crane*) — a paper crane for medical research.

A Typora-style cross-platform markdown editor (macOS + Windows 11) being shaped into an end-to-end manuscript studio for medical researchers. The crane (학, 鶴) is also a homophone for *learning* (學) — the brand carries the dual meaning of scholarship and the origami crane folded for someone's healing.

**Current version: v0.1.0.** The editing foundation is in place; medical-research specialization comes next.

## Features

### Live preview
- 11 baseline markdown elements (headings, bold, italic, inline/fenced code, link, image, list, blockquote, horizontal rule)
- GFM tables with row-level live preview and full keyboard navigation (Tab / Shift+Tab / Enter / Cmd+Enter)
- Task lists with click-to-toggle checkboxes
- Strikethrough (`~~text~~`)
- Fenced code syntax highlighting via CodeMirror's lezer parsers (TS / Python / Rust / Go / etc., lazy-loaded)
- Active-line invariant: the line under the cursor never gets `Decoration.replace` — IME-safe

### Math
- Inline math `$x^2$` and block math `$$...$$` rendered with KaTeX
- Live preview decoration: math renders when cursor is on a different line
- Math inside fenced code stays as raw text
- HTML / PDF export includes rendered KaTeX (CSS via jsDelivr CDN)

### Mermaid diagrams
- ` ```mermaid ` fenced blocks render as SVG when cursor is outside
- Lazy-loaded (~700KB only when first encountered)
- Cached by fence body so repeated diagrams render once
- HTML / PDF export inlines the rendered SVG

### Sidebar
- Collapsible left sidebar, two tabs:
  - **Files** — multi-folder workspace; each opened folder is a separate root, lazy-expanded, `.md` only, per-root `fs.watch`
  - **Outline** — heading tree of the current document (= TOC) with active-heading highlight that follows the editor viewport
- Drag-handle resize, persisted state (visibility, active tab, width, all open workspace folders)
- **Git status indicators** — colored dots next to files/folders inside a git repo (modified, added, untracked, deleted, renamed, ignored). Aggregated to parent folders when descendants are dirty.
- **File → Open Folder…** appends to the workspace; **File → Close Folder** lists open roots.

### Find & Replace
- CodeMirror's built-in search panel exposed through native menu (Find / Find and Replace / Find Next / Find Previous)
- Themed to light/dark CSS variables

### Export
- HTML export — markdown-it pipeline with task-lists, GFM tables, strikethrough, lezer code highlighting (cm-tok-* classes inline)
- PDF export — offscreen `BrowserWindow` + `webContents.printToPDF`, A4 page, code/table page-break-inside avoid
- Math (KaTeX) and Mermaid both render in exports
- Optional user CSS appended into the export's `<style>` block

### Customization
- **Custom CSS** — edit `~/Library/Application Support/Durumi/custom.css` (or `%APPDATA%\Durumi\custom.css`); changes hot-reload into the live editor and are included in HTML/PDF export. Open via **View → Open Custom CSS…**
- **Macros / snippets** — JSON-configured key-bound text insertion. Edit `~/.../Durumi/macros.json`. Default macros: `Cmd/Ctrl+Shift+D` inserts today's date, `Cmd/Ctrl+Shift+H` inserts a horizontal rule. Token expansion for `${YYYY}-${MM}-${DD}`, `${date}`, `${time}`, `${selection}`, `${cursor}`. Open via **Edit → Open Macros Config…**

### Image auto-upload
- Paste an image from the clipboard into the editor → saved to `<file_dir>/assets/img-<ts>-<rand>.<ext>` and a markdown image link is inserted
- Drag-drop image files onto the editor → same flow
- If no document is open, an alert prompts the user to save first (no orphan files)

### File I/O & UX
- Native Open / Save / Save As / Recent Files
- Light / dark theme toggle (system / light / dark preference)
- Native menu (Cmd+B, Cmd+I, Cmd+1..6, Cmd+S, Cmd+F, ...)
- Dirty-close confirmation dialog
- UTF-8 file encoding, line-ending preserved
- **Korean / English UI** — switchable via **View → Language**, with a system-locale auto mode. ~134 unique strings localized.

### Auto-update + signing
- `electron-updater` checks for updates 30s after launch (packaged builds only) — silent failure on dev / network errors
- **Help → Check for Updates…** for a manual check
- macOS builds are ad-hoc signed (Gatekeeper warning workaround documented in [docs/RELEASE.md](docs/RELEASE.md))
- Windows NSIS builds are unsigned (SmartScreen workaround documented)
- Real Apple Developer ID + EV Windows certificate are pending — see roadmap.

## Roadmap — vision toward a medical-research studio

Durumi's long-term direction is to be the **best end-to-end writing environment for medical research manuscripts**. The features below are *not yet implemented* — they form the backbone of post-v0.1.0 work.

### Reference & citation engine
- Built-in EndNote-style reference library (local store, BibTeX/RIS import/export)
- Live search against **PubMed**, **KoreaMed**, **Crossref**, **Semantic Scholar**, **ORCID**
- DOI → metadata resolution; one-click cite-and-insert
- Configurable citation styles (CSL): Vancouver, APA, AMA, IEEE, journal-specific templates
- Bibliography auto-generation in HTML / PDF export

### AI-assisted writing
- Integrated LLM assist for drafting, summarizing, and rephrasing
- **English-polish** mode that smooths non-native phrasing without producing the AI-tells that detectors flag
- Context-aware suggestions grounded in the document's references (RAG over the local reference library)

### AI manuscript review harness
- Multi-perspective evaluation panels at each writing stage. Each perspective is an independent reviewer agent that surfaces stage-appropriate concerns:
  - **Clinician** — clinical relevance, patient impact, indication framing
  - **Bio scientist** — mechanism, biology, novelty
  - **Statistician** — design, power, analysis correctness, reproducibility
  - **Ethicist** — IRB, consent, dual-use, conflict of interest
  - **Reviewer** — section-by-section critique anticipating peer review
- Rubric-driven, per-section feedback ("Methods statistical analysis is underspecified for the comparisons performed")

### Background data → figure pipeline
- AI-driven Python execution sandbox for data analysis and figure generation
- Markdown blocks reference dataset files and emit figures into the manuscript automatically
- Figures kept in sync as data changes — re-run on demand

### Knowledge graph / ontology view
- Obsidian-style graph view over the citation network and concept ontology of the manuscript-in-progress
- Identifies isolated claims (no citation backing), redundant references, and gaps relative to the field
- Visual indicator of the *intellectual contribution surface area* of the work

### Compliance & integrity
- AI-text-detection-aware writing assist (output stays human-natural)
- Plagiarism-style overlap warning against the local reference library
- Journal submission helpers (cover letter, response-to-reviewers scaffolding)

See [docs/PROGRESS.md](docs/PROGRESS.md) for the active progress tracker.

## Develop

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build              # bundle main + preload + renderer
pnpm make:mac           # produce dist-build/Durumi-0.1.0-*.dmg (run on macOS)
pnpm make:win           # produce dist-build/Durumi Setup 0.1.0.exe (run on Windows 11)
```

See [docs/RELEASE.md](docs/RELEASE.md) for the release runbook (signing posture, auto-update setup).

## Test

```bash
pnpm typecheck          # 0 errors expected
pnpm lint               # 0 errors / 0 warnings expected
pnpm test               # 249 Vitest unit tests
pnpm test:e2e           # 16 Playwright Electron tests (run pnpm build first)
```

## Install (unsigned)

### macOS
The `.dmg` is ad-hoc signed only. Drag Durumi to Applications, then right-click → Open the first time to bypass Gatekeeper.

### Windows 11
The `.exe` is unsigned. SmartScreen will warn — click "More info" → "Run anyway".

## Keyboard shortcuts

### Editor
| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+B` | Bold toggle |
| `Cmd/Ctrl+I` | Italic toggle |
| `Cmd/Ctrl+Shift+K` | Inline code toggle |
| `Cmd/Ctrl+Shift+X` | Strikethrough toggle |
| `Cmd/Ctrl+K` | Insert link |
| `Cmd/Ctrl+1..6` | Heading H1–H6 |
| `Cmd/Ctrl+Shift+T` | Insert 2×2 table boilerplate |
| `Cmd/Ctrl+Shift+C` | Fenced code block (or wrap selection) |
| `Cmd/Ctrl+Enter` | Toggle task marker — or, inside a table cell, insert a row below |
| `Cmd/Ctrl+Shift+D` | Insert today's date (default macro) |
| `Cmd/Ctrl+Shift+H` | Insert horizontal rule (default macro) |
| `Tab` (in table cell) | Next cell — auto-add row at end |
| `Shift+Tab` (in table cell) | Previous cell |
| `Enter` (in table cell) | Exit table downward |

User-defined macros via `macros.json` extend this set.

### File / window
| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+N` | New |
| `Cmd/Ctrl+Shift+N` | New window |
| `Cmd/Ctrl+O` | Open |
| `Cmd/Ctrl+S` | Save |
| `Cmd/Ctrl+Shift+S` | Save As |
| `Cmd/Ctrl+Shift+L` | Toggle theme |
| `Cmd/Ctrl+/` | Toggle source mode (debugging) |

### Sidebar
| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+\` | Toggle sidebar |
| `Cmd/Ctrl+Shift+E` | Show Files tab |
| `Cmd/Ctrl+Shift+O` | Show Outline tab |

### Find
| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+F` | Find |
| `Cmd/Ctrl+Alt+F` | Find and Replace |
| `Cmd/Ctrl+G` | Find Next |
| `Cmd/Ctrl+Shift+G` | Find Previous |
| `Esc` | Close Find panel |

## Project Structure

```
electron/                    Main process (Node)
├── main.ts                  BrowserWindow entry
├── menu.ts                  Native menu (localized)
├── ipc.ts                   IPC handler registry
├── preload.ts               contextBridge IPC bridge
├── preferences.ts           JSON-backed prefs
├── fs.ts                    Per-root file watchers
├── pdf.ts                   Offscreen printToPDF
├── customCss.ts             Custom CSS file watcher
├── images.ts                Image paste / drop save
├── macros.ts                Macros JSON loader / watcher
├── git.ts                   simple-git status
├── i18n.ts                  Korean / English menu strings
└── autoUpdater.ts           electron-updater wrapper

src/                         Renderer (React + CodeMirror 6)
├── App.tsx                  Top-level layout + menu dispatcher
├── main.tsx                 React root + LanguageProvider
├── editor/
│   ├── MarkdownEditor.tsx   CM6 React wrapper
│   ├── decorations/         Live-preview ViewPlugins
│   ├── keymap/              Keyboard / toggle helpers + macros
│   ├── math/scan.ts         Inline / block math scanner
│   ├── mermaid/renderer.ts  Singleton async Mermaid renderer
│   ├── imagePaste.ts        Paste / drop handler
│   ├── outline.ts           parseHeadings + buildOutlineTree
│   ├── jumpToLine.ts        Cursor + scrollIntoView helper
│   ├── openSearch.ts        Search panel openers
│   └── theme.ts             CM6 theme via CSS variables
├── components/
│   ├── Sidebar.tsx          Collapsible shell
│   ├── sidebar/             FileTree, WorkspaceRoot, FileTreeNode, Outline, OutlineItem, gitStatus
│   └── StatusBar.tsx
├── hooks/                   useFolderTree, useDocOutline, useActiveHeading
├── store/                   zustand stores (appStore, sidebarStore — workspaces + git status)
├── export/                  markdown-it pipeline + KaTeX + Mermaid
├── i18n/                    dict.ts + t.ts
└── styles/                  Global CSS, light/dark tokens, git status dots

shared/
└── ipc-contract.ts          IPC types shared by main and renderer

build/
├── icon.svg                 Master logo (origami crane on 한지 paper)
└── icon.png                 1024×1024 app icon (rendered from icon.svg)

tests/                       Vitest unit tests (249)
e2e/                         Playwright Electron tests (16)
docs/
├── PROGRESS.md              Active progress tracker + roadmap
└── RELEASE.md               Signing + auto-update runbook
```

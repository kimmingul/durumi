# Durumi

> **Durumi** (두루미, *Korean for crane*) — a paper crane for medical research.

A cross-platform markdown editor (macOS + Windows 11) that grows from a Typora-style live-preview editor into an end-to-end manuscript studio for medical researchers. The crane (학, 鶴) is also a homophone for *learning* (學) — the brand carries the dual meaning of scholarship and the origami crane folded for someone's healing.

**Current version: v0.1.2.** Typora-parity foundation complete; medical-research v1 features (citations, templates, statistics macros, .docx import, manuscript memos) are in place.

## Features

### Live preview — Markdown coverage

Built on CodeMirror 6 + `@lezer/markdown` + GFM, with active-line invariant (the line under the caret never gets `Decoration.replace`, keeping IME composition safe).

- Headings — ATX `#` … `######` and Setext `===` / `---`
- Emphasis — `*em*`, `_em_`, `**strong**`, `__strong__`, `***both***`
- Strikethrough `~~text~~`, highlight `==text==`, subscript `~x~`, superscript `^x^`
- Inline code `` `code` `` with backtick-runs for embedded backticks
- Backslash escapes (`\* \_ \[ \\` …) — leading `\` hidden when off-line
- Inline HTML pairs `<sub>`, `<sup>`, `<mark>`, `<kbd>`, `<u>` rendered visually; matched as paired tags
- Hard line breaks — trailing two spaces or trailing `\`, both visualized with a faint `↵` marker
- Links — inline `[text](url "title")`, reference `[text][id]` + `[id]: url`, autolinks `<https://…>`, bare-URL linkify
- Images — `![alt](src)` and `![alt](src "title")` with paren-tolerant URLs
- Lists — bulleted, ordered, nested, GFM task lists with click-to-toggle
- Code blocks — fenced (with `@codemirror/language-data` syntax highlighting, lazy-loaded) and indented
- GFM tables with column alignment, full keyboard navigation (Tab / Shift+Tab / Enter / Cmd+Enter)
- Blockquotes — including nested `>>` and GitHub-style alerts (`> [!NOTE/TIP/IMPORTANT/WARNING/CAUTION]`)
- Horizontal rules — `---`, `***`, `___`
- HTML blocks — `<div>`, `<table>`, etc. (passed through to export; styled in editor)
- HTML comments — `<!-- … -->`
- Front matter — YAML between `---` … `---` at document start, folded summary in editor
- Footnotes — `[^id]` reference + `[^id]: text` definition
- `[toc]` directive — live preview shows the heading tree as a clickable widget
- Citations — Pandoc-style `[@key]`, `[@a; @b]`, `[-@key]`, `[@key, p. 33]`

### Math & diagrams

- Inline math `$x^2$` and block math `$$…$$` rendered with KaTeX (caret-off-line trigger)
- Math inside fenced code stays as raw text
- ` ```mermaid ` blocks render as inline SVG with `securityLevel: 'strict'` (lazy-loaded ~700 KB)
- Mermaid cache keyed by fence body; HTML/PDF export inlines the rendered SVG

### Manuscript memos (v0.1.2 — new)

Word-style review notes embedded in the markdown source.

- Inline `%% memo %%` — colored sticky-note rendering when the caret leaves the line
- Block `%%\n…\n%%` — multi-line memos for paragraph-level review
- Optional tag prefix: `%% @ai stats agent must verify %%`, `%% @todo add p-values %%`, `%% @reviewer cohort question %%`, `%% @stats run Wilcoxon %%`
- Known tags get distinct colors (blue / orange / green / purple); unknown tags fall back to neutral gray
- Sidebar **메모** tab aggregates every memo in document order — tag chip + preview + line number; click jumps to source
- Status bar shows the running memo count
- `Cmd/Ctrl + Alt + M` wraps the current selection (or inserts an empty memo with caret centered)
- **Default-strip on export** — memos never leak to HTML / PDF / DOCX / LaTeX. A "메모 포함" toggle in Settings promotes them to visible blockquotes when transparency is wanted (review-mode export)

### Citations & bibliography

- Pandoc-style `[@key]` / `[@a; @b]` / `[-@key]` / `[@key, p. 33]` syntax
- BibTeX auto-discovery — walks up to 32 directories looking for `references.bib`, `references.bibtex`, `bibliography.bib`; or set `bibliography:` in YAML front matter
- HTML/PDF export: numbered `<sup>`-link citations + Vancouver-style `<section class="references">` auto-appended
- Missing keys surface as red `[?]` markers
- DOCX/LaTeX exports route through Pandoc citeproc with `csl: …` front-matter key when more styles are needed

### Manuscript templates

`File → New from Template` → six reporting-guideline-aligned skeletons:

| ID | Reporting guideline |
|---|---|
| `imrad` | IMRaD article (Introduction–Methods–Results–Discussion) |
| `consort` | CONSORT 2010 — randomized controlled trial |
| `prisma` | PRISMA 2020 — systematic review / meta-analysis |
| `case-report` | CARE 2017 — single-patient case report |
| `cohort` | STROBE — cohort / observational |
| `cross-sectional` | STROBE — cross-sectional / survey |

Each template ships with YAML front matter, `[toc]`, and the heading tree the guideline expects.

### Statistics macros (default presets)

Eleven default macros for medical-stat boilerplate (editable via `Edit → Open Macros Config…`):

| Shortcut | Insert |
|---|---|
| `Cmd/Ctrl + Alt + P` | `*p* < 0.05` |
| `Cmd/Ctrl + Alt + C` | `95% CI [, ]` |
| `Cmd/Ctrl + Alt + M` | `M ± SD` |
| `Cmd/Ctrl + Alt + N` | `(*n* = )` |
| `Cmd/Ctrl + Alt + H` / `O` / `R` | `HR` / `OR` / `RR` template with 95% CI |
| `Cmd/Ctrl + Alt + K` / `F` | `[@]` citation / `[^]` footnote skeleton |
| `Cmd/Ctrl + Shift + D` | Today's date |
| `Cmd/Ctrl + Shift + H` | Horizontal rule |

Token expansion: `${YYYY}-${MM}-${DD}`, `${date}`, `${time}`, `${selection}`, `${cursor}`.

### Sidebar (4 tabs)

- **Files** — multi-folder workspace; per-root `fs.watch`; `.md` filter; lazy expansion; right-click context menu (new file / new folder / rename / duplicate / move to trash / reveal / copy path); git status indicators (modified / added / untracked / deleted / renamed; aggregated to parent folders)
- **Outline** — heading tree of the current document with active-heading highlight that follows the editor viewport; **drag-to-reorder sections** (rewrites the markdown source)
- **Search** — across-file workspace search with case / whole-word / regex filters; results grouped by file; click jumps to line. Excludes `.git`, `node_modules`, files > 1 MB, binaries
- **Memos** — aggregated `%% %%` notes across the current document (see [Manuscript memos](#manuscript-memos-v020--new))

Drag-handle resize; persisted state (visibility, active tab, width, all open workspace folders).

### Quick Open & navigation

- `Cmd/Ctrl + P` — fuzzy filename palette across all workspace folders (fzf-style scoring; up to 50 results ranked by score then by recency)
- `Cmd/Ctrl + F` / `Cmd/Ctrl + Alt + F` — Find / Find and Replace via CodeMirror's themed search panel
- `F8` — Focus Mode (dim all blocks except the one containing the caret)
- `F9` — Typewriter Mode (caret line stays at viewport mid-height)

### Export

| Format | Pipeline | External dep |
|---|---|---|
| HTML | `markdown-it` + KaTeX + Mermaid + GitHub-alerts plugin + slugified heading anchors | none |
| PDF | HTML → headless `BrowserWindow.printToPDF` (A4, page-break-inside avoid for code/tables) | none |
| DOCX | Pandoc — `markdown+yaml_metadata_block+footnotes+definition_lists+pipe_tables+raw_html` → `docx` | Pandoc |
| LaTeX | Pandoc — same input format → `latex --standalone` | Pandoc |

- Optional Word style reference (`--reference-doc`) and LaTeX template (`--template`) configurable in Settings
- Pandoc detected automatically; `Pandoc Install` dialog with **Homebrew one-click install** on macOS when missing
- Custom CSS appended to the export's `<style>` block (HTML/PDF)
- Memos stripped by default; "메모 포함" toggle promotes them to blockquotes

### Spell check

- Electron's built-in spellchecker; default language inferred from OS, override in Settings
- Code blocks, fenced code, inline code, and front matter excluded
- Custom dictionary persisted to preferences
- Right-click misspelling → suggestions, "Add to dictionary", "Ignore"

### Customization

- **Custom CSS** — edit `~/Library/Application Support/Durumi/custom.css` (or `%APPDATA%\Durumi\custom.css`); hot-reloads into the live editor and is included in HTML/PDF export. Open via **View → Open Custom CSS…**
- **Macros / snippets** — JSON-configured key-bound text insertion at `~/.../Durumi/macros.json`. Open via **Edit → Open Macros Config…**
- **Settings dialog** — theme, language, Pandoc binary path, Word style reference, LaTeX template, spell-check languages, custom dictionary, "Include memos in export"

### Image auto-upload

- Paste image from clipboard → saved to `<file_dir>/images/img-<ts>-<rand>.<ext>` and a markdown image link inserted at the caret
- Drag-drop image files onto the editor → same flow
- File-name conflicts resolved with `-2`, `-3`, … suffix
- If no document is open, an alert prompts to save first (no orphan files)

### File I/O & UX

- Native Open / Save / Save As / Recent Files
- **Robust quit handling** — `Cmd+Q` / `Cmd+W` / red-light close all route through a renderer-driven Save? prompt, with a 30 s timeout fallback so a hung renderer never permanently locks the close
- Light / dark theme (system / light / dark preference)
- Korean / English UI — auto-detect from OS locale; switch via **View → Language**
- UTF-8 file encoding, line-ending preserved
- Multi-window
- Dirty-close confirmation dialog

### Auto-update + signing

- `electron-updater` checks for updates 30s after launch (packaged builds only)
- **Help → Check for Updates…** for a manual check
- macOS builds are ad-hoc signed (Gatekeeper warning workaround documented in [docs/RELEASE.md](docs/RELEASE.md))
- Windows NSIS builds are unsigned (SmartScreen workaround documented)
- Real Apple Developer ID + EV Windows certificate are pending — see roadmap

## Documentation

- **[docs/durumi-markdown-reference.md](docs/durumi-markdown-reference.md)** — comprehensive Korean markdown reference (Typora 1.13 baseline + Durumi extensions: citations, memos, manuscript metadata, KaTeX coverage, export pipeline, shortcut tables)
- **[docs/typora-spec.md](docs/typora-spec.md)** — Typora 1.13 parity spec (Phases A/B/C, deliberate non-goals, references)
- **[docs/PROGRESS.md](docs/PROGRESS.md)** — release tracker + post-v0.1.2 roadmap
- **[docs/RELEASE.md](docs/RELEASE.md)** — signing posture + auto-update runbook

## Roadmap — vision toward a manuscript studio

The features below build on the v0.1.2 foundation:

### 1 — Live reference search
- API integrations: PubMed, KoreaMed, Crossref, Semantic Scholar, ORCID
- DOI → metadata resolution; one-click cite-and-insert into the local BibTeX

### 2 — AI-assisted writing
- Integrated LLM assist for drafting, summarizing, and rephrasing
- **English-polish** mode that smooths non-native phrasing without producing AI-detection signals
- Context-aware suggestions grounded in the document's references (RAG over the local reference library)

### 3 — AI manuscript review harness
- Multi-perspective evaluation panels at each writing stage. Each perspective is an independent reviewer agent:
  - **Clinician** — clinical relevance, patient impact, indication framing
  - **Bio scientist** — mechanism, biology, novelty
  - **Statistician** — design, power, analysis correctness, reproducibility
  - **Ethicist** — IRB, consent, dual-use, conflict of interest
  - **Reviewer** — section-by-section critique anticipating peer review
- Rubric-driven, per-section feedback. Findings surfaced as `%% @reviewer-clinician … %%` memos in the existing memo sidebar.

### 4 — Background data → figure pipeline
- AI-driven Python execution sandbox for data analysis and figure generation
- Markdown blocks reference dataset files and emit figures into the manuscript automatically
- Figures kept in sync as data changes — re-run on demand

### 5 — Knowledge graph / ontology view
- Obsidian-style graph view over the citation network and concept ontology of the manuscript
- Identifies isolated claims (no citation backing), redundant references, and gaps relative to the field

### 6 — Compliance & integrity
- AI-text-detection-aware writing assist (output stays human-natural)
- Plagiarism-style overlap warning against the local reference library
- Journal submission helpers (cover letter, response-to-reviewers scaffolding)

### 7 — CriticMarkup track-changes (opt-in)
- `{++ ++}` / `{-- --}` / `{~~ ~> ~~}` / `{>> <<}` for reviewers who want full insert/delete/substitute semantics on top of `%% %%` memos

### 8 — Real code-signing
- Apple Developer ID + notarization
- Windows OV/EV certificate + signed NSIS

## Develop

```bash
git clone https://github.com/kimmingul/durumi.git
cd durumi
pnpm install
pnpm dev
```

## Build

```bash
pnpm build              # bundle main + preload + renderer
pnpm make:mac           # produce dist-build/Durumi-0.1.2-*.dmg (run on macOS)
pnpm make:win           # produce dist-build/Durumi Setup 0.1.2.exe (run on Windows 11)
```

See [docs/RELEASE.md](docs/RELEASE.md) for the release runbook (CI workflow, signing posture, auto-update setup).

## Test

```bash
pnpm typecheck          # 0 errors expected
pnpm lint               # 0 errors / 0 warnings expected
pnpm test               # 643 Vitest unit tests
pnpm test:e2e           # 16 Playwright Electron tests (run pnpm build first)
```

CI runs `typecheck → lint → test` on every push/PR via [`.github/workflows/ci.yml`](.github/workflows/ci.yml); Playwright on macOS via [`e2e.yml`](.github/workflows/e2e.yml); tagged `v*.*.*` releases via [`release.yml`](.github/workflows/release.yml).

## Install (unsigned)

### macOS
The `.dmg` is ad-hoc signed only. Drag Durumi to Applications, then right-click → Open the first time to bypass Gatekeeper.

### Windows 11
The `.exe` is unsigned. SmartScreen will warn — click "More info" → "Run anyway".

## Keyboard shortcuts

### Editor — Markdown formatting
| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + B` | Bold toggle |
| `Cmd/Ctrl + I` | Italic toggle |
| `Cmd/Ctrl + Shift + K` | Inline code toggle |
| `Cmd/Ctrl + Shift + X` | Strikethrough toggle |
| `Cmd/Ctrl + K` | Insert link |
| `Cmd/Ctrl + 1..6` | Heading H1–H6 |
| `Cmd/Ctrl + Shift + T` | Insert 2×2 table boilerplate |
| `Cmd/Ctrl + Shift + C` | Fenced code block (or wrap selection) |
| `Cmd/Ctrl + Enter` | Toggle task marker — or, inside a table cell, insert a row below |
| `Cmd/Ctrl + Alt + M` | Wrap selection in `%% memo %%` (or insert empty memo) |
| `Tab` (in table cell) | Next cell — auto-add row at end |
| `Shift + Tab` (in table cell) | Previous cell |
| `Enter` (in table cell) | Exit table downward |

### Statistics macros (default; user-configurable)
| Shortcut | Insert |
|---|---|
| `Cmd/Ctrl + Shift + D` | Today's date |
| `Cmd/Ctrl + Shift + H` | Horizontal rule |
| `Cmd/Ctrl + Alt + P` | `*p* < 0.05` |
| `Cmd/Ctrl + Alt + C` | `95% CI [, ]` |
| `Cmd/Ctrl + Alt + N` | `(*n* = )` |
| `Cmd/Ctrl + Alt + H` / `O` / `R` | `HR` / `OR` / `RR` with 95% CI |
| `Cmd/Ctrl + Alt + K` / `F` | `[@]` citation / `[^]` footnote skeleton |

User-defined macros via `macros.json` extend / override these.

### File / window
| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + N` | New |
| `Cmd/Ctrl + Shift + N` | New window |
| `Cmd/Ctrl + O` | Open |
| `Cmd/Ctrl + S` | Save |
| `Cmd/Ctrl + Shift + S` | Save As |
| `Cmd/Ctrl + Shift + L` | Toggle theme |
| `Cmd/Ctrl + /` | Toggle source mode (debugging) |

### View / sidebar
| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + \` | Toggle sidebar |
| `Cmd/Ctrl + Shift + E` | Show Files tab |
| `Cmd/Ctrl + Shift + O` | Show Outline tab |
| `Cmd/Ctrl + Shift + F` | Show Search tab |
| `Cmd/Ctrl + P` | Quick Open (fuzzy filename palette) |
| `F8` | Focus Mode toggle |
| `F9` | Typewriter Mode toggle |

### Find
| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + F` | Find |
| `Cmd/Ctrl + Alt + F` | Find and Replace |
| `Cmd/Ctrl + G` | Find Next |
| `Cmd/Ctrl + Shift + G` | Find Previous |
| `Esc` | Close Find panel |

## Project Structure

```
electron/                    Main process (Node)
├── main.ts                  BrowserWindow entry + before-quit / window-all-closed
├── menu.ts                  Native menu (localized)
├── ipc.ts                   IPC handler registry
├── preload.ts               contextBridge IPC bridge
├── preferences.ts           JSON-backed prefs
├── closeGuard.ts            Save?-prompt-driven close with 30s timeout
├── fs.ts                    Per-root file watchers
├── pdf.ts                   Offscreen printToPDF
├── pandoc.ts                detect / runPandoc / Homebrew install / DOCX import
├── bibliography.ts          .bib auto-discovery (32-level walk)
├── customCss.ts             Custom CSS file watcher
├── images.ts                Image paste / drop save
├── macros.ts                Macros JSON loader / watcher
├── git.ts                   simple-git status
├── search.ts                Cross-file workspace search
├── spellCheck.ts            Electron spellchecker integration
├── i18n.ts                  Korean / English menu strings
└── autoUpdater.ts           electron-updater wrapper

src/                         Renderer (React + CodeMirror 6)
├── App.tsx                  Top-level layout + menu dispatcher
├── main.tsx                 React root + LanguageProvider
├── editor/
│   ├── MarkdownEditor.tsx   CM6 React wrapper
│   ├── markdownExt/         Custom lezer parsers (frontMatter / footnote /
│   │                        toc / inlineExtras / citation / comments)
│   ├── decorations/         Live-preview decorations (one file per construct)
│   ├── keymap/              Keyboard / toggle helpers + macros + wrapComment
│   ├── math/scan.ts         Inline / block math scanner
│   ├── mermaid/renderer.ts  Singleton async Mermaid renderer
│   ├── imagePaste.ts        Paste / drop handler
│   ├── outline.ts           parseHeadings + buildOutlineTree
│   ├── outlineRewrite.ts    Drag-to-reorder section rewrite
│   ├── jumpToLine.ts        Cursor + scrollIntoView helper
│   ├── openSearch.ts        Search panel openers
│   ├── viewModes.ts         Focus / Typewriter modes
│   └── theme.ts             CM6 theme via CSS variables
├── components/
│   ├── Sidebar.tsx          Collapsible shell, 4 tabs
│   ├── sidebar/             FileTree, WorkspaceRoot, FileTreeNode, Outline,
│   │                        OutlineItem, SearchTab, CommentsTab
│   ├── QuickOpen.tsx        Cmd/Ctrl+P fuzzy file palette
│   ├── PandocInstallDialog.tsx
│   ├── SettingsDialog.tsx
│   └── StatusBar.tsx        Word/char/reading-time + memo count
├── hooks/                   useFolderTree / useDocOutline / useDocComments /
│                            useActiveHeading
├── store/                   zustand stores (appStore, sidebarStore)
├── export/                  markdown-it pipeline + KaTeX + Mermaid +
│                            BibTeX renderer + escapeHtml + slug
├── i18n/                    dict.ts + t.ts (en + ko)
└── styles/                  Global CSS, light/dark tokens, git status dots,
                             memo chip colors

shared/
├── ipc-contract.ts          IPC types shared by main and renderer
├── frontMatter.ts           YAML extractor
├── bibtex.ts                BibTeX parser + indexer
├── citation.ts              Vancouver formatter + key collector
├── manuscriptTemplates.ts   IMRaD / CONSORT / PRISMA / CARE / STROBE
└── comments.ts              %% memo %% parser + strip / promote (single
                             source of truth for editor + export)

build/
├── icon.svg                 Master logo (origami crane on 한지 paper)
└── icon.png                 1024×1024 app icon (rendered from icon.svg)

tests/                       Vitest unit tests (643)
e2e/                         Playwright Electron tests (16)
docs/
├── durumi-markdown-reference.md   Korean markdown reference (954 lines)
├── typora-spec.md           Typora 1.13 parity spec
├── PROGRESS.md              Progress tracker + roadmap
└── RELEASE.md               Signing + auto-update runbook
```

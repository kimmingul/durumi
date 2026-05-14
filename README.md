# Durumi

> **Durumi** (두루미, *Korean for crane*) — a paper crane for medical research.

A cross-platform markdown editor (macOS + Windows 11) that grows from a Typora-style live-preview editor into an end-to-end manuscript studio for medical researchers. The crane (학, 鶴) is also a homophone for *learning* (學) — the brand carries the dual meaning of scholarship and the origami crane folded for someone's healing.

**Current version: v0.2.2.** Highlights since v0.1.8.3:

- **v0.2.x — Hardening cycle** *(v0.2.0 → v0.2.2 + post-release refactor/perf gates)*: data-integrity and security pass driven by an external code review. Atomic markdown body writes, CriticMarkup HTML-escape, path-scoped IPC validation, honest AI-key plaintext indicator, no-side-effect bibliography bind, Electron `sandbox: true`, and a custom `durumi-asset://` protocol that fixes a long-standing image-render bug. Plus an App.tsx + electron/ipc.ts decomposition (906→246 / 889→39+10 modules), a 43% main-chunk shrink (3.06 MB → 1.74 MB), and a signed-release runbook. See [docs/v0.2-hardening.md](docs/v0.2-hardening.md) for the full ledger and [docs/image-rendering.md](docs/image-rendering.md) for the image-fix engineering case study.
- **v0.1.13 — Mode rename**: the three modes get user-friendly Durumi-native names instead of borrowed product names. `WYSIWYG → Document / 문서`, `Typora-style → Live / 라이브`, `Markdown source → Source / 소스`. Status-bar icons become D / L / S. Internal `prefs.editor.defaultMode` keys (`wysiwyg | typora | markdown`) stay unchanged for back-compat.
- **v0.1.12 — Document mode strict-literal**: typing markdown markers in Document mode auto-escapes them so `#`, `*`, `[` etc. stay literal characters; toolbar / shortcuts are the only path to real formatting. Active-line invariant relaxed so Document mode renders the same on every line regardless of the caret position.
- **v0.1.11 — Three-mode editor**: Document (default, Word-like) / Live (the v0.1.0~v0.1.10 live-preview behaviour) / Source (plain markdown). Switch via the status-bar D/L/S segmented control or `Cmd+Shift+1/2/3`. Document mode ships with a formatting toolbar and six journal-flavoured style presets (Durumi default / Classic manuscript / Nature / Lancet / JKMS / Comfortable draft).
- **v0.1.10 — Reference workflow refinements**: 검토 menu split into 검토 / 참고문헌 / AI 작성 도우미 top-level menus; smart-merge of adjacent `[@a; @b]` citations; DOI dedup with row highlight; Crossref abstract auto-saved to `reference/<key>.md` on add; 8-option sort dropdown in the references sidebar.
- **v0.1.9 — Reference docs**: comprehensive `docs/reference-management.md` user guide.
- **v0.1.8.4** — Right sidebar split (References + AI moved out of the left sidebar into a dedicated right pane with independent visibility / width).

## Features

### Three edit modes (v0.1.11, renamed in v0.1.13)

The editor wears three faces. Switch via status-bar D/L/S segmented control, the View → Edit Mode submenu, or keyboard:

- **Document / 문서** *(default, `Cmd/Ctrl + Shift + 1`)* — MS Word-style. Markdown markers never visible. Formatting via toolbar (Style / Inline / List / Insert / Review groups) or shortcuts. Typing `#`, `*`, `[`, `<` auto-escapes so the characters stay literal — toolbar and `Cmd+B` / `Cmd+1` etc. are the only path to real formatting. v0.1.12 narrows the v0.1.0 active-line invariant so widgets (image, math, mermaid, table, taskList, HR, citation pill, footnote pill, frontMatter) render on every line, including the one the caret is on.
- **Live / 라이브** *(`Cmd/Ctrl + Shift + 2`)* — the v0.1.0~v0.1.10 live-preview default. Markdown rendered on inactive lines; raw source shown on the active line so you can edit markers.
- **Source / 소스** *(`Cmd/Ctrl + Shift + 3`)* — plain markdown with syntax highlighting. Live-preview decorations off entirely.

`Cmd/Ctrl + /` toggles between Source and the previously-used mode. Default mode persists in `prefs.editor.defaultMode` (internal values stay `wysiwyg | typora | markdown` for back-compat).

See [docs/editor-modes.md](docs/editor-modes.md) for the full user guide, FAQ, and IME-safety notes.

### Document style presets (v0.1.11)

Settings → "문서 스타일 / Document Styles" gives 10 per-entry style rows (body, H1-H6, blockquote, code, table header — each with font family / size / weight / colour / line-height) plus six pre-built journal-flavoured presets:

| Preset | Body |
|:--|:--|
| Durumi default | Inter 16px, 1.6 (the on-screen default) |
| Classic manuscript | Times New Roman 12pt, 2.0 (double-spaced, NEJM/JAMA submission feel) |
| Nature-style | Helvetica 14px, 1.5 |
| Lancet-style | Georgia 14px, 1.55 |
| JKMS / Korean Medical | Noto Serif KR 16px, 1.7 |
| Comfortable draft | Atkinson Hyperlegible 17px, 1.75 |

Styles apply live through 50 CSS custom properties on `:root` — the editor and the HTML/PDF export pipeline see the same variables. Reset-to-default button restores the Durumi preset. Names are *display* hints only; submission formatting still goes through the export pipeline.

### Live preview — Markdown coverage

Built on CodeMirror 6 + `@lezer/markdown` + GFM. v0.1.0~v0.1.11 enforced "no `Decoration.replace` on the active line" to protect IME composition; v0.1.12 narrows this to **Live mode only** — Document mode renders uniformly across active and inactive lines (CodeMirror 6's composition handling is trusted; punctuation markers don't carry IME composition targets anyway).

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

### Manuscript memos (Word-style review notes)

Word-style review notes embedded in the markdown source — extended through v0.1.3 and v0.1.4 into a full review surface.

**Source syntax (still the anchor — unchanged since v0.1.2):**

- Inline `%% memo %%` and block `%%\n…\n%%`
- Optional tag prefix: `%% @ai stats agent must verify %%`, `%% @todo add p-values %%`, `%% @reviewer cohort question %%`, `%% @stats run Wilcoxon %%`
- Known tags get distinct colors (blue / orange / green / purple); unknown tags fall back to neutral gray
- `Cmd/Ctrl + Alt + M` wraps the current selection (or inserts an empty memo)
- **Default-strip on export** — memos never leak to HTML / PDF / DOCX / LaTeX. A "메모 포함" toggle in Settings promotes them to visible blockquotes when transparency is wanted

**MS Word-style chat panel (v0.1.3):**

- Memo body text is hidden inline; a right-side chat panel shows each memo as a card on its own row, vertically aligned with the source line
- The line-end marker collapses to a small color-coded `💬` icon — click it to focus the matching card
- Panel auto-shows when the document has at least one memo; close with the panel's `×` or toggle with `Cmd/Ctrl + Shift + M`
- Each card has a tag dropdown, an auto-grow textarea, and a delete button — edits sync card ↔ markdown source through a 300 ms debounce
- Panel width persisted to prefs (default 320 px)
- Discovery: native **검토 / Review** menu and editor right-click context menu both expose 메모 추가 and 메모 패널 표시/숨기기

**Threading + author + timestamps + resolved + grouping (v0.1.4 Track A):**

- Each memo gets author chip, relative timestamp ("3h ago" / "3시간 전"), a resolved checkbox, and a Reply thread underneath
- Group-by dropdown: 라인 순 / 태그별 / 작성자별 / 상태별; hide-resolved toggle (default ON)
- Settings → "Author / 작성자" lets you set the name that gets stamped on new memos / replies
- The augmenting metadata (author, replies, timestamps, resolved state) lives in a sidecar JSON file `<doc>.md.comments.json` next to the markdown — atomic-write with 1 s debounce. The markdown body itself remains the source of truth, so a v0.1.2 reader (or any non-Durumi tool) still sees every memo

### Track changes (CriticMarkup)

Five [Fletcher CriticMarkup](https://fletcher.github.io/MultiMarkdown-6/syntax/critic.html) operators, end-to-end (added in v0.1.4 Track B).

| Syntax | Meaning | Editor rendering |
| :--- | :--- | :--- |
| `{++ added text ++}` | insertion | green underline |
| `{-- deleted text --}` | deletion | red strikethrough |
| `{~~ old ~> new ~~}` | substitution | red-strike old + arrow + green-underline new |
| `{== marked ==}` | review-highlight | distinct heavier-yellow tint |
| `{>> short comment <<}` | margin comment | purple `💬` pill widget |

- 5th sidebar tab **변경 / Changes** groups annotations by kind; click → jump
- Status bar adds `+N -N ~N ▮N 💬N` badges next to the memo counter when CM count > 0
- **Export modes**:
  - *Accept all changes* (default) — clean, submission-ready output. `{++ ++}` / `{~~ ~> ~~}` collapse to the new text; `{-- --}` and `{>> <<}` disappear; `{== ==}` is unwrapped
  - *Preserve annotations* (Settings → "Include track-changes annotations") — emits `<ins>` / `<del>` / `<mark>` / `<aside>` for HTML/PDF, or Pandoc-styled spans `[text]{.insertion/.deletion/.highlight}` and a `::: comment` fenced div for DOCX/LaTeX
- **`==text==` vs `{== ==}`**: `==text==` (existing inlineExtras) is *permanent highlight* in the rendered document; `{== ==}` is a *review mark* that gets accepted-out by default on export. They render with deliberately different yellows so you can distinguish at a glance
- Entry points: 검토 메뉴 → 변경 추적 ▶ submenu, or right-click in the editor → 변경 추적 ▶. No keyboard shortcut by design (5 operators × 3 modifiers would crowd the chord space).

### Citations & bibliography

- Pandoc-style `[@key]` / `[@a; @b]` / `[-@key]` / `[@key, p. 33]` syntax
- BibTeX auto-discovery — walks up to 32 directories looking for `references.bib`, `references.bibtex`, `bibliography.bib`; or set `bibliography:` in YAML front matter
- HTML/PDF export: numbered `<sup>`-link citations + Vancouver-style `<section class="references">` auto-appended
- Missing keys surface as red `[?]` markers
- DOCX/LaTeX exports route through Pandoc citeproc with `csl: …` front-matter key when more styles are needed

**v0.1.7 editor integration:**

- `[@`-autocomplete in the editor — typing `[@` surfaces a fuzzy drop-down of every key in `references.bib`; Enter inserts `[@key]` with the closing bracket
- Hover tooltip over `[@key]` — shows title / author / venue / DOI; "📄 Open file" button when a local PDF/MD is saved
- `Cmd/Ctrl + Shift + I` "Insert citation" palette — Quick-Open-style fuzzy filter over the live `.bib` keys

**v0.1.7.1 editing affordances:**

- Sidebar entry rows gain ✎ (edit) / 🔑 (rename key) / ✕ (delete) buttons
- Rename: atomic — bib write + a single CodeMirror transaction that migrates every `[@oldKey]` in the active document (undo as one unit)
- Bulk DOI add — paste a list (newline / comma / semicolon separated); sequential through Crossref with live per-row status
- Import from `.bib` / `.ris` — Zotero / EndNote / RefWorks / Web of Science exports with collision modes (rename / skip / replace) and preview

### Live reference search (v0.1.6)

- **Crossref / PubMed / KoreaMed** keyword search in the 참고문헌 sidebar tab (300 ms debounce, source dropdown, "추가" button per result)
- **DOI → BibTeX** via `Cmd/Ctrl + Shift + B` — paste a DOI, preview the resolved entry, confirm to append to `references.bib` and insert `[@key]` at the editor caret
- **ORCID iD verification** in Settings — `pub.orcid.org/v3.0/{iD}/record` resolves the credit name + first employment + works count inline
- **KoreaMed** uses HTML scraping of `SearchBasic.php` (the official OpenAPI is intermittent); per-field regex with synthetic-HTML tests so a parser regression is caught locally even when the live site is unreachable
- All outbound HTTP runs in the main process; the renderer never makes a network call (CORS, User-Agent, polite-pool email, API keys all live in main)
- Explicit opt-in: every call is initiated by an explicit user click — no background prefetch
- Offline-aware: an "오프라인" badge disables remote search while keeping local entries fully usable

### Local reference library (v0.1.7)

Each entry can mirror to a local PDF (open access) or a Markdown abstract (otherwise), viewable inline from the editor.

- Download flow: Crossref `link[]` → PMC → Unpaywall → HTML scrape (Turndown) → abstract-only stub. Always produces something (the user is never left empty-handed).
- Files land in `<doc-folder>/reference/<key>.{pdf,md}`; the bib entry's `file` field gets a POSIX-relative path that round-trips across machines
- **Bidirectional sync**: files the user drops into `reference/` (Finder copy, git pull, Zotero export) appear in the sidebar's "📁 미등록 파일" section with a one-click "Register" flow — DOI auto-extracted from the PDF (pdfjs-dist, lazy-loaded), or a manual-entry modal when no DOI is found
- Open PDFs / MDs in the system default app from the sidebar 📄/📝 badge or the `[@key]` hover tooltip's "Open file" button

### AI assist (v0.1.8 series)

Two providers behind one shape — Anthropic Messages API and OpenAI-compatible chat completions (covers OpenAI, Ollama, LM Studio, any self-hosted compatible endpoint via custom base URL). API keys live encrypted at rest via Electron's `safeStorage`; the renderer never sees plaintext.

**Selection rewrite palette** (`Cmd/Ctrl + Shift + /`): seven commands — Polish English / Tighten / Expand / Simplify / Academic tone / Translate to Korean / Translate to English. Before/after preview with token usage; Accept replaces the selection in place.

**Citation suggestion**: 검토 → "AI: 현재 단락에 인용 제안" reads the paragraph at the caret + a compact slice of `references.bib` (capped at 60 entries; v0.1.8.2 enriches each entry with the first ~3 pages of its local PDF when available). Returns STRICT JSON; a hallucination guard drops any candidate whose key isn't in the live bibliography set.

**Inline ghost-text completion** (off by default; opt in via Settings): 1–2 sentence continuations appear as gray italic text at the end of a paragraph when the user idles. Tab accepts; Esc / typing / selection change clears. Per-session cap (default 100) bounds runaway cost.

**AI usage + cost dashboard**: every successful AI call records into a localStorage-backed log (last 200 calls + per-model + per-source lifetime totals). Settings → "AI 사용량" shows summary pills (calls / tokens / cost), by-model + by-source tables, and a Reset button.

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

### Sidebars (left 5 tabs + right 2 tabs, v0.1.8.4)

The left and right sidebars are independent — each has its own visibility toggle, active tab, and width. The right sidebar opens via `Cmd/Ctrl + Shift + \`.

**Left sidebar (5 tabs)** — file navigation / review:

- **Files** — multi-folder workspace; per-root `fs.watch`; `.md` filter; lazy expansion; right-click context menu (new file / new folder / rename / duplicate / move to trash / reveal / copy path); git status indicators (modified / added / untracked / deleted / renamed; aggregated to parent folders)
- **Outline** — heading tree of the current document with active-heading highlight that follows the editor viewport; **drag-to-reorder sections** (rewrites the markdown source)
- **Search** — across-file workspace search with case / whole-word / regex filters; results grouped by file; click jumps to line. Excludes `.git`, `node_modules`, files > 1 MB, binaries
- **메모 / Memos** — aggregated `%% %%` notes across the current document; click to focus the chat-panel card
- **변경 / Changes** — aggregated CriticMarkup annotations grouped by kind (insertion / deletion / substitution / highlight / comment); click → jump

**Right sidebar (2 tabs)** — authoring assistance:

- **참고문헌 / References** (v0.1.6+) — Crossref / PubMed / KoreaMed search; local `.bib` entries with file-status badges and ✎ / 🔑 / ✕ actions; "📁 미등록 파일" section for orphan PDFs / MDs the user dropped in. **v0.1.10**: 8-option sort dropdown (added/author/year/key/citation-order/uncited-first), Shift-click on search-card 추가 = add + insert `[@key]`, DOI dedup highlights existing row when a duplicate is rejected
- **AI** (v0.1.8.3) — provider status, quick selection commands, citation actions, session usage stats, recent activity log

Drag-handle resize on both; persisted state (visibility, active tab, width, all open workspace folders).

### Document-mode formatting toolbar (v0.1.11)

Visible only in Document mode — a 36px toolbar above the editor, five button groups:

| Group | Buttons |
|:--|:--|
| Style | Style dropdown (Body / H1-H6 / Blockquote / Code block — auto-syncs to caret) |
| Inline | Bold / Italic / Strike / Inline code / **Superscript** / **Subscript** *(raw `<sup>/<sub>` HTML inline)* |
| List | Bulleted / Numbered / Task / Indent / Outdent |
| Insert | Link / Image (OS picker) / Table / Math (`$$\n\n$$`) / Footnote (auto-numbered) / Citation (opens cite palette) |
| Review | CriticMarkup highlight / Memo / Track-change toggle |

No new icon dependency — unicode glyphs only.

### Reference workflow (v0.1.6 ~ v0.1.10)

Beyond the live search + local library shipped in v0.1.6/v0.1.7, v0.1.10 added:

- **Body-insert toggle on add**: `InsertCitationDialog` gains a `☐ 본문에도 [@key] 삽입` checkbox (default OFF, seeded by `prefs.bibliography.insertCitationOnAdd`). Toolbar Citation button + Shift-click on search-card 추가 do the "add + insert" path.
- **Smart-merge of adjacent cite groups**: inserting `[@b]` next to `[@a]` produces `[@a; @b]`; inserting a key already in the adjacent group is rejected with the "이미 인용되어 있습니다" toast.
- **Crossref abstract auto-save** (default ON): adding a reference writes `reference/<key>.md` from the Crossref `abstract` (or a metadata stub) so you have a one-click target before the PDF is fetched.
- **DOI-based dedup**: `appendEntry` normalises DOIs and rejects duplicates with the existing key surfaced; missing-DOI weak match (title + first-author + year) prompts before re-adding.
- **Top-level "참고문헌" + "AI 작성 도우미" menus** split out from the legacy 검토 menu so the menu bar matches the actual feature surface.

### Quick Open & navigation

- `Cmd/Ctrl + P` — fuzzy filename palette across all workspace folders (fzf-style scoring; up to 50 results ranked by score then by recency)
- `Cmd/Ctrl + Shift + I` — Insert citation palette (fuzzy search over `references.bib` keys)
- `Cmd/Ctrl + Shift + B` — Insert citation from DOI
- `Cmd/Ctrl + Shift + /` — AI assist on selection (palette)
- `Cmd/Ctrl + F` / `Cmd/Ctrl + Alt + F` — Find / Find and Replace via CodeMirror's themed search panel
- `F1` — Keyboard shortcuts dialog (searchable list of every binding)
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
- **Settings dialog** — theme, language, Pandoc binary path, Word style reference, LaTeX template, spell-check languages, custom dictionary, "Include memos in export", "Include track-changes annotations" (CriticMarkup preserve mode), "Author / 작성자" name, **AI provider + API key + model + ghost-text toggle**, **AI usage dashboard** with per-model / per-source breakdown, **참고문헌 (Crossref email, NCBI key, ORCID iD)**

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

- **[docs/editor-modes.md](docs/editor-modes.md)** — 3-mode editor (Document / Live / Source) user guide: switching, IME safety, style presets, FAQ
- **[docs/document-mode-test.md](docs/document-mode-test.md)** — comprehensive Document-mode regression-test fixture covering every widget + IME composition scenarios
- **[docs/reference-management.md](docs/reference-management.md)** — 참고문헌 관리 가이드 (Korean): add flow, local PDF/MD library, smart-merge, sort options, key rename, AI suggestion, shortcuts (v0.1.10)
- **[docs/durumi-markdown-reference.md](docs/durumi-markdown-reference.md)** — comprehensive Korean markdown reference (Typora 1.13 baseline + Durumi extensions: citations, memos, manuscript metadata, KaTeX coverage, export pipeline, shortcut tables)
- **[docs/typora-spec.md](docs/typora-spec.md)** — Typora 1.13 parity spec (Phases A/B/C, deliberate non-goals, references)
- **[docs/PROGRESS.md](docs/PROGRESS.md)** — release tracker for every version + roadmap
- **[docs/RELEASE.md](docs/RELEASE.md)** — signing posture + auto-update runbook

## Recent additions

- **v0.1.13** — Mode rename: `WYSIWYG → Document / 문서`, `Typora-style → Live / 라이브`, `Markdown source → Source / 소스`. Status-bar segmented control letters: `W/T/M → D/L/S`. Internal prefs keys unchanged for back-compat.
- **v0.1.12** — Document-mode strict-literal escape filter; v0.1.0 active-line invariant narrowed so Document mode renders uniformly across active/inactive lines; menu i18n consolidated into a single `shared/menuLabels.ts` source of truth
- **v0.1.11** — Three-mode editor (Document default / Live / Source); status-bar D/L/S segmented control + `Cmd+Shift+1/2/3`; Document-mode formatting toolbar; six journal-flavoured style presets with reset-to-default
- **v0.1.10** — Reference workflow refinements: split 검토 menu into 참고문헌 + AI 작성 도우미 top-level menus; smart-merge `[@a; @b]`; DOI dedup with sidebar row highlight; Crossref abstract auto-save on add; 8-option sort dropdown
- **v0.1.9** — Comprehensive `docs/reference-management.md` user guide
- **v0.1.8.4** — Left + right sidebar split (References + AI moved to a dedicated right pane with independent visibility / width)
- **v0.1.8.3** — AI sidebar tab consolidates the AI entry points; F1 keyboard-shortcuts dialog; Korean i18n polish pass
- **v0.1.8.2** — pdfjs-dist replaces the regex-on-raw-bytes PDF scanner; DOI extraction now finds DOIs in compressed content streams; citation suggestion enriches each candidate with the first ~3 pages of its local PDF
- **v0.1.8.1** — Atomic citation-key rename across bib + active doc; AI usage + cost dashboard (localStorage-backed); inline ghost-text completion (off by default, opt in via Settings)
- **v0.1.8** — LLM client with safeStorage-encrypted keys; selection rewrite palette (`Cmd/Ctrl + Shift + /`); AI citation suggestion with hallucination guard against the live bibliography set
- **v0.1.7.1** — Entry edit / delete in the references sidebar; bulk DOI add (paste a list, sequential through Crossref); `.bib` / `.ris` import with collision handling
- **v0.1.7** — `[@`-autocomplete + hover tooltip + local PDF/MD download pipeline (Crossref link → PMC → Unpaywall → HTML scrape → abstract stub); bidirectional `reference/` folder sync; orphan-file registration with auto-DOI extraction
- **v0.1.6** — Live reference search (Crossref / PubMed / KoreaMed / ORCID); DOI → BibTeX via `Cmd/Ctrl + Shift + B`; Settings 참고문헌 section
- **v0.1.5** — Native **검토 / Review** menu and editor right-click context menu; next/prev memo (`F3` / `Shift + F3`)
- **v0.1.4** — CriticMarkup track-changes (5 operators) + memo threading with sidecar JSON metadata
- **v0.1.3** — MS Word-style memo chat panel

## Roadmap — vision toward a manuscript studio

The features below build on the v0.1.12 foundation. Items 1 + 2 are shipped:

### ✓ 1 — Live reference search (shipped in v0.1.6)
- API integrations: PubMed, KoreaMed, Crossref, ORCID
- DOI → metadata resolution; one-click cite-and-insert into the local BibTeX

### ✓ 2 — AI-assisted writing (shipped in v0.1.8 series)
- Selection rewrite palette (7 commands: polish / tighten / expand / simplify / academic tone / Ko/En translation)
- Citation suggestion grounded in the local `references.bib` + local PDF excerpts (v0.1.8.2 enriches with pdfjs-dist body text)
- Inline ghost-text completion (off by default; per-session cap bounds cost)
- Usage + cost dashboard with per-model + per-source breakdown

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

### 7 — Real code-signing
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
pnpm make:mac           # produce dist-build/Durumi-0.1.13-*.dmg (run on macOS)
pnpm make:win           # produce dist-build/Durumi Setup 0.1.13.exe (run on Windows 11)
```

See [docs/RELEASE.md](docs/RELEASE.md) for the release runbook (CI workflow, signing posture, auto-update setup).

## Test

```bash
pnpm typecheck          # 0 errors expected
pnpm lint               # 0 errors / 0 warnings expected
pnpm test               # 1250 Vitest unit tests (v0.1.13)
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

### Edit mode (v0.1.11)
| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + Shift + 1` | Document mode (문서) |
| `Cmd/Ctrl + Shift + 2` | Live mode (라이브) |
| `Cmd/Ctrl + Shift + 3` | Source mode (소스) |
| `Cmd/Ctrl + /` | Toggle Source ↔ previous mode |

### View / sidebar
| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + \` | Toggle left sidebar |
| `Cmd/Ctrl + Shift + \` | Toggle right sidebar (References / AI) |
| `Cmd/Ctrl + Shift + E` | Show Files tab |
| `Cmd/Ctrl + Shift + O` | Show Outline tab |
| `Cmd/Ctrl + Shift + F` | Show Search tab |
| `Cmd/Ctrl + Shift + M` | Toggle memo chat panel (검토 menu) |
| `Cmd/Ctrl + P` | Quick Open (fuzzy filename palette) |
| `F1` | Keyboard shortcuts dialog |
| `F3` | 다음 메모로 이동 (Next memo, wrap-around) |
| `Shift + F3` | 이전 메모로 이동 (Previous memo, wrap-around) |
| `F8` | Focus Mode toggle |
| `F9` | Typewriter Mode toggle |

### Citations & AI assist (v0.1.6 – v0.1.12)
| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + Shift + B` | Add reference from DOI (Crossref) |
| `Cmd/Ctrl + Shift + I` | Insert citation into text (fuzzy palette over `references.bib`) |
| `Cmd/Ctrl + Shift + /` | Polish selection with AI (palette) |
| `Tab` | Accept inline ghost-text suggestion (when present) |
| `Esc` | Dismiss ghost text / close palettes |

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
├── contextMenu.ts           Editor right-click menu (cut/copy/paste +
│                            메모 추가 + 변경 추적 ▶ + link insert +
│                            spell-check suggestions); rebuilt per popup
├── i18n.ts                  Korean / English menu strings
└── autoUpdater.ts           electron-updater wrapper

src/                         Renderer (React + CodeMirror 6)
├── App.tsx                  Top-level layout + menu dispatcher
├── main.tsx                 React root + LanguageProvider
├── editor/
│   ├── MarkdownEditor.tsx   CM6 React wrapper
│   ├── markdownExt/         Custom lezer parsers (frontMatter / footnote /
│   │                        toc / inlineExtras / citation / comments /
│   │                        criticMarkup)
│   ├── decorations/         Live-preview decorations (one file per construct,
│   │                        including criticMarkup for the 5 CM operators)
│   ├── keymap/              Keyboard / toggle helpers + macros + wrapComment
│   │                        + wrapCriticMarkup (5 wrap fns) + memoNav
│   │                        (next/prev memo with wrap-around)
│   ├── math/scan.ts         Inline / block math scanner
│   ├── mermaid/renderer.ts  Singleton async Mermaid renderer
│   ├── imagePaste.ts        Paste / drop handler
│   ├── outline.ts           parseHeadings + buildOutlineTree
│   ├── outlineRewrite.ts    Drag-to-reorder section rewrite
│   ├── jumpToLine.ts        Cursor + scrollIntoView helper
│   ├── openSearch.ts        Search panel openers
│   ├── viewModes.ts         Focus / Typewriter modes
│   ├── editMode.ts          v0.1.11 — Document / Live / Source state (internal ids: wysiwyg / typora / markdown)
│   ├── wysiwygEscape.ts     v0.1.12 — strict-literal markdown escape filter
│   └── theme.ts             CM6 theme via CSS variables
├── components/
│   ├── Sidebar.tsx          Left sidebar shell (5 tabs)
│   ├── RightSidebar.tsx     Right sidebar shell (v0.1.8.4 — 2 tabs)
│   ├── sidebar/             FileTree, WorkspaceRoot, FileTreeNode, Outline,
│   │                        OutlineItem, SearchTab, CommentsTab, ChangesTab,
│   │                        ReferencesTab, referenceSort.ts (v0.1.10)
│   ├── MemoPanel.tsx        Right-side chat panel host
│   ├── MemoCard.tsx         Per-memo card (header / textarea / replies)
│   ├── EditorToolbar.tsx    v0.1.11 — Document-mode formatting toolbar
│   ├── QuickOpen.tsx        Cmd/Ctrl+P fuzzy file palette
│   ├── PandocInstallDialog.tsx
│   ├── SettingsDialog.tsx
│   └── StatusBar.tsx        Word/char + memo count + CM badges +
│                            v0.1.11 W/T/M edit-mode segmented control
├── hooks/                   useFolderTree / useDocOutline / useDocComments /
│                            useActiveHeading / useMemoSync /
│                            useMemoCaretFocus / useMemoMeta /
│                            useDocCriticMarkup
├── store/                   zustand stores (appStore including editMode,
│                            sidebarStore, rightSidebarStore (v0.1.8.4),
│                            memoSidecarStore, bibliographyStore)
├── utils/                   relativeTime.ts (i18n-aware "3h ago" / "3시간 전")
├── export/                  markdown-it pipeline + KaTeX + Mermaid +
│                            BibTeX renderer + escapeHtml + slug
├── i18n/                    dict.ts + t.ts (en + ko) — menu.* sourced from
│                            `shared/menuLabels.ts` (v0.1.12)
└── styles/                  Global CSS, light/dark tokens, git status dots,
                             memo chip colors, CriticMarkup decoration colors,
                             journalPresets.ts (v0.1.11), applyStyles.ts

shared/
├── ipc-contract.ts          IPC types shared by main and renderer
├── menuLabels.ts            Native-menu i18n source of truth (v0.1.12)
├── frontMatter.ts           YAML extractor
├── bibtex.ts                BibTeX parser + indexer
├── citation.ts              Vancouver formatter + key collector
├── citationMerge.ts         Smart-merge `[@a; @b]` helper (v0.1.10)
├── manuscriptTemplates.ts   IMRaD / CONSORT / PRISMA / CARE / STROBE
├── comments.ts              %% memo %% parser + strip / promote +
│                            replaceMemo helper (single source of truth
│                            for editor + export)
├── memoSidecar.ts           <doc>.md.comments.json schema + pure update fns
│                            (memoIdFor, ensureMeta, migrateMemoMeta,
│                            pruneOrphans, setResolved, addReply, …)
└── criticMarkup.ts          5-operator parser + transformCm for export
                             (accept-all-changes vs preserve modes)

build/
├── icon.svg                 Master logo (origami crane on 한지 paper)
└── icon.png                 1024×1024 app icon (rendered from icon.svg)

tests/                       Vitest unit tests (1250 in v0.1.13)
e2e/                         Playwright Electron tests (16)
docs/
├── durumi-markdown-reference.md   Korean markdown reference (~1311 lines)
├── editor-modes.md          3-mode editor guide (Document/Live/Source)
├── reference-management.md  Reference workflow user guide (v0.1.10)
├── document-mode-test.md    Document-mode regression-test fixture
├── typora-spec.md           Typora 1.13 parity spec
├── PROGRESS.md              Progress tracker + roadmap
└── RELEASE.md               Signing + auto-update runbook
```

### Subsystems added since v0.1.5

```
electron/
├── bibliographyFetch.ts     Crossref / PubMed / KoreaMed / ORCID HTTP adapter
├── bibliographyWrite.ts     Atomic .bib writer (append / upsert / rename / remove)
├── referenceFs.ts           reference/ folder layout + status probe + scan
├── referenceDownload.ts     Download pipeline (Crossref link → PMC → Unpaywall → MD)
├── referenceImport.ts       Orphan-file DOI extraction + manual entry build
├── pdfText.ts               pdfjs-dist text extraction (lazy-loaded)
├── aiClient.ts              Anthropic + OpenAI-compatible LLM client
└── aiKeys.ts                safeStorage-backed key vault

src/
├── components/
│   ├── AiCommandPalette.tsx       Cmd+Shift+/ selection rewrite palette
│   ├── CitationSuggestPanel.tsx   AI citation suggestion with hallucination guard
│   ├── CitePalette.tsx            Cmd+Shift+I fuzzy palette over local entries
│   ├── InsertCitationDialog.tsx   Cmd+Shift+B DOI → BibTeX modal
│   ├── BulkDoiDialog.tsx          Paste-many-DOIs flow
│   ├── EditEntryDialog.tsx        Full-field bib entry editor
│   ├── RenameKeyDialog.tsx        Atomic citation-key rename
│   ├── OrphanRegisterDialog.tsx   Manual metadata entry for orphan files
│   ├── ImportReferencesDialog.tsx .bib / .ris import preview + collision picker
│   ├── KeyboardShortcutsDialog.tsx Searchable shortcut reference (F1)
│   ├── AiUsageDashboard.tsx       Settings panel — usage + cost breakdown
│   └── sidebar/
│       ├── ReferencesTab.tsx      v0.1.6+ — search + local entries + orphans
│       └── AiTab.tsx              v0.1.8.3 — provider, commands, usage
├── editor/
│   ├── autocomplete/
│   │   └── citationAutocomplete.ts  [@-key autocompletion (v0.1.7)
│   ├── decorations/
│   │   └── citationHover.ts         Hover tooltip for [@key]
│   ├── ai/
│   │   └── ghostText.ts             Inline ghost-text extension
│   └── paragraphContext.ts          currentParagraph helper
└── store/
    ├── bibliographyStore.ts         References cache + add/remove/rename/import
    └── aiUsageStore.ts              localStorage-backed AI usage log

shared/
├── bibtex.ts + bibtexWriter.ts      Parser (v0.1.2) + writer (v0.1.6)
├── citationKey.ts                   Cite-key gen (RR Hangul) + rename helper
├── ris.ts                           RIS parser (Zotero/EndNote/RefWorks)
├── aiPrompts.ts                     Selection commands + ghost-text prompt
├── aiCitationSuggest.ts             Suggestion prompt builder + JSON parser
└── aiCost.ts                        Hardcoded price table for 14 models
```

## License & contributing

Durumi is licensed under the **Apache License 2.0** (see [`LICENSE`](LICENSE)).
A copy of the NOTICE is in [`NOTICE`](NOTICE).

**Why Apache 2.0?** Durumi switched from MIT to Apache 2.0 in v0.1.14 to:
- Add an explicit patent grant (protects users from patent claims).
- Make trademark expectations clear ("Durumi" is not granted by the license).
- Pair cleanly with the future server-side codebase, which will be released
  under **AGPL v3** so the planned paid sync / collaboration tier isn't
  cloned and re-hosted by SaaS competitors. The desktop client stays freely
  usable under Apache 2.0; the server-side code that powers sync will be
  AGPL so anyone hosting it must publish their changes back.

This is an **open-core** model. The maintainer (Min-Gul Kim) intends to fund
continued development through a paid hosted-sync / real-time-collab tier on
top of the open-source client.

### Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the dev loop, architectural
invariants, and quality gates.

All contributors must accept the **Individual Contributor License Agreement**
(see [`CLA.md`](CLA.md)). The quickest way is to add a `Signed-off-by:` line
to each commit (`git commit -s`). The CLA grants the maintainer the right to
re-license your contributions, which is what enables the open-core model
above to keep working as the project grows.

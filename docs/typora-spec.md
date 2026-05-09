# Typora 1.13 Parity Spec

**Source of truth:** Typora support docs (support.typora.io) and the
1.13 release notes (2026-04-03). This memo captures the exact syntax
and behavior we will mirror, plus deliberate scope decisions for the
medical-research path.

The phases here mirror the roadmap in `MEMORY` / chat: A is parser
and pipeline foundation, B is medical-workflow critical features,
C is editing-UX parity. After all three phases land we begin
medical-research v1.

---

## Phase A — Parser and pipeline foundation

These features touch the markdown parsing pipeline (`@codemirror/lang-markdown`
+ remark plugins on the export side). Adding them late forces re-flowing
the AST in many places, so we land them first.

### A-1. YAML front matter

Typora behavior:

- Delimited by `---` lines.
- Must be the first thing in the file. Re-typing `---` on the first
  blank line and pressing Enter inserts an empty block in live preview.
- Recognized fields used by Typora: `title`, `author`, `creator`,
  `subject`, `keywords`, `tags`, plus document-config keys
  `typora-root-url`, `typora-copy-images-to`, `header`/`typora-header`,
  `footer`/`typora-footer`, `sidebar`/`typora-sidebar`, `append-head`,
  `append-body`, plus pandoc passthrough (`header-includes`, etc.).
- Variables like `${title}`, `${author}` are substituted into HTML
  exports. Allowing YAML to override export settings is gated by a
  preference ("Read and overwrite export settings from YAML front matter").

Durumi implementation:

- Parse with `js-yaml` (safe load) when the document starts with `---\n`
  ending in a `---` line at column 0.
- Render in the live editor as a folded "Front matter" block (single
  line summary `title — author`) using a CodeMirror block decoration.
  Source mode shows raw YAML.
- Outline view ignores the block (no `#` heading is inferred).
- Export pipeline reads parsed front matter and exposes `${title}`,
  `${author}`, `${subject}`, `${keywords}`, `${date}` to HTML/PDF
  templates. Pandoc-bound formats receive raw YAML so pandoc parses it.
- Out of scope for v1: `typora-root-url`, `typora-copy-images-to`
  (we ship images via `electron/images.ts` already), header/footer
  HTML override (medical-research scope).

### A-2. Footnotes

Typora behavior (from Markdown Reference and MultiMarkdown):

- Definition: `[^fn1]: footnote text` (block-level, can wrap).
- Reference: `[^fn1]` inline; rendered as superscript link.
- Identifier free-form (alphanumeric + `-_`). Numbering in HTML is
  derived from order of first reference, not from the identifier.

Durumi implementation:

- Parse with a CodeMirror MarkdownExtension that recognizes
  `[^id]` references and `[^id]:` definitions. Re-use existing
  inline plugin infrastructure (see `editor/`).
- Live preview: references render as superscript link `<sup>1</sup>`
  with click → jump to definition; definitions render as a
  bottom-of-block list with backlink `↩` per Typora.
- Export: integrate `remark-footnotes` (or our own renderer) so HTML
  export emits the standard `<section class="footnotes">` block with
  GitHub-style anchors `#fn1` / `#fnref1`.
- Status bar shows nothing (Typora does not). Outline ignores.

### A-3. `[toc]` directive

Typora behavior:

- Lowercase `[toc]` on its own line. Auto-updates as headings change.
- Renders the current document's heading tree as a nested list.

Durumi implementation:

- Parser recognizes `^[toc]\s*$` as a block-level directive node.
- Live preview replaces the line with the rendered nested heading
  list (re-using outline data from `editor/outline.ts`).
- Export: HTML emits `<nav class="toc"><ul>…</ul></nav>` linked to
  heading IDs. Pandoc receives `[toc]` rewritten to a literal
  `\tableofcontents` for LaTeX or removed and replaced with
  `--toc` flag for docx.
- Multiple `[toc]` blocks are allowed (Typora behavior).

### A-4. Pandoc adapter layer

Typora behavior:

- All non-PDF/non-HTML exports require a Pandoc binary on PATH.
- Settings page lets the user point at a custom binary path.
- Each format has format-specific options surfaced in dialogs
  (style reference for docx, PDF engine for LaTeX-based PDF, etc.).

Durumi implementation:

- New `electron/pandoc.ts`:
  - `detectPandoc(): Promise<{ binary: string; version: string } | null>`
    — scans `which pandoc` / `where pandoc`, then a configured override
    in preferences, then well-known locations (`/usr/local/bin/pandoc`,
    `/opt/homebrew/bin/pandoc`, `C:\Program Files\Pandoc\pandoc.exe`).
  - `runPandoc(input, args): Promise<Buffer>` — spawns pandoc with
    Markdown on stdin and returns the binary output. Times out at 30 s.
  - `pandocAvailable` is cached at app start; the cache is invalidated
    when the user changes the override path.
- All Pandoc-bound exports route through this module. UI failures
  surface a single "Install Pandoc" dialog with a link to
  https://pandoc.org/installing.html plus a "Set custom path…" button
  that opens preferences.
- Preferences gain a `pandocPath` field (`string | null`).

---

## Phase B — Medical-workflow critical features

### B-1. `.docx` export (Pandoc)

- Pandoc args: `-f markdown+yaml_metadata_block+footnotes -t docx`.
- Optional `--reference-doc=<path>` if user supplies a style reference
  via preferences (`docxStyleReference`). Manuscripts often need
  journal-specific styles, so this matters.
- We pre-convert math via Pandoc's default; KaTeX-only macros that
  Pandoc cannot handle are reported in the warning toast.
- Menu: `File → Export → Word (.docx)…`.

### B-2. `.tex` / LaTeX export (Pandoc)

- Pandoc args: `-f markdown+yaml_metadata_block+footnotes -t latex`.
- Output is the standalone `.tex` file (Pandoc with `-s`).
- YAML keys passed through: `title`, `author`, `date`,
  `header-includes`. We do not ship a custom template in v1; users can
  add their own via preferences (`latexTemplate`).
- Menu: `File → Export → LaTeX (.tex)…`.

### B-3. Word / character / reading-time counter

- Status bar shows three numbers: `1,234 words · 7,890 chars · ~5 min`.
- Computed in the renderer from the editor doc on a 200 ms debounce.
- Word count rules: split by `/\s+/` after stripping markdown syntax
  (heading hashes, list bullets, fence markers, link/image syntax).
  This matches Typora's reported behavior empirically — exact parity
  is not a goal because Typora's algorithm is undocumented.
- Reading time = `ceil(words / 230)` (industry default).
- Toggle visibility via preferences (`statusBarShowCounters`,
  default `true`).

### B-4. Across-file search

- Sidebar gains a third tab next to Files / Outline: "Search".
- Backed by a new `electron/search.ts` that walks workspace folders
  using existing `listDirectory` + a streamed file read.
- Filters: case sensitive, whole word, regex (matches Typora UI).
- Results list grouped by file; clicking a result opens the file and
  jumps to the match line (re-using `MarkdownEditor` line jumping).
- Workspace-relative paths (re-uses `relativeFromRoot` from
  `gitStatus.ts`).
- Excluded: `.git`, `node_modules`, files > 1 MB, binary files
  (heuristic: contains a NUL in first 8 KB).

### B-5. Quick Open (Cmd+Shift+O / Ctrl+P)

- Modal palette overlay. Searches filenames across all workspace
  folders.
- Fuzzy match scoring: subsequence + bonuses for word-start matches
  (`fzf`-style). Reuse a small in-house scorer (no extra dep).
- Up to 50 results, ranked by score then by recency
  (`addRecentFile` order).
- Enter opens the selected file (passes through `maybeDiscard`).
- Esc closes.

### B-6. Spell check

- Electron's built-in spellchecker via
  `webContents.session.setSpellCheckerLanguages([...])`.
- Default language list resolved from OS preference; user can override
  in preferences (`spellCheckLanguages: string[]`).
- Custom dictionary words go through
  `session.addWordToSpellCheckerDictionary`. Stored in preferences
  (`spellCheckCustomWords: string[]`).
- Right-click menu: misspelling shows suggestions + "Add to
  dictionary" / "Ignore in document".
- Code blocks and inline code are excluded by reading the markdown
  AST and skipping ranges (Electron does not support per-range
  exclusion natively, so we will mark the contenteditable mirror
  with `spellcheck="false"` on those nodes — this needs validation
  during implementation).

---

## Phase C — Editing-UX parity

### C-1. Auto pair, smart punctuation, list continuation

- Typora pairs: `()`, `[]`, `{}`, `<>`, quotes; markdown extras
  `*`, `_`, backtick, `~`, `=`, `^`, `$` (last four are wrap-only,
  no auto-close on type — Typora's documented exception).
- Smart quotes: `"` → `“ ”`, `'` → `‘ ’` based on context. Disabled
  by default in Typora (toggle in preferences) — we follow suit.
- List continuation: pressing Enter on a non-empty list item starts
  the next item with the same marker; pressing Enter on an empty
  list item exits the list (already CodeMirror default; we verify
  bullet marker preservation including ordered list increment).
- Toggles (preferences):
  - `autoPair: 'off' | 'brackets-quotes' | 'all'` (default `'all'`)
  - `smartPunctuation: boolean` (default `false`)

### C-2. Focus Mode and Typewriter Mode

- Default shortcuts: F8 (focus), F9 (typewriter) — matching Typora.
- Focus: dim every block except the one containing the caret using
  CodeMirror block decorations + a CSS variable on `.cm-editor`.
- Typewriter: scroll the editor on each selection change so the caret
  line sits at viewport mid-height. Implemented with
  `EditorView.updateListener` calling `view.dispatch({ effects:
  EditorView.scrollIntoView(pos, { y: 'center' }) })`.
- Both modes persisted per-window in preferences
  (`viewModes.focus`, `viewModes.typewriter`).
- Menu: `View → Focus Mode`, `View → Typewriter Mode` (toggle items).

### C-3. Highlight, subscript, superscript

- Highlight: `==text==` → `<mark>text</mark>`.
- Sub: `H~2~O` → `H<sub>2</sub>O`. Note conflict with strikethrough
  (`~~`) — single `~` only when surrounded by non-space chars and
  not followed by another `~`.
- Sup: `X^2^` → `X<sup>2</sup>`. Single `^` only between word chars.
- Toggles: `extendedSyntax.highlight`, `extendedSyntax.subscript`,
  `extendedSyntax.superscript` (all default `true` for Durumi —
  medical writing uses these heavily, e.g., `H₂O`, `m²`, `Na^+^`).
- Live preview swaps the source for the rendered glyph when caret
  leaves the span.

### C-4. GitHub-style callouts

- Block syntax:
  ```
  > [!NOTE]
  > Highlights information that users should take into account.
  ```
- Five types: `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`.
- Render as a styled blockquote with a colored left border + icon
  + label. Icons inline SVG, labels localized via `i18n/t.ts`.
- Export: HTML emits
  `<blockquote class="callout callout-note"><p class="callout-title">…`
  for compatibility with our default print styles.
- Pandoc emits the raw source (Pandoc 3.x parses these natively).

### C-5. Emoji autocomplete

- Trigger: `:` followed by ≥ 2 word chars opens a CodeMirror
  autocomplete list of matching shortcodes (`:smile:`, `:warning:`,
  …). Up to 8 results.
- Selecting inserts the unicode glyph (replace `:foo:` with `😀`)
  matching Typora's behavior.
- Bundle a curated list (~1500 emoji shortcodes from
  `emoji-datasource-google` minimum slice) at build time to avoid
  shipping the full 50k+ catalog.

### C-6. Sidebar file operations

- Right-click menu on file tree entries:
  - New file (sibling)
  - New folder
  - Rename… (inline rename input)
  - Duplicate (suffixed `-copy`)
  - Move to Trash (`shell.trashItem`)
  - Reveal in Finder/Explorer (`shell.showItemInFolder`)
  - Copy path / Copy relative path
- Folder-level:
  - New file inside
  - New folder inside
  - Move to Trash
- Operations are routed through main-process IPC and refresh the
  affected directory entry in the sidebar store.

---

## Deliberate non-goals (Phase D / never)

- EPUB / OPML / RST / Textile / MediaWiki export — unused in medical
  research; available indirectly via Pandoc adapter if user really
  needs it.
- Theme gallery UI — `customCss.ts` is enough.
- Sequence/Flow blocks (Typora legacy) — Mermaid covers all cases.
- OS-level autosave/version integration (Typora's macOS Versions
  support) — replaced in v0.x by simple `~/.durumi/backup` mirror.
- HTML embed widgets, video tags — out of scope for medical
  manuscripts.
- Image export — niche; if needed later, can use a headless
  BrowserWindow render similar to PDF export.

---

## Implementation ordering inside each phase

- **A:** front matter parse → footnote parse → `[toc]` → Pandoc
  adapter. Each lands as its own commit.
- **B:** Pandoc adapter prerequisites complete first; then docx,
  then LaTeX, then counters (independent), then across-file search,
  then Quick Open, then spell check.
- **C:** Auto pair tweaks, then focus/typewriter (both small
  CodeMirror extensions), then highlight/sub/sup, then callouts,
  then emoji, then sidebar file ops.

After C-6 lands cleanly, declare `v0.1.2 — Typora-parity foundation`
and start medical-research v1 design.

---

## References

- Typora 1.13 release notes (2026-04-03):
  https://support.typora.io/What's-New-1.13/
- Markdown Reference: https://support.typora.io/Markdown-Reference/
- Export: https://support.typora.io/Export/
- YAML: https://support.typora.io/YAML/
- Math: https://support.typora.io/Math/
- File Management: https://support.typora.io/File-Management/
- Search: https://support.typora.io/Search/
- Auto Pair: https://support.typora.io/Auto-Pair/
- Focus and Typewriter Mode:
  https://support.typora.io/Focus-and-Typewriter-Mode/
- Spellcheck: https://support.typora.io/Spellcheck/
- Shortcut Keys: https://support.typora.io/Shortcut-Keys/

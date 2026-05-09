# Durumi — Progress

## v0.1.2 (current) — Manuscript Studio v1

The post-v0.1.0 milestone: Typora 1.13 parity foundation complete, medical-research v1 features in place, manuscript memo system shipped.

### Added since v0.1.0

#### Editor — Typora-parity foundation
- ATX + Setext (`===` / `---`) headings
- Backslash escapes (`\* \_ \[ \\ \$ …`) — leading `\` hidden in live preview
- Inline HTML pairs `<sub>`, `<sup>`, `<mark>`, `<kbd>`, `<u>` — paired and rendered
- Hard line breaks (trailing two spaces or trailing `\`) visualized with `↵`
- HTML block + HTML comment (`<!-- … -->`) styling
- Reference links `[text][id]` + `[id]: url` definition; shortcut `[id]`; autolinks `<https://…>`; bare-URL linkify
- Image with title `![alt](src "title")`; paren-tolerant URLs
- GitHub-style alerts `> [!NOTE/TIP/IMPORTANT/WARNING/CAUTION]`
- Highlight `==text==`, subscript `~x~`, superscript `^x^` via `InlineExtras`
- Front matter (YAML) folded summary in editor
- Footnotes `[^id]` reference + definition (live preview + GitHub-style export)
- `[toc]` directive — live heading tree widget; `<nav class="toc">` in HTML
- Auto-pair brackets/quotes; smart list continuation
- Focus Mode (`F8`) and Typewriter Mode (`F9`)
- Emoji autocomplete (`:smile:` → 😀) — ~1500 shortcodes
- Idle-on-open: no active line until first user interaction (no leaking `#` markers on file open)

#### Medical-research v1
- **Citations** — Pandoc-style `[@key]`, `[@a; @b]`, `[-@key]`, `[@key, p. 33]`. Vancouver-style `<section class="references">` auto-appended to HTML/PDF. Missing keys flagged `[?]`. BibTeX auto-discovery walks 32 directory levels for `references.bib` / `references.bibtex` / `bibliography.bib`.
- **Manuscript templates** — IMRaD, CONSORT, PRISMA, CARE, STROBE-cohort, STROBE-cross-sectional. Each ships with YAML front matter, `[toc]`, and the heading tree the guideline expects.
- **Statistics macros** — 11 default presets (p < 0.05, 95% CI, M±SD, n=, HR/OR/RR, citation/footnote skeletons). Editable via `macros.json`.
- **`.docx` import** — Pandoc-driven; missing-Pandoc dialog with **Homebrew one-click install** on macOS.

#### Memos (Word-style review notes)
- `%% memo %%` inline syntax with optional `@tag` prefix (`@ai`, `@todo`, `@reviewer`, `@stats`, custom)
- Block form `%%\n…\n%%` for paragraph-level memos
- Live colored sticky-note rendering with per-tag accent color
- Sidebar **메모** tab — document-ordered list, click jumps to line
- Status bar memo count
- `Cmd/Ctrl + Alt + M` wraps selection (or inserts empty memo)
- **Default-strip on export** for HTML / PDF / DOCX / LaTeX (medical safety: review notes never leak into a submitted manuscript). Settings checkbox "메모 포함" promotes them to visible blockquotes when transparency is wanted.
- Single source of truth: `shared/comments.ts` — same parser used by editor live preview, sidebar, status bar, AND export pre-processor

#### Sidebar
- Tab count went 2 → 4: Files / Outline / Search / 메모
- **Search tab** — across-file workspace search (case / whole-word / regex; results grouped by file; click jumps to line; excludes `.git`, `node_modules`, files > 1 MB, binaries)
- **Outline drag-to-reorder** — drag a heading row to rewrite the markdown source (ATX-only docs; Setext docs are read-only since line math is fragile there)
- **Sidebar context menu** — right-click on file tree: new file, new folder, rename, duplicate, move to trash, reveal in Finder/Explorer, copy path / relative path, close folder
- **Quick Open** (`Cmd/Ctrl + P`) — fuzzy filename palette across all workspace folders

#### Export
- **DOCX** via Pandoc (`markdown+yaml_metadata_block+footnotes+definition_lists+pipe_tables+raw_html` → `docx --standalone`). Optional `--reference-doc` (Word style template) configurable in Settings.
- **LaTeX** via Pandoc (same input format → `latex --standalone`). Optional `--template` configurable.
- HTML export gained: `markdown-it-mark` (==highlight==), `markdown-it-sub` / `-sup`, `markdown-it-github-alerts`, lezer-based code highlighting (cm-tok-* classes inline), citation & TOC pre-processing, slugified heading anchors.
- All Pandoc-bound formats route through a single `runPandoc` adapter with auto-detect + custom path override.

#### Settings & UX
- **Settings dialog** — theme / language / Pandoc binary path / Word style reference / LaTeX template / spell-check languages / custom dictionary / "Include memos in export"
- **Pandoc Install dialog** with Homebrew one-click install (macOS) when Pandoc is missing
- **Spell check** — Electron's built-in spellchecker; default language from OS; code blocks, inline code, and front matter excluded; per-document custom dictionary persisted
- **Robust quit handling** — `Cmd+Q` / `Cmd+W` / red-light close all route through a renderer-driven Save? prompt with a 30 s timeout fallback (so a hung renderer never permanently locks the close); `Cmd+Q` on macOS now actually quits the app instead of leaving a zombie process behind

#### Documentation & CI
- **[docs/durumi-markdown-reference.md](durumi-markdown-reference.md)** — 954-line Korean markdown reference (Typora 1.13 baseline + Durumi extensions + KaTeX coverage + export matrix + shortcut tables)
- **[docs/typora-spec.md](typora-spec.md)** — Typora 1.13 parity spec (Phases A/B/C; deliberate non-goals)
- **GitHub Actions CI** — `ci.yml` (typecheck → lint → vitest), `e2e.yml` (Playwright on macOS), `release.yml` (tagged `v*.*.*` builds DMG + NSIS via electron-builder, publishes to a draft GitHub Release)

### Quality gates
- 643 Vitest unit tests (up from 249)
- 16 Playwright Electron E2E tests
- `pnpm lint` clean (0 errors / 0 warnings)
- `pnpm typecheck` clean (0 errors)
- `pnpm build` produces ~3 MB main bundle + ~2.6 MB renderer bundle (Mermaid lazy chunks separate)

### Signing posture (unchanged)
- macOS: ad-hoc signed (Gatekeeper requires right-click → Open on first launch)
- Windows: unsigned NSIS (SmartScreen "Run anyway")
- Real Apple Developer ID + Windows EV certificate are deferred — see Roadmap item 8.

---

## v0.1.0 (shipped) — Editing foundation

Cross-platform (macOS + Windows 11) Typora-style markdown editor with:
- Live-preview markdown rendering (11 element types) with IME-safe active-line invariant
- GFM tables, task lists, strikethrough, fenced code syntax highlighting
- Math (KaTeX) and Mermaid diagrams in both editor and export
- Sidebar — multi-folder Files tab + live Outline tab + git status dots
- Find / Find-and-Replace via CodeMirror's search panel
- HTML and PDF export
- Custom CSS hot-reload, JSON-defined macros / snippets
- Image paste / drop → saved to `assets/` next to the document
- Native menu, recent files, multi-window, theme toggle (system / light / dark)
- Korean / English UI (auto-detect from OS locale, switchable via View → Language)
- Auto-update wired via `electron-updater`

249 Vitest unit tests, 16 Playwright Electron E2E tests at v0.1.0.

---

## Roadmap

The shape of post-v0.1.2 work, in rough priority order. Each item gets its own design + plan cycle when picked up.

### 1 — Live reference search
- API integrations: PubMed, KoreaMed, Crossref, Semantic Scholar, ORCID
- DOI → metadata resolution; one-click cite-and-insert into the local BibTeX

### 2 — AI-assisted writing
- LLM drafting / summarization / rephrasing in-editor
- English-polish mode that smooths non-native phrasing without producing AI-detection signals
- RAG over the local reference library so suggestions are grounded

### 3 — AI manuscript review harness
- Multi-perspective rubric evaluation per section: clinician / bio scientist / statistician / ethicist / reviewer
- Stage-aware feedback (draft → revision → submission)
- Findings surfaced as `%% @reviewer-clinician … %%` memos in the existing memo sidebar

### 4 — Background data → figure pipeline
- Sandboxed Python execution for analysis and figure generation
- Auto-emit figures into the manuscript; re-run on data change

### 5 — Knowledge graph / ontology view
- Obsidian-style graph over the citation network and concept map
- Highlight isolated claims, redundant references, field-coverage gaps

### 6 — Compliance & integrity
- Plagiarism-style overlap warning against the local reference library
- Journal submission helpers (cover letter, response-to-reviewers scaffolding)

### 7 — CriticMarkup track-changes (opt-in)
- Full `{++ ++}` / `{-- --}` / `{~~ ~> ~~}` / `{>> <<}` insert/delete/substitute/comment operators on top of the existing `%% %%` memo flow

### 8 — Real code-signing
- Apple Developer ID + notarization
- Windows OV/EV certificate + signed NSIS

---

## Architecture invariants (do not break)

These constraints emerged during the editor foundation + v0.1.2 work and must be preserved by any future change.

- **Active-line invariant** — the line under the editor cursor never gets `Decoration.replace`. This keeps IME composition (Korean, Japanese, Chinese) working. Live-preview decorations must check the cursor position and bypass the active line. The shared helper is [`src/editor/decorations/activeLine.ts::hasActiveLine`](../src/editor/decorations/activeLine.ts).
- **Idle-on-open invariant** — `userActiveField` (a CodeMirror `StateField<boolean>`) starts `false` and only flips to `true` on the first user interaction (input / delete / select). Without this, opening a file with the caret placed at position 0 would expose the first line's raw markers (`#`, `>`, etc.) just because CodeMirror's default selection landed there.
- **Block widgets via `StateField`** — `Decoration.replace({ block: true })` cannot be issued from `ViewPlugin`. Use `StateField.define({ provide: f => EditorView.decorations.from(f) })` for any block-level widget (Mermaid, math display, comments, etc.).
- **HardBreak crosses line boundaries** — the lezer `HardBreak` node spans the trailing whitespace AND the newline. ViewPlugin decorations may not span line breaks, so any `HardBreak` decoration must clamp `to` to the marker's line end. Active-line check must use line *number*, not byte-range overlap, because `to == nextLine.from`.
- **`%% memo %%` parser parity** — both the lezer extension (`src/editor/markdownExt/comments.ts`) and the regex parser (`shared/comments.ts`) must enforce the same gates: word-boundary before opener (no `100%% complete %%done%%`), non-empty trimmed body, code-fence skip, triple-`%%%` rejection. If they diverge, the editor sidebar will show different memos than the export pipeline strips.
- **Memo strip-on-export is the safety floor** — `renderHtml` and Pandoc both pre-process via `stripComments` (default) or `promoteComments` (opt-in). Even Pandoc's LaTeX `%`-comment pass-through is a leak vector — strip in the renderer, never trust the writer.
- **`pnpm test:e2e` requires `pnpm build` first** — Playwright config does not auto-bundle. Run `pnpm build` before `pnpm test:e2e`.
- **Mocking Node fs in vitest** — when the source uses `import { promises as fs } from 'node:fs'`, mock both `node:fs` and `node:fs/promises` and share the same `vi.fn()` instances across both. Include `default` exports.
- **Korean IME with React state ↔ module globals** — components like `LanguageProvider` that mirror React state into a module-level global must sync *during* render (idempotent guard) rather than only in `useEffect`. Otherwise the first render after a language switch uses the stale global and produces a frozen-language UI.
- **Close guard timeout** — the renderer's Save?-prompt handler can fail to register (renderer crashed before mount, IPC dropped, modal hung). [`electron/closeGuard.ts`](../electron/closeGuard.ts) sets a 30 s timeout that fires `onCancel` to release the `pending` flag, otherwise `Cmd+W` becomes a permanent no-op for that window.
- **macOS Cmd+Q ≠ window close** — on macOS, `app.before-quit` fires and the user expects the app to actually quit. The default `window-all-closed` handler keeps the app alive on darwin (dock convention) which conflicts with Cmd+Q. [`electron/main.ts`](../electron/main.ts) tracks an `isAppQuitting` flag set by `before-quit` and clears it when the user cancels — so `window-all-closed` knows whether to call `app.quit()` even on darwin.
- **`Decoration.replace` cannot exceed `node.from..node.to`** — when a decoration's `to` lands on the next line's start (e.g. block widgets, newline-inclusive ranges), CodeMirror throws "Decorations that replace line breaks may not be specified via plugins". Use `StateField` instead, or clamp the range to the marker's own line.

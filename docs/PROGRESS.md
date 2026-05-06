# Durumi — Progress

## v0.1.0 (current)

The editing foundation is complete and shipping. Cross-platform (macOS + Windows 11) Typora-style markdown editor with:

- Live-preview markdown rendering (11 element types) with IME-safe active-line invariant
- GFM tables, task lists, strikethrough, fenced code syntax highlighting
- Math (KaTeX) and Mermaid diagrams in both editor and export
- Sidebar — multi-folder Files tab + live Outline tab + git status dots
- Find / Find-and-Replace via CodeMirror's search panel
- HTML and PDF export (markdown-it + lezer code highlight + KaTeX + inlined Mermaid SVG)
- Custom CSS hot-reload, JSON-defined macros / snippets
- Image paste / drop → saved to `assets/` next to the document
- Native menu, recent files, multi-window, theme toggle (system / light / dark)
- Korean / English UI (auto-detect from OS locale, switchable via View → Language)
- Auto-update wired via `electron-updater` (publish URL not yet configured)

### Quality gates
- 249 Vitest unit tests
- 16 Playwright Electron E2E tests
- `pnpm lint` clean (0 errors / 0 warnings)
- `pnpm typecheck` clean (0 errors)

### Signing posture
- macOS: ad-hoc signed (Gatekeeper requires right-click → Open on first launch)
- Windows: unsigned NSIS (SmartScreen "Run anyway")
- Real Apple Developer ID + Windows EV certificate are deferred.

---

## Roadmap

The shape of post-v0.1.0 work, in rough priority order. Items are scoped at the level of "first functional cut" — each will get its own design + plan cycle when picked up.

### 1 — Reference & citation engine
- Local reference library with BibTeX / RIS import-export
- API integrations: PubMed, KoreaMed, Crossref, Semantic Scholar, ORCID
- DOI → metadata resolution
- Citation styles via CSL (Vancouver, APA, AMA, IEEE, journal-specific)
- Bibliography auto-generation in HTML / PDF export

### 2 — AI-assisted writing
- LLM drafting / summarization / rephrasing in-editor
- English-polish mode that avoids AI-detection signals
- RAG over the local reference library so suggestions are grounded

### 3 — AI manuscript review harness
- Multi-perspective rubric evaluation per section: clinician / bio scientist / statistician / ethicist / reviewer
- Stage-aware feedback (draft → revision → submission)

### 4 — Background data → figure pipeline
- Sandboxed Python execution for analysis and figure generation
- Auto-emit figures into the manuscript; re-run on data change

### 5 — Knowledge graph / ontology view
- Obsidian-style graph over the citation network and concept map
- Highlight isolated claims, redundant references, field-coverage gaps

### 6 — Compliance & integrity
- Plagiarism-style overlap warning against the local reference library
- Journal submission helpers (cover letter, response-to-reviewers scaffolding)

### 7 — Real code-signing
- Apple Developer ID + notarization
- Windows OV/EV certificate + signed NSIS

---

## Architecture invariants (do not break)

These constraints emerged during the editor foundation and must be preserved by any future change.

- **Active-line invariant** — the line under the editor cursor never gets `Decoration.replace`. This keeps IME composition (Korean, Japanese, Chinese) working. Live-preview ViewPlugins must check the cursor position and bypass the active line.
- **Block widgets via `StateField`** — `Decoration.replace({ block: true })` cannot be issued from `ViewPlugin`. Use `StateField.define({ provide: f => EditorView.decorations.from(f) })` for any block-level widget (Mermaid, math display, etc.).
- **`pnpm test:e2e` requires `pnpm build` first** — Playwright config does not auto-bundle. Run `pnpm build` before `pnpm test:e2e`.
- **Mocking Node fs in vitest** — when the source uses `import { promises as fs } from 'node:fs'`, mock both `node:fs` and `node:fs/promises` and share the same `vi.fn()` instances across both. Include `default` exports.
- **Korean IME with React state ↔ module globals** — components like `LanguageProvider` that mirror React state into a module-level global must sync *during* render (idempotent guard) rather than only in `useEffect`. Otherwise the first render after a language switch uses the stale global and produces a frozen-language UI.

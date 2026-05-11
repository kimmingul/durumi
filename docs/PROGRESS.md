# Durumi — Progress

## v0.1.10 (current) — Reference workflow refinements

Three-track release sharpening the day-to-day reference workflow.
Driven by a six-item user audit (see `memory/v0_1_10_plan.md`).

### Track A — Menu restructure
The single "검토" submenu was carrying memo work, change-tracking,
references, and AI all at once. Split into three top-level menus:

```
검토 ▶               (memo + change-tracking + export toggles)
참고문헌 ▶            (cite palette, DOI add, bulk DOI, file import,
                      AI citation suggest, References sidebar)
AI 작성 도우미 ▶      (Polish selection, AI sidebar)
```

Labels also updated for clarity — e.g. "DOI로 인용 삽입" → "DOI로
참고문헌 추가", "참고문헌 탭 보이기" → "참고문헌 사이드바 열기".
All `MenuCommand` ids unchanged, so the renderer wiring is identical.
KeyboardShortcutsDialog regrouped to match (new "References" group).

### Track B — Add-flow redesign
1. **Body-insert toggle on add.** Default OFF. `InsertCitationDialog`
   gains a `☐ 본문에도 [@key] 삽입` checkbox seeded from
   `prefs.bibliography.insertCitationOnAdd`.
2. **Smart-merge of adjacent cite groups.** New helper
   `insertCitationSmart(doc, pos, key)` in `shared/citationMerge.ts`.
   Inserting `[@b]` next to `[@a]` produces `[@a; @b]`; inserting a
   key already in the adjacent group is rejected with the
   "이미 인용되어 있습니다" toast. Wired through
   `App.insertCitationAtCaret` and `CitePalette` so every
   cite-insertion path benefits.
3. **Crossref abstract auto-save.** Default ON
   (`prefs.bibliography.autoSaveAbstract`). When a reference is added,
   if `reference/<key>.{md,pdf}` doesn't exist, the Crossref `abstract`
   (or a metadata stub) is written to `reference/<key>.md`. The 📥
   button keeps its original meaning ("fetch a better copy"). New IPC
   `bibliographyAutoSaveAbstract`.
4. **DOI-based duplicate prevention.** `appendEntry` normalises the
   DOI (lowercase, strip `https://doi.org/`, trailing slash) and
   rejects an add when a match exists, returning
   `{ ok: false, error: 'duplicate-doi', existingKey }`. No-DOI
   adds fall through to a weak match (normalised title + first-author
   surname + year) that prompts the user via `window.confirm` before
   retrying with `force: true`. The right sidebar scrolls and flashes
   the existing row via the new `highlightedKey` store slice.

### Track C — Sidebar polish
- **Sort dropdown** above the references list. Eight options
  driven by `prefs.bibliography.sortBy` (single source of truth,
  no local React state): added-newest/oldest, author A→Z,
  year newest/oldest, citation-key A→Z, citation-order in the open
  document, uncited-first. Pure helper at
  `src/components/sidebar/referenceSort.ts` with 12 vitest cases.
- **Shift-click on "추가" in search-result cards** = add + insert
  `[@key]` at the caret. Plain click stays add-only. Wired via the
  existing `onInsertCitation` prop — no new editor handles needed.

### New preferences (`prefs.bibliography`)
- `insertCitationOnAdd: boolean` — default `false`
- `autoSaveAbstract: boolean` — default `true`
- `sortBy: 'addedDesc' | 'addedAsc' | 'author' | 'yearDesc' | 'yearAsc' | 'key' | 'citationOrder' | 'unused'` — default `'addedDesc'`

Migration: `mergeDefaults` already spreads `DEFAULTS.bibliography`
over loaded prefs, so existing users pick up the defaults transparently.

### Quality gates
- 1175 Vitest tests across 137 files (1162 baseline + 13 new
  `citationMerge.test.ts` cases). Up from 1129 in v0.1.8.3.
- `pnpm typecheck` clean
- `pnpm lint` clean
- `pnpm build` clean

### Workflow note
Implemented as three parallel subagents in git worktrees from a
shared prep commit (prefs scaffold). Worktree diffs were merged
manually with one cross-track wiring step (smart-merge integrated
into `App.insertCitationAtCaret`, highlightedKey subscription added
to `ReferencesTab`).

---

## v0.1.8.3 — UI/UX polish: AI sidebar, shortcuts, i18n

Three-track polish release. No new architecture invariants; everything
sits on top of the v0.1.8.x surface area.

### Track A — AI sidebar tab (commit `d37d664`)
New 7th sidebar tab "AI" consolidates the entry points that previously
required hunting through the 검토 menu. One panel shows:
  • Provider status row (active provider + model + key indicator,
    one-click ⚙ to Settings)
  • Quick selection commands grid (the 7 v0.1.8 Track B prompts —
    disabled when no selection or no key)
  • Citation actions (Suggest for current paragraph, Insert from DOI)
  • Session usage stats with deep-link to the full dashboard
  • Recent activity (last 5 calls with source + token count)

All buttons route through the existing menu-command handlers via new
Sidebar callback props, so no new IPC and no duplicate command
implementations. The sidebar tab is the *surface*; the business logic
stays where v0.1.8 put it.

### Track B — Keyboard shortcuts dialog (commit `171c9f9`)
New "Keyboard shortcuts…" entry under Help (`F1`) opens a searchable
reference of every shortcut Durumi binds, grouped by area (File / Edit
/ View / Review / AI assist). Search input filters across both labels
and key names so a user who remembers `Cmd+Shift+B` but not the action
(or vice-versa) lands on the right row.

`F1` chosen over `Cmd+/` to avoid the existing `Cmd+/` binding for
source mode toggle.

### Track C — Korean i18n polish (commit `fdce6f3`)
Six targeted fixes from a full Korean-string review:
  • `editEntry.delete.confirm` — restructured to fix particle agreement
    when the citation key ends in alphanumerics
  • `updates.availableDetail` — avoid version-dependent particle issue
  • `ai.cmd.tighten.desc` — replaced bilingual "hedge word" with
    `약화어(hedge)`
  • `ai.cmd.simplify.desc` — more natural phrasing
  • `ai.cmd.translateEn/Ko.desc` — differentiated descriptions so the
    target language is visible at the desc level too

en/ko key sets diffed before/after: both sections carry the identical
442-key surface. No missing translations introduced.

### Quality gates
- 1129 Vitest unit tests across ~133 files (v0.1.8.2 was 1114 → Track A
  1121 → Track B 1129; Track C is i18n-only, +0 new test counts).
- 16 Playwright Electron E2E tests
- `pnpm lint` clean (0 errors / 0 warnings)
- `pnpm typecheck` clean (0 errors)
- `pnpm build` clean

---

## v0.1.8.2 — pdfjs-dist for real PDF text extraction

Single-track polish that replaces the v0.1.7-era regex-on-raw-bytes PDF
scanning with pdfjs-dist. Two outcomes:

  • **DOI extraction now finds DOIs in compressed content streams.**
    The v0.1.7 path only matched plaintext spans (Info dict + the rare
    uncompressed page); modern journal PDFs have most of their body in
    FlateDecode blocks where the regex never reached. The Track C
    "Register orphan file" flow now rarely needs the manual-entry
    fallback.
  • **Citation suggestion gets per-entry body excerpts.** The v0.1.8
    Track C suggestion prompt only carried the Crossref abstract for
    each candidate. With pdfjs-dist, the renderer can pull the first
    ~3 pages of any local PDF in `<bib-dir>/reference/` and feed that
    excerpt to the model — methods / results / discussion now influence
    matching, not just the abstract.

### What changed
- New `electron/pdfText.ts` wraps pdfjs-dist's legacy build with a
  testable `PdfParser` interface. The 2MB pdfjs payload is **lazy-
  loaded** the first time extraction runs, so app startup isn't
  affected.
- `electron/referenceImport.ts::extractDoiFromPdf` now goes pdfjs-dist
  → page-text DOI scan, falling back to the v0.1.7 raw-header scan
  only when pdfjs declines (corrupt / encrypted PDFs). The fallback
  preserves the prior behaviour as a safety net.
- New IPC `reference:extractText` reads PDF text or markdown body for
  any file under `<bib-dir>/reference/`. Returns capped output
  (default 5 pages, 8000 chars) so a 200-page review article doesn't
  swamp the renderer.
- `shared/aiCitationSuggest.ts::buildCitationSuggestPrompt` now accepts
  either bare `BibEntry` or `{ entry, localText }` shapes. When
  `localText` is present, it's truncated to 600 chars and inlined as
  an `excerpt:` field per entry.
- `CitationSuggestPanel` runs an enrichment pass before the LLM call:
  for every entry with a local file, it requests `reference:extractText`
  (capped at 30 entries, 1500 chars/entry) and passes the result
  through. The result view shows "N entries enriched with local
  content" so the user knows when the suggestion benefited from local
  PDFs vs ran abstract-only.

### Quality gates
- 1114 Vitest unit tests across ~131 files (v0.1.8.1 was 1104 → +10)
- 16 Playwright Electron E2E tests
- `pnpm lint` clean (0 errors / 0 warnings)
- `pnpm typecheck` clean (0 errors)
- `pnpm build` clean (renderer bundle +5KB; main bundle picks up the
  pdfjs lazy-import on demand)

### New dep
- `pdfjs-dist` (~2MB, lazy-loaded)

---

## v0.1.8.1 — AI polish: rename, dashboard, ghost text

A patch release that fills the v0.1.8 gaps that surfaced once people
actually used the AI features: cite-key typos couldn't be fixed without
a doc-wide migration, every API call was invisible cost-wise, and
common mid-paragraph "what comes next" moments still required opening
the palette manually.

### Track A — Atomic citation-key rename (commit `f09882d`)
- Sidebar entries gain a 🔑 button next to ✎ ✕.
- RenameKeyDialog: shows current key + new-key input + live "이 문서에
  N개 참조가 있습니다 — 모두 한 번에 변경됨" count + validation
  (non-empty, allowed charset, not the same key, not already taken).
- On confirm: `bibliographyRenameKey` IPC rewrites references.bib, then
  a single CodeMirror transaction migrates every `[@oldKey]` in the
  active doc — atomic undo as one unit.
- New `renameCitationKeyChanges` helper in `shared/citationKey.ts`
  handles every Pandoc shape (bare, author-suppressing, locator,
  grouped) without false positives on partial matches.

### Track B — AI usage + cost dashboard (commit `6d46284`)
- Every successful `aiChat` call records into a localStorage-backed
  store: last 200 calls, per-model + per-source lifetime totals.
- Settings dialog grows an "AI 사용량" section with summary pills
  (calls / tokens / estimated cost), by-model + by-source tables,
  recent-calls log (collapsed), and a Reset button.
- Cost estimation in `shared/aiCost.ts` with hardcoded prices for
  Claude Opus 4.7 / Sonnet 4.6 / Haiku 4.5, GPT-4o family, GPT-4.1
  family, and zero-cost catch-alls for local Ollama / Mistral / Qwen.
  Unmatched models report 0 (under-report rather than guess).

### Track C — Inline ghost-text completion (commit `0dcdce7`)
- New CodeMirror extension renders 1-2 sentence continuations as gray
  italic text after the caret when the user idles at the end of a
  paragraph. Tab accepts; Esc / typing / selection change clears.
- **Off by default** — opt in via Settings → AI assist → "Inline
  ghost text". Every accepted Tab is a real LLM call.
- Cost guards: 800ms idle debounce, ≥30 chars before triggering, end of
  line AND end of paragraph required, single in-flight (auto-cancel on
  doc / selection change), per-session cap (default 100 triggers).
- New prompt builder `buildGhostTextPrompt` with an explicit
  `NO_COMPLETION` escape hatch — the model returns that token when the
  lead-in is too short / mid-heading / otherwise unsuitable, and the
  extension treats it as a no-op.
- Successful triggers record into the Track B usage dashboard under
  `source: 'ghostText'` so the user can see how often the feature
  actually fires.

### Quality gates
- 1104 Vitest unit tests across ~130 files (v0.1.8 was 1049 → Track A
  1066 → Track B 1093 → Track C 1104; +55 total)
- 16 Playwright Electron E2E tests
- `pnpm lint` clean (0 errors / 0 warnings)
- `pnpm typecheck` clean (0 errors)
- `pnpm build` clean

### Architecture invariants added in this line of work

These join the list at the bottom of the file. Any future change must
preserve all of them.

- **Cite-key rename is bib + doc atomic.** The bib write commits before
  the doc transaction dispatches; both succeed or the user sees a
  clear error with the bib intact and the doc untouched. No half-state
  where references.bib has the new key but the doc still cites the old.
- **AI usage logging is best-effort, persistence is opt-in by default.**
  localStorage may be unavailable (read-only profile, quota), and the
  store silently degrades — usage flows continue, the dashboard simply
  shows what's currently in memory. Nothing in the AI codepaths
  depends on logging succeeding.
- **Ghost-text is gated behind an explicit opt-in toggle.** The default
  is off because every accepted suggestion is a real LLM call. The
  per-session cap is a guardrail against runaway typing sessions, not
  a substitute for the toggle.
- **Single-flight + auto-cancel for ghost-text.** Doc or selection
  changes cancel any in-flight request and clear pending decorations;
  late-arriving completions for stale carets never land. Prevents the
  "I typed past the suggestion and it appeared after my new text" bug.

---

## v0.1.8 — AI-assisted writing

The first AI release. Roadmap item #2 lands as three coordinated
tracks: a provider-abstracted LLM client (Track A), a selection-rewrite
palette with seven prompt recipes (Track B), and a paragraph-aware
citation-suggestion flow (Track C). Every LLM call is opt-in and
explicit — with no API key configured the new menu items still appear
but the modals tell the user "no provider configured" and refuse to
spend tokens. v0.1.6's "all outbound HTTP runs in main" invariant
extends to LLM calls.

### Provider strategy
Two providers behind one shape:
- **Anthropic** — `api.anthropic.com/v1/messages` with `x-api-key` auth
- **OpenAI-compatible** — `<baseUrl>/v1/chat/completions` with Bearer
  auth (auth header omitted when key is empty so keyless self-hosted
  endpoints like Ollama and LM Studio work)

API keys are persisted as opaque encrypted blobs (`enc:` prefix) via
Electron's `safeStorage` (macOS Keychain / Windows DPAPI / Linux kwallet
or libsecret). On platforms without a keychain backend, keys are tagged
`plain:` so future code can detect and refuse rather than silently fall
through. The renderer never sees the plaintext.

### Track A — LLM client + Settings (commit `aa53168`)
- New `electron/aiClient.ts` with a unified `aiChat(messages, opts)`
  surface; structured error codes (`auth` / `rate-limit` / `timeout` /
  `network` / `invalid-response` / `http`).
- New `electron/aiKeys.ts` — safeStorage wrapper with `encrypt` /
  `decrypt` and a `fakeKeyVault()` test seam.
- New IPC: `ai:setApiKey`, `ai:hasKey`, `ai:verify`, `ai:chat`.
- Settings dialog gains a new "AI 작성 도우미" section with provider
  radio, key-save flow, model picker (Anthropic: Opus 4.7 / Sonnet 4.6
  / Haiku 4.5; OpenAI: free-form), base URL field, and a Verify probe
  button.
- Privacy notice in the section: "선택 텍스트와 주변 단락이 선택한
  제공자로 전송됩니다."

### Track B — Selection rewrite palette (commit `6c9b8d3`)
- New **Cmd/Ctrl+Shift+/** palette runs the active provider against the
  editor selection.
- Seven commands ship: Polish English / Tighten / Expand / Simplify /
  Academic tone / Translate to Korean / Translate to English.
- Flow: select text → palette → pick command → before/after preview
  with token usage → Accept replaces the selection in place. Esc / Back
  cancels without touching the document.
- Prompt library lives in `shared/aiPrompts.ts` so adding a new command
  is a one-file change.
- System prompts enforce medical-research guarantees: never invent
  citations, preserve `[@key]` refs verbatim, keep markdown structure,
  default to academic register.
- Surrounding-paragraph context (from `currentParagraph`) is sent as a
  non-rewritable preface — drives voice + tense consistency on
  multi-sentence rewrites without making the model edit text the user
  didn't select.

### Track C — Citation suggestion (commit `c048e14`)
- New "AI: 현재 단락에 인용 제안…" menu item opens a panel that reads
  the paragraph at the caret, hands it to the LLM together with a
  compact slice of `references.bib` (capped at 60 entries; abstracts
  truncated to ~320 chars), and asks for a STRICT JSON list of keys
  that fit.
- **Hallucination guard**: `parseCitationSuggestion` drops any candidate
  whose key isn't in the live bibliography set. The model can never
  insert a fabricated cite key — even if it tries.
- Per-candidate card shows rationale + anchor phrase + one-click
  "단락 끝에 삽입" action. The user always sees what's about to change;
  rejection is the silent default.
- Strategy is retrieval-augmented (single round-trip with paragraph +
  bibliography slice) rather than tool-use, so it works against any
  chat-completion endpoint including OpenAI-compatible self-hosted
  models that don't support function calling.

### Quality gates
- 1049 Vitest unit tests across ~126 files (v0.1.7.1 was 1021 → Track A
  1033 → Track B 1039 → Track C 1049; +28 total)
- 16 Playwright Electron E2E tests
- `pnpm lint` clean (0 errors / 0 warnings)
- `pnpm typecheck` clean (0 errors)
- `pnpm build` clean

### Architecture invariants added in this line of work

These join the list at the bottom of the file. Any future change must
preserve all of them.

- **API keys live encrypted in main, never in the renderer.** safeStorage
  encrypts on write; the renderer asks `aiHasKey` for a yes/no but never
  receives plaintext. UI gating uses that boolean.
- **Every LLM call is explicitly user-initiated.** No auto-suggest on
  caret idle, no background re-runs, no "while you write" inline ghost
  text. Cmd+Shift+/ is the entry; Esc cancels at any point.
- **Citation suggestions are validated against the live `.bib`.** The
  model only sees keys we already have; the parser drops anything
  outside that set. Fabricated keys never reach the document — by
  construction, not by trust.
- **System prompts forbid citation invention and `[@key]` mutation.**
  Every prompt builder includes the rule. If a future command needs to
  bend it, that's an explicit override at the recipe level, not a
  default the system slips into.
- **AI calls follow the v0.1.6 "outbound HTTP in main only" invariant.**
  The renderer never imports `fetch`-based AI code; it goes through the
  IPC `ai:chat` handler which owns timeout, User-Agent, and key handling.

---

## v0.1.7.1 — Bibliography ergonomics: edit, bulk, import

A patch release that fills the everyday-use gaps v0.1.7 left exposed.
No new architecture invariants — every track sits on top of the
v0.1.7 surface (the `.bib` writer, the IPC contract, the sidebar tab).

### Track A — Entry edit + delete (commit `f880ee6`)
- Each row in the local-entries section gains ✎ (edit) and ✕ (delete)
  icon buttons.
- **Edit modal**: type, title, author, year, journal, volume, number,
  pages, DOI, URL, file, abstract. Citation key is read-only — renaming
  it would have to migrate every `[@oldKey]` in the active document
  atomically, deferred to a future polish.
- **Delete**: confirms, removes from the `.bib`, and per the
  architecture invariant **leaves the `reference/` file alone**. The
  next scan flips the abandoned file into the Unregistered Files
  section so the user can re-register it under a different entry.
- New IPC `bibliography:removeEntry`. The existing `upsertEntry` on
  main is reused for the edit case.

### Track B — Bulk DOI add (commit `bc73a5c`)
- New "DOI 일괄 추가…" menu item opens a paste-many-DOIs modal.
- Newline / comma / semicolon-separated input, deduplicated, processed
  **sequentially** through Crossref (parallel would land in the
  rate-limit category — Crossref's polite pool tolerates a steady
  stream but not bursts).
- Per-row live status (pending → resolving → ok / error) so a list of
  30+ DOIs is never a black box.
- Stop button is wired so a long run is interruptible; partial results
  remain in the bib.

### Track C — RIS / BibTeX import (commit `5062f5c`)
- New "참고문헌 가져오기 (.bib / .ris)…" menu item brings in entries
  from Zotero / EndNote / RefWorks / Web of Science exports.
- Format auto-detect by extension first, content sniff for ambiguous
  drops (`^\s*TY\s*-\s` for RIS, otherwise BibTeX).
- New `shared/ris.ts` parser covers the tags reference managers actually
  emit: TY / AU / A1-3 / ED / TI / T1 / CT / JO / JF / J2 / JA / T2 /
  BT / PY / Y1 / DA / VL / IS / SP / EP / PB / SN / DO / UR / AB / N2
  / ID. Continuation lines fold into the previous tag.
- Preview dialog shows fresh vs colliding keys + parser warnings, and
  exposes a per-import collision mode picker:
  - **rename** (default): append `-2`, `-3`, … to the imported key
  - **skip**: keep the existing entry
  - **replace**: overwrite existing fields

### Quality gates
- 1021 Vitest unit tests across ~122 files (v0.1.7 was 990 → Track A
  1000 → Track B 1005 → Track C 1021; +31 total)
- 16 Playwright Electron E2E tests
- `pnpm lint` clean (0 errors / 0 warnings)
- `pnpm typecheck` clean (0 errors)
- `pnpm build` clean

---

## v0.1.7 — Bibliography polish + local reference library

The bibliography becomes a proper *library*, not just an index. v0.1.6
turned `references.bib` into a live surface; v0.1.7 makes the surrounding
`reference/` folder a first-class part of the manuscript: every entry can
mirror to a local PDF (when open access) or a Markdown abstract (otherwise),
viewable inline from the editor. The folder is **bidirectional** — files
Durumi downloads land there, AND files the user drops there manually are
recognised and offered for one-click registration.

### Track A — `[@`-autocomplete + hover tooltip (commit `214d5e5`)

- **`[@`-autocomplete in the editor**: typing `[@` surfaces a fuzzy-ranked
  drop-down of every key in `references.bib`. Accept → `[@key]` lands
  with the closing bracket already in place.
- **Hover tooltip** for `[@key]`: shows title / author / venue / DOI in a
  floating card. When `entry.fields.file` resolves to a real file, the
  card grows an "📄 Open file" button.
- New `currentParagraph(state)` helper extracts the paragraph surrounding
  the caret. Standalone for now, but it's the input shape v0.1.8's
  AI-assisted citation suggestion needs.
- New dep: `@codemirror/autocomplete`.

### Track B — Local reference download (commit `ca025ff`)

- Each entry can mirror to `<doc-folder>/reference/<key>.{pdf,md}` and be
  opened from the sidebar 📄/📝 badge or the `[@key]` hover tooltip.
- Probe order (per entry, user-initiated, **no background prefetch**):
  | # | Source | Result |
  |:--|:--|:--|
  | 1 | Crossref `link[]` (publisher-tagged PDF) | `.pdf` |
  | 2 | PMC OA service (when a PMID has a PMC counterpart) | `.pdf` |
  | 3 | Unpaywall API (definitive OA-status oracle) | `.pdf` |
  | 4 | HTML scrape via Turndown | `.md` |
  | 5 | Abstract-only stub (formatted from existing fields) | `.md` |
- The downloaded path is persisted back to the bib entry's `file` field
  (POSIX-relative — round-trips across machines).
- Atomic writes (tmp+rename) for both PDF and MD outputs; PDFs validated
  against a `%PDF` magic header before commit.
- New deps: `turndown`, `@types/turndown`.

### Track C — Bidirectional reference sync (commit `f8e46a9`)

- The `reference/` folder is now bidirectional: files the user drops there
  manually (Finder copy, git pull, Zotero export) are surfaced in a
  **"📁 Unregistered files"** sidebar section.
- One-click **Register** flow:
  1. Scan file head for DOI (PDF: trailer Info dict + content; MD: YAML
     front-matter or body)
  2. DOI found → Crossref auto-fetch → bib entry written → toast
  3. No DOI → metadata-entry modal (title required, author/year/journal/
     DOI optional)
- After registration, the file becomes a normal bib entry: `[@`-autocomplete
  picks it up immediately, and the user can insert citations to it the
  same way.
- The `pdfjs-dist` library is intentionally NOT pulled in. A regex over
  the trailer Info dict + first 256KB catches most journal PDFs without
  the 2MB cost. v0.1.8 may upgrade if manual-entry frequency proves high.

### Quality gates
- 990 Vitest unit tests across ~120 files (v0.1.6 was 924 → Track A 948
  → Track B 973 → Track C 990; +66 total)
- 16 Playwright Electron E2E tests
- `pnpm lint` clean (0 errors / 0 warnings)
- `pnpm typecheck` clean (0 errors)
- `pnpm build` clean

### Architecture invariants added in this line of work

These join the list at the bottom of the file. Any future change must
preserve all of them.

- **`reference/` is the user's filesystem too.** Files the user drops
  there are never auto-renamed and never auto-deleted. The bib `file`
  field gets updated to point at user-chosen filenames; only Durumi-
  downloaded files use the canonical `<key>.<ext>` shape.
- **All reference-folder writes are user-initiated.** No fs.watch-driven
  auto-fetch, no scheduled re-scan. The renderer rescans on tab focus
  and after every register / download action — the user always asked for
  the network call before it happens.
- **`file` field is always `references.bib`-relative, POSIX-separated.**
  Absolute paths are tolerated on read (for old Zotero exports) but never
  produced. Forward slashes only — round-trips across macOS / Linux /
  Windows.
- **DOI extraction is best-effort heuristics, not a guarantee.** When
  PDF DOI extraction fails, the renderer ALWAYS falls back to the manual
  metadata modal. There's no silent failure mode where a registered file
  ends up with bogus metadata.
- **Bidirectional sync is reconciliation, not real-time.** The store
  computes orphans as `(files in reference/) − (files claimed by any bib
  entry's file field)`. Two entries pointing at the same file is a no-op
  (both claim it, neither is orphan). Renaming the file outside Durumi
  produces an orphan + a stale entry — the renderer's status badge
  shows "missing file" so the user sees the breakage.

---

## v0.1.6 — Live reference search

The bibliography becomes a live surface. v0.1.6 turns `references.bib` from
a passively-discovered file into a write target the editor manages directly:
DOIs resolve to BibTeX entries, Crossref / PubMed / KoreaMed feed a
keyword search panel, ORCID iDs verify in Settings — all without a sidecar,
DB, or external dependency like Zotero. The `.bib` file remains the single
source of truth; new code only reads from and writes to it.

### Track A — DOI → BibTeX (commit `c9180ff`)

- New **Cmd/Ctrl + Shift + B "DOI로 인용 삽입"** modal — paste a DOI,
  preview the resolved entry, confirm to append to `references.bib` and
  insert `[@key]` at the editor caret in one motion.
- New `shared/bibtexWriter.ts` — `formatEntry` BibTeX serializer with
  canonical field ordering, balanced-brace escaping, UTF-8 preserved.
- New `shared/citationKey.ts` — deterministic `lastnameYEARword` keys with
  Standard Revised Romanization for Hangul authors (`김민걸 → gim`),
  collision suffixes `a/b/c`.
- New `electron/bibliographyFetch.ts` — Crossref `/works/{doi}` adapter,
  10s timeout, polite-pool User-Agent, structured error codes
  (`not-found` / `network` / `parse` / `timeout` / `rate-limit` / `http`).
- New `electron/bibliographyWrite.ts` — `ensureBibFile(docPath)` defaults
  to the document's folder, `appendEntry` writes atomically (tmp+rename).
- New Zustand `bibliographyStore` — caches parsed entries, `bindToDocument`
  on filePath change, `addFromDoi` / `addEntry` helpers.
- New Settings section "참고문헌 / Bibliography" — Crossref polite-pool
  email, NCBI E-utilities API key, ORCID iD.

### Track B — Crossref / PubMed search panel (commit `d20143c`)

- New **6th sidebar tab "참고문헌 / References"** — search bar with source
  dropdown (Crossref / PubMed), 300ms debounce, result cards with one-click
  "추가" button that appends to `.bib` and inserts `[@key]` at the caret.
- Local `references.bib` entries listed below results with a fuzzy filter;
  click → insert `[@key]`.
- **OFFLINE mode**: navigator.onLine listener disables remote search and
  swaps in an "오프라인" badge; local entries remain fully usable.
- New **Cmd/Ctrl + Shift + I "인용 삽입" palette** — Quick Open-style
  fuzzy filter over local entries; ↑/↓ Enter Esc keyboard model.
- PubMed via NCBI E-utilities (ESearch + ESummary, JSON). API key from
  Settings raises rate limit from 3 → 10 req/s.
- 검토 menu gains "DOI로 인용 삽입…", "인용 삽입…", "참고문헌 탭 보이기".

### Track C — KoreaMed scraper + ORCID resolver (commit `8525af8`)

- KoreaMed joins the source dropdown. Since the official OpenAPI is
  intermittent, we scrape the public `SearchBasic.php` result page —
  entries extracted by field-by-field regex (title / authors /
  journalInfo / DOI), each row guarded so a malformed entry never poisons
  the result set.
- New `parseJournalInfo` parses Vancouver-style citation lines
  ("Korean J Med. 2024 Mar;99(2):101-110.") into year / volume / number /
  pages.
- New ORCID resolver (`pub.orcid.org/v3.0/{iD}/record`) — Settings
  Bibliography section gains a "Verify" button that surfaces the credit
  name + first employment + works count inline.
- All four scrapers/APIs share the same `httpJson` / `httpText` helpers
  (timeout, structured error codes, User-Agent identification).

### Quality gates
- 924 Vitest unit tests across ~117 files (v0.1.5 was 804 → Track A 878
  → Track B 898 → Track C 924; +120 total)
- 16 Playwright Electron E2E tests
- `pnpm lint` clean (0 errors / 0 warnings)
- `pnpm typecheck` clean (0 errors)
- `pnpm build` clean

### Architecture invariants added in this line of work

These join the list at the bottom of the file. Any future change must
preserve all of them.

- **`.bib` is the single source of truth — the in-memory store is a cache.**
  No sidecar JSON, no SQLite, no Zotero coupling. External edits (manual
  edits, other tools writing the file) flow back via `bindToDocument`'s
  re-read; the store never holds state the file doesn't.
- **All outbound HTTP runs in the main process.** The renderer never calls
  `fetch` directly. This keeps the renderer security-isolated, consolidates
  CORS / User-Agent / rate-limit handling, and makes the API-key surface
  (NCBI) safe to read from prefs.
- **`.bib` writes are atomic (tmp+rename, same dir).** Concurrent writes
  during a Pandoc export, or a crash mid-write, never leave the file
  half-corrupted. Same pattern as v0.1.4 Track A's `memoSidecar:write`.
- **Citation-key generation is deterministic.** `makeCitationKey(entry,
  existingKeys)` always produces the same key for the same input. The
  algorithm: `lastname + year + firstSignificantTitleWord`, lowercased,
  ASCII-only via NFD strip + Standard RR for Hangul. Collisions suffixed
  `a`/`b`/…/`z`, then `-1`/`-2`/… for the pathological case.
- **External network calls are explicitly user-initiated.** No background
  prefetch, no autocomplete polling. The user pastes a DOI / clicks search
  / clicks Verify — and only then does Durumi reach the network. (Privacy
  + offline-friendly + locked-down academic networks are first-class
  citizens of the medical-research workflow.)
- **HTML scraping is the documented fallback for KoreaMed only.** When a
  source has a stable JSON API (Crossref, PubMed, ORCID) we use it; when
  it does not (KoreaMed), we scrape `SearchBasic.php` and pin the
  selectors with synthetic-HTML tests so a parser regression is caught
  locally before it reaches users.

---

## v0.1.5 — 검토 menu + context-menu discovery

A polish/discoverability release on top of v0.1.4. The memo and CriticMarkup
features that shipped in v0.1.3 + v0.1.4 were discoverable only through
keyboard shortcuts (or the sidebar tabs); v0.1.5 adds a native **검토 / Review**
menu and an editor right-click context menu so every operation has a visible
home. No source-syntax or export changes — purely an entry-point release.

### Native 검토 / Review menu (between View and Help)

- 메모 추가 (`Cmd/Ctrl + Alt + M`)
- 메모 패널 표시/숨기기 (`Cmd/Ctrl + Shift + M`) — moved here from the View menu
- 변경 추적 (CriticMarkup) ▶ submenu — 5 items, no shortcuts: 삽입 표시 /
  삭제 표시 / 치환 표시 / 강조 표시 / 주석 표시
- 메모 탭 보이기 / 변경 탭 보이기 (sidebar tab navigation)
- 다음 메모로 이동 (`F3`) / 이전 메모로 이동 (`Shift + F3`) — wrap-around;
  skips the memo the caret is currently inside (matches Word UX)
- ☐ 내보내기에 메모 포함 (checkbox; mirrors `prefs.exportIncludeComments`)
- ☐ 내보내기에 변경 표시 포함 (checkbox; mirrors
  `prefs.exportPreserveAnnotations`)

### Editor right-click context menu (gated on `params.isEditable`)

- Cut / Copy / Paste (Electron standard; preserved from previous behavior)
- 메모 추가 (Cmd+Alt+M label)
- 변경 추적 ▶ — same 5 CriticMarkup operators as the native menu
- 링크 삽입 (Cmd+K label)
- (Existing spell-check items: dictionary suggestions / Add to dictionary /
  Ignore)

### Substitute caret behavior

When wrapping in `{~~ ~> ~~}`:

- With selection → caret lands in the empty NEW slot of `{~~ selection ~> ⎵ ~~}`
- Without selection → caret lands in the OLD slot of `{~~ ⎵ ~>  ~~}`

### Implementation

- New `src/editor/keymap/wrapCriticMarkup.ts` — 5 wrap functions for the CM
  operators, shared by the menu, context menu, and any future shortcut.
- New `src/editor/keymap/memoNav.ts` — `nextMemo` / `prevMemo` with
  wrap-around; skips the memo currently containing the caret.
- File rename: `electron/spellCheck.ts` → `electron/contextMenu.ts`. The
  file now absorbs both spell-check items and the new memo / CriticMarkup /
  link-insert items, gated on `params.isEditable`. Rebuilt per popup so the
  current language preference is honored on every right-click.
- New tests:
  - `tests/editor/wrapCriticMarkup.test.ts` (11)
  - `tests/editor/memoNav.test.ts` (8)

### Quality gates
- 804 Vitest unit tests across ~109 files (v0.1.4 was 785 → +19 from the two
  new test files)
- 16 Playwright Electron E2E tests
- `pnpm lint` clean (0 errors / 0 warnings)
- `pnpm typecheck` clean (0 errors)
- `pnpm build` clean

Reference commit: `db1951a`. No new architecture invariants — this is a
discovery layer over existing v0.1.3 + v0.1.4 features.

---

## v0.1.4 — Memo maturation + CriticMarkup

The post-v0.1.2 line of work split into three commits across two minor releases. Together they evolve the memo system from a flat list of `%% %%` annotations into a Word-style review surface with author identity, threading, resolution state, and grouping — and add a full CriticMarkup track-changes notation alongside it. Every code path remains backward compatible: a v0.1.2 document with no sidecar and no `{++ ++}` markers continues to render byte-identically.

### v0.1.3 — MS Word-style memo chat panel (commit `ca61824`)

- The memo body text is now hidden inline; a right-side **chat panel** shows each memo as a Word-style card on its own row, vertically aligned with the source line.
- The line-end marker collapses to a small color-coded `💬` icon. Clicking it focuses the matching card.
- Panel auto-shows when the document has at least one memo. The user can dismiss it for the session via the panel's `×` button. `Cmd/Ctrl + Shift + M` toggles.
- Each card has a tag dropdown (`@ai` / `@todo` / `@reviewer` / `@stats` / no-tag / custom), an auto-grow textarea, and a delete button. Edits sync card ↔ markdown source through a 300 ms debounce.
- New `replaceMemo()` helper in `shared/comments.ts` auto-promotes inline ↔ block depending on whether the body picked up a newline.
- Source `%% memo %%` syntax, sidebar 메모 tab, status bar count, `Cmd + Alt + M` wrap shortcut, and export-strip safety are all unchanged.
- Panel width persisted to prefs (`memoPanel.width`), default 320 px.

### v0.1.4 Track A — memo threading + author + resolved + grouping (commit `a41026b`)

- New **sidecar JSON** file alongside each `.md` (`<doc>.md.comments.json`) holds threading, author, timestamps, and resolved state. v0.1.3 documents without a sidecar continue to work — the sidecar is *augmenting* metadata, never the source of truth.
- New `shared/memoSidecar.ts` with pure immutable update fns: `memoIdFor`, `ensureMeta`, `migrateMemoMeta`, `pruneOrphans`, `setResolved`, `addReply`, `removeReply`, `parseSidecar`.
- Memo identity = `cyrb53(body + ':' + tag)` first 12 chars; ID migration on body edits via `migrateId(old, new)` in the sidecar store. Reply IDs use `crypto.randomUUID()` when available.
- Orphan entries (sidecar IDs no longer matching any memo) get a 7-day grace before pruning.
- New `electron/ipc.ts` handlers `memoSidecar:read` / `memoSidecar:write` (atomic tmp+rename). New Zustand `memoSidecarStore.ts` with 1 s debounced autosave; reactive to `appStore.filePath`. `Cmd+S` explicitly flushes the sidecar; Save-As re-binds the sidecar path.
- New `useMemoMeta(memo): MemoMeta` hook with effect-based lazy `ensureMeta`.
- `MemoCard` extensions: header with author chip, relative time ("3h ago" / "3시간 전"), resolved checkbox at top-right, reply thread list, Reply / Send / Cancel buttons.
- `MemoPanel` extensions: group-by dropdown (라인 순 / 태그별 / 작성자별 / 상태별); hide-resolved toggle (default ON).
- New `src/utils/relativeTime.ts` (i18n-aware).
- New prefs: `author.name` (default = `os.userInfo().username || 'Anonymous'`), `memoPanel.hideResolvedDefault: true`, `memoPanel.groupBy: 'line'`.
- Settings dialog gets a new "Author / 작성자" section with the name input.

### v0.1.4 Track B — CriticMarkup track changes (commit `381a6ba`)

The five [Fletcher CriticMarkup](https://fletcher.github.io/MultiMarkdown-6/syntax/critic.html) operators, end-to-end.

| Operator | Meaning | Editor rendering |
| :--- | :--- | :--- |
| `{++ added text ++}` | insertion | green underline |
| `{-- deleted text --}` | deletion | red strikethrough |
| `{~~ old ~> new ~~}` | substitution | red-strike old + arrow + green-underline new |
| `{== marked ==}` | review-highlight | distinct heavier-yellow tint (separate from `==text==`) |
| `{>> short comment <<}` | margin comment | purple `💬` pill widget |

- New `src/editor/markdownExt/criticMarkup.ts` — five inline parsers, registered `before:` Emphasis / Strikethrough / Subscript / Highlight; reject empty body and multi-line.
- New `src/editor/decorations/criticMarkup.ts` — StateField with per-operator widgets/marks; active-line invariant preserved; comment widget click fires `durumi:cm-focus`.
- New `shared/criticMarkup.ts` — pure regex `parseCmAnnotations` + `transformCm(src, mode, target)` for export pipeline. Fence-skip + idempotent on plain markdown.
- New `src/hooks/useDocCriticMarkup.ts` — 100 ms debounced parse + per-kind counts.
- New 5th sidebar tab **변경 / Changes** via `src/components/sidebar/ChangesTab.tsx` — grouped by kind, click → jump, includes a help blurb explaining `{== ==}` vs `==text==`.
- Status bar: when CM count > 0, badges `+N -N ~N ▮N 💬N` next to the memo counter.
- **Export safety**: default mode is **accept all changes** (clean submission-ready output). Settings checkbox `exportPreserveAnnotations` opts into preserve mode → emits `<ins>` / `<del>` / `<mark>` / `<aside>` (HTML) or Pandoc-styled spans `[text]{.insertion/.deletion/.highlight}` and a `::: comment` fenced div. `transformCm` runs **after** comment processing in `renderHtml` and **before** the Pandoc IPC call.
- New pref `exportPreserveAnnotations: false` (default).

### Quality gates
- 785 Vitest unit tests across ~110 files (v0.1.2 was 643 → v0.1.3 655 → v0.1.4 Track A 709 → v0.1.4 Track B 785)
- 16 Playwright Electron E2E tests
- `pnpm lint` clean (0 errors / 0 warnings)
- `pnpm typecheck` clean (0 errors)

### Architecture invariants added in this line of work

These join the earlier list at the bottom of this file. Any future change must preserve all of them.

- **Memo body text is the markdown source — sidecar is augmenting metadata only.** A reader without `<doc>.md.comments.json` still sees every memo. The sidecar holds author, timestamps, replies, and resolved state, but never the memo's text. This is what keeps `.md` files portable across editors.
- **Memo IDs derive from the `body+tag` hash and mutate on edit.** When the user edits a memo, its `cyrb53` ID changes. The sidecar store handles this via `migrateId(old, new)` on the next sync; any existing replies / resolved state move along. Orphans (sidecar entries with no matching memo for 7 days) are pruned by `pruneOrphans`.
- **Comment policy is applied BEFORE the CriticMarkup transform in export.** A `%% memo %%` wrapping a `{++ ... ++}` run is removed at the outer level first by `stripComments` / `promoteComments`; only then does `transformCm` see the (now-unwrapped) CriticMarkup. Reversing the order would let a strip leak the inner annotation.
- **CriticMarkup parsers MUST register `before:` Emphasis / Strikethrough / Subscript / Highlight.** The `{~~ ~> ~~}` substitution and `{-- --}` deletion both contain runs that overlap with Strikethrough's `~~ ~~` and Subscript's `~ ~`; without explicit `before:` ordering, lezer's GFM extension consumes the inner text first and the CriticMarkup parser never fires.

---

## v0.1.2 — Manuscript Studio v1

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

The shape of post-v0.1.5 work, in rough priority order. Each item gets its own design + plan cycle when picked up.

> ✓ **Shipped in v0.1.4** — CriticMarkup track-changes (`{++ ++}` / `{-- --}` / `{~~ ~> ~~}` / `{== ==}` / `{>> <<}`), commit `381a6ba`. Originally roadmap item 7.
> ✓ **Shipped in v0.1.6** — Live reference search (Crossref / PubMed / KoreaMed / ORCID), commits `c9180ff` / `d20143c` / `8525af8`. Originally roadmap item 1.

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

### 7 — Real code-signing
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

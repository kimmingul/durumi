# Durumi — Progress

## v0.2.4 (current) — Phase 3.1.1: in-place table cell editing

First slice of the v0.3 table-editing roadmap. Markdown tables in
Document (WYSIWYG) mode are no longer collapsed back to source when
the caret enters their range — instead each cell becomes a
`contentEditable` surface that the user clicks and types into
directly. Inline syntax inside cells still renders as **literal**
text (rendering `**bold**` as bold lands in Phase 3.1.2). No
breaking changes; existing tables in saved documents continue to
work because the canonical markdown source is unchanged.

### What changed

**In-place table cell editing.** Each row of a GFM table is rendered
as a single block widget with cells exposed as `<div
contentEditable>`. Click into a cell, type, click out — the
markdown source updates as `| <typed-text> |`. Pipes typed in the
cell text are escaped as `\|` so the row keeps its column count.

**Korean-IME-safe input.** Every cell tracks
`data-composing="true"` between `compositionstart` and
`compositionend`. The `input` listener bails while composing; only
`compositionend` triggers a single sync. This mirrors invariant #1
(IME-safe marker hide) at the cell scope. Mid-composition Tab
flushes the in-progress text before navigating.

**Cell-to-cell navigation.** Tab moves to the next cell, Shift+Tab
to the previous, Enter to the same column on the next row, Arrow
Up/Down to the same column above/below. Tab in the very last cell
of the table is a no-op (Phase 3.2 will add the
"insert row on Tab-overflow" behaviour).

**Active-line invariant deviation, table-only.** Documented as
invariant #11 in `CONTRIBUTING.md`. Tables are unique because they
have no inline markers to hide (the `|` chars are structural, not
punctuation markers); collapsing back to raw markdown when the
caret enters the row would defeat the entire feature. This
deviation must not be copied to other constructs (math, mermaid,
images, etc.) without separate design review.

### Files

- New `src/editor/markdownExt/tableEdit.ts` — pure helpers
  (`cellTextToMarkdown`, `markdownToCellText`, `findCellRange`,
  `findCellPipeSpan`, `replaceCellText`) for round-tripping cell
  text into the markdown source. Pipe-escape aware so embedded `|`
  characters survive both directions. Programmatic dispatches use
  `userEvent: 'input.cellEdit'` so the WYSIWYG strict-literal
  filter ignores them.
- New `src/editor/keymap/tableNavigation.ts` — DOM-level
  `navigateNextCell` / `navigatePrevCell` / `navigateNextRow` /
  `navigatePrevRow` invoked from the cell's `keydown` handler
  (CodeMirror keymap can't reach focus inside a contentEditable
  widget, so these are pure DOM walks via `data-*` attrs).
- Rewrite `src/editor/decorations/table.ts` — table widget now
  renders contentEditable cells with `compositionstart` /
  `compositionend` / `input` / `keydown` listeners,
  `ignoreEvent() => true` (so CM's mousedown / Cmd+A etc. don't
  reach inside the widget), and an `updateDOM` path that preserves
  focus + caret across the post-sync rebuild.
- `tests/editor/tableEdit.test.ts` — 26 new vitest cases covering
  cell-text round-trips (with pipes, backslashes, Korean), cell
  range lookup with the delimiter row skipped, and the integration
  with `EditorView` (pipe escape, Korean text, out-of-range guards,
  wysiwyg-filter bypass).
- `e2e/table-cell-edit.spec.ts` — 11 new Playwright Electron cases
  covering click-to-edit, Tab / Shift+Tab / Arrow Up/Down / Enter
  navigation, empty-cell typing, pipe-char escape, Korean text via
  `keyboard.type`, an explicit `compositionstart` /
  `compositionend` cycle (the IME guard at the DOM event level),
  and the mid-text Tab commit.
- `CONTRIBUTING.md` — new invariant #11 documenting the
  active-line deviation for tables.

### Test count

- vitest: 1323 → 1349 (+26)
- Playwright e2e: 51 → 62 (+11)

## v0.2.3 — Maintenance: v0.2.x hardening band closeout

Closing release for the v0.2.x hardening band. No new user-facing
features and no breaking changes — purely **internal quality
improvements** (refactors, e2e stabilization, bundle perf, signing
runbook, image-rendering case study). Auto-updater serves it
transparently to v0.2.2 users. See
[docs/v0.2-hardening.md](v0.2-hardening.md) for the full P0–P3 ledger;
this release completes the band by landing P2 + P3 items previously
deferred.

### What changed

**P2-1 — `src/App.tsx` decomposition ([`fd66ff1`](https://github.com/kimmingul/durumi/commit/fd66ff1)).**
Extracted 12 hooks (`useFileMenuCommands`, `useExportFlow`,
`useAiPalette`, `useCitationInsertFlow`, `useWorkspaceMenu`,
`useMenuCommandRouter`, `useAppChromeEffects`, `usePreferencesInit`,
`useCustomCss`, `useAppCloseGuard`, `useMemoEvents`,
`usePickAndInsertImage`) into `src/hooks/`. App.tsx **906 → 246
lines**; what remains is pure orchestration. Pure refactor, no
behaviour change.

**P2-2 — `electron/ipc.ts` decomposition ([`45830b2`](https://github.com/kimmingul/durumi/commit/45830b2)).**
Split a single 889-line monolith into 10 per-domain modules under
`electron/ipc/`: `files`, `preferences`, `search`, `bibliography`,
`bibliographyFetch`, `reference`, `ai`, `pandoc`, `shell`, plus a
`_shared.ts` for cross-domain helpers. The barrel `electron/ipc.ts`
is now 39 lines and just wires the `KeyVault` + calls each domain's
`register*Handlers`. **No file > 200 lines**. All
`assertAllowedPath` / `allowSessionPath` / `assertPrefsPatchAllowed`
calls preserved verbatim.

**P3-1 — e2e suite stabilized ([`c9df4d0`](https://github.com/kimmingul/durumi/commit/c9df4d0)).**
**9 pre-existing test failures → 0**. Root-caused as two clusters:

  - **WYSIWYG strict-literal mode** (7 tests) — v0.1.13 made WYSIWYG
    the default edit mode and that mode escapes user typing (`# X` →
    `\# X`), but the e2e specs were written assuming legacy Typora
    behaviour. Fixed by a new `setTyporaMode(app, page)` helper called
    at the top of each affected spec.
  - **Path-guard + persisted state pollution** (2 tests) — workspace
    specs inject `fs.mkdtempSync` paths via `prefs:set`, which the
    v0.2.1 path guard rejected as un-dialogued. Added a `DURUMI_E2E=1`
    env bypass in `electron/pathGuard.ts` that accepts paths under
    `os.tmpdir()` only when the env var is set; the `test:e2e` script
    forwards it. Production builds never set this, and the renderer
    can't influence main-process env.

**16 / 16 e2e tests now pass.**

**P3-2 — renderer main chunk shrunk ([`af29940`](https://github.com/kimmingul/durumi/commit/af29940)).**
Main chunk **3.06 MB → 1.74 MB (-43%, -1.3 MB)**. Lazy boundaries
added behind dynamic `import()` or `React.lazy`:

  - **KaTeX** — split to its own ~481 KB chunk, loads on first math
    expression or export
  - **`renderHtml` cluster** (markdown-it + plugins + bibliography
    pipeline) — loads only on export
  - **markdown-it for table cells** — same chunk as renderHtml
  - **node-emoji + emojilib** — loads on first `:query` trigger
  - **js-yaml front-matter parser** — split via a new
    `shared/frontMatterFenced.ts` so the synchronous fence-only
    callers don't drag in the full YAML parser
  - **12 top-level dialogs** (`SettingsDialog`,
    `PandocInstallDialog`, `InsertCitationDialog`, `BulkDoiDialog`,
    `ImportReferencesDialog`, `KeyboardShortcutsDialog`,
    `CitePalette`, `AiCommandPalette`, `CitationSuggestPanel`,
    `OrphanRegisterDialog`, `EditEntryDialog`, `RenameKeyDialog`)
    → `React.lazy` + open-gated render with `Suspense fallback={null}`

The remaining ~1.7 MB is essentially mandatory editor core
(CodeMirror + Lezer + React shell). Stretch target of ≤ 1.5 MB
would require re-architecting CodeMirror loading; out of scope.

**P3-3 — signing runbook + dormant config templates
([`4b9a42a`](https://github.com/kimmingul/durumi/commit/4b9a42a)).**
Two new subsections in `docs/RELEASE.md` ("Path to real macOS
signing" with 8 numbered steps, "Path to real Windows signing" with
6 steps + OV/EV tradeoff table) plus an "Ongoing cost" footer
(~$300/yr for the dual-platform path). Commented templates in
`electron-builder.yml` and `.github/workflows/release.yml` show
exactly which lines to uncomment once GitHub Secrets are in place.
New dormant `build/entitlements.mac.plist` for hardened-runtime
notarization. **Current ad-hoc signing config unchanged** — the
runbook activates with cert acquisition, not with this release.

**Image-rendering case study ([`3fe4a39`](https://github.com/kimmingul/durumi/commit/3fe4a39)).**
The v0.2.2 image-render fix involved four independent root causes
that had to fall before pasted images would render. The new
**773-line [docs/image-rendering.md](image-rendering.md)** is a
full case study: how the bug manifested, why it had been silently
broken since v0.1.2, the architectural rationale for the chosen
fix (`durumi-asset://` custom protocol vs. the rejected
alternatives), each root cause with its fix and verification, the
diagnostic process and the "instrument main, NOT just renderer"
lesson, 6 forward-looking invariants, and a 5-step verification
walkthrough for future debugging. Also updated `CONTRIBUTING.md`
with the 4 new v0.2.x security invariants (sandbox lock,
`durumi-asset://` URL shape, CSP whitelist, path-guard
`sessionAllowedTrees`) — contributor invariant list now totals 10.

### Quality gates

- `pnpm lint`: clean
- `pnpm typecheck`: clean
- `pnpm test`: **1308 / 1308** vitest across 147 files (baseline
  preserved across the refactors)
- `pnpm test:e2e`: **16 / 16** Playwright Electron tests (was 7 / 16
  in v0.2.2)
- `pnpm build`: clean, **main chunk 1.74 MB** (was 3.06 MB)

### v0.2.x hardening band — done

This release closes the band. Final ledger:

| Priority | Items | Status |
|:--|:--|:--|
| **P0** Data integrity / trust | atomic write, CriticMarkup escape | ✅ v0.2.0 |
| **P1** Security posture | atomic build, sandbox, path guard, AI key honesty, bind side-effect | ✅ v0.2.1 + v0.2.2 |
| **P2** Maintainability | App.tsx + ipc.ts decomposition | ✅ v0.2.3 |
| **P3** Release gates | e2e stabilization, bundle perf, signing runbook | ✅ v0.2.3 |

Next priority: P3 cert acquisition (Apple Developer ID + Windows
OV cert) — that's a $300/yr user task, not a code task. Once secrets
are wired up, uncomment the marked lines and the next tagged release
ships signed.

### Auto-update

v0.2.2 users see the "Download v0.2.3" prompt within ~30s of opening
the app. Restart when ready. No code-level behaviour change for
legitimate workflows; the only user-visible improvement is faster
first-paint from the bundle shrink (cold launch on Apple Silicon
typically reads ~1.3 MB less from the .asar).

---

## v0.2.2 — Hardening III: Electron sandbox + image-render fix

Final P1 hardening release. Flips `webPreferences.sandbox` to true on
the BrowserWindow and fixes a long-standing image-rendering bug that
was surfaced during the sandbox smoke test. See
[docs/v0.2-hardening.md](v0.2-hardening.md) for the full P1 ledger;
this release completes the P1 cycle.

> *See [docs/image-rendering.md](image-rendering.md) for the full case
> study of the image-render fix — diagnostic process, architectural
> rationale, the four root causes that had to fall, and the invariants
> future maintainers must keep intact.*

### Electron `sandbox: true` (P1-1 → [`f38c4a2`](https://github.com/kimmingul/durumi/commit/f38c4a2))

Static analysis during v0.2.0 had already shown that the preload was
`contextBridge`-only and the renderer was Node-free, so the flip is a
one-line config change in `electron/main.ts`. Combined with
`contextIsolation: true`, `nodeIntegration: false`, and the v0.2.1
path-scoped IPC guard, the renderer is now defence-in-depth isolated
from the filesystem: even an XSS-compromised renderer can't reach
`/etc/passwd` through any IPC, and the OS-level sandbox blocks
out-of-process escape attempts on top.

### Image-render fix

The smoke test surfaced a bug that had been present since v0.1.2: the
editor's image widget set `<img src>` to the raw markdown URL (a
relative path like `assets/img-*.png`), which the browser resolved
against the *renderer's* URL (`file:///…/out/renderer/`), not the
document's directory. Images saved to `<doc_dir>/assets/` silently
404'd. Three separate root causes had to fall before images rendered:

1. **No path resolution at the widget**. The widget had no knowledge
   of the active document's directory, so it couldn't build a
   correct URL. Fixed with a `docPath` StateField threaded through
   the editor by `MarkdownEditor`, plus a `resolveImageSrc` helper
   that joins relative paths against `dirname(docPath)` and wraps
   them in a custom `durumi-asset://` URL. The custom scheme is
   handled in main with the same path-guard allowlist as the IPC
   layer.

2. **Path guard rejected the asset**. `assets/` lives next to the
   `.md` file but the v0.2.1 path guard only trusted the *exact*
   dialog-returned `.md` path. Extended in `electron/pathGuard.ts`:
   `allowSessionPath(p)` now also registers `dirname(p)` as a
   session-trusted tree, and `bootstrapSessionTreesFromRecents()`
   pre-populates recent-file dirnames at `app.whenReady()` so
   reopening a recent doc finds its assets without re-adding the
   folder as a workspace.

3. **CSP blocked the custom scheme**. Even with the URL built and
   the path-guard trusting the asset, the renderer's
   `Content-Security-Policy` meta tag did not whitelist
   `durumi-asset:` in `img-src` — Electron enforces the meta CSP on
   `<img>` loads regardless of scheme privileges. Fixed by adding
   `durumi-asset:` to the `img-src` directive in `index.html`.

4. **URL pathname normalisation** (subtler). The first attempt
   encoded the absolute path in the URL *pathname*
   (`durumi-asset:///%2FUsers%2F…`). Chromium's standard-scheme URL
   parser silently normalises `%2F` inside the pathname back to a
   literal `/`, corrupting the absolute path before the handler
   could decode it. Fixed by moving the absolute path into the URL
   *query string* (`durumi-asset://x/?p=…`); query-string
   percent-encoding round-trips unchanged through the parser.

### Other improvements bundled here

- **Toggle Developer Tools in View menu** is now always visible
  (previously gated on `NODE_ENV=development`). Matches VS Code /
  Slack / Discord; lets power users self-diagnose without a rebuild.
- **Image-load failure surfacing**: the widget's `<img>` has an
  `onerror` handler that logs the resolved URL to the renderer
  console, plus `data-md-src` / `data-resolved-src` attributes for
  DevTools inspection. The protocol handler appends a one-line
  diagnostic to `<userData>/asset-protocol.log` for **non-200**
  responses (success path is silent so the log doesn't grow).

### Quality gates

- `pnpm lint`: clean
- `pnpm typecheck`: clean
- `pnpm test`: **1308 / 1308** tests across 147 files (was 1286 / 146
  in v0.2.1; +22 covering `resolveImageSrc` URL classification and
  `pathGuard` session-tree behavior)
- `pnpm build`: clean
- Visual smoke verified on macOS arm64 DMG: image paste/drop renders
  in Document and Live modes, Recent Files still works, app starts
  cleanly under `sandbox: true`

### Auto-update

v0.2.1 users will see the "Download v0.2.2" prompt within ~30s of
opening the app. No code-level behaviour change for legitimate
workflows. The image-render fix is purely additive; an existing doc
that previously had broken images now renders them correctly.

---

## v0.2.1 — Hardening II: AI key honesty + no-write bibliography bind + path-scoped IPC guard

Second hardening release. Lands three of the four P1 items from
[docs/v0.2-hardening.md](v0.2-hardening.md). All are backend / IPC
changes plus one small UI surface — no manual smoke-test gate, so
the trio shipped together. The remaining P1 item (Electron
`sandbox: true` flip) ships separately because it needs a manual
DMG/EXE walk-through; that's the v0.2.2 release.

### What changed

**AI key plaintext fallback honesty (P1-3 → [`7a84633`](https://github.com/kimmingul/durumi/commit/7a84633)).**
The old `aiHasKey()` boolean said *whether* a key was stored, never *how*.
On Linux without an OS keyring `safeStorage.isEncryptionAvailable()` returns
false and `aiKeys.ts` had long fallen back to a `plain:` prefix — silently.
Now: a new IPC `aiKeyStatus()` returns
`'none' | 'encrypted' | 'plaintext'` sourced from the storage prefix
without decrypting; `aiEncryptionAvailable()` lets the renderer warn
*before* a save. UX: a persistent warning paragraph + a `Save (plaintext)`
button label on keyless systems, plus a per-key 🔒/🔓 badge below each
provider's input. The misleading header comment in `aiKeys.ts` was
rewritten to match the actual behaviour.

**`bindToDocument` no longer creates the `.bib` (P1-4 → [`e1843cf`](https://github.com/kimmingul/durumi/commit/e1843cf)).**
Opening a manuscript silently materialised `references.bib` in the user's
folder. The store's `bindToDocument` fell back to `bibliographyEnsureFile`
when no existing `.bib` was discovered, and that handler creates the file
as a side effect — despite a comment claiming "record the would-be path."
Now: a new pure helper `computeBibPath()` does the discovery probe and
returns `{ path, exists }` without touching disk; the `.bib` materialises
on the first `addEntry` call (whose atomic tmp+rename write already
creates the file when missing). A regression-guard test asserts
`bibliographyEnsureFile` is *not* called during a bind, so the old
side-effect can't sneak back in.

**Path-scoped IPC validation (P1-2 → [`4b86193`](https://github.com/kimmingul/durumi/commit/4b86193)).**
A compromised renderer could previously call `file:openPath` /
`file:save` / dozens of others with `/etc/passwd` or `~/.ssh/id_rsa`.
New module `electron/pathGuard.ts` exposes
`assertAllowedPath(p)` which throws unless `p` is inside a workspace
folder, an exact match for a recent-files entry, or registered via
`allowSessionPath()` after a main-side dialog. Applied at the handler
boundary of every renderer-supplied path (~30 handlers across files,
fs, bibliography, reference, memoSidecar, pandoc, git, search, image).
Dialog handlers register their returns into the session allowlist.
`prefs:set` is guarded so the renderer can't poison the allowlist
itself by smuggling untrusted paths into `workspaceFolders` /
`recentFiles`. Paths are `path.resolve()`'d before comparison so `..`
traversal collapses; the prefix check uses `startsWith(root + sep)` so
`/foo` doesn't accidentally allow `/foo-clone/file`. Symlink resolution
via `fs.realpath` was intentionally skipped to keep the guard cheap.

### Quality gates
- `pnpm lint`: clean
- `pnpm typecheck`: clean
- `pnpm test`: **1286 / 1286** tests across 146 files (was 1261 / 145
  in v0.2.0; +25 tests covering `keyStatusOf`, `computeBibPath`
  side-effect guard, the `exists`-flip after first addEntry, and the
  17-case pathGuard suite)

### Auto-update
v0.2.0 users will see the "Download v0.2.1" prompt within ~30s of
opening the app. No behaviour change to legitimate workflows — the
path guard only fires on paths the renderer shouldn't have been
sending anyway. AI key UX gets a visible upgrade on Linux; on macOS
and Windows the new 🔒 badge is purely informational.

---

## v0.2.0 — Hardening: atomic markdown write + CriticMarkup XSS fix

First hardening release. Lands the two highest-priority items from the
external review of v0.1.14 — both real data-integrity / trust bugs in
shipped code, not feature work. Sets up the v0.2.x cycle that will
work through the remaining P1 items in [docs/v0.2-hardening.md](v0.2-hardening.md).

### What changed

**Atomic Markdown body save.** Previously the main document save path
([electron/ipc.ts](../electron/ipc.ts) `file:save`, `file:saveAs`,
`export:file` HTML branch) called `fs.writeFile` directly. A crash or
power loss mid-write could leave the user's manuscript truncated. The
memo sidecar and `.bib` writer already used tmp+rename — the body was
the *least* protected file in the app despite being the most valuable.

A new shared helper `writeFileAtomic` in [electron/fs.ts](../electron/fs.ts)
now does the tmp+rename + parent-dir creation in one place. Both the
sidecar writer and `bibliographyWrite.atomicWrite` were reduced to thin
wrappers around it, so all three storage paths share the same
crash-consistency contract.

Tmp filenames combine `pid + ts + process-local counter`. The counter
fixes a latent bug in the previous tmp-naming scheme (`pid + ts` only)
where two writes within the same millisecond would collide on the tmp
filename and one would mysteriously ENOENT on rename. The bug existed
in `bibliographyWrite` since v0.1.6 — surfaced by the new
`writeFileAtomic` concurrency test.

**CriticMarkup preserve-mode HTML escape.** The
`transformCm(..., 'preserve', 'html')` path in
[shared/criticMarkup.ts](../shared/criticMarkup.ts) was the only HTML
emitter in the export pipeline that did *not* escape annotation text
before wrapping it in raw `<ins>` / `<del>` / `<mark>` / `<aside>`
tags. A co-author's `.md` containing `{++<script>...++}` would
therefore execute script in the exported HTML — and "open a manuscript
sent by a collaborator and export it" is the core medical-research
workflow.

The fix moves `escapeHtml` to [shared/escapeHtml.ts](../shared/escapeHtml.ts)
(the export-side path becomes a re-export so the existing five
`src/export/*.ts` call sites stay untouched) and applies it inside the
preserve+html branch. Five regression tests cover the five annotation
kinds with HTML metacharacters in the input.

### Hardening roadmap

[docs/v0.2-hardening.md](v0.2-hardening.md) — new — captures the full
v0.2.x → v0.3.x hardening plan derived from the external review:

- **P0 (this release)** — atomic write, CriticMarkup escape.
- **P1 (v0.2.x patches)** — flip Electron `sandbox: true` (static
  analysis showed the preload is *already* `contextBridge`-only, so
  this is a one-PR change, not the multi-step project originally
  scoped), path-scoped IPC validation, AI key plaintext-fallback
  honesty UI, `bindToDocument` no longer writes the `.bib` file.
- **P2 (continuous)** — opportunistic decomposition of
  `App.tsx` (906 lines) and `electron/ipc.ts` (787 lines), one
  feature-slice at a time.
- **P3 (pre-public release)** — E2E launch stabilization, bundle-size
  audit, real code signing + hardened runtime + signed updater.

### Quality gates
- `pnpm lint`: clean
- `pnpm typecheck`: clean
- `pnpm test`: **1261 / 1261** tests across 145 files (was 1250 / 144;
  +11 tests for `writeFileAtomic` and CriticMarkup escape regressions)
- `pnpm build`: clean (also verified once with `sandbox: true` flipped
  on as part of the P1-1 discovery; flag reverted before commit)

---

## v0.1.14 — License migration: MIT → Apache 2.0 + CLA

A legal-foundation release. No code behaviour changes. Switches the
project from MIT to Apache 2.0 and adds an Individual Contributor
License Agreement to support a sustainable open-core business model
(see "Why" below).

### What changed
- `LICENSE` — full Apache License, Version 2.0 text, copyright
  `2026 Min-Gul Kim`.
- `NOTICE` — Apache-style notice file. Required to include in
  derivative works per Apache §4(d).
- `package.json` — `"license": "MIT"` → `"Apache-2.0"`.
- `CLA.md` — new Individual Contributor License Agreement. Modeled on
  Apache's iCLA with a key addition: contributors grant the maintainer
  the right to **re-license contributions** (including under proprietary
  terms). This is what makes the open-core model viable — it lets
  Durumi offer a paid commercial license to enterprise customers
  alongside the Apache-licensed open release.
- `CONTRIBUTING.md` — new contributor guide explaining the CLA, the
  dev loop, the six architectural invariants, and the PR checklist.
- `README.md` — new "License & contributing" section explaining why
  Apache 2.0 + the open-core plan.

### Why
The original MIT license is *permissive* — anyone can take Durumi's
source, fork it, and sell a competing hosted sync / collaboration
service. With the planned freemium business model (local app + AI
mode free with bring-your-own API key; paid sync + paid real-time
collaboration), MIT leaves the paid tier defenceless against
SaaS-style competitors copying the client code.

Apache 2.0 + the upcoming AGPL-v3 server is the chosen split:
- **Desktop client** (current code) — Apache 2.0. Free, open, easy to
  audit, friendly to enterprise adoption. The desktop client's "moat"
  is brand and UX, not the source code itself.
- **Sync / collaboration server** (future code) — AGPL v3. Anyone who
  hosts the server in a SaaS fashion must publish their hosting code
  under the AGPL — which closes the AWS-style "hosted Durumi" loophole.

The CLA's re-licensing clause enables a future commercial license
track (think MongoDB, Elastic, GitLab) for customers who can't use
AGPL internally.

### Trademark (deferred)
Trademark registration for "Durumi" (KIPO + USPTO) is deferred until
the project has either a v1.0 milestone or a measurable user base —
whichever comes first. Trademark is the real protection against
"renamed Durumi clone" products; license is the protection against
"copy-pasted Durumi service."

### Quality gates
- typecheck / lint / build clean (no code changes)
- 1250 vitest tests across 144 files (unchanged from v0.1.13)

---

## v0.1.13 — Mode rename: Document / Live / Source

Naming polish only — no behavioural change. The three modes get
user-friendly Durumi-native names that don't borrow from other
products:

| Internal id (prefs) | v0.1.12 label | v0.1.13 label |
|:--|:--|:--|
| `wysiwyg` | WYSIWYG / WYSIWYG | **Document** / **문서** |
| `typora` | Typora / Typora 스타일 | **Live** / **라이브** |
| `markdown` | Markdown / 마크다운 | **Source** / **소스** |

### What changed
- `shared/menuLabels.ts` — `menu.view.editMode.*` labels updated for
  both EN and KO. The internal `EditMode` type union stays
  `'wysiwyg' | 'typora' | 'markdown'` so existing `preferences.json`
  files keep working untouched.
- `src/i18n/dict.ts` — `status.editMode.*` labels and tooltips
  rewritten to match. Tooltips now describe each mode's role in plain
  language ("Document mode — Word-style, no markdown markers" / "Live
  mode — render on inactive lines, source on the active line" /
  "Source mode — plain markdown text").
- `src/components/StatusBar.tsx` — segmented-control icon letters
  W/T/M → D/L/S. The shortcut hints in the tooltips remain
  `Cmd+Shift+1/2/3`.
- Docs (README, editor-modes.md, durumi-markdown-reference.md,
  document-mode-test.md formerly wysiwyg-test.md) updated throughout.
  Historical references to "WYSIWYG" / "Typora 스타일" / "Markdown
  소스" are preserved with a one-line "v0.1.13에서 명칭 변경" note so
  release-note context isn't lost.
- `docs/wysiwyg-test.md` renamed to `docs/document-mode-test.md` so
  the filename matches the new user-facing mode name.

### What stays the same
- Internal `EditMode` union values, `prefs.editor.defaultMode` storage,
  test file names (`tests/editor/wysiwyg*.test.ts`), and shortcut
  bindings (`Cmd+Shift+1/2/3`). This is a label-only release — code
  paths and on-disk state are unchanged.
- All v0.1.12 invariants (Document mode strict-literal escape filter,
  relaxed active-line rule, menu i18n single source of truth).
- 1250 vitest tests, all green.

### Quality gates
- typecheck / lint / build clean
- 1250 vitest tests across 144 files (same count as v0.1.12 — no
  behaviour change)

---

## v0.1.12 — WYSIWYG strict-literal mode

A direct fix for a real surprise in v0.1.11: typing `#` in WYSIWYG mode
was still triggering markdown heading parsing, so the line jumped to a
giant H1 even though "WYSIWYG" promises Word-like literal characters.
v0.1.12 makes WYSIWYG mean what it says.

### The escape filter

A new `transactionFilter` (`src/editor/wysiwygEscape.ts`) intercepts
user-typed single characters in WYSIWYG mode and rewrites markdown
markers with a backslash escape:

| User types | Storage | Display |
|:--|:--|:--|
| `#`, `>`, `<`, `*`, `_`, `` ` ``, `[`, `]`, `~` | `\#`, `\>`, `\<`, `\*`, … | `#`, `>`, `<`, `*`, … |
| `-`, `+` at line start | `\-`, `\+` | `-`, `+` |
| `.` after digits at line start (`1.`, `12.`, …) | `1\.`, `12\.` | `1.`, `12.` |
| Anything else | unchanged | unchanged |

A companion `wysiwygEscapeHider` ViewPlugin scans the visible viewport
(not just the active line) and hides every leading `\` in an escape
sequence via `Decoration.mark` + `display: none`. The user sees clean
`#`, `*`, `[`, … even on lines they're not editing. Source files
round-trip through the markdown parser as literal characters — no
heading, no emphasis, no list, no link, and no raw HTML for the typed
`<sup>` / `<sub>` cases.

### Active-line invariant relaxed — uniform rendering

v0.1.0 invariant #1 ("커서 줄에 `Decoration.replace` 금지") was originally
a blanket rule for IME composition safety. v0.1.12 narrows it to a
**Typora-only** rule: in Typora mode the active line keeps the legacy
"show raw markers / source" behaviour. In **WYSIWYG mode every plugin
renders on the active line too** — both inline marker hiders (empty
`cm-md-marker-hidden` widgets) and content widgets (HR, image, math,
mermaid, table, taskList, frontMatter, citation pill, footnote pill).
CodeMirror 6's composition handling (automatic bailout on widget
boundaries) is trusted; if a specific widget surfaces an IME issue in
practice, it can be migrated to `mark + display:none + side widget`
later.

So every marker-hiding decoration plugin (emphasis, heading, link,
inlineCode, strikethrough, blockquote, htmlInline, escape, autolink,
lineBreak) gets a `shouldHideMarker(state, lineActive)` helper:

    Typora:   hide on inactive lines only (`!lineActive`)
    WYSIWYG:  hide on every line, including the active one
    Markdown: decorations are off via the Compartment

The result: in WYSIWYG mode a line like `**Authors:** [Your Name]<sup>1</sup>`
renders as `Authors: Your Name1` whether or not the caret is on it —
the same Word-like appearance regardless of active-line state. Each
plugin owns its own marker; no second "patch hider" trying to mimic
what the plugins already do.

URL nodes only get hidden when their parent is a `Link` node — i.e.
they're the URL part of `[label](url)`. Standalone `URL` nodes that
Lezer emits for autolinks (plain emails like `mgkim@jbnu.ac.kr`, bare
`<https://example.com>`) stay visible: hiding an autolink would erase
the address from the user's view. `link.ts` also suppresses the
`cm-md-link` colour-and-underline styling in WYSIWYG mode for tentative
shortcut `[Text]` constructs (no URL child); real `[label](url)` inline
links keep the styling.

List markers (`1.`, `-`, `*`, `+`) stay visible in every mode — that's
the visual rendering of a list. `list.ts` only adds a `cm-md-list-item`
line class for indentation. WYSIWYG agrees with Typora here.

### What still produces formatting in WYSIWYG

- Toolbar buttons (Bold, Italic, Style dropdown → H1, …) — dispatched
  programmatically without `userEvent: 'input.type'`, so the filter
  bypasses them and the inserted `**`, `# `, `[@key]`, etc. land
  unescaped.
- Keyboard shortcuts that wire to the same helpers (`Cmd+B`, `Cmd+1`,
  `Cmd+Shift+I`, …) — same path, same result.
- Existing markdown content in opened files — only *new typing* is
  escaped; loaded docs are untouched.
- Paste — content is preserved as markdown, not escaped.

### Citation autocomplete behaviour change

`[@key]` autocomplete is *disabled in WYSIWYG mode*. The user must use
the toolbar Citation button (or `Cmd+Shift+I` cite palette). Typora and
Markdown modes keep the `[@` autocomplete trigger.

### autoPair coordination

`autoPair` now consults `currentEditMode`. In WYSIWYG, the markdown
marker keys (`*`, `_`, `` ` ``, `[`, `~`, `=`, `^`, `$`) bail out of
autopairing so the escape filter sees a clean single-character insertion.
Generic non-markdown pairs (`(`, `{`, `<`, `"`, `'`) keep working.

### Style dropdown unescape

`setHeading` and `clearHeading` now recognise both the raw `#` prefix
and the WYSIWYG-escaped `\#` prefix. So toggling H1 → Body → H1 on a
typed-then-escaped heading line cleans up correctly.

### Architecture invariant #6 reinforced

The original invariant "WYSIWYG marker hide is `Decoration.mark` +
CSS `display:none` only" is preserved. The new escape filter is purely
a transaction-level rewrite — no decorations, no DOM manipulation.
IME composition is unaffected (composition transactions use
`input.compose`, not `input.type`, so the filter doesn't touch them).

### Quality gates

- 1248 vitest tests across 144 files (1210 v0.1.11 baseline + 17 escape
  filter cases + 3 escape-input integration cases + 7 autoPair + escape
  integration + 9 Lezer tree assertions + 10 plugin-level WYSIWYG render
  cases proving each marker-hiding plugin honours the relaxed invariant
  on the active line + the autoPair WYSIWYG guard cases).
- typecheck / lint / build clean.

### Docs

`docs/editor-modes.md` updated with the new escape table, FAQ entries
on `[@` autocomplete and `Cmd+B` workflow, and a clear restatement that
toolbar/shortcuts are the canonical formatting paths in WYSIWYG.

---

## v0.1.11 — Three-mode editor

The editor learns to wear three faces. WYSIWYG is the new default for
medical-manuscript drafting; Typora-style is preserved for v0.1.0-v0.1.10
muscle memory; Markdown source is the escape hatch. Shipped as three
phases over a single release.

### Phase 1 — Mode infrastructure
- New `src/editor/editMode.ts` exports `EditMode = 'wysiwyg' | 'typora' | 'markdown'`,
  a `StateField` always loaded outside the mode Compartment, and the
  `setEditMode` StateEffect.
- `MarkdownEditor` wraps the live-decoration array in a `Compartment` —
  Markdown mode swaps it for an empty array, suppressing every live
  preview decoration so the user sees plain markdown source. WYSIWYG +
  Typora share the same decoration bundle.
- New `wysiwygMarkerHider` ViewPlugin (`src/editor/decorations/wysiwygMarkers.ts`)
  scans the active line for inline markdown punctuation
  (`*`, `_`, `**`, `__`, `~~`, `` ` ``, `#`, `>`, list markers) and adds
  `Decoration.mark({ class: 'cm-md-marker-hidden' })`. A CSS rule with
  `display: none` hides them. **Critical IME-safety detail**:
  `Decoration.replace` is never used — the active-line invariant from
  `durumi_project.md` (Korean/Japanese/Chinese IME composition) still
  holds. This is the new architecture invariant #6.
- `appStore` replaces the unused `sourceMode` boolean with `editMode` +
  `lastNonMarkdownMode`. `Cmd+/` keeps working (now toggles between
  Markdown and the previous mode).
- New `prefs.editor.defaultMode` (default `'wysiwyg'`); `mergeDefaults`
  back-fills.
- View → Edit Mode submenu with `Cmd+Shift+1/2/3` shortcuts. New
  MenuCommand variant `{ type: 'setEditMode', mode }`.
- Status bar gets a 3-button segmented control (W/T/M) tied to prefs so
  menu radio and control stay in sync.

### Phase 2 — WYSIWYG toolbar
- New chrome toolbar (`src/components/EditorToolbar.tsx`) renders above
  the editor only in WYSIWYG mode. 36px tall, theme-token styled,
  `role="toolbar"`.
- Five button groups:
  1. **Style dropdown** — Body / H1-H6 / Blockquote / Code block
  2. **Inline** — Bold, Italic, Strike, Inline code, **Sup**, **Sub**
     (`<sup>/<sub>` raw HTML, round-trips through markdown-it)
  3. **List** — Bulleted, Numbered, Task, Indent, Outdent
  4. **Insert** — Link, Image (OS file picker → existing `saveImage` IPC),
     Table, Math (`$$\n\n$$`), Footnote (auto-numbered anchor + def),
     Citation (opens cite palette)
  5. **Review** — Highlight (CriticMarkup `{== ==}`), Memo, Track-change
- New keymap helpers: `toggleSup`/`toggleSub` in `toggleWrap.ts`,
  `clearHeading` in `setHeading.ts`.
- Style dropdown auto-syncs to the caret line.
- No new icon dependency — unicode glyphs only.

### Phase 3 — Document styles
- New "문서 스타일 / Document Styles" tab in Settings.
- **6 prebuilt journal-flavoured presets** (draft display only — not
  official typesetting):

  | Preset | Body |
  |:--|:--|
  | Durumi default | Inter 16px, 1.6 (default) |
  | Classic manuscript | Times New Roman 12pt, 2.0 (double-spaced) |
  | Nature-style | Helvetica 14px, 1.5 |
  | Lancet-style | Georgia 14px, 1.55 |
  | JKMS / Korean Medical | Noto Serif KR 16px, 1.7 |
  | Comfortable draft | Atkinson Hyperlegible 17px, 1.75 |

- 10 per-entry style rows (Body / H1-H6 / Blockquote / Code / Table
  header) — font family, size, weight, color, line-height. Editing any
  field detaches from the preset and surfaces "Custom (user-edited)".
- **Reset to Durumi default** button.
- Styles apply live via 50 CSS custom properties on `:root` (e.g.
  `--style-body-font`, `--style-h1-size`, …). The HTML/PDF export
  pipeline inherits the same variables automatically.
- Runtime `isValidStyleSet` validator in `mergeDefaults` so a corrupt
  `styles` block falls back to defaults instead of crashing.

### New preferences (`prefs.editor`)
- `defaultMode: 'wysiwyg' | 'typora' | 'markdown'` — default `'wysiwyg'`
- `activePreset: string | null` — default `'durumi-default'`; flips to
  `null` when the user edits any per-entry field
- `styles: StyleSet` — the resolved style set; always populated

### New architecture invariant #6
**WYSIWYG marker hiding uses `Decoration.mark` + CSS `display: none`,
never `Decoration.replace`.** Documented in `durumi_project.md`.

### Quality gates
- 1210 Vitest tests across 141 files (1175 v0.1.10 baseline + 35 new:
  10 wysiwygMarkers, 6 editMode, 14 journalPresets, 5 toggleSupSub).
- `pnpm typecheck` clean
- `pnpm lint` clean
- `pnpm build` clean

### Workflow note
Phase 1 was committed sequentially (`5b16bf7`) so Phases 2 + 3 could
fork from a stable base. Phase 2 (toolbar) and Phase 3 (styles) ran
as parallel subagents in git worktrees; their diffs merged cleanly
because they touched different namespaces in `dict.ts` and different
sections of `App.tsx`.

---

## v0.1.10 — Reference workflow refinements

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

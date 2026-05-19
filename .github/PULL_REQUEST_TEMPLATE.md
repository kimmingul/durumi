## Summary

<!-- 1-3 sentences on what changed and why. Link the issue / spec if any. -->

## Architecture

<!-- Optional. Table of files touched per layer (main / renderer / shared / docs).
     Omit for small or docs-only PRs. -->

## Test plan

- [ ] `pnpm lint` — clean
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all vitest passing
- [ ] `pnpm build` (required before e2e)
- [ ] `pnpm test:e2e` — all Playwright Electron specs passing
- [ ] Manual verification in `pnpm dev` (real UI events: mouse / keyboard / IME)

## Document Mode Principles

If this PR touches editor decorations, keymaps, toolbar commands, IPC that
mutates markdown, or any behavior visible in Document mode, fill in each
item. Mark `[~]` with a one-line reason for items that genuinely don't
apply. **Omit this whole section only if the PR doesn't touch editor or
markdown-shaping code at all.**

See [docs/DOCUMENT_MODE_PRINCIPLES.md](docs/DOCUMENT_MODE_PRINCIPLES.md).

- [ ] **(1) Source integrity** — round-trip byte-level diff verified (open → mode toggle ×3 → save → `diff` shows 0)
- [ ] **(2) IME safety** — real-UI Korean composition in affected surfaces (active line / table cell / link label / memo body / math / alert)
- [ ] **(3) Code-island sovereignty** — toolbar / inline-mark no-op or disabled inside fence / math / inline HTML / frontmatter (if applicable)
- [ ] **(4) Rendered-intent, source-backed** — every new/changed command reducible to a minimal markdown source edit; Source mode reproduces the same result
- [ ] **(5) Explicit scope** — declared scope(s) per command: `document-metadata` / `block-line` / `inline-span` / `code-island` / `cross-reference-pair`
- [ ] **(6) Boundary atomicity** — real-UI `page.keyboard.press('Backspace')` / `Delete` at every widget / span boundary (transaction-dispatch unit tests do **not** satisfy this)

> ⚠️ **Real-UI** means actual Electron UI events. CodeMirror `view.dispatch(...)`
> bypasses keymap precedence and IME composition filters. v0.2.19/.20/.21/.23
> false-greened on exactly this — see [feedback-real-ui-verification](docs/PROGRESS.md#v0223-current).

## Lessons captured

<!-- New false-green patterns discovered during this cycle?
     Add a one-liner here and update docs/PROGRESS.md plus the real-UI
     verification memory. Omit if no new patterns. -->

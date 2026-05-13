# Contributing to Durumi

Thanks for your interest in contributing to Durumi (두루미). This guide
covers the legal terms, the dev loop, and the style conventions.

## TL;DR

- Code is licensed under **Apache License 2.0** (see [`LICENSE`](LICENSE)).
- All contributors must accept the **Individual Contributor License Agreement**
  ([`CLA.md`](CLA.md)). The fastest way is to add a `Signed-off-by:` line to
  each commit (`git commit -s`).
- Run `pnpm typecheck && pnpm lint && pnpm test` before opening a pull request.

## License & CLA

Durumi switched from MIT to **Apache License 2.0** in v0.1.14 to clarify the
patent grant and to support a future commercial sync / collaboration tier
without forcing the desktop client to be closed-source.

The CLA ([`CLA.md`](CLA.md)) gives the maintainer the right to **re-license
your contributions** under other terms (including proprietary) in addition
to Apache 2.0. This is the standard pattern for open-core projects (used by
MongoDB, Elastic, GitLab, etc.) and enables a sustainable business model
that funds continued development of the open-source Work.

### How to accept the CLA

Pick **one** of the following per contribution:

1. **DCO-style sign-off (recommended)** — add a `Signed-off-by:` line to
   each commit message:

   ```bash
   git commit -s -m "your message"
   ```

   This appends e.g. `Signed-off-by: Your Name <your.email@example.com>`
   automatically based on your `git config user.name` and `user.email`.

2. **Comment on your pull request** with the exact text:

   ```
   I have read the CLA Document and I hereby sign the CLA
   ```

The maintainer will keep a list of signed contributors. A CLA-bot may be
wired up later to automate this.

## Dev loop

```bash
git clone https://github.com/kimmingul/durumi.git
cd durumi
pnpm install
pnpm dev
```

Quality gates (run before every PR):

```bash
pnpm typecheck      # 0 errors expected
pnpm lint           # 0 errors / 0 warnings expected
pnpm test           # current vitest suite must stay green
pnpm build          # bundle main + preload + renderer; check for build errors
```

E2E (Playwright Electron):

```bash
pnpm build          # required first
pnpm test:e2e
```

## Architectural invariants

These rules live in `memory/durumi_project.md` and must not be broken in a
contribution:

1. **Active-line invariant (v0.1.12-relaxed)** — in `Live` mode (legacy
   "Typora-style"), no `Decoration.replace` on the caret line. In `Document`
   mode (legacy "WYSIWYG"), every plugin renders on every line via
   `shouldHideMarker` helper / `isWysiwygMode` check.
2. **Block widgets are `StateField`** — `Decoration.replace({ block: true })`
   must come from a `StateField`, not a `ViewPlugin`.
3. **`pnpm test:e2e` requires `pnpm build` first** — Playwright doesn't
   trigger the build.
4. **`vi.mock` for Node `fs`** — both `node:fs` and `node:fs/promises` need
   the same mock instance with a `default` export.
5. **React state ↔ module global** — `LanguageProvider`-style mirroring must
   sync synchronously inside render (idempotent guard against infinite
   loops), not via `useEffect`.
6. **WYSIWYG marker hide** — inline markers use `Decoration.mark` + CSS
   `display: none` (IME-safe). Content widgets in Document mode also
   render on the active line; if a widget is reported to break IME, fall
   back to `mark + display:none + side widget` rather than removing the
   widget.

See `memory/durumi_project.md` for details and rationale.

## Commit style

- Conventional commit prefixes welcome but not required: `feat:`, `fix:`,
  `chore:`, `docs:`, `refactor:`, `test:`.
- One conceptual change per commit. Long commits → split.
- Mention the version cycle when relevant (e.g. `feat: v0.1.14 — ...`).
- Include `Signed-off-by:` (CLA, see above).

## Pull request checklist

- [ ] Quality gates pass locally (`typecheck`, `lint`, `test`, `build`)
- [ ] New behaviour has tests
- [ ] `docs/PROGRESS.md` updated if user-visible
- [ ] CLA acknowledged (sign-off in commits or PR comment)
- [ ] Architectural invariants respected

## Issues and discussions

- Bug reports: GitHub Issues with reproduction steps + Durumi version
- Feature ideas: GitHub Discussions
- Security: see [`SECURITY.md`](SECURITY.md) (if absent, email the
  maintainer directly — please don't open a public issue for security
  reports)

Thanks for helping Durumi grow into a real manuscript studio.

# Durumi — Release runbook

Durumi releases are produced by GitHub Actions on every `v*.*.*` tag push.
The workflow lives at `.github/workflows/release.yml`. Local builds remain
available for smoke-testing.

## Cutting a release (one-liner)

```bash
pnpm release:tag patch        # or: minor | major
git push origin main
git push origin v0.1.8.3      # whatever tag the helper printed
```

`pnpm release:tag` is a thin wrapper around `scripts/release.sh`. It:

1. Refuses to run on a dirty tree.
2. Bumps `package.json` via `pnpm version --no-git-tag-version`.
3. Commits the bump as `chore: release vX.Y.Z`.
4. Creates an annotated tag `vX.Y.Z`.
5. Prints the two `git push` commands and exits — **it does not push**, so
   you can review the bump first.

Pushing the tag fires `.github/workflows/release.yml`, which:

- Runs **release-mac** on `macos-latest` (builds the universal-ish DMG —
  arch `[x64, arm64]`).
- Runs **release-win** on `windows-latest` (builds the NSIS installer for
  x64).
- Both jobs invoke `electron-builder --publish always`, which uses the
  built-in `GITHUB_TOKEN` (passed as `GH_TOKEN`) to upload installers and
  the auto-update manifests (`latest.yml`, `latest-mac.yml`) to a draft
  GitHub Release named after the tag. The first job that publishes
  *creates* the draft; the second appends its artifacts to the same draft.

After both jobs are green, open
https://github.com/kimmingul/durumi/releases, fill in the notes, leave
**Set as a pre-release** unchecked, and click **Publish release**.

## CI workflows

| Workflow | Trigger | Runs on | Steps |
|---|---|---|---|
| `ci.yml` | push/PR to `main` | `ubuntu-latest` | typecheck → lint → vitest |
| `e2e.yml` | push/PR to `main` | `macos-latest` | `pnpm build` → Playwright Electron smoke |
| `release.yml` | tag push `v*.*.*` | `macos-latest` + `windows-latest` (parallel) | `pnpm build` → `electron-builder --publish always` |

### Known CI gaps

- **No Linux e2e.** Playwright + Electron on Linux CI is doable but flaky
  — first cut runs on macOS only.
- **No Windows CI tests.** `release.yml` builds on Windows but never runs
  vitest there. The renderer is platform-agnostic so this is unlikely to
  bite, but it is a gap worth closing.

## Signing posture (zero-cost — current)

### macOS

- Builds are **ad-hoc signed only** (`mac.identity: null` in
  `electron-builder.yml`).
- End users will hit Gatekeeper on first launch:
  - **Workaround:** right-click the app in Finder → **Open** → confirm.
  - Or, after the failed first launch: System Settings → Privacy &
    Security → **Open Anyway**.
- Auto-update still works once the app is past Gatekeeper because the
  bundle is shipped over HTTPS by `electron-updater` and the signature
  check uses the ad-hoc identity baked into the prior install.

### Windows

- Builds are **unsigned**.
- End users will see SmartScreen "Windows protected your PC":
  - **Workaround:** click **More info** → **Run anyway**.
- `electron-builder.yml` sets `win.verifyUpdateCodeSignature: false` so
  the unsigned NSIS update can still install.

### TODOs (paid signing)

- [ ] **Apple Developer ID** ($99/yr) → real codesign + notarization →
  no Gatekeeper warning. Wire `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
  `APPLE_TEAM_ID`, and a `.p12` cert into the `release-mac` job as
  GitHub Secrets; remove `identity: null` from `electron-builder.yml`.
- [ ] **Windows OV/EV cert** (~$200/yr OV, ~$400/yr EV) → SmartScreen
  reputation. Wire `CSC_LINK` (base64 of the `.pfx`) and
  `CSC_KEY_PASSWORD` as GitHub Secrets; flip `verifyUpdateCodeSignature`
  to `true`.

## Auto-update

- Provider: `github` — releases at
  https://github.com/kimmingul/durumi/releases are the update source.
- `electron-updater` pulls the latest **non-draft, non-prerelease**
  GitHub Release whose tag is `v{version}`. Drafts created by
  `release.yml` are **not** seen by clients until the maintainer
  publishes them.

## In-app update UX

- 30s after launch, packaged builds check `publish.url`. If a newer
  version exists, the user sees a "Download" prompt.
- Download progress is silent. On completion, "Restart now" prompt.
- Help → Check for Updates… lets the user trigger a check manually.
- Dev builds: auto-update is a no-op. Manual menu shows "Updates only
  available in packaged builds".

## Local builds (still supported)

You don't need a tag to produce a local artifact:

```bash
pnpm make:mac    # dist-build/Durumi-{version}-{arch}.dmg
pnpm make:win    # dist-build/Durumi Setup {version}.exe
```

To publish from your laptop instead of CI (rare; mostly for emergencies):

```bash
export GH_TOKEN=$(gh auth token)
pnpm make:mac -- --publish always
pnpm make:win -- --publish always
```

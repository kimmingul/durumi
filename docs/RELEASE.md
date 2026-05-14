# Durumi — Release runbook

Durumi releases are produced by GitHub Actions on every `v*.*.*` tag push.
The workflow lives at `.github/workflows/release.yml`. Local builds remain
available for smoke-testing.

## Cutting a release (one-liner)

```bash
pnpm release:tag patch        # or: minor | major
git push origin main
git push origin v0.1.12       # whatever tag the helper printed
```

> ⚠️ **Versions must be strict SemVer 2.0.0** (`MAJOR.MINOR.PATCH`,
> optionally with `-PRERELEASE` or `+BUILD` suffix). `electron-builder`
> rejects 4-segment versions like `0.1.8.4` with
> `Invalid version: "0.1.8.4"` at build time. If you need a quick polish
> on top of a release, bump the PATCH (e.g. `0.1.11 → 0.1.12`) rather
> than appending a fourth segment.

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
  no Gatekeeper warning. See **Path to real macOS signing** below.
- [ ] **Windows OV/EV cert** (~$200/yr OV, ~$400/yr EV) → SmartScreen
  reputation. See **Path to real Windows signing** below.

## Path to real macOS signing

Step-by-step runbook for upgrading the macOS build from ad-hoc signing
to a real Developer ID + notarized DMG. Total wall-clock setup: roughly
two hours, dominated by Apple's enrolment review (can take 24–48h on
their side — start there first).

### 1. Enrol in the Apple Developer Program (~24–48h wait)

1. Go to https://developer.apple.com/programs/ and click **Enroll**.
   $99/yr, individual or organisation. An organisation enrolment needs
   a D-U-N-S number and takes longer — for a solo project, individual
   is simpler.
2. Wait for Apple to approve the enrolment (e-mail confirmation).
3. Note your **Team ID** (10 alphanumeric chars) under
   https://developer.apple.com/account → **Membership details**.

### 2. Generate a Developer ID Application certificate (~10 min)

Two ways; pick one.

**Option A — Xcode (recommended).**
1. Install Xcode from the Mac App Store, open it once to accept the
   licence.
2. Xcode → **Settings** → **Accounts** → add your Apple ID → select
   your team → **Manage Certificates…** → **+** → **Developer ID
   Application**. Xcode generates the private key into your login
   keychain and uploads the CSR to Apple automatically.

**Option B — developer.apple.com (manual).**
1. Open **Keychain Access** → **Certificate Assistant** → **Request a
   Certificate From a Certificate Authority…** → save the `.certSigningRequest`
   to disk.
2. https://developer.apple.com/account/resources/certificates → **+** →
   **Developer ID Application** → upload the CSR → download the `.cer`.
3. Double-click the `.cer` to import into your login keychain — the
   certificate now pairs with the private key from step 1.

### 3. Export the cert + key as `.p12` (~5 min)

1. **Keychain Access** → **login** keychain → **My Certificates** →
   right-click **Developer ID Application: <your name> (TEAMID)** →
   **Export "…"** → format **Personal Information Exchange (.p12)**.
2. Pick a strong passphrase — you'll paste it into a GitHub Secret.
   Store both the `.p12` file and the passphrase in your password
   manager; if you lose either, you'll re-do steps 2 and 3.

### 4. Base64-encode the `.p12` for GitHub Secrets (~1 min)

GitHub Secrets only accept strings, so the binary `.p12` gets wrapped:

```bash
base64 -i cert.p12 -o cert.p12.b64
pbcopy < cert.p12.b64   # copies the whole base64 string to the clipboard
```

### 5. Create an App-Specific Password for notarization (~3 min)

Notarization runs as your Apple ID, but it cannot use your account
password (2FA blocks it). Instead:

1. Sign in to https://appleid.apple.com → **Sign-In and Security** →
   **App-Specific Passwords**.
2. **Generate Password** → label it e.g. `durumi-notarization-ci` →
   copy the 19-char password (format `xxxx-xxxx-xxxx-xxxx`).
3. Apple shows it once — save it to your password manager before you
   close the modal.

### 6. Add five GitHub Secrets (~3 min)

https://github.com/kimmingul/durumi/settings/secrets/actions → **New
repository secret**. Add each of:

| Secret name | Value |
|---|---|
| `MAC_CSC_LINK` | the base64 string from step 4 (whole file contents) |
| `MAC_CSC_KEY_PASSWORD` | the `.p12` passphrase from step 3 |
| `APPLE_ID` | your Apple ID e-mail address |
| `APPLE_APP_SPECIFIC_PASSWORD` | the 19-char password from step 5 |
| `APPLE_TEAM_ID` | the 10-char Team ID from step 1 |

### 7. Activate the signing config (~2 min)

In [`electron-builder.yml`](../electron-builder.yml), under `mac:`:

1. **Delete** the `identity: null` line.
2. Flip `hardenedRuntime: false` to `hardenedRuntime: true`.
3. Uncomment the four lines marked in the "Real-signing template"
   block: `entitlements`, `entitlementsInherit`, `gatekeeperAssess`,
   `notarize: true`.

In [`.github/workflows/release.yml`](../.github/workflows/release.yml),
under the macOS job's "Build & publish (electron-builder, macOS)"
step → `env:` block: uncomment the five `CSC_LINK` / `CSC_KEY_PASSWORD`
/ `APPLE_*` lines.

The entitlements file at
[`build/entitlements.mac.plist`](../build/entitlements.mac.plist) is
already in the repo, dormant until the `mac.entitlements` key is
uncommented.

### 8. Test the signed build

> When ready, uncomment the marked lines in `electron-builder.yml` and
> `.github/workflows/release.yml`, then push a `vX.Y.Z` tag to test the
> signed build.

The CI run takes 8–12 min (notarization is the bottleneck). On success,
download the DMG from the draft release, install it on a Mac that has
*never* run Durumi before — Gatekeeper should show no warning.

## Path to real Windows signing

Step-by-step runbook for replacing the unsigned NSIS installer with a
code-signed one. Total wall-clock setup: roughly a day, dominated by
the CA's vetting process (faster for OV, longer for EV).

### 1. Pick OV vs EV (~5 min decision)

| Aspect | OV (Organisation Validated) | EV (Extended Validation) |
|---|---|---|
| Price | ~$200/yr | ~$400/yr |
| SmartScreen | Reputation builds over **weeks**, with downloads from real users | Reputation **immediately** on first signed install |
| Hardware | Optional USB token (SSL.com offers cloud signing) | **Mandatory** hardware token (YubiKey / eToken) shipped to you |
| CI compatibility | Easy — `.pfx` file + password fits in a GitHub Secret | Harder — token requires an attended Windows machine or a cloud-signing service |

For Durumi at v0.2 scale, **OV is the right starting point**: the user
base is small enough that the early SmartScreen warnings are
tolerable, and the cloud-signed-OV path keeps CI fully automated. Move
to EV later if/when first-install friction becomes a complaint.

### 2. Buy a cert from a CA (~1 day of vetting)

CAs that resell to small projects:

- **DigiCert** — premium price, fast turnaround.
- **Sectigo / Comodo** — mid-tier, the cheapest reliable option.
- **SSL.com** — has a cloud signing API that avoids the hardware token
  for OV certs; good for GitHub Actions.

Expect the CA to ask for:
- Business registration (sole-proprietor / DBA is usually OK for OV;
  EV requires a registered company).
- A phone call to a number listed in a public directory.
- Photo ID / passport scan.

When approved, you'll receive a `.pfx` file (cert + private key
bundle) and a password — or a hardware token in the mail (EV).

### 3. Base64-encode the `.pfx` (~1 min)

```bash
base64 -i cert.pfx -o cert.pfx.b64
pbcopy < cert.pfx.b64
```

### 4. Add two GitHub Secrets (~2 min)

https://github.com/kimmingul/durumi/settings/secrets/actions:

| Secret name | Value |
|---|---|
| `WIN_CSC_LINK` | the base64 `.pfx` from step 3 |
| `WIN_CSC_KEY_PASSWORD` | the `.pfx` password from the CA |

### 5. Activate the signing config (~1 min)

In [`electron-builder.yml`](../electron-builder.yml), under `win:`:

1. Flip `verifyUpdateCodeSignature: false` to `true` so future
   auto-updates verify the signature chain.
2. (Optional, EV only) Uncomment `signtoolOptions: sign:
   '@electron/windows-sign'` if you need a custom hook for a hardware
   token — most OV setups don't need this.

In [`.github/workflows/release.yml`](../.github/workflows/release.yml),
under the Windows job's "Build & publish (electron-builder, Windows)"
step → `env:` block: uncomment the two `CSC_LINK` / `CSC_KEY_PASSWORD`
lines.

### 6. Test the signed build

> When ready, uncomment the marked lines in `electron-builder.yml` and
> `.github/workflows/release.yml`, then push a `vX.Y.Z` tag to test the
> signed build.

The signed NSIS will install on Windows 10/11 without the
"Unidentified developer" red bar. With an OV cert, SmartScreen will
still warn for the first ~50 installs until the reputation builds;
with EV, no warning from the first install.

## Ongoing cost

Apple Developer Program $99/yr + Windows OV cert ~$200/yr (or EV
~$400/yr) + GitHub Actions $0 (the macOS + Windows runners stay well
inside the public-repo free tier). **Total ~$300/yr** for the dual-
platform signed-release path, ~$500/yr if you choose EV on Windows.

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

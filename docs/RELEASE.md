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

## Signing posture (current)

Both platforms are signed as of v0.2.30. This was not cosmetic on macOS —
the previous ad-hoc builds were **blocked outright**, not merely warned
about (see `.moai/project/tech.md` §13.3).

### macOS — automated in CI

- Developer ID signature + Apple notarization, produced by `release.yml`
  from repo secrets. `hardenedRuntime: true`, entitlements applied.
- Users see no Gatekeeper prompt; the notarization ticket is stapled, so
  verification works offline.
- Verify a build with:
  `spctl -a -vv Durumi.app` → `accepted / source=Notarized Developer ID`

### Windows — signed manually, outside CI

- GlobalSign **EV** code-signing certificate (*Nanum Space Co,. Ltd*) on a
  SafeNet USB token. EV keys cannot leave the token, so CI cannot sign;
  the maintainer signs locally after each release build.
- EV grants SmartScreen reputation immediately, without the weeks-long
  warm-up an OV certificate needs.
- `win.verifyUpdateCodeSignature: true` with an explicit
  `win.publisherName`. Full procedure and rationale:
  **Windows signing (EV token, external)** below.

### Remaining gaps

- Windows signing is a manual step in every release. Moving to a cloud-HSM
  certificate would restore full automation at extra annual cost.
- The signed Windows build was installed and launched successfully on
  Windows 11 (2026-08-01) — install and first run were not blocked.


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

## Windows signing (EV token, external)

**Status: active since 2026-08-01.** v0.2.30's `Durumi-Setup-*.exe` is signed
with a GlobalSign EV code-signing certificate issued to *Nanum Space Co,. Ltd*.

### Why this is not in CI

The private key lives on a SafeNet USB token and, by EV rules, cannot be
exported. GitHub Actions runners have no USB port, so the Windows release
is a **two-stage** process:

```
tag push → CI builds an UNSIGNED NSIS  (release.yml, windows-latest)
         → a human signs it locally with the token
         → the signed EXE + regenerated latest.yml/blockmap replace the assets
```

macOS is unaffected — it stays fully automated in CI (Developer ID +
notarization via repo secrets).

### One-time setup on macOS

Signing a Windows PE from macOS works; no SafeNet client is needed, because
OpenSC talks to the token directly.

```bash
brew install osslsigncode opensc libp11
```

- `opensc` provides the PKCS#11 module (`/opt/homebrew/lib/opensc-pkcs11.so`)
- `libp11` provides the OpenSSL engine (`/opt/homebrew/lib/engines-3/pkcs11.dylib`)
  — **`osslsigncode` fails without it**; `-pkcs11module` alone is not enough
- macOS's built-in PIV driver does *not* open this token (`security
  list-smartcards` reports nothing). That is expected; OpenSC handles it.

Confirm the token is visible before touching the PIN:

```bash
pkcs11-tool --module /opt/homebrew/lib/opensc-pkcs11.so -L
# Slot 0 … token label: Nanum Space Co,.Ltd
```

**Never brute-force the PIN.** SafeNet tokens lock after repeated failures.
`pkcs11-tool -L` shows `token flags`; anything mentioning `final try` or
`locked` means stop.

### Signing a release

The intermediate CA is not on the token, so it must be supplied explicitly —
otherwise only the leaf is embedded and chain building depends on the client
fetching AIA at runtime.

```bash
# 1. Pull the unsigned artifact + updater manifest from the draft release
gh release download vX.Y.Z --pattern 'Durumi-Setup-*.exe' --pattern 'latest.yml'

# 2. Export the leaf from the token and fetch the intermediate it names in AIA
pkcs11-tool --module /opt/homebrew/lib/opensc-pkcs11.so --slot 0 \
  -r --type cert --id 0001 -o cert.der
openssl x509 -in cert.der -inform DER -out leaf.pem
curl -fsSL -o inter.crt http://secure.globalsign.com/cacert/gsgccr45evcodesignca2020.crt
openssl x509 -in inter.crt -inform DER -out inter.pem
cat leaf.pem inter.pem > chain.pem

# 3. Sign (prompts for the PIN; input is not echoed)
osslsigncode sign \
  -certs chain.pem \
  -key 'pkcs11:token=Nanum%20Space%20Co%2c.Ltd;id=%00%01;type=private' \
  -pkcs11module /opt/homebrew/lib/opensc-pkcs11.so \
  -engine /opt/homebrew/lib/engines-3/pkcs11.dylib \
  -askpass -h sha256 \
  -n "Durumi" -i "https://github.com/kimmingul/durumi" \
  -ts http://timestamp.globalsign.com/tsa/r6advanced1 \
  -in Durumi-Setup-X.Y.Z.exe -out signed.exe
```

The timestamp is not optional — without it every signature stops validating
when the certificate expires (2027-06-05 for the current one).

### Regenerating the updater metadata — do not skip

Signing changes the file, so `latest.yml`'s `sha512` and `size` no longer
match. Replacing only the EXE leaves `electron-updater` failing its integrity
check on every Windows update, silently.

```bash
# new hash (base64, as electron-updater expects) and size
shasum -a 512 signed.exe | cut -d' ' -f1 | xxd -r -p | base64
stat -f%z signed.exe
# → edit both `sha512:` occurrences and `size:` in latest.yml

# blockmap for differential downloads
node_modules/.pnpm/app-builder-bin@*/node_modules/app-builder-bin/mac/app-builder_arm64 \
  blockmap --input signed.exe --output Durumi-Setup-X.Y.Z.exe.blockmap
```

Then upload all three, overwriting:

```bash
mv signed.exe Durumi-Setup-X.Y.Z.exe
gh release upload vX.Y.Z Durumi-Setup-X.Y.Z.exe \
  Durumi-Setup-X.Y.Z.exe.blockmap latest.yml --clobber
```

### Verifying

```bash
curl -fsSL -o root.crt http://secure.globalsign.com/cacert/codesigningrootr45.crt
openssl x509 -in root.crt -inform DER -out root.pem
cat root.pem /etc/ssl/cert.pem > ca-with-gs.pem
osslsigncode verify -CAfile ca-with-gs.pem Durumi-Setup-X.Y.Z.exe
```

Expect `Signature verification: ok` and `Succeeded`. macOS's default CA
bundle does not carry the GlobalSign code-signing root, which is why it has
to be added — a failure without it is a local trust-store gap, not a bad
signature.

Confirm the chain really has two certificates (leaf + intermediate). Count
them from the extracted signature block, not from `verify` output — the
`verify` summary prints only the signer, which makes a correct 2-cert chain
look like 1:

```bash
osslsigncode extract-signature -in Durumi-Setup-X.Y.Z.exe -out sig.der
openssl pkcs7 -inform DER -in sig.der -print_certs -noout | grep -c '^subject='
# → 2
```

Finally, check that `latest.yml`'s hash matches the uploaded EXE, or Windows
auto-update will refuse it.

### `verifyUpdateCodeSignature`

`electron-builder.yml` sets it to `true` together with an explicit
`publisherName: "Nanum Space Co,. Ltd"`. The manual `publisherName` is
required precisely because signing happens outside electron-builder — it
never sees the certificate and cannot infer the name. The string must match
the certificate CN exactly.

v0.2.30 shipped with the flag `false`, so it only affects clients running
v0.2.31 or later. **Verify it on a real Windows machine during the first
update cycle that exercises it** — a mismatch rejects every update silently.

### Not done yet

- Verified on Windows 11 (2026-08-01): the signed installer installs and the
  app launches, without being blocked.
- Still unverified: `verifyUpdateCodeSignature`. It cannot be exercised until
  a client running v0.2.31+ takes an update, and a `publisherName` mismatch
  fails silently — updates simply stop arriving. Check it on the first update
  cycle that actually crosses that boundary.
- Signing is manual. A cloud-HSM certificate (GlobalSign Signing Service,
  SSL.com eSigner) would restore full CI automation at extra cost.


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

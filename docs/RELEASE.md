# Durumi — Release runbook

## Building
- macOS: `pnpm make:mac` → `dist-build/Durumi-{version}-{arch}.dmg`
- Windows: `pnpm make:win` → `dist-build/Durumi Setup {version}.exe`

## Signing posture (zero-cost — current)

### macOS
- Builds are **ad-hoc signed only** (`mac.identity: null` in `electron-builder.yml`).
- Users will see Gatekeeper warning on first launch:
  - **Workaround:** right-click the app → **Open** → confirm.
  - Or, in System Settings → Privacy & Security → "Open Anyway" after the failed launch.

### Windows
- Builds are **unsigned**.
- Users will see SmartScreen "Windows protected your PC":
  - **Workaround:** click **More info** → **Run anyway**.

### Roadmap
- Apple Developer ID + notarization
- Windows OV/EV code-signing certificate

## Auto-update

- Provider: `github` — releases at https://github.com/kimmingul/durumi/releases are the update source.
- electron-updater downloads from the latest **non-draft, non-prerelease** GitHub Release whose tag is `v{version}`.

### Publishing flow
1. Bump `package.json` version (e.g. `0.1.0` → `0.2.0`); commit and push.
2. Set `GH_TOKEN` to a GitHub PAT with `repo` scope (electron-builder reads it to upload assets):
   ```bash
   export GH_TOKEN=$(gh auth token)
   ```
3. Build and publish — electron-builder creates a **draft** release and uploads the installers + `latest.yml` / `latest-mac.yml`:
   ```bash
   pnpm make:mac -- --publish always   # on macOS
   pnpm make:win -- --publish always   # on Windows 11
   ```
4. Open the draft at https://github.com/kimmingul/durumi/releases, fill in release notes, **uncheck "Set as a pre-release"**, and publish.
5. Existing installs detect the update on next launch (30s after start) or via Help → Check for Updates….

> Until a release is published, auto-update silently noops — `electron-updater` simply finds no matching release and reports "no update available".

## In-app update UX
- 30s after launch, packaged builds check `publish.url`. If a newer version is on the server, the user sees a "Download" prompt.
- Download progress is silent. On completion, "Restart now" prompt.
- Help → Check for Updates… lets the user trigger a check manually.
- Dev builds: auto-update is a no-op. Manual menu shows "Updates only available in packaged builds".

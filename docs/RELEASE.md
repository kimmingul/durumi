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

- Provider: `generic` (HTTP directory). Edit `electron-builder.yml` `publish.url` before publishing.
- The current placeholder (`https://updates.durumi.invalid/`) is invalid by design — auto-update will silently noop on packaged builds until configured.

### Publishing flow (when ready)
1. Bump `package.json` version.
2. `pnpm make:mac` and `pnpm make:win`.
3. Upload artifacts + the auto-generated `latest.yml` / `latest-mac.yml` to the host pointed to by `publish.url`.
4. Existing installs will detect the update on next launch (30s after start) or via Help → Check for Updates….

## In-app update UX
- 30s after launch, packaged builds check `publish.url`. If a newer version is on the server, the user sees a "Download" prompt.
- Download progress is silent. On completion, "Restart now" prompt.
- Help → Check for Updates… lets the user trigger a check manually.
- Dev builds: auto-update is a no-op. Manual menu shows "Updates only available in packaged builds".

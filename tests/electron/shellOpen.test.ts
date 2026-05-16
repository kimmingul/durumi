import { describe, it, expect, vi } from 'vitest';

// `electron/ipc.ts` imports `electron`; stub it so Vitest can load the file
// in jsdom without an actual Electron runtime. We only call the pure
// `isExternalUrlAllowed` helper — none of the IPC registration runs.
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
  dialog: {},
  ipcMain: { handle: vi.fn() },
  nativeTheme: { on: vi.fn(), shouldUseDarkColors: false },
  shell: { openExternal: vi.fn() },
}));

import { isExternalUrlAllowed } from '../../electron/ipc';

describe('isExternalUrlAllowed', () => {
  // v0.2.19 broadened the allowlist from the original three-host whitelist
  // (pandoc.org / github.com) to all http/https/mailto URLs. The change
  // unblocks in-editor link clicks for `[text](url)` constructs; the user
  // already typed the URL into their own document, so we treat it the way
  // a browser would. Tests below pin the new contract: the trusted
  // hostnames still work, ANY host on http(s) works, mailto works, and
  // the dangerous schemes (file:, javascript:, vbscript:, data:) stay
  // hard-rejected.

  it('allows the canonical pandoc download page', () => {
    expect(isExternalUrlAllowed('https://pandoc.org/installing.html')).toBe(true);
  });

  it('allows the www.pandoc.org variant', () => {
    expect(isExternalUrlAllowed('https://www.pandoc.org/installing.html')).toBe(true);
  });

  it('allows github.com release pages (used by Pandoc binary downloads)', () => {
    expect(
      isExternalUrlAllowed('https://github.com/jgm/pandoc/releases'),
    ).toBe(true);
  });

  it('allows http URLs (v0.2.19 — markdown link contract)', () => {
    expect(isExternalUrlAllowed('http://pandoc.org/installing.html')).toBe(true);
  });

  it('allows arbitrary hosts on http(s) (v0.2.19 — markdown link contract)', () => {
    expect(isExternalUrlAllowed('https://example.com/foo')).toBe(true);
    expect(isExternalUrlAllowed('https://news.ycombinator.com')).toBe(true);
  });

  it('allows mailto: URLs (v0.2.19)', () => {
    expect(isExternalUrlAllowed('mailto:user@example.com')).toBe(true);
    expect(isExternalUrlAllowed('mailto:user@example.com?subject=Hi')).toBe(true);
  });

  it('rejects file: URLs', () => {
    expect(isExternalUrlAllowed('file:///etc/passwd')).toBe(false);
  });

  it('rejects javascript: URLs', () => {
    expect(isExternalUrlAllowed('javascript:alert(1)')).toBe(false);
    expect(isExternalUrlAllowed('JavaScript:alert(1)')).toBe(false);
    expect(isExternalUrlAllowed('  javascript:alert(1)  ')).toBe(false);
  });

  it('rejects vbscript: URLs', () => {
    expect(isExternalUrlAllowed('vbscript:msgbox(1)')).toBe(false);
  });

  it('rejects data: URLs', () => {
    expect(isExternalUrlAllowed('data:text/html,<script>1</script>')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isExternalUrlAllowed('not a url')).toBe(false);
    expect(isExternalUrlAllowed('')).toBe(false);
  });
});

// v0.2.19 codex-review follow-up. The widened allowlist (http/https/mailto)
// reaches a much larger input surface than the original three-host whitelist,
// so any future refactor needs an automated guard against the encoding /
// scheme / whitespace tricks that historically smuggle `javascript:` through
// naive URL validators. Each case below asserts the current implementation's
// correct outcome — codex confirmed all of these are handled today, the
// purpose of pinning them is so a regression breaks the suite immediately.
describe('isExternalUrlAllowed — defensive edge cases (codex-review hardening)', () => {
  // --- Encoding tricks ------------------------------------------------------
  it('rejects `javascript%3Aalert(1)` (URL-encoded colon — not a parseable URL)', () => {
    expect(isExternalUrlAllowed('javascript%3Aalert(1)')).toBe(false);
  });

  it('rejects `javascript%00:alert(1)` (NUL-injected — not a parseable URL)', () => {
    expect(isExternalUrlAllowed('javascript%00:alert(1)')).toBe(false);
  });

  it('rejects `JaVaSCriPt:alert(1)` (mixed-case scheme)', () => {
    expect(isExternalUrlAllowed('JaVaSCriPt:alert(1)')).toBe(false);
  });

  // --- Whitespace prefix ----------------------------------------------------
  it('rejects `\\tjavascript:alert(1)` (tab prefix)', () => {
    expect(isExternalUrlAllowed('\tjavascript:alert(1)')).toBe(false);
  });

  it('rejects `\\njavascript:alert(1)` (newline prefix)', () => {
    expect(isExternalUrlAllowed('\njavascript:alert(1)')).toBe(false);
  });

  it('rejects `  javascript:alert(1)` (leading spaces)', () => {
    expect(isExternalUrlAllowed('  javascript:alert(1)')).toBe(false);
  });

  // --- Other unhandled schemes (only http/https/mailto are accepted) -------
  it('rejects `chrome://settings`', () => {
    expect(isExternalUrlAllowed('chrome://settings')).toBe(false);
  });

  it('rejects `vscode://file/path`', () => {
    expect(isExternalUrlAllowed('vscode://file/path')).toBe(false);
  });

  it('rejects `tel:+1234567890`', () => {
    expect(isExternalUrlAllowed('tel:+1234567890')).toBe(false);
  });

  it('rejects `magnet:?xt=urn:btih:abc`', () => {
    expect(isExternalUrlAllowed('magnet:?xt=urn:btih:abc')).toBe(false);
  });

  it('rejects `ssh://user@host`', () => {
    expect(isExternalUrlAllowed('ssh://user@host')).toBe(false);
  });

  it('rejects `feed://example.com`', () => {
    expect(isExternalUrlAllowed('feed://example.com')).toBe(false);
  });

  it('rejects `app://custom`', () => {
    expect(isExternalUrlAllowed('app://custom')).toBe(false);
  });

  // --- Re-confirm the three accepted protocols still work ------------------
  it('accepts `http://example.com`', () => {
    expect(isExternalUrlAllowed('http://example.com')).toBe(true);
  });

  it('accepts `https://example.com/path?q=1#frag`', () => {
    expect(isExternalUrlAllowed('https://example.com/path?q=1#frag')).toBe(true);
  });

  it('accepts `mailto:user@example.com`', () => {
    expect(isExternalUrlAllowed('mailto:user@example.com')).toBe(true);
  });

  it('accepts `mailto:user@example.com?subject=Hi`', () => {
    expect(isExternalUrlAllowed('mailto:user@example.com?subject=Hi')).toBe(true);
  });
});

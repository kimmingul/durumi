import { test, expect } from '@playwright/test';
import { launchClean, setTyporaMode, shutdownClean } from './_helpers';

test('app launches and shows window', async () => {
  const app = await launchClean();
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await expect(win).toHaveTitle(/Durumi/);
  // Use app.exit(0) (matching the other golden tests) instead of app.close().
  // app.close() relies on a graceful Cmd+W path which our renderer-driven
  // close guard would block until React has mounted its IPC handler.
  await shutdownClean(app);
});

test('typing markdown applies live preview classes', async () => {
  const app = await launchClean();
  const win = await app.firstWindow();
  await win.waitForSelector('.cm-content');
  // Typed-markdown test: switch to Typora mode so the `#` heading marker
  // isn't escaped to `\#` by the WYSIWYG filter (see e2e/_helpers.ts).
  await setTyporaMode(app, win);
  await win.click('.cm-content');
  await win.keyboard.type('# Heading\n\nbody');
  // Wait for the live-preview class to land rather than racing a fixed
  // timeout — the markdown parser is incremental and may not have applied
  // decorations within 150ms on a cold CodeMirror under packaged Electron.
  await win.waitForSelector('.cm-md-h1', { timeout: 5000 });
  const headingCount = await win.locator('.cm-md-h1').count();
  expect(headingCount).toBeGreaterThan(0);
  await shutdownClean(app);
});

test('toggling theme flips data-theme attribute', async () => {
  const app = await launchClean();
  const win = await app.firstWindow();
  await win.waitForSelector('.cm-content');
  await win.waitForTimeout(150);
  const before = await win.evaluate(() => document.documentElement.dataset.theme);
  // Use getAllWindows() rather than getFocusedWindow(): in headless Playwright/Electron
  // runs the OS does not give focus to the test window, so getFocusedWindow() returns
  // null and the send() is silently a no-op. The app only ever has one window in tests.
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w?.webContents.send('menu:command', 'toggleTheme');
  });
  await win.waitForTimeout(200);
  const after = await win.evaluate(() => document.documentElement.dataset.theme);
  expect(after).not.toBe(before);
  await shutdownClean(app);
});

import { test, expect, _electron as electronApp } from '@playwright/test';
import { join } from 'node:path';

test('app launches and shows window', async () => {
  const app = await electronApp.launch({
    args: [join(process.cwd(), 'out/main/main.js')],
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await expect(win).toHaveTitle(/Durumi/);
  await app.close();
});

test('typing markdown applies live preview classes', async () => {
  const app = await electronApp.launch({
    args: [join(process.cwd(), 'out/main/main.js')],
  });
  const win = await app.firstWindow();
  await win.waitForSelector('.cm-content');
  await win.click('.cm-content');
  await win.keyboard.type('# Heading\n\nbody');
  await win.waitForTimeout(150);
  const headingCount = await win.locator('.cm-md-h1').count();
  expect(headingCount).toBeGreaterThan(0);
  await app.evaluate(({ app: a }) => a.exit(0));
});

test('toggling theme flips data-theme attribute', async () => {
  const app = await electronApp.launch({
    args: [join(process.cwd(), 'out/main/main.js')],
  });
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
  await app.evaluate(({ app: a }) => a.exit(0));
});

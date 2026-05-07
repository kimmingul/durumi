import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import path from 'node:path';

const APP_ENTRY = path.resolve(process.cwd(), 'out', 'main', 'main.cjs');

async function launch() {
  const app = await electron.launch({ args: [APP_ENTRY] });
  const page = await app.firstWindow();
  await page.waitForSelector('.cm-content');
  return { app, page };
}

async function shutdown(app: ElectronApplication) {
  await app.evaluate(({ app: a }) => a.exit(0));
}

test('Cmd+F opens search panel; typing query highlights matches; Cmd+G moves to next; Esc closes', async () => {
  const { app, page } = await launch();
  try {
    await page.click('.cm-content');
    await page.keyboard.type('hello world\nhello again\nbye');
    // Open search
    await page.keyboard.press('Meta+F');
    await page.waitForSelector('.cm-panel.cm-search', { timeout: 2000 });
    // Type query into the search input. CM6 listens on `keyup` to commit the
    // query (not just `input`), so we focus + type so each key fires keyup.
    const search = page.locator('.cm-panel.cm-search input[name="search"]');
    await search.click();
    await search.pressSequentially('hello', { delay: 20 });
    // Wait for at least one match marker
    await page.waitForTimeout(200);
    const matches = await page.locator('.cm-searchMatch').count();
    expect(matches).toBeGreaterThanOrEqual(2);
    // Next
    await page.keyboard.press('Meta+G');
    await page.waitForTimeout(50);
    // Close
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const panel = await page.locator('.cm-panel.cm-search').count();
    expect(panel).toBe(0);
  } finally {
    await shutdown(app);
  }
});

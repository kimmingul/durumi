import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import path from 'node:path';

const APP_ENTRY = path.resolve(process.cwd(), 'out', 'main', 'main.js');

async function launch() {
  const app = await electron.launch({ args: [APP_ENTRY] });
  const page = await app.firstWindow();
  await page.waitForSelector('.cm-content');
  return { app, page };
}

async function shutdown(app: ElectronApplication) {
  await app.evaluate(({ app: a }) => a.exit(0));
}

test('mermaid fence renders to a block widget when cursor is outside', async () => {
  const { app, page } = await launch();
  await page.click('.cm-content');
  // Type a complete mermaid fence followed by a trailing newline so the
  // cursor lands outside the fence (active-block guard releases the
  // decoration).
  await page.keyboard.type('```mermaid\ngraph TD\nA-->B\n```\n');
  await page.keyboard.press('ArrowDown');
  // Mermaid render is async + lazy-loaded — give it generous time on first
  // run inside packaged Electron.
  await page.waitForSelector('.cm-mermaid-rendered', { timeout: 15000 });
  await expect(page.locator('.cm-mermaid-rendered').first()).toBeVisible();
  await shutdown(app);
});

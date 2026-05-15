import { test, expect, type ElectronApplication } from '@playwright/test';
import { launchClean, setTyporaMode, shutdownClean } from './_helpers';

async function launch() {
  const app = await launchClean();
  const page = await app.firstWindow();
  await page.waitForSelector('.cm-content');
  return { app, page };
}

async function shutdown(app: ElectronApplication) {
  await shutdownClean(app);
}

test('mermaid fence renders to a block widget when cursor is outside', async () => {
  const { app, page } = await launch();
  // Typed-markdown test: switch to Typora mode so the backticks aren't
  // escaped to `\`` by the WYSIWYG filter (see e2e/_helpers.ts).
  await setTyporaMode(app, page);
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

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

test('inline math renders when cursor leaves the line', async () => {
  const { app, page } = await launch();
  await page.click('.cm-content');
  // Type inline math followed by an explicit newline so the cursor leaves the
  // first line, then move further away to ensure the math line is inactive.
  await page.keyboard.type('Inline $E=mc^2$.');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  // B1 #11: widget contents are invisible to .cm-content innerText, assert via
  // class selector instead.
  await expect(page.locator('.cm-math-inline').first()).toBeVisible();
  await shutdown(app);
});

import { test, expect, type ElectronApplication } from '@playwright/test';
import { launchClean, shutdownClean } from './_helpers';

async function launch() {
  const app = await launchClean();
  const page = await app.firstWindow();
  await page.waitForSelector('.cm-content');
  return { app, page };
}

async function shutdown(app: ElectronApplication) {
  await shutdownClean(app);
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

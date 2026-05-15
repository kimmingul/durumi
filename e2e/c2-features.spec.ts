import { test, expect, type ElectronApplication } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { launchClean, shutdownClean } from './_helpers';

async function shutdown(app: ElectronApplication) {
  await shutdownClean(app);
}

test('renderer picks up custom.css from userData on launch', async () => {
  // Use a clean userData directory so we control custom.css contents.
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'durumi-c2-'));
  fs.writeFileSync(
    path.join(userData, 'custom.css'),
    'body { --custom-flag: yes; }\n',
    'utf8',
  );

  const app = await launchClean({ userDataDir: userData });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('.cm-content');
    // Wait for the renderer to fetch + inject the custom CSS.
    await page.waitForFunction(
      () => !!document.getElementById('custom-css'),
      undefined,
      { timeout: 5000 },
    );
    const flag = await page.evaluate(() =>
      getComputedStyle(document.body).getPropertyValue('--custom-flag').trim(),
    );
    expect(flag).toBe('yes');
  } finally {
    await shutdown(app);
    // Electron may still be flushing log/cache files; retry rm a few times.
    for (let i = 0; i < 5; i++) {
      try {
        fs.rmSync(userData, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }
});

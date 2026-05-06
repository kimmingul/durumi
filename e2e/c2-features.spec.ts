import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const APP_ENTRY = path.resolve(process.cwd(), 'out', 'main', 'main.js');

async function shutdown(app: ElectronApplication) {
  await app.evaluate(({ app: a }) => a.exit(0));
}

test('renderer picks up custom.css from userData on launch', async () => {
  // Use a clean userData directory so we control custom.css contents.
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'durumi-c2-'));
  fs.writeFileSync(
    path.join(userData, 'custom.css'),
    'body { --custom-flag: yes; }\n',
    'utf8',
  );

  const app = await electron.launch({
    args: [APP_ENTRY, `--user-data-dir=${userData}`],
  });
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

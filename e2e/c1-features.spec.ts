import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const APP_ENTRY = path.resolve(process.cwd(), 'out', 'main', 'main.js');

async function shutdown(app: ElectronApplication) {
  await app.evaluate(({ app: a }) => a.exit(0));
}

test('language=ko renders sidebar tabs in Korean on launch', async () => {
  // Pre-seed prefs with language=ko so we don't depend on the host locale.
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'durumi-c1-'));
  fs.writeFileSync(
    path.join(userData, 'preferences.json'),
    JSON.stringify({
      theme: 'system',
      language: 'ko',
      sidebar: { visible: true, activeTab: 'files', width: 240 },
      workspaceFolders: [],
      recentFiles: [],
      lastWindow: { width: 980, height: 720 },
    }),
    'utf8',
  );

  const app = await electron.launch({
    args: [APP_ENTRY, `--user-data-dir=${userData}`],
  });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('.cm-content');
    // Wait for the sidebar to render (it's `visible: true` in prefs).
    await page.waitForSelector('.cm-sidebar-tab', { timeout: 10000 });
    // The prefsGet().then(...) chain in App.tsx applies the persisted
    // language asynchronously, so wait for the localized text rather than
    // racing the initial English render.
    const fileTab = page.locator('.cm-sidebar-tab', { hasText: '파일' });
    const outlineTab = page.locator('.cm-sidebar-tab', { hasText: '목차' });
    await expect(fileTab).toBeVisible({ timeout: 10000 });
    await expect(outlineTab).toBeVisible({ timeout: 10000 });
  } finally {
    await shutdown(app);
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

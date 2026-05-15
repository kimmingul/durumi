import { test, expect, type ElectronApplication } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { launchClean, setTyporaMode, shutdownClean } from './_helpers';

async function launch() {
  const app = await launchClean();
  const page = await app.firstWindow();
  await page.waitForSelector('.cm-content');
  return { app, page };
}

// Force-exit to bypass the dirty-close (beforeunload) dialog that
// `app.close()` would otherwise hang on after we have typed into the editor.
async function shutdown(app: ElectronApplication) {
  await shutdownClean(app);
}

function makeTempFolder(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'durumi-b2-'));
  fs.writeFileSync(path.join(dir, 'one.md'), '# One\n\nbody');
  fs.writeFileSync(path.join(dir, 'two.md'), '# Two\n\n## Sub\n\nbody');
  return dir;
}

test('open folder + click file opens content', async () => {
  const { app, page } = await launch();
  const tmp = makeTempFolder();
  try {
    // Pin sidebar.activeTab to 'files' so persisted state from a prior run
    // (e.g. the Outline test that follows) doesn't hide the file tree.
    await page.evaluate(async (p: string) => {
      const api = (window as unknown as {
        api: {
          prefsSet: (x: {
            workspaceFolders: string[];
            sidebar?: { visible: boolean; activeTab: 'files'; width: number };
          }) => Promise<void>;
        };
      }).api;
      await api.prefsSet({
        workspaceFolders: [p],
        sidebar: { visible: true, activeTab: 'files', width: 315 },
      });
    }, tmp);
    await page.reload();
    await page.waitForSelector('.cm-content');
    await page.waitForSelector('.cm-tree-row-file', { timeout: 5000 });
    const rows = page.locator('.cm-tree-row-file');
    await expect(rows).toHaveCount(2);
    await rows.first().click();
    await page.waitForTimeout(200);
    const content = await page.evaluate(
      () => (document.querySelector('.cm-content') as HTMLElement).innerText
    );
    expect(content).toContain('One');
  } finally {
    await shutdown(app);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('outline tab shows headings and clicking jumps cursor', async () => {
  const { app, page } = await launch();
  try {
    // Typed-markdown test: switch to Typora mode so `#` chars aren't escaped
    // by the WYSIWYG strict-literal filter (see e2e/_helpers.ts).
    await setTyporaMode(app, page);
    await page.click('.cm-content');
    await page.keyboard.type('# H1\n\n## H2\n\n### H3\n\nbody text\n');
    // useDocOutline has a 100ms debounce; wait it out before switching tabs.
    await page.waitForTimeout(150);
    await page.locator('.cm-sidebar-tab', { hasText: 'Outline' }).click();
    await page.waitForSelector('.cm-outline-row', { timeout: 3000 });
    const rows = page.locator('.cm-outline-row');
    await expect(rows).toHaveCount(3);
    await rows.nth(2).click();
    await page.waitForTimeout(100);
    const activeLineText = await page.evaluate(() => {
      const a = document.querySelector('.cm-activeLine');
      return a ? (a as HTMLElement).innerText : '';
    });
    expect(activeLineText).toContain('H3');
  } finally {
    await shutdown(app);
  }
});

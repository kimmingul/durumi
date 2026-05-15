import { test, expect, type ElectronApplication } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
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

function makeFolder(prefix: string, files: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `durumi-c6-${prefix}-`));
  for (const f of files) {
    fs.writeFileSync(path.join(dir, f), `# ${f}\n\nbody`);
  }
  return dir;
}

test('multiple workspace roots render side-by-side in the sidebar', async () => {
  const { app, page } = await launch();
  const a = makeFolder('a', ['alpha.md']);
  const b = makeFolder('b', ['beta.md', 'gamma.md']);
  try {
    // The persisted preferences file is shared across e2e runs, so any test
    // that left the sidebar pinned to Outline would block the file-tree
    // assertions below. Explicitly force the Files tab to be active.
    await page.evaluate(async (paths: string[]) => {
      const api = (window as unknown as {
        api: {
          prefsSet: (x: {
            workspaceFolders: string[];
            sidebar?: { visible: boolean; activeTab: 'files'; width: number };
          }) => Promise<void>;
        };
      }).api;
      await api.prefsSet({
        workspaceFolders: paths,
        sidebar: { visible: true, activeTab: 'files', width: 315 },
      });
    }, [a, b]);
    await page.reload();
    await page.waitForSelector('.cm-content');
    await page.waitForSelector('.cm-tree-root-label', { timeout: 5000 });

    const labels = page.locator('.cm-tree-root-label');
    await expect(labels).toHaveCount(2);

    // Both roots render their files (1 + 2 = 3 file rows in total).
    const rows = page.locator('.cm-tree-row-file');
    await expect(rows).toHaveCount(3);
  } finally {
    await shutdown(app);
    fs.rmSync(a, { recursive: true, force: true });
    fs.rmSync(b, { recursive: true, force: true });
  }
});

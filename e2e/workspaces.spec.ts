import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

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
    await page.evaluate(async (paths: string[]) => {
      await (
        window as unknown as {
          api: { prefsSet: (x: { workspaceFolders: string[] }) => Promise<void> };
        }
      ).api.prefsSet({ workspaceFolders: paths });
    }, [a, b]);
    await page.reload();
    await page.waitForSelector('.cm-content');
    // Wait for prefsGet effect + per-root listings to populate.
    await page.waitForTimeout(400);
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

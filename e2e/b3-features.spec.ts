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

async function shutdown(app: ElectronApplication) {
  await shutdownClean(app);
}

test('HTML export produces a valid file with rendered body', async () => {
  const { app, page } = await launch();
  const tmpFile = path.join(os.tmpdir(), `durumi-e2e-export-${Date.now()}.html`);
  try {
    // Typed-markdown test: switch to Typora mode so the `#` heading marker
    // isn't escaped to `\#` by the WYSIWYG filter (see e2e/_helpers.ts).
    await setTyporaMode(app, page);
    await page.click('.cm-content');
    await page.keyboard.type('# Hello\n\nbody text');
    await app.evaluate(({ dialog }, p) => {
      (dialog as unknown as { showSaveDialog: (...args: unknown[]) => Promise<unknown> }).showSaveDialog =
        async () => ({ canceled: false, filePath: p });
    }, tmpFile);
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win?.webContents.send('menu:command', 'exportHtml');
    });
    let attempts = 0;
    while (!fs.existsSync(tmpFile) && attempts < 50) {
      await page.waitForTimeout(100);
      attempts++;
    }
    expect(fs.existsSync(tmpFile)).toBe(true);
    const html = fs.readFileSync(tmpFile, 'utf8');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<h1 id="hello">Hello</h1>');
    expect(html).toContain('body text');
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    await shutdown(app);
  }
});

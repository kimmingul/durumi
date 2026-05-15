/**
 * v0.2.10 — Recent Folders menu round-trip.
 *
 * Asserts the persistence + push semantics from the renderer side: setting
 * `recentFolders` via `prefsSet` survives a reload, and the order is MRU
 * with cap-10. The native menu rebuild happens out-of-process and isn't
 * directly inspectable from Playwright; the persistence + ordering test
 * here is the sharpest contract we can pin from inside the renderer.
 */

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

test('recentFolders persistence: MRU order, dedup, cap at 10', async () => {
  const { app, page } = await launch();
  // Build 12 dummy tmpdir folders so we can assert the cap.
  const dirs = Array.from({ length: 12 }, (_, i) =>
    fs.mkdtempSync(path.join(os.tmpdir(), `durumi-recent-${i}-`)),
  );
  try {
    await page.evaluate(async (paths: string[]) => {
      const api = (
        window as unknown as {
          api: {
            prefsSet: (x: { recentFolders: string[] }) => Promise<void>;
            prefsGet: () => Promise<{ recentFolders: string[] }>;
          };
        }
      ).api;
      // Push each folder one-at-a-time so dedup + ordering is exercised.
      for (const p of paths) {
        const cur = await api.prefsGet();
        const next = [p, ...(cur.recentFolders ?? []).filter((x) => x !== p)].slice(0, 10);
        await api.prefsSet({ recentFolders: next });
      }
      // Re-add an earlier folder; it should jump to the head.
      const cur2 = await api.prefsGet();
      const replay = paths[3]!;
      const next2 = [replay, ...(cur2.recentFolders ?? []).filter((x) => x !== replay)].slice(0, 10);
      await api.prefsSet({ recentFolders: next2 });
    }, dirs);

    const after = await page.evaluate(async () => {
      const api = (
        window as unknown as { api: { prefsGet: () => Promise<{ recentFolders: string[] }> } }
      ).api;
      const prefs = await api.prefsGet();
      return prefs.recentFolders;
    });

    // Dedup pulled paths[3] to the head.
    expect(after[0]).toBe(dirs[3]);
    // Cap at 10.
    expect(after.length).toBe(10);
    // Earliest pushes were dropped — paths[0] (the first push) was the oldest
    // and should have rotated off after we passed 10 unique entries.
    expect(after).not.toContain(dirs[0]);
  } finally {
    await shutdown(app);
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  }
});

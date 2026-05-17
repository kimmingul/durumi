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

/**
 * v0.2.23 — pending-assets IPC contract.
 *
 * The previous v0.2.11 toast-trigger contract (`saveImage(null)` returning
 * `{ error: 'no-file' }`) is gone. The new pipeline writes bytes into a
 * per-session pending-assets dir on the spot and returns the absolute path
 * for the renderer to embed. The first subsequent save migrates that file
 * into `<docDir>/assets/` and rewrites the markdown link.
 *
 * Unit coverage lives in:
 *  - `tests/editor/imagePaste.test.ts` — `handlePaste` inserts the abs path
 *    when the doc is unsaved.
 *  - `tests/electron/pendingAssets.test.ts` — savePendingImage write
 *    location, isPendingPath, migratePendingInContent end-to-end.
 *
 * This e2e pins the IPC contract: a real launched Electron app's
 * `image:save` handler returns `{ absPath }` for a null `contextFilePath`,
 * and the absolute path lives under `<userData>/pending-assets/`. Locking
 * the IPC shape end-to-end prevents a main-process refactor from silently
 * breaking the immediate-render trigger (the unit tests stub
 * `window.api`, so they cannot catch a real-IPC drift).
 */
test('image:save IPC returns {absPath} under pending-assets for a null doc path', async () => {
  const { app, page } = await launch();
  try {
    const ipcResult = await page.evaluate(async () => {
      const w = window as unknown as {
        api: {
          saveImage: (
            b: Uint8Array,
            m: string,
            p: string | null,
          ) => Promise<{ absPath?: string; relPath?: string }>;
        };
      };
      return w.api.saveImage(new Uint8Array([1, 2, 3]), 'image/png', null);
    });
    expect(ipcResult).toHaveProperty('absPath');
    expect(typeof ipcResult.absPath).toBe('string');
    expect(ipcResult.absPath).toMatch(/[\\/]pending-assets[\\/]/);
    expect(ipcResult.absPath!.endsWith('.png')).toBe(true);
  } finally {
    await shutdown(app);
  }
});

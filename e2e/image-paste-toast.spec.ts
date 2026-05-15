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
 * v0.2.11 — Item 3 e2e. The full paste chain
 *   Cmd+V → contentDOM 'paste' → handlePaste → window.api.saveImage(null)
 *   → {error:'no-file'} → showToast → ToastHost render
 * is covered as follows:
 *
 *  - `tests/editor/imagePaste.test.ts` (vitest) drives `handlePaste`
 *    directly with a stubbed `window.api.saveImage` returning the no-file
 *    shape, and asserts the toast store gains an entry with the
 *    "Save as…" action.
 *  - `tests/store/toastStore.test.ts` (vitest) covers the store + auto-
 *    dismiss timer + action wiring.
 *  - This e2e (below) pins the IPC contract: a real launched Electron
 *    app's `image:save` handler returns exactly `{error:'no-file'}` for
 *    a null `contextFilePath`, which is the trigger the renderer-side
 *    handler keys off. Locking the IPC shape end-to-end prevents a
 *    main-process refactor from silently breaking the toast trigger
 *    (the unit tests stub `window.api`, so they cannot catch a real-IPC
 *    drift).
 *
 * A genuine `dispatchEvent('paste', …)` from `page.evaluate` does not
 * reach `handlePaste`: CodeMirror's input pipeline filters synthetic
 * events (`isTrusted=false`) for security. Driving Cmd+V against an OS
 * clipboard image works on a real desktop but is flaky in headless
 * Electron because the OS pasteboard surface differs across CI hosts —
 * we keep it out of the suite to avoid platform-specific flakes and
 * rely on the unit-tested `handlePaste→showToast` chain instead.
 */
test('image:save IPC returns {error:"no-file"} for a null doc path', async () => {
  const { app, page } = await launch();
  try {
    const ipcResult = await page.evaluate(async () => {
      const w = window as unknown as {
        api: {
          saveImage: (b: Uint8Array, m: string, p: string | null) => Promise<{ error?: string; relPath?: string }>;
        };
      };
      return w.api.saveImage(new Uint8Array([1, 2, 3]), 'image/png', null);
    });
    expect(ipcResult).toEqual({ error: 'no-file' });
  } finally {
    await shutdown(app);
  }
});

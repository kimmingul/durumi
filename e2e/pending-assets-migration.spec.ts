import { test, expect, type ElectronApplication } from '@playwright/test';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchClean, shutdownClean, getEditorDoc } from './_helpers';

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
 * v0.2.23 — end-to-end migration contract.
 *
 * Pipeline under test:
 *   1. Untitled buffer → `image:save` with `contextFilePath=null` writes
 *      bytes into `<userData>/pending-assets/<sid>/` and returns `absPath`.
 *   2. Renderer inserts `![](<absPath>)` into the editor doc.
 *   3. `file:saveAs` runs `migratePendingInContent` BEFORE the disk
 *      write: it moves the file into `<docDir>/assets/` and rewrites the
 *      markdown link to `assets/<filename>`. The post-save doc on disk
 *      matches what the editor buffer now shows.
 *
 * We exercise the IPCs directly (rather than driving keyboard/paste
 * events) because Electron's headless `dialog.showSaveDialog` cannot be
 * automated — but the renderer-side data flow uses the same store
 * setters the UI uses, so the contract is identical. The unit suite
 * covers the editor's `handlePaste` insert + `useFileMenuCommands` save
 * wiring; this spec pins the main-process plumbing end-to-end.
 */
test('untitled → image-save → save migrates pending file into <docDir>/assets/', async () => {
  const { app, page } = await launch();
  const targetDir = await fs.mkdtemp(join(tmpdir(), 'durumi-pending-e2e-'));
  const targetPath = join(targetDir, 'doc.md');
  try {
    // 1. saveImage with no doc path → bytes land in pending-assets.
    const saved = await page.evaluate(async () => {
      const w = window as unknown as {
        api: {
          saveImage: (
            b: Uint8Array,
            m: string,
            p: string | null,
          ) => Promise<{ absPath?: string; relPath?: string }>;
        };
      };
      return w.api.saveImage(new Uint8Array([7, 7, 7]), 'image/png', null);
    });
    expect(saved.absPath).toBeDefined();
    const pendingAbs = saved.absPath!;
    expect(pendingAbs).toMatch(/[\\/]pending-assets[\\/]/);
    // The pending file actually exists on disk before the save.
    await fs.access(pendingAbs);

    // 2. Drive a save through the IPC contract: hand main the same
    // markdown the renderer would have built. The `file:save` handler
    // runs migratePendingInContent on the content and writes the
    // rewritten version.
    const saveResult = await page.evaluate(
      async ({ p, mdContent }) => {
        const w = window as unknown as {
          api: {
            fileSave: (
              path: string,
              content: string,
            ) => Promise<{ ok: true; content?: string }>;
          };
        };
        return w.api.fileSave(p, mdContent);
      },
      { p: targetPath, mdContent: `# Hi\n\n![](${pendingAbs})\n` },
    );
    // Main returned a rewritten content payload (migration happened).
    expect(saveResult.content).toBeDefined();
    expect(saveResult.content!).toMatch(/!\[\]\(assets\/img-[^)]+\.png\)/);
    expect(saveResult.content!).not.toContain(pendingAbs);

    // 3. The file on disk matches the rewritten content.
    const onDisk = await fs.readFile(targetPath, 'utf8');
    expect(onDisk).toBe(saveResult.content);

    // 4. The image moved from pending-assets into <docDir>/assets/.
    const assetEntries = await fs.readdir(join(targetDir, 'assets'));
    expect(assetEntries.length).toBe(1);
    expect(assetEntries[0]).toMatch(/^img-.*\.png$/);
    // The original pending location no longer holds the file.
    await expect(fs.access(pendingAbs)).rejects.toThrow();
  } finally {
    await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {});
    await shutdown(app);
  }
});

/**
 * Renderer-side display: after the editor inserts the pending-assets
 * absolute path, the `<img>` widget routes through `resolveImageSrc`,
 * which wraps the abs path in `durumi-asset://x/?p=…`. The protocol
 * handler returns 200 because `allowSessionTree(sessionDir)` registered
 * the pending root as trusted when the bytes were saved. We assert the
 * 200 response by `fetch`-ing the constructed URL from inside the
 * renderer, which is the exact request the widget would make.
 */
test('durumi-asset:// serves pending images (path-guard trusts the session dir)', async () => {
  const { app, page } = await launch();
  try {
    const result = await page.evaluate(async () => {
      const w = window as unknown as {
        api: {
          saveImage: (
            b: Uint8Array,
            m: string,
            p: string | null,
          ) => Promise<{ absPath?: string }>;
        };
      };
      const saved = await w.api.saveImage(new Uint8Array([5, 5, 5]), 'image/png', null);
      if (!saved.absPath) return { status: -1, mime: null };
      const url = `durumi-asset://x/?p=${encodeURIComponent(saved.absPath)}`;
      const res = await fetch(url);
      return { status: res.status, mime: res.headers.get('content-type') };
    });
    expect(result.status).toBe(200);
    expect(result.mime).toBe('image/png');
  } finally {
    // getEditorDoc isn't needed here — `result` already proved the
    // protocol handler works. The import is left from the helper bundle
    // for symmetry with the migration spec above.
    void getEditorDoc;
    await shutdown(app);
  }
});

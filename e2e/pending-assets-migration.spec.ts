import { test, expect, type ElectronApplication } from '@playwright/test';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchClean, shutdownClean, getEditorDoc } from './_helpers';

/**
 * Build a userData dir whose absolute path contains a literal space.
 *
 * Production on macOS lands userData under
 * `~/Library/Application Support/durumi/` — that space is exactly what
 * broke the v0.2.23 first cut (CommonMark refuses unwrapped spaces in
 * image URLs, so the parser skipped the node and the user saw raw
 * markdown). `os.tmpdir()` returns a space-free path on every CI host
 * we touch, so the migration / IPC suites would never have surfaced
 * this. We force the path shape here so the renderer-render spec
 * exercises the encode-on-insert + decode-in-resolveImageSrc round
 * trip end-to-end.
 */
async function mkdtempWithSpace(prefix: string): Promise<string> {
  const base = await fs.mkdtemp(join(tmpdir(), prefix));
  const withSpace = join(base, 'with space');
  await fs.mkdir(withSpace, { recursive: true });
  return withSpace;
}

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
    // markdown the renderer would have built. The renderer percent-
    // encodes the pending path before insertion (so the markdown parser
    // accepts URLs with spaces under macOS `Application Support`), so
    // mirror that here. The `file:save` handler runs
    // migratePendingInContent which decodes before checking the pending
    // prefix.
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
      { p: targetPath, mdContent: `# Hi\n\n![](${encodeURI(pendingAbs)})\n` },
    );
    // Main returned a rewritten content payload (migration happened).
    expect(saveResult.content).toBeDefined();
    expect(saveResult.content!).toMatch(/!\[\]\(assets\/img-[^)]+\.png\)/);
    expect(saveResult.content!).not.toContain(pendingAbs);
    expect(saveResult.content!).not.toContain(encodeURI(pendingAbs));

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

/**
 * Real-UI regression: simulate the user's actual scenario where userData
 * lives under a path containing a space (matches macOS production
 * `~/Library/Application Support/durumi/`). We:
 *   1. Launch with a userData dir whose absolute path has a literal
 *      space ("…/with space/…").
 *   2. Drive `image:save(null)` to get a pending absPath with the space.
 *   3. Dispatch a CodeMirror transaction inserting `![](<encoded>)`.
 *   4. Wait for the `cm-md-image` widget to mount, then verify:
 *        - The `<img>` element exists (parser tokenised the link).
 *        - Its `src` is a durumi-asset:// URL.
 *        - The URL's `?p=` parameter is the REAL filesystem path
 *          (with the space, not %20).
 *        - The widget loaded successfully (`naturalWidth > 0`).
 *
 * The first-cut v0.2.23 ship missed this because:
 *   - `os.tmpdir()` returns a space-free path on every CI host, so the
 *     existing migration spec never produced a space in the pending dir.
 *   - The migration IPC test passed because main only checks the path
 *     prefix; it never round-trips through the markdown parser.
 *   - Unit tests stubbed `window.api`, so they couldn't see the parser
 *     refuse the unwrapped-space URL.
 *
 * Pinning this spec keeps the encode-on-insert + decode-in-resolveImageSrc
 * contract from regressing the moment someone "simplifies" it.
 */
test('renderer actually renders a pending image whose path contains a space', async () => {
  const userDataWithSpace = await mkdtempWithSpace('durumi-spaced-');
  const app = await launchClean({ userDataDir: userDataWithSpace });
  const page = await app.firstWindow();
  await page.waitForSelector('.cm-content');
  try {
    const probe = await page.evaluate(async () => {
      const w = window as unknown as {
        api: {
          saveImage: (
            b: Uint8Array,
            m: string,
            p: string | null,
          ) => Promise<{ absPath?: string }>;
        };
      };
      // A 1x1 transparent PNG so `naturalWidth` is well-defined after
      // the load. Any opaque pixel works too — the point is to give the
      // browser a real decodable byte stream.
      const onePixelPng = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
        0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);
      const saved = await w.api.saveImage(onePixelPng, 'image/png', null);
      if (!saved.absPath) return null;
      // Sanity: the userData dir we launched with contains a literal
      // space, so the pending path inherits it.
      if (!saved.absPath.includes(' ')) return null;
      const encoded = encodeURI(saved.absPath);
      // Dispatch a CM transaction to insert the markdown image at caret.
      // This is the same code path `usePickAndInsertImage` takes.
      const root = document.querySelector('.cm-editor') as HTMLElement | null;
      if (!root) return null;
      const content = root.querySelector('.cm-content') as HTMLElement | null;
      const view = (
        content as unknown as {
          cmTile?: {
            root?: {
              view?: {
                dispatch: (spec: object) => void;
                state: { doc: { length: number } };
              };
            };
          };
        }
      )?.cmTile?.root?.view;
      if (!view) return null;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: `![](${encoded})\n` },
      });
      return { absPath: saved.absPath, encoded };
    });
    expect(probe).not.toBeNull();
    expect(probe!.absPath).toContain(' ');

    // The image widget mounts inside the CM content. Wait for it.
    const img = page.locator('img.cm-md-image').first();
    await img.waitFor({ state: 'attached', timeout: 5000 });

    const inspection = await img.evaluate((el) => {
      const i = el as HTMLImageElement;
      let p: string | null = null;
      try {
        p = new URL(i.src).searchParams.get('p');
      } catch {
        p = null;
      }
      return {
        src: i.src,
        param: p,
        complete: i.complete,
        naturalWidth: i.naturalWidth,
      };
    });
    expect(inspection.src.startsWith('durumi-asset://')).toBe(true);
    // The path in the durumi-asset URL must be the REAL filesystem path
    // (with the space), not the markdown-encoded form. Anything else
    // would 404 against the main-side fs.readFile.
    expect(inspection.param).toBe(probe!.absPath);
    // The actual byte fetch + decode succeeded.
    expect(inspection.complete).toBe(true);
    expect(inspection.naturalWidth).toBeGreaterThan(0);
  } finally {
    await shutdownClean(app);
    await fs.rm(userDataWithSpace, { recursive: true, force: true }).catch(() => {});
  }
});

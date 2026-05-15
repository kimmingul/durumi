import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const APP_ENTRY = path.resolve(process.cwd(), 'out', 'main', 'main.cjs');

/**
 * Launch the packaged Electron app with an isolated, ephemeral userData
 * directory so the test never reads or writes the developer's actual
 * `~/Library/Application Support/Electron/preferences.json`.
 *
 * Why this exists (v0.2.13 hot-fix):
 *  - Specs like `b1-features.spec.ts` assume the launch default of
 *    `editor.defaultMode === 'wysiwyg'`. That assumption holds on a fresh
 *    CI runner but breaks the moment a developer flips their personal
 *    preference to `typora` (Live mode) or `markdown` (Source mode) — the
 *    persisted pref bleeds into the test process, the editor boots into
 *    the wrong mode, and assertions like `expect(...).not.toContain('%%')`
 *    fail even though the production code is correct.
 *  - The fix is to give every spec its own throwaway userData dir. Electron
 *    honors the `--user-data-dir=<path>` Chromium command-line switch out
 *    of the box (already used by `c1-features.spec.ts` and `c2-features.spec.ts`),
 *    and `electron/main.ts` also parses it explicitly via `app.setPath`
 *    as belt-and-braces in case Chromium ever stops applying it.
 *
 * The temp dir path is stashed on the returned ElectronApplication via a
 * non-enumerable prop so `shutdownClean` can rm-rf it after the app exits.
 */
export interface LaunchCleanOptions {
  /** Extra CLI args appended after `--user-data-dir`. */
  extraArgs?: string[];
  /**
   * Pre-existing userData directory to use instead of a fresh `mkdtemp`.
   * Specs that need to seed `preferences.json` or `custom.css` before launch
   * (e.g. `c1-features.spec.ts`, `c2-features.spec.ts`) create and populate
   * the dir themselves, then pass it here. `shutdownClean` skips the rm in
   * that case so the test can manage its own cleanup.
   */
  userDataDir?: string;
}

export async function launchClean(
  argsOrOptions: string[] | LaunchCleanOptions = [],
): Promise<ElectronApplication> {
  const opts: LaunchCleanOptions = Array.isArray(argsOrOptions)
    ? { extraArgs: argsOrOptions }
    : argsOrOptions;
  const extraArgs = opts.extraArgs ?? [];
  const ownsDir = !opts.userDataDir;
  const userDataDir = opts.userDataDir ?? (await fs.promises.mkdtemp(path.join(os.tmpdir(), 'durumi-e2e-')));
  const app = await electron.launch({
    args: [APP_ENTRY, `--user-data-dir=${userDataDir}`, ...extraArgs],
    env: {
      ...process.env,
      // Already set by the `test:e2e` script, repeated here for any caller
      // that bypasses the npm script (e.g. running `playwright test`
      // directly from the editor's test runner UI).
      DURUMI_E2E: '1',
    },
  });
  (app as unknown as { __userDataDir: string; __ownsUserDataDir: boolean }).__userDataDir = userDataDir;
  (app as unknown as { __userDataDir: string; __ownsUserDataDir: boolean }).__ownsUserDataDir = ownsDir;
  return app;
}

/**
 * Quit the Electron app via `app.exit(0)` (bypassing the dirty-close
 * beforeunload guard, matching the existing convention) and best-effort
 * remove the temp userData dir created by `launchClean`.
 *
 * The rm is wrapped in a small retry to tolerate Electron flushing late
 * cache/log writes a few ms after exit; failures are swallowed because a
 * stale temp dir is harmless and we don't want a cleanup error to fail an
 * otherwise-passing test.
 */
export async function shutdownClean(app: ElectronApplication): Promise<void> {
  const stash = app as unknown as { __userDataDir?: string; __ownsUserDataDir?: boolean };
  const userDataDir = stash.__userDataDir;
  const ownsDir = stash.__ownsUserDataDir !== false;
  try {
    await app.evaluate(({ app: a }) => a.exit(0));
  } catch {
    // The app may already be torn down (e.g. spec did its own quit). Ignore.
  }
  if (userDataDir && ownsDir) {
    for (let i = 0; i < 5; i++) {
      try {
        await fs.promises.rm(userDataDir, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }
}

/**
 * Switch the editor to Typora mode (legacy active-line marker hiding).
 *
 * Why: v0.1.12 introduced a WYSIWYG strict-literal mode (the default). In
 * that mode the editor's transactionFilter intercepts every typed special
 * char and rewrites it with a backslash escape — `#` → `\#`, `*` → `\*`,
 * etc. — so the markdown parser produces zero formatting from raw user
 * typing. Live-decoration e2e specs that drive `page.keyboard.type` with
 * markdown source therefore see no `cm-md-h1`, no task widget, no fence
 * highlighting, and so on.
 *
 * Typora mode (legacy v0.1.0-v0.1.10 behaviour) leaves user typing
 * unescaped so the parser sees real markdown. Use this helper at the top
 * of any spec that types markdown source and relies on the live preview
 * decorations applying.
 *
 * The mode switch is dispatched via the menu-command IPC channel so it
 * exercises the same code path the View ▸ Mode menu item would.
 */
export async function setTyporaMode(app: ElectronApplication, page: Page): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w?.webContents.send('menu:command', { type: 'setEditMode', mode: 'typora' });
  });
  // Let the renderer dispatch the resulting reducer update + reconfigure
  // the editor compartment before the test proceeds with typing.
  await page.waitForTimeout(150);
}

/**
 * Switch the editor to Markdown (source) mode.
 *
 * Used by toolbar tests to verify the toolbar is NOT mounted outside of
 * Document/WYSIWYG mode. Mirrors `setTyporaMode` but targets `markdown`.
 */
export async function setMarkdownMode(app: ElectronApplication, page: Page): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w?.webContents.send('menu:command', { type: 'setEditMode', mode: 'markdown' });
  });
  await page.waitForTimeout(150);
}

/**
 * Switch the editor to Document (WYSIWYG) mode.
 *
 * WYSIWYG is the launch default, so most specs don't need this helper.
 * Use it inside specs that have already flipped to Live or Source mode
 * and want to flip back — e.g. the v0.2.8 memo/CriticMarkup parity spec
 * which exercises both modes back-to-back.
 */
export async function setWysiwygMode(app: ElectronApplication, page: Page): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w?.webContents.send('menu:command', { type: 'setEditMode', mode: 'wysiwyg' });
  });
  await page.waitForTimeout(150);
}

/**
 * Read the live CodeMirror document via the EditorView attached to the DOM.
 *
 * The toolbar tests need to assert raw source (e.g. `**hello**`) — `cm-content`
 * innerText shows the rendered preview which hides the markers. We reach the
 * `EditorView` instance through the CodeMirror 6 internal `cmTile` link that
 * `EditorView.findFromDOM` itself walks: `.cm-editor` → `cmTile.root.view`.
 *
 * Falls back to `.cm-content` innerText when the cmTile traversal is null
 * (e.g. a renderer that swapped out the view between the page.evaluate and
 * the DOM query) — that fallback is lossy but keeps tests from hanging.
 */
export async function getEditorDoc(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const root = document.querySelector('.cm-editor') as HTMLElement | null;
    if (!root) return '';
    // CM6 stashes its view on the .cm-content node via a `cmView` weakmap-ish
    // chain that goes (dom).cmTile.root.view. The `cmTile` symbol is internal
    // but stable enough for e2e since we pin a single CM6 version.
    const content = root.querySelector('.cm-content') as HTMLElement | null;
    const tileHolder = (content ?? root) as unknown as {
      cmTile?: { root?: { view?: { state: { doc: { toString(): string } } } } };
    };
    const view = tileHolder.cmTile?.root?.view;
    if (view) return view.state.doc.toString();
    return content?.innerText ?? '';
  });
}

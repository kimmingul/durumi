import type { ElectronApplication, Page } from '@playwright/test';

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

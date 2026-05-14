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

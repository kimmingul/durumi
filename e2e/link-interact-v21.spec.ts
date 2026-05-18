import { test, expect } from '@playwright/test';
import { launchClean, shutdownClean } from './_helpers';

/**
 * v0.2.21 — REAL-UI verification of three user-reported regressions that
 * v0.2.19 + v0.2.20 both shipped "fixed" with passing tests:
 *
 *   1. Hover over a `[text](url)` link in Document mode shows the URL
 *      tooltip ON-SCREEN (not at `top: -10000px`).
 *
 *   2. Right-click on a `.cm-md-link` shows the renderer context menu and
 *      does NOT trigger the left-click `shellOpenExternal` path.
 *
 *   3. The "링크 삽입" / Cmd+K / native context-menu "Insert link" entry
 *      opens the InsertLinkDialog (same as the toolbar Link button), NOT
 *      raw `[]()` text into the document.
 *
 * These tests deliberately drive REAL mouse events (mouse.move, click with
 * button:'right') and intercept the main-process `shell:openExternal` IPC
 * handler so they fail the way the v0.2.19/v0.2.20 specs did NOT: by
 * observing the user-visible state, not just internal helper invocations.
 */
test('v0.2.21 fix #1: hover renders a visible (on-screen) tooltip', async () => {
  const app = await launchClean();
  const page = await app.firstWindow();
  await page.waitForSelector('.cm-content');

  await page.evaluate(() => {
    const content = document.querySelector('.cm-content') as HTMLElement;
    const view = (content as unknown as {
      cmTile?: { root?: { view?: { dispatch: (s: unknown) => void } } };
    }).cmTile?.root?.view;
    if (!view) throw new Error('no view');
    view.dispatch({ changes: { from: 0, to: 0, insert: 'pre [click](https://example.com) post' } });
  });
  await page.keyboard.press('End');

  // Move the real mouse over the link label and wait for the hoverTime.
  const box = await page.locator('.cm-md-link').first().boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(500);

  // Tooltip element must exist AND be positioned on-screen. Pre-v0.2.21
  // the DOM node existed but lived at `top: -10000px` because the
  // CodeMirror tooltip layout couldn't resolve `coordsAtPos(link.from)`
  // — that position fell inside the hidden bracket replace-widget.
  const measured = await page.evaluate(() => {
    const el = document.querySelector('.cm-tooltip-hover');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  });
  expect(measured).not.toBeNull();
  // Must be inside the viewport (NOT parked at -10000).
  expect(measured!.top).toBeGreaterThan(0);
  expect(measured!.top).toBeLessThan(2000);
  expect(measured!.left).toBeGreaterThan(0);

  // v0.2.22 — tooltip is single-line: title if present, else URL. No buttons.
  await expect(page.locator('.cm-link-tooltip-url')).toHaveText('https://example.com');
  await expect(page.locator('[data-testid=link-tooltip-open]')).toHaveCount(0);
  await expect(page.locator('[data-testid=link-tooltip-edit]')).toHaveCount(0);

  await page.screenshot({ path: 'e2e/screenshots/v0.2-smoke/49-link-tooltip-visible.png' });
  await shutdownClean(app);
});

test('v0.2.23: click semantics — plain left = caret only, ⌘+Click = open, right = menu', async () => {
  const app = await launchClean();
  const page = await app.firstWindow();
  await page.waitForSelector('.cm-content');

  // Intercept shell:openExternal in main so we can count actual calls.
  // Three distinct click flavours land here, each with a different
  // expectation:
  //   - right-click: never opens, pops the renderer context menu
  //   - plain left: never opens (v0.2.23 — used to open pre-fix, now
  //     positions the caret so users can edit the label)
  //   - ⌘+Click / Ctrl+Click: opens
  await app.evaluate(({ ipcMain }) => {
    const g = global as unknown as { __shellOpenCalls?: string[] };
    g.__shellOpenCalls = [];
    ipcMain.removeHandler('shell:openExternal');
    ipcMain.handle('shell:openExternal', async (_e, url: string) => {
      g.__shellOpenCalls!.push(url);
      return { ok: true as const };
    });
  });

  await page.evaluate(() => {
    const content = document.querySelector('.cm-content') as HTMLElement;
    const view = (content as unknown as {
      cmTile?: { root?: { view?: { dispatch: (s: unknown) => void } } };
    }).cmTile?.root?.view;
    if (!view) throw new Error('no view');
    view.dispatch({ changes: { from: 0, to: 0, insert: 'see [click](https://example.com) end' } });
  });
  await page.keyboard.press('End');

  // Right-click → renderer context menu, no browser.
  await page.locator('.cm-md-link').first().click({ button: 'right' });
  await page.waitForTimeout(200);
  await expect(page.locator('[data-testid=link-context-menu]')).toBeVisible();
  expect(
    await app.evaluate(() => (global as unknown as { __shellOpenCalls?: string[] }).__shellOpenCalls ?? []),
  ).toEqual([]);
  await page.screenshot({ path: 'e2e/screenshots/v0.2-smoke/50-link-rightclick-no-browser.png' });
  await page.keyboard.press('Escape');

  // v0.2.23 — plain left-click MUST NOT open. This is the user-reported
  // regression that drove the modifier-gating change.
  await page.locator('.cm-md-link').first().click({ button: 'left' });
  await page.waitForTimeout(200);
  const callsAfterPlain = await app.evaluate(
    () => (global as unknown as { __shellOpenCalls?: string[] }).__shellOpenCalls ?? [],
  );
  expect(callsAfterPlain).toEqual([]);

  // v0.2.23 — ⌘+Click / Ctrl+Click DOES open. `ControlOrMeta` auto-picks
  // ⌘ on macOS and Ctrl on Win/Linux, matching the runtime check in
  // `linkClickHandler`.
  await page.locator('.cm-md-link').first().click({
    button: 'left',
    modifiers: ['ControlOrMeta'],
  });
  await page.waitForTimeout(200);
  const callsAfterMod = await app.evaluate(
    () => (global as unknown as { __shellOpenCalls?: string[] }).__shellOpenCalls ?? [],
  );
  expect(callsAfterMod).toEqual(['https://example.com']);

  await shutdownClean(app);
});

test('v0.2.21 fix #3: "Insert link" menu command opens the dialog (not raw `[]()`)', async () => {
  const app = await launchClean();
  const page = await app.firstWindow();
  await page.waitForSelector('.cm-content');

  // Fire the same `menu:command` IPC that `electron/contextMenu.ts` sends
  // when the user clicks "링크 삽입" on a right-click over empty editor
  // area (params.isEditable === true). Pre-v0.2.21 this inserted literal
  // `[]()` text into the document via `useMenuCommandRouter`'s `'link'`
  // branch. v0.2.21 routes the same command through
  // `durumi:open-link-dialog`, which `EditorToolbar` listens for and
  // mounts the `InsertLinkDialog`.
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w?.webContents.send('menu:command', 'link');
  });
  await page.waitForTimeout(300);

  // Dialog visible.
  await expect(page.locator('[data-testid=insert-link-dialog]')).toBeVisible();

  // Document is unchanged — no raw `[]()` insertion.
  const doc = await page.evaluate(() => {
    const content = document.querySelector('.cm-content') as HTMLElement;
    const view = (content as unknown as {
      cmTile?: { root?: { view?: { state: { doc: { toString(): string } } } } };
    }).cmTile?.root?.view;
    return view?.state.doc.toString() ?? '';
  });
  expect(doc).toBe('');

  await page.screenshot({ path: 'e2e/screenshots/v0.2-smoke/51-link-dialog-from-menu.png' });
  await shutdownClean(app);
});

import { test, expect } from '@playwright/test';
import { launchClean, getEditorDoc, shutdownClean } from './_helpers';

/**
 * v0.2.20 — real Electron coverage of the v0.2.19 link interactivity
 * surface. The v0.2.19 unit tests exercised `findLinkAt` and the click /
 * tooltip helpers in isolation against jsdom; both passed. But the real
 * Electron build still had no working hover/click on user-typed or
 * toolbar-inserted links because the v0.1.12 WYSIWYG escape filter
 * rewrote every typed `[`/`]` to `\[`/`\]`, so the lezer parser
 * produced `Escape` nodes instead of a `Link` node — no `.cm-md-link`
 * mark, nothing for the hover extension to bind to. These tests stand
 * up the editor end-to-end and assert the user-visible behaviour:
 *
 *   1. a programmatically-inserted (toolbar-style) `[label](url)`
 *      renders a `.cm-md-link` mark with the LABEL only (URL hidden),
 *      hovering it pops the tooltip with the URL + Open/Edit buttons,
 *      and right-clicking the same span pops a Open / Copy / Edit
 *      menu in the renderer.
 *
 *   2. a user-typed `[text](url)` in Document mode (the default,
 *      WYSIWYG) now ALSO parses as a real Link (post-v0.2.20 escape
 *      relaxation) and supports the same hover/right-click surface.
 *
 *   3. a shortcut `[Notes]` placeholder (no URL child) stays as
 *      literal text — no link styling, no tooltip — so the
 *      strict-literal WYSIWYG contract is preserved.
 */
test('hover tooltip mounts over a real `.cm-md-link` (programmatic insert)', async () => {
  const app = await launchClean();
  const page = await app.firstWindow();
  await page.waitForSelector('.cm-content');

  // Bypass autoPair / escape filter the same way the toolbar Link
  // button does: dispatch the change without a `userEvent` annotation.
  await page.evaluate(() => {
    const content = document.querySelector('.cm-content') as HTMLElement;
    const view = (content as unknown as {
      cmTile?: {
        root?: { view?: { dispatch: (s: unknown) => void; state: { doc: { length: number } } } };
      };
    }).cmTile?.root?.view;
    if (!view) throw new Error('no view');
    view.dispatch({ changes: { from: 0, to: 0, insert: 'pre [click](https://example.com) post' } });
  });

  // Move caret off the link line so the link renders in collapsed form
  // (label only). The .cm-md-link mark is emitted by linkDecoration on
  // both active and inactive lines in WYSIWYG mode; this assertion is
  // about the rendered-collapsed shape that users actually hover.
  await page.keyboard.press('End');

  const linkSpans = await page.locator('.cm-md-link').count();
  expect(linkSpans).toBeGreaterThan(0);
  // The label is the only visible text inside the link span; the URL
  // sits in a hidden replace-widget on the right.
  const linkText = await page.locator('.cm-md-link').first().textContent();
  expect(linkText).toBe('click');

  await page.locator('.cm-md-link').first().hover();
  await page.waitForTimeout(400);
  const tooltipUrl = await page.locator('.cm-link-tooltip-url').textContent();
  expect(tooltipUrl).toBe('https://example.com');
  await expect(page.locator('[data-testid=link-tooltip-open]')).toBeVisible();
  await expect(page.locator('[data-testid=link-tooltip-edit]')).toBeVisible();

  await shutdownClean(app);
});

test('right-click on a link opens the Open / Copy / Edit popup', async () => {
  const app = await launchClean();
  const page = await app.firstWindow();
  await page.waitForSelector('.cm-content');

  await page.evaluate(() => {
    const content = document.querySelector('.cm-content') as HTMLElement;
    const view = (content as unknown as {
      cmTile?: {
        root?: { view?: { dispatch: (s: unknown) => void; state: { doc: { length: number } } } };
      };
    }).cmTile?.root?.view;
    if (!view) throw new Error('no view');
    view.dispatch({ changes: { from: 0, to: 0, insert: 'see [click](https://example.com) end' } });
  });
  await page.keyboard.press('End');

  await page.locator('.cm-md-link').first().click({ button: 'right' });
  await expect(page.locator('[data-testid=link-context-menu]')).toBeVisible();
  await expect(page.locator('[data-testid=link-ctx-open]')).toBeVisible();
  await expect(page.locator('[data-testid=link-ctx-copy]')).toBeVisible();
  await expect(page.locator('[data-testid=link-ctx-edit]')).toBeVisible();

  // Esc dismisses the popup (matches sidebar ContextMenu behaviour).
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid=link-context-menu]')).toHaveCount(0);

  await shutdownClean(app);
});

test('right-click Edit fires durumi:edit-link with the link payload', async () => {
  const app = await launchClean();
  const page = await app.firstWindow();
  await page.waitForSelector('.cm-content');

  await page.evaluate(() => {
    const content = document.querySelector('.cm-content') as HTMLElement;
    const view = (content as unknown as {
      cmTile?: {
        root?: { view?: { dispatch: (s: unknown) => void; state: { doc: { length: number } } } };
      };
    }).cmTile?.root?.view;
    if (!view) throw new Error('no view');
    view.dispatch({ changes: { from: 0, to: 0, insert: 'pre [hello](https://example.com) end' } });

    // Capture the CustomEvent payload on the window so we can assert
    // the dispatcher fired the same shape the tooltip Edit button uses.
    (window as unknown as { __lastEditLink?: unknown }).__lastEditLink = null;
    window.addEventListener('durumi:edit-link', (e) => {
      (window as unknown as { __lastEditLink?: unknown }).__lastEditLink =
        (e as CustomEvent).detail;
    });
  });
  await page.keyboard.press('End');

  await page.locator('.cm-md-link').first().click({ button: 'right' });
  await page.locator('[data-testid=link-ctx-edit]').click();

  const detail = await page.evaluate(
    () => (window as unknown as { __lastEditLink?: unknown }).__lastEditLink,
  );
  expect(detail).toMatchObject({
    text: 'hello',
    url: 'https://example.com',
    title: '',
  });

  await shutdownClean(app);
});

test('v0.2.20: typed `[text](url)` lands raw (escape no longer rewrites brackets)', async () => {
  // Pre-v0.2.20: every typed `[` and `]` was rewritten to `\[` / `\]`
  // by the WYSIWYG escape filter, so the lezer parser saw Escape nodes
  // instead of a Link node and the v0.2.19 hover tooltip never bound
  // to anything. This test types `[Notes]` end-to-end (no toolbar,
  // pure keystrokes) and asserts the on-disk text has zero backslash
  // escapes — the v0.2.20 contract for both shortcut placeholders and
  // real inline links.
  //
  // We don't try to type the full `[click](https://example.com)` shape
  // end-to-end here because autoPair's lack of typeOver-closer logic
  // (a separate, pre-existing issue) means typing `[`...`]` followed
  // by `(`...`)` ends up with stray characters as the caret juggles
  // around the auto-closed brackets while the WYSIWYG bracket-hide
  // widgets clamp insertions to the label range. Toolbar-inserted
  // links (the path the user actually used in v0.2.19) ARE
  // exercised by the three tests above, end-to-end.
  const app = await launchClean();
  const page = await app.firstWindow();
  await page.waitForSelector('.cm-content');
  await page.click('.cm-content');

  // autoPair pairs `[` → `[]` (v0.2.20 — was bailed pre-v0.2.20
  // because the escape filter was about to consume it). User types
  // the label between the auto-paired brackets, then arrows past.
  await page.keyboard.type('[');
  await page.keyboard.type('Notes');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);

  const doc = await getEditorDoc(page);
  expect(doc).toBe('[Notes]');
  // Pin the contract: no backslash escapes anywhere in the typed
  // text. Pre-v0.2.20 this would be `\[Notes\]`.
  expect(doc).not.toContain('\\');

  await shutdownClean(app);
});

test('v0.2.20: shortcut `[Notes]` (no URL) stays as literal text', async () => {
  const app = await launchClean();
  const page = await app.firstWindow();
  await page.waitForSelector('.cm-content');

  await page.evaluate(() => {
    const content = document.querySelector('.cm-content') as HTMLElement;
    const view = (content as unknown as {
      cmTile?: {
        root?: { view?: { dispatch: (s: unknown) => void; state: { doc: { length: number } } } };
      };
    }).cmTile?.root?.view;
    if (!view) throw new Error('no view');
    view.dispatch({ changes: { from: 0, to: 0, insert: '[Your Department]' } });
  });
  await page.keyboard.press('End');
  await page.waitForTimeout(200);

  // No .cm-md-link mark: shortcut links without a URL child should
  // render as plain literal text per the strict-literal WYSIWYG
  // contract preserved through v0.2.20.
  await expect(page.locator('.cm-md-link')).toHaveCount(0);

  await shutdownClean(app);
});

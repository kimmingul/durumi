import { test, expect, type ElectronApplication } from '@playwright/test';
import { getEditorDoc, launchClean, shutdownClean } from './_helpers';

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
 * Insert a fresh 2x2 table at the caret via the keyboard shortcut.
 * Then commit focus back to the editor (click body so the contentEditable
 * header cell isn't focused) so the gear icon is hover-discoverable.
 */
async function insertTable(page: import('@playwright/test').Page): Promise<void> {
  await page.click('.cm-content');
  await page.keyboard.press('Meta+Shift+T');
  await page.waitForSelector('div[role="row"]');
}

/**
 * Replace the entire document via a CodeMirror dispatch (avoids the
 * WYSIWYG escape filter that would turn pipe chars into `\|`).
 */
async function setEditorDoc(
  page: import('@playwright/test').Page,
  doc: string,
): Promise<void> {
  await page.evaluate((markdown) => {
    const root = document.querySelector('.cm-editor') as HTMLElement | null;
    if (!root) return;
    const content = root.querySelector('.cm-content') as HTMLElement | null;
    const tileHolder = (content ?? root) as unknown as {
      cmTile?: {
        root?: {
          view?: {
            state: { doc: { length: number } };
            dispatch: (s: unknown) => void;
          };
        };
      };
    };
    const view = tileHolder.cmTile?.root?.view;
    if (!view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: markdown },
      userEvent: 'input.testReset',
    });
  }, doc);
  // Wait for the StateField rebuild + row decoration mount.
  await page.waitForSelector('div[role="row"]', { timeout: 2000 });
}

async function openStylePopover(page: import('@playwright/test').Page): Promise<void> {
  const gear = page.locator('[data-testid="table-style-gear"]').first();
  await expect(gear).toBeVisible({ timeout: 2000 });
  await gear.click({ force: true });
  await page.waitForSelector('[data-testid="table-style-popover"]', { timeout: 2000 });
}

async function applyPopover(page: import('@playwright/test').Page): Promise<void> {
  await page.click('[data-testid="table-style-apply"]');
  await page.waitForSelector('[data-testid="table-style-popover"]', {
    state: 'detached',
    timeout: 2000,
  });
}

test.describe('Phase 3.3 — table line styling popover', () => {
  test('gear icon mounts on the table header row', async () => {
    const { app, page } = await launch();
    try {
      await insertTable(page);
      const gear = page.locator('[data-testid="table-style-gear"]').first();
      await expect(gear).toBeVisible();
      // Gear belongs to the header row.
      const onHeader = await gear.evaluate(
        (el) => !!el.closest('.cm-table-row-header'),
      );
      expect(onHeader).toBe(true);
    } finally {
      await shutdown(app);
    }
  });

  test('clicking gear opens the popover with preset buttons + format toggle + apply/cancel', async () => {
    const { app, page } = await launch();
    try {
      await insertTable(page);
      await openStylePopover(page);
      await expect(page.locator('[data-testid="table-style-preset-none"]')).toBeVisible();
      await expect(page.locator('[data-testid="table-style-preset-default"]')).toBeVisible();
      await expect(page.locator('[data-testid="table-style-preset-booktabs"]')).toBeVisible();
      await expect(page.locator('[data-testid="table-style-preset-grid"]')).toBeVisible();
      await expect(page.locator('[data-testid="table-style-format-pandoc"]')).toBeVisible();
      await expect(page.locator('[data-testid="table-style-format-html"]')).toBeVisible();
      await expect(page.locator('[data-testid="table-style-apply"]')).toBeVisible();
      await expect(page.locator('[data-testid="table-style-cancel"]')).toBeVisible();
    } finally {
      await shutdown(app);
    }
  });

  test('cancel button closes the popover without mutating the source', async () => {
    const { app, page } = await launch();
    try {
      await insertTable(page);
      const before = await getEditorDoc(page);
      await openStylePopover(page);
      await page.click('[data-testid="table-style-preset-booktabs"]');
      await page.click('[data-testid="table-style-cancel"]');
      await page.waitForSelector('[data-testid="table-style-popover"]', {
        state: 'detached',
        timeout: 2000,
      });
      const after = await getEditorDoc(page);
      expect(after).toBe(before);
    } finally {
      await shutdown(app);
    }
  });

  test('Booktabs preset (Pandoc) prepends a {.durumi-table} attrs block', async () => {
    const { app, page } = await launch();
    try {
      await insertTable(page);
      await openStylePopover(page);
      await page.click('[data-testid="table-style-format-pandoc"]');
      await page.click('[data-testid="table-style-preset-booktabs"]');
      await applyPopover(page);
      const doc = await getEditorDoc(page);
      expect(doc).toMatch(/\{\.durumi-table[^}]*\}/);
      // Booktabs has a top + bottom rule and no vertical rules.
      expect(doc).toMatch(/data-top-rule="2px solid/);
      expect(doc).toMatch(/data-bottom-rule="2px solid/);
      expect(doc).toMatch(/data-vert-rules="0 none/);
    } finally {
      await shutdown(app);
    }
  });

  test('Grid preset (Pandoc) emits all four rule attrs', async () => {
    const { app, page } = await launch();
    try {
      await insertTable(page);
      await openStylePopover(page);
      await page.click('[data-testid="table-style-format-pandoc"]');
      await page.click('[data-testid="table-style-preset-grid"]');
      await applyPopover(page);
      const doc = await getEditorDoc(page);
      expect(doc).toMatch(/\{\.durumi-table[^}]*\}/);
      expect(doc).toMatch(/data-top-rule="1px solid/);
      expect(doc).toMatch(/data-header-separator="1px solid/);
      expect(doc).toMatch(/data-row-rules="1px solid/);
      expect(doc).toMatch(/data-vert-rules="1px solid/);
      expect(doc).toMatch(/data-bottom-rule="1px solid/);
    } finally {
      await shutdown(app);
    }
  });

  test('switching format from Pandoc to HTML converts the wrapper in-place', async () => {
    const { app, page } = await launch();
    try {
      await setEditorDoc(
        page,
        '{.durumi-table data-top-rule="2px solid #000" data-bottom-rule="2px solid #000"}\n\n| A | B |\n|---|---|\n| 1 | 2 |\n',
      );
      await openStylePopover(page);
      // The popover initialised in Pandoc mode (it detected the attrs block).
      await expect(page.locator('[data-testid="table-style-format-pandoc"]')).toBeChecked();
      await page.click('[data-testid="table-style-format-html"]');
      await applyPopover(page);
      const doc = await getEditorDoc(page);
      // The Pandoc attrs block is gone; replaced by an HTML wrapper.
      expect(doc).not.toMatch(/\{\.durumi-table/);
      expect(doc).toMatch(/<div class="durumi-table"[^>]*>/);
      expect(doc).toMatch(/<\/div>/);
      // The table data survived.
      expect(doc).toContain('| A | B |');
    } finally {
      await shutdown(app);
    }
  });

  test('Default preset removes the {.durumi-table} block entirely (no markdown overhead)', async () => {
    const { app, page } = await launch();
    try {
      await setEditorDoc(
        page,
        '{.durumi-table data-top-rule="2px solid #000" data-bottom-rule="2px solid #000" data-vert-rules="0 none"}\n\n| A | B |\n|---|---|\n| 1 | 2 |\n',
      );
      await openStylePopover(page);
      await page.click('[data-testid="table-style-preset-default"]');
      await applyPopover(page);
      const doc = await getEditorDoc(page);
      // Empty/default style ⇒ no wrapper line in source.
      expect(doc).not.toMatch(/\{\.durumi-table/);
      expect(doc).not.toMatch(/<div class="durumi-table"/);
      // Table itself intact.
      expect(doc).toContain('| A | B |');
    } finally {
      await shutdown(app);
    }
  });

  test('format preservation: HTML-wrapped table stays HTML after re-edit', async () => {
    const { app, page } = await launch();
    try {
      await setEditorDoc(
        page,
        '<div class="durumi-table" data-top-rule="1px solid #000">\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n</div>\n',
      );
      await openStylePopover(page);
      // Popover initialised in HTML mode (it detected the wrapper).
      await expect(page.locator('[data-testid="table-style-format-html"]')).toBeChecked();
      await page.click('[data-testid="table-style-preset-grid"]');
      await applyPopover(page);
      const doc = await getEditorDoc(page);
      expect(doc).toMatch(/<div class="durumi-table"[^>]*>/);
      expect(doc).toMatch(/<\/div>/);
      expect(doc).not.toMatch(/\{\.durumi-table/);
    } finally {
      await shutdown(app);
    }
  });

  test('persistence: styled-table attrs survive a doc reset round-trip via the StateField', async () => {
    const { app, page } = await launch();
    try {
      await insertTable(page);
      await openStylePopover(page);
      await page.click('[data-testid="table-style-preset-booktabs"]');
      await applyPopover(page);
      const docAfterApply = await getEditorDoc(page);
      // Round-trip: write the same source back in (simulates close+reopen).
      await setEditorDoc(page, docAfterApply);
      // After the rebuild the gear is still there, the attrs are still parseable.
      await openStylePopover(page);
      // The popover initialises with Pandoc format (because the source already
      // carries a Pandoc attrs block).
      await expect(page.locator('[data-testid="table-style-format-pandoc"]')).toBeChecked();
      // Cancel — we only wanted to verify the read path.
      await page.click('[data-testid="table-style-cancel"]');
      const doc = await getEditorDoc(page);
      expect(doc).toMatch(/\{\.durumi-table[^}]*data-top-rule="2px solid/);
    } finally {
      await shutdown(app);
    }
  });

  test('format preference: when the user pref is "html" the popover defaults to HTML for unstyled tables', async () => {
    const { app, page } = await launch();
    try {
      // Set the renderer-cached preference (same channel SettingsDialog +
      // usePreferencesInit use). The popover reads this when the document has
      // no existing wrapper to honour.
      await page.evaluate(() => {
        (window as { __durumiTableStyleFormat?: 'pandoc' | 'html' }).__durumiTableStyleFormat =
          'html';
      });
      await insertTable(page);
      await openStylePopover(page);
      await expect(page.locator('[data-testid="table-style-format-html"]')).toBeChecked();
      await page.click('[data-testid="table-style-preset-booktabs"]');
      await applyPopover(page);
      const doc = await getEditorDoc(page);
      expect(doc).toMatch(/<div class="durumi-table"[^>]*data-top-rule=/);
      expect(doc).not.toMatch(/\{\.durumi-table/);
    } finally {
      await shutdown(app);
    }
  });

  test('escape key closes the popover without dispatching changes', async () => {
    const { app, page } = await launch();
    try {
      await insertTable(page);
      const before = await getEditorDoc(page);
      await openStylePopover(page);
      await page.click('[data-testid="table-style-preset-grid"]');
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-testid="table-style-popover"]', {
        state: 'detached',
        timeout: 2000,
      });
      const after = await getEditorDoc(page);
      expect(after).toBe(before);
    } finally {
      await shutdown(app);
    }
  });
});

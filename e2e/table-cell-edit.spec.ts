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
 * Insert a fresh 2x2 table at the caret. The `Meta+Shift+T` shortcut
 * inserts a boilerplate `| Header N | Cell N |` table.
 */
async function insertTable(page: import('@playwright/test').Page): Promise<void> {
  await page.click('.cm-content');
  await page.keyboard.press('Meta+Shift+T');
  await page.waitForSelector('div[role="row"]');
}

/**
 * Clear the currently focused cell's text. We avoid `Meta+A` because
 * within a `cm-content` contentEditable that has nested contentEditable
 * cells, Cmd+A selects across ALL widget cells — which is not the
 * single-cell behaviour we want to test. Instead we triple-click the
 * cell to select its single line, then Backspace.
 */
async function clearFocusedCell(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const ae = document.activeElement as HTMLElement | null;
    if (!ae) return;
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(ae);
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await page.keyboard.press('Backspace');
}

test.describe('Phase 3.1.1 — in-place table cell editing', () => {
  test('click cell -> type -> markdown updates', async () => {
    const { app, page } = await launch();
    try {
      await insertTable(page);
      const cell = page.locator('.cm-table-cell[contenteditable="true"]').first();
      await cell.click();
      await clearFocusedCell(page);
      await page.keyboard.type('hello');
      await page.locator('.cm-content').click({ position: { x: 5, y: 200 } });
      const doc = await getEditorDoc(page);
      expect(doc).toContain('| hello |');
    } finally {
      await shutdown(app);
    }
  });

  test('Tab moves focus to next cell, type -> next cell markdown updates', async () => {
    const { app, page } = await launch();
    try {
      await insertTable(page);
      const cell = page.locator('.cm-table-cell[contenteditable="true"]').first();
      await cell.click();
      await clearFocusedCell(page);
      await page.keyboard.type('a');
      await page.keyboard.press('Tab');
      await clearFocusedCell(page);
      await page.keyboard.type('b');
      await page.locator('.cm-content').click({ position: { x: 5, y: 200 } });
      const doc = await getEditorDoc(page);
      expect(doc).toMatch(/\|\s*a\s*\|\s*b\s*\|/);
    } finally {
      await shutdown(app);
    }
  });

  test('Shift+Tab goes back to the previous cell', async () => {
    const { app, page } = await launch();
    try {
      await insertTable(page);
      const cell = page.locator('.cm-table-cell[contenteditable="true"]').first();
      await cell.click();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await clearFocusedCell(page);
      await page.keyboard.type('back');
      await page.locator('.cm-content').click({ position: { x: 5, y: 200 } });
      const doc = await getEditorDoc(page);
      expect(doc).toContain('| back |');
    } finally {
      await shutdown(app);
    }
  });

  test('Arrow Down navigates to same column on next logical row', async () => {
    const { app, page } = await launch();
    try {
      await insertTable(page);
      const cell = page.locator('.cm-table-cell[contenteditable="true"]').first();
      await cell.click();
      await page.keyboard.press('ArrowDown');
      await clearFocusedCell(page);
      await page.keyboard.type('down');
      await page.locator('.cm-content').click({ position: { x: 5, y: 200 } });
      const doc = await getEditorDoc(page);
      expect(doc).toMatch(/\|\s*down\s*\|/);
    } finally {
      await shutdown(app);
    }
  });

  test('Arrow Up navigates to same column on previous row', async () => {
    const { app, page } = await launch();
    try {
      await insertTable(page);
      // Focus the body row (logical row 1) first.
      const bodyCell = page.locator('.cm-table-row-body .cm-table-cell[contenteditable="true"]').first();
      await bodyCell.click();
      await page.keyboard.press('ArrowUp'); // back to header row 0
      await clearFocusedCell(page);
      await page.keyboard.type('up');
      await page.locator('.cm-content').click({ position: { x: 5, y: 200 } });
      const doc = await getEditorDoc(page);
      // Header row should now contain "up" in col 0.
      expect(doc.split('\n')[0]).toMatch(/\|\s*up\s*\|/);
    } finally {
      await shutdown(app);
    }
  });

  test('empty cell receives typed text', async () => {
    const { app, page } = await launch();
    try {
      await insertTable(page);
      const cell = page.locator('.cm-table-cell[contenteditable="true"]').first();
      await cell.click();
      await clearFocusedCell(page);
      // Cell is now empty; typing should populate it cleanly.
      await page.keyboard.type('fresh');
      await page.locator('.cm-content').click({ position: { x: 5, y: 200 } });
      const doc = await getEditorDoc(page);
      expect(doc).toContain('| fresh |');
    } finally {
      await shutdown(app);
    }
  });

  test('pipe char in cell content escapes as \\| in markdown source', async () => {
    const { app, page } = await launch();
    try {
      await insertTable(page);
      const cell = page.locator('.cm-table-cell[contenteditable="true"]').first();
      await cell.click();
      await clearFocusedCell(page);
      await page.keyboard.type('a|b');
      await page.locator('.cm-content').click({ position: { x: 5, y: 200 } });
      const doc = await getEditorDoc(page);
      expect(doc).toContain('a\\|b');
      // And the row must still parse as 2 columns (no extra cell from
      // an unescaped pipe).
      const headerLine = doc.split('\n')[0] ?? '';
      // Count unescaped pipes; should be 3 (outer + outer + inner separator).
      const pipes = headerLine.match(/(?<!\\)\|/g) ?? [];
      expect(pipes.length).toBe(3);
    } finally {
      await shutdown(app);
    }
  });

  test('Korean text (가나다) reaches markdown source via input/composition handlers', async () => {
    const { app, page } = await launch();
    try {
      await insertTable(page);
      const cell = page.locator('.cm-table-cell[contenteditable="true"]').first();
      await cell.click();
      await clearFocusedCell(page);
      // In headless Electron Playwright `keyboard.type` doesn't trigger
      // the IME composition pipeline directly, but the resulting DOM
      // mutation path still goes through `beforeinput` + `input` + a
      // visible glyph in textContent. Our sync handler must capture it.
      await page.keyboard.type('가나다');
      await page.locator('.cm-content').click({ position: { x: 5, y: 200 } });
      const doc = await getEditorDoc(page);
      expect(doc).toContain('가나다');
    } finally {
      await shutdown(app);
    }
  });

  test('explicit composition events flush only on compositionend', async () => {
    const { app, page } = await launch();
    try {
      await insertTable(page);
      const cell = page.locator('.cm-table-cell[contenteditable="true"]').first();
      await cell.click();
      await clearFocusedCell(page);
      // Simulate a CJK composition cycle:
      //  - compositionstart  → cell.dataset.composing = "true"
      //  - input (with isComposing) → handler bails out
      //  - compositionend  → handler removes flag and runs syncCell
      await page.evaluate(() => {
        const ae = document.activeElement as HTMLElement | null;
        if (!ae) return;
        ae.dispatchEvent(new CompositionEvent('compositionstart'));
        ae.textContent = '가';
        ae.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', isComposing: true } as never));
      });
      // Mid-composition: the doc should NOT yet contain "가".
      const midDoc = await getEditorDoc(page);
      expect(midDoc).not.toContain('가');
      await page.evaluate(() => {
        const ae = document.activeElement as HTMLElement | null;
        if (!ae) return;
        ae.dispatchEvent(new CompositionEvent('compositionend', { data: '가' }));
      });
      await page.locator('.cm-content').click({ position: { x: 5, y: 200 } });
      const finalDoc = await getEditorDoc(page);
      expect(finalDoc).toContain('가');
    } finally {
      await shutdown(app);
    }
  });

  test('Tab while text is pending commits the cell before navigating', async () => {
    const { app, page } = await launch();
    try {
      await insertTable(page);
      const cell = page.locator('.cm-table-cell[contenteditable="true"]').first();
      await cell.click();
      await clearFocusedCell(page);
      await page.keyboard.type('first');
      await page.keyboard.press('Tab');
      await page.locator('.cm-content').click({ position: { x: 5, y: 200 } });
      const doc = await getEditorDoc(page);
      expect(doc).toContain('| first |');
    } finally {
      await shutdown(app);
    }
  });

  test('Enter in a body cell does not insert a markdown newline into the row', async () => {
    const { app, page } = await launch();
    try {
      await insertTable(page);
      const bodyCell = page.locator('.cm-table-row-body .cm-table-cell[contenteditable="true"]').first();
      await bodyCell.click();
      await clearFocusedCell(page);
      await page.keyboard.type('row1');
      await page.keyboard.press('Enter');
      await page.locator('.cm-content').click({ position: { x: 5, y: 200 } });
      const doc = await getEditorDoc(page);
      expect(doc).toContain('| row1 |');
      // Three pipe-bearing lines: header, delim, body. Enter must not
      // add a fourth or insert a `\n` into the row's source.
      const tableLines = doc.split('\n').filter((l) => l.includes('|'));
      expect(tableLines.length).toBe(3);
    } finally {
      await shutdown(app);
    }
  });
});

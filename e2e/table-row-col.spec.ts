import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import path from 'node:path';
import { getEditorDoc } from './_helpers';

const APP_ENTRY = path.resolve(process.cwd(), 'out', 'main', 'main.cjs');

async function launch() {
  const app = await electron.launch({ args: [APP_ENTRY] });
  const page = await app.firstWindow();
  await page.waitForSelector('.cm-content');
  return { app, page };
}

async function shutdown(app: ElectronApplication) {
  await app.evaluate(({ app: a }) => a.exit(0));
}

/** Insert a fresh 2x2 table at the caret via the keyboard shortcut. */
async function insertTable(page: import('@playwright/test').Page): Promise<void> {
  await page.click('.cm-content');
  await page.keyboard.press('Meta+Shift+T');
  await page.waitForSelector('div[role="row"]');
}

/** Insert a table from raw markdown source by typing it (Source mode is
 * not required here — the editor's StateField rebuild handles new source
 * regardless of mode). We use direct doc mutation via the `cmTile.view`
 * accessor for determinism: typing pipe chars triggers the WYSIWYG
 * escape filter in Document mode. */
async function setEditorDoc(page: import('@playwright/test').Page, doc: string): Promise<void> {
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
  await page.waitForTimeout(60);
}

/** Hover over a cell and wait for the action overlay to appear. */
async function hoverCellAndWaitForOverlay(
  page: import('@playwright/test').Page,
  cellSelector: string,
): Promise<void> {
  await page.locator(cellSelector).first().hover();
  await page.waitForSelector('[data-testid="table-action-row-below"]', { timeout: 2000 });
}

test.describe('Phase 3.2 — table row/column add/delete', () => {
  test('hovering a cell shows the floating action overlay', async () => {
    const { app, page } = await launch();
    try {
      await insertTable(page);
      const bodyCell = page.locator('.cm-table-row-body .cm-table-cell[contenteditable="true"]').first();
      await bodyCell.hover();
      // Overlay buttons should be visible within ~300ms.
      await page.waitForSelector('[data-testid="table-action-row-below"]', { timeout: 1000 });
      await expect(page.locator('[data-testid="table-action-col-right"]')).toBeVisible();
    } finally {
      await shutdown(app);
    }
  });

  test('click +row below inserts a new row after the hovered row', async () => {
    const { app, page } = await launch();
    try {
      await setEditorDoc(page, '| H1 | H2 |\n| --- | --- |\n| a | b |\n');
      await hoverCellAndWaitForOverlay(page, '.cm-table-row-body .cm-table-cell');
      await page.locator('[data-testid="table-action-row-below"]').first().click();
      await page.waitForTimeout(80);
      const doc = await getEditorDoc(page);
      // Body went from 1 row to 2 rows.
      const bodyLines = doc.split('\n').filter((l) => l.includes('|'));
      expect(bodyLines.length).toBe(4); // header + delim + 2 body rows
    } finally {
      await shutdown(app);
    }
  });

  test('click +row above inserts a row above the hovered body row', async () => {
    const { app, page } = await launch();
    try {
      await setEditorDoc(page, '| H1 | H2 |\n| --- | --- |\n| a | b |\n');
      await hoverCellAndWaitForOverlay(page, '.cm-table-row-body .cm-table-cell');
      await page.locator('[data-testid="table-action-row-above"]').first().click();
      await page.waitForTimeout(80);
      const doc = await getEditorDoc(page);
      const bodyLines = doc.split('\n').filter((l) => l.includes('|'));
      expect(bodyLines.length).toBe(4);
      // The new blank row should appear before the row that contains `a`.
      const aIdx = bodyLines.findIndex((l) => l.includes('a'));
      expect(aIdx).toBe(3); // header(0), delim(1), blank(2), a(3)
    } finally {
      await shutdown(app);
    }
  });

  test('click +col right inserts a new column on the right', async () => {
    const { app, page } = await launch();
    try {
      await setEditorDoc(page, '| H1 | H2 |\n| --- | --- |\n| a | b |\n');
      await hoverCellAndWaitForOverlay(page, '.cm-table-row-body .cm-table-cell');
      await page.locator('[data-testid="table-action-col-right"]').first().click();
      await page.waitForTimeout(80);
      const doc = await getEditorDoc(page);
      // Header should now have 3 columns.
      const header = doc.split('\n').find((l) => l.includes('H1')) ?? '';
      const pipes = header.match(/(?<!\\)\|/g) ?? [];
      expect(pipes.length).toBe(4); // 3 cols → 4 pipes
    } finally {
      await shutdown(app);
    }
  });

  test('click +col left inserts a column to the left', async () => {
    const { app, page } = await launch();
    try {
      await setEditorDoc(page, '| H1 | H2 |\n| --- | --- |\n| a | b |\n');
      await hoverCellAndWaitForOverlay(page, '.cm-table-row-body .cm-table-cell');
      await page.locator('[data-testid="table-action-col-left"]').first().click();
      await page.waitForTimeout(80);
      const doc = await getEditorDoc(page);
      const header = doc.split('\n').find((l) => l.includes('H1')) ?? '';
      const pipes = header.match(/(?<!\\)\|/g) ?? [];
      expect(pipes.length).toBe(4);
    } finally {
      await shutdown(app);
    }
  });

  test('click delete row removes the hovered body row', async () => {
    const { app, page } = await launch();
    try {
      await setEditorDoc(page, '| H1 | H2 |\n| --- | --- |\n| a | b |\n| c | d |\n');
      await hoverCellAndWaitForOverlay(page, '.cm-table-row-body .cm-table-cell');
      // The hovered cell is the first body cell (a). Click delete-row.
      await page.locator('[data-testid="table-action-row-delete"]').first().click();
      await page.waitForTimeout(80);
      const doc = await getEditorDoc(page);
      expect(doc).not.toMatch(/\|\s*a\s*\|/);
      expect(doc).toMatch(/\|\s*c\s*\|/);
    } finally {
      await shutdown(app);
    }
  });

  test('click delete col removes the hovered column', async () => {
    const { app, page } = await launch();
    try {
      await setEditorDoc(page, '| H1 | H2 |\n| --- | --- |\n| a | b |\n');
      await hoverCellAndWaitForOverlay(page, '.cm-table-row-body .cm-table-cell');
      await page.locator('[data-testid="table-action-col-delete"]').first().click();
      await page.waitForTimeout(80);
      const doc = await getEditorDoc(page);
      const header = doc.split('\n').find((l) => l.includes('H')) ?? '';
      const pipes = header.match(/(?<!\\)\|/g) ?? [];
      expect(pipes.length).toBe(2); // 1 col → 2 pipes
    } finally {
      await shutdown(app);
    }
  });

  test('Tab on the LAST cell of the table adds a new row below', async () => {
    const { app, page } = await launch();
    try {
      await setEditorDoc(page, '| H1 | H2 |\n| --- | --- |\n| a | b |\n');
      // Focus the very last cell.
      const lastCell = page.locator('.cm-table-row-body .cm-table-cell[contenteditable="true"]').last();
      await lastCell.click();
      await page.keyboard.press('Tab');
      await page.waitForTimeout(80);
      const doc = await getEditorDoc(page);
      const bodyLines = doc.split('\n').filter((l) => l.includes('|'));
      expect(bodyLines.length).toBe(4); // header + delim + 2 body rows
    } finally {
      await shutdown(app);
    }
  });

  test('alignment is preserved across column-delete', async () => {
    const { app, page } = await launch();
    try {
      await setEditorDoc(
        page,
        '| L | C | R |\n|:---|:---:|---:|\n| 1 | 2 | 3 |\n',
      );
      // Hover any body cell, click delete-column. The cell hovered is
      // col 0 (left-aligned). After delete, remaining alignments must be
      // :---: and ---: only.
      await hoverCellAndWaitForOverlay(page, '.cm-table-row-body .cm-table-cell');
      await page.locator('[data-testid="table-action-col-delete"]').first().click();
      await page.waitForTimeout(80);
      const doc = await getEditorDoc(page);
      const delimLine = doc.split('\n').find((l) => /^\|.*-/.test(l)) ?? '';
      expect(delimLine).toContain(':---:');
      expect(delimLine).toContain('---:');
      expect(delimLine).not.toContain(':---|:---:');
    } finally {
      await shutdown(app);
    }
  });

  test('refuses to delete the only remaining column', async () => {
    const { app, page } = await launch();
    try {
      await setEditorDoc(page, '| H1 |\n| --- |\n| a |\n');
      await hoverCellAndWaitForOverlay(page, '.cm-table-row-body .cm-table-cell');
      // The delete-col button should be disabled.
      const delCol = page.locator('[data-testid="table-action-col-delete"]').first();
      await expect(delCol).toBeDisabled();
    } finally {
      await shutdown(app);
    }
  });
});

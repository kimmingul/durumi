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

/**
 * Replace the editor document with the given markdown source. Goes through
 * the EditorView dispatch path so the StateField rebuild runs and the
 * table widget mounts cleanly.
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
  await page.waitForTimeout(80);
}

/**
 * Read the inner HTML of the Nth body cell (logical row counted from 1).
 * Used to assert the rendered DOM contains the expected mark elements.
 */
async function getCellHtml(
  page: import('@playwright/test').Page,
  rowSelector: string,
  colIndex: number,
): Promise<string> {
  return await page.evaluate(
    ({ sel, col }) => {
      const row = document.querySelector(sel);
      if (!row) return '';
      const cells = row.querySelectorAll('.cm-table-cell');
      const cell = cells[col] as HTMLElement | undefined;
      if (!cell) return '';
      return cell.innerHTML;
    },
    { sel: rowSelector, col: colIndex },
  );
}

/**
 * Read a cell's user-visible text content, skipping any action-overlay
 * children. Equivalent to `cellTextOnly()` in the source.
 */
async function getCellRawText(
  page: import('@playwright/test').Page,
  rowSelector: string,
  colIndex: number,
): Promise<string> {
  return await page.evaluate(
    ({ sel, col }) => {
      const row = document.querySelector(sel);
      if (!row) return '';
      const cells = row.querySelectorAll('.cm-table-cell');
      const cell = cells[col] as HTMLElement | undefined;
      if (!cell) return '';
      let s = '';
      for (let n = cell.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === Node.TEXT_NODE) s += (n as Text).data;
      }
      return s;
    },
    { sel: rowSelector, col: colIndex },
  );
}

test.describe('Phase 3.1.2 — inline marks in table cells', () => {
  test('cell containing **bold** renders <strong> when blurred', async () => {
    const { app, page } = await launch();
    try {
      await setEditorDoc(page, '| **bold** | b |\n| --- | --- |\n| c | d |\n');
      const headerHtml = await getCellHtml(page, '.cm-table-row-header', 0);
      expect(headerHtml).toContain('<strong>bold</strong>');
    } finally {
      await shutdown(app);
    }
  });

  test('clicking a rendered cell swaps to raw markdown source', async () => {
    const { app, page } = await launch();
    try {
      await setEditorDoc(page, '| **bold** | b |\n| --- | --- |\n| c | d |\n');
      // Click the bold header cell.
      const cell = page
        .locator('.cm-table-row-header .cm-table-cell[contenteditable="true"]')
        .first();
      await cell.click();
      await page.waitForTimeout(60);
      // The cell text node should now show the raw `**bold**` markdown.
      const rawText = await getCellRawText(page, '.cm-table-row-header', 0);
      expect(rawText).toBe('**bold**');
      // The cell should NOT contain a <strong> child in raw mode.
      const html = await getCellHtml(page, '.cm-table-row-header', 0);
      expect(html).not.toContain('<strong>');
    } finally {
      await shutdown(app);
    }
  });

  test('blurring a focused cell re-renders inline marks', async () => {
    const { app, page } = await launch();
    try {
      await setEditorDoc(page, '| **bold** | b |\n| --- | --- |\n| c | d |\n');
      const cell = page
        .locator('.cm-table-row-header .cm-table-cell[contenteditable="true"]')
        .first();
      await cell.click();
      await page.waitForTimeout(60);
      // Click outside the table to blur.
      await page.locator('.cm-content').click({ position: { x: 5, y: 200 } });
      await page.waitForTimeout(80);
      const html = await getCellHtml(page, '.cm-table-row-header', 0);
      expect(html).toContain('<strong>bold</strong>');
    } finally {
      await shutdown(app);
    }
  });

  test('inline code, italic, and strike all render', async () => {
    const { app, page } = await launch();
    try {
      await setEditorDoc(
        page,
        '| `code` | *em* |\n| --- | --- |\n| ~~gone~~ | x |\n',
      );
      const header0 = await getCellHtml(page, '.cm-table-row-header', 0);
      expect(header0).toContain('cm-md-inline-code');
      const header1 = await getCellHtml(page, '.cm-table-row-header', 1);
      expect(header1).toContain('<em>em</em>');
      const body0 = await getCellHtml(page, '.cm-table-row-body', 0);
      expect(body0).toContain('<s>gone</s>');
    } finally {
      await shutdown(app);
    }
  });

  test('inline math renders as KaTeX-styled span', async () => {
    const { app, page } = await launch();
    try {
      await setEditorDoc(page, '| $x^2$ | b |\n| --- | --- |\n| c | d |\n');
      // The placeholder span mounts immediately; KaTeX may finish
      // rendering after a tick. Either state is acceptable for this
      // test — we just want the `cm-math-inline` class on the cell.
      await page.waitForTimeout(200);
      const headerHtml = await getCellHtml(page, '.cm-table-row-header', 0);
      expect(headerHtml).toContain('cm-math-inline');
    } finally {
      await shutdown(app);
    }
  });

  test('citation [@key] renders as a styled pill', async () => {
    const { app, page } = await launch();
    try {
      await setEditorDoc(
        page,
        '| see [@smith2023] | b |\n| --- | --- |\n| c | d |\n',
      );
      const headerHtml = await getCellHtml(page, '.cm-table-row-header', 0);
      expect(headerHtml).toContain('cm-md-citation');
      expect(headerHtml).toContain('@smith2023');
    } finally {
      await shutdown(app);
    }
  });

  test('link [text](url) renders as styled <a>', async () => {
    const { app, page } = await launch();
    try {
      await setEditorDoc(
        page,
        '| [docs](https://example.com) | b |\n| --- | --- |\n| c | d |\n',
      );
      const headerHtml = await getCellHtml(page, '.cm-table-row-header', 0);
      expect(headerHtml).toContain('cm-md-link');
      expect(headerHtml).toContain('href="https://example.com"');
    } finally {
      await shutdown(app);
    }
  });

  test('Korean text inside bold renders correctly and survives focus + blur', async () => {
    const { app, page } = await launch();
    try {
      await setEditorDoc(page, '| **한글** | b |\n| --- | --- |\n| c | d |\n');
      // Blurred — should show as bold Korean text.
      const renderedHtml = await getCellHtml(page, '.cm-table-row-header', 0);
      expect(renderedHtml).toContain('<strong>한글</strong>');
      // Focus — raw markdown surfaces.
      const cell = page
        .locator('.cm-table-row-header .cm-table-cell[contenteditable="true"]')
        .first();
      await cell.click();
      await page.waitForTimeout(60);
      const rawText = await getCellRawText(page, '.cm-table-row-header', 0);
      expect(rawText).toBe('**한글**');
      // Blur again — re-renders.
      await page.locator('.cm-content').click({ position: { x: 5, y: 200 } });
      await page.waitForTimeout(80);
      const reRenderedHtml = await getCellHtml(page, '.cm-table-row-header', 0);
      expect(reRenderedHtml).toContain('<strong>한글</strong>');
    } finally {
      await shutdown(app);
    }
  });

  test('typing inside a focused cell preserves raw-mode editing (IME-safe path)', async () => {
    const { app, page } = await launch();
    try {
      await setEditorDoc(page, '| **a** | b |\n| --- | --- |\n| c | d |\n');
      const cell = page
        .locator('.cm-table-row-header .cm-table-cell[contenteditable="true"]')
        .first();
      await cell.click();
      await page.waitForTimeout(60);
      // Caret lands at the end of the raw text (after the closing `**`).
      await page.keyboard.type('X');
      await page.waitForTimeout(60);
      const doc = await getEditorDoc(page);
      // Source should contain the new char appended after the closing `**`.
      expect(doc).toContain('**a**X');
    } finally {
      await shutdown(app);
    }
  });

  test('source remains canonical: rendered cell does not strip markers from doc', async () => {
    const { app, page } = await launch();
    try {
      const src = '| **bold** | *em* |\n| --- | --- |\n| `c` | ~~d~~ |\n';
      await setEditorDoc(page, src);
      // Click outside the table to ensure no cell is in raw mode.
      await page.locator('.cm-content').click({ position: { x: 5, y: 200 } });
      await page.waitForTimeout(80);
      const doc = await getEditorDoc(page);
      // The markdown source must be unchanged — the render is purely
      // visual. (Trailing whitespace may differ; we check the markers.)
      expect(doc).toContain('**bold**');
      expect(doc).toContain('*em*');
      expect(doc).toContain('`c`');
      expect(doc).toContain('~~d~~');
    } finally {
      await shutdown(app);
    }
  });

  test('explicit composition events in a cell with `**한글**` route through raw mode (IME-safe)', async () => {
    const { app, page } = await launch();
    try {
      await setEditorDoc(page, '| **한글** | b |\n| --- | --- |\n| c | d |\n');
      const cell = page
        .locator('.cm-table-row-header .cm-table-cell[contenteditable="true"]')
        .first();
      await cell.click();
      await page.waitForTimeout(60);
      // Verify raw mode is active (cell holds `**한글**`).
      const rawText = await getCellRawText(page, '.cm-table-row-header', 0);
      expect(rawText).toBe('**한글**');
      // Simulate a composition cycle inside the cell — append `안` after
      // the closing `**`.
      await page.evaluate(() => {
        const ae = document.activeElement as HTMLElement | null;
        if (!ae) return;
        // Place caret at end.
        const sel = window.getSelection();
        const tn = ae.firstChild as Text;
        if (sel && tn && tn.nodeType === Node.TEXT_NODE) {
          const r = document.createRange();
          r.setStart(tn, tn.length);
          r.setEnd(tn, tn.length);
          sel.removeAllRanges();
          sel.addRange(r);
        }
        ae.dispatchEvent(new CompositionEvent('compositionstart'));
        if (tn) tn.data = '**한글**안';
        ae.dispatchEvent(
          new InputEvent('input', {
            inputType: 'insertCompositionText',
            isComposing: true,
          } as never),
        );
      });
      // During composition, the doc must NOT yet include `안`.
      const midDoc = await getEditorDoc(page);
      expect(midDoc).not.toContain('한글안');
      // End composition.
      await page.evaluate(() => {
        const ae = document.activeElement as HTMLElement | null;
        if (!ae) return;
        ae.dispatchEvent(new CompositionEvent('compositionend', { data: '안' }));
      });
      await page.locator('.cm-content').click({ position: { x: 5, y: 200 } });
      await page.waitForTimeout(80);
      const finalDoc = await getEditorDoc(page);
      // After blur + sync, the source should contain the appended char.
      expect(finalDoc).toContain('한글');
      expect(finalDoc).toContain('안');
    } finally {
      await shutdown(app);
    }
  });
});

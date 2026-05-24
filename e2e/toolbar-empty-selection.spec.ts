import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchClean, shutdownClean, getEditorDoc } from './_helpers';

/**
 * v0.2.29 — empty-selection toolbar contract.
 *
 * History: v0.2.28 inserted `${before}${after}` (e.g. `****`) on empty
 * selection — collided with CommonMark block parsers AND broke Korean
 * IME composition. v0.2.29 tried two alternative designs (placeholder
 * text, then Word-style pending format with a transactionFilter) but
 * both broke real macOS Korean IME because rewriting the doc mid-
 * composition desyncs CodeMirror's compose-range tracking. The
 * WYSIWYG-on-source pattern (CM6 + atomic ranges over markdown source)
 * is fundamentally IME-fragile.
 *
 * Final v0.2.29 contract (accepts the constraint):
 *
 *   - Empty selection + inline-mark toolbar (Bold/Italic/Strike/Code/
 *     Sub/Sup) → NO doc change. Toolbar surfaces a transient "Select
 *     text first" hint (`[data-testid="toolbar-empty-hint"]`) near
 *     the clicked button, auto-fades after ~1.8s.
 *   - Non-empty selection → wrap/unwrap as before (toggleWrap).
 *
 * Word-like type-ahead format deferred to v0.3.x architectural work
 * (see DOCUMENT_MODE_PRINCIPLES.md §7 "Buried Problem").
 */

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await launchClean();
  page = await app.firstWindow();
  await page.waitForSelector('.cm-content');
});

test.afterAll(async () => {
  await shutdownClean(app);
});

async function clearAndFocus(): Promise<void> {
  await page.evaluate(() => {
    const root = document.querySelector('.cm-editor') as HTMLElement | null;
    const content = root?.querySelector('.cm-content') as HTMLElement | null;
    const view = (
      content as unknown as {
        cmTile?: {
          root?: {
            view?: {
              dispatch: (spec: object) => void;
              state: { doc: { length: number } };
              focus: () => void;
            };
          };
        };
      }
    )?.cmTile?.root?.view;
    if (!view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: '' },
      selection: { anchor: 0 },
    });
    view.focus();
  });
}

async function clickToolbarButton(testId: string): Promise<void> {
  await page.click(`[data-testid="${testId}"]`);
  await page.waitForTimeout(30);
}

const INLINE_BUTTONS = [
  { testId: 'toolbar-bold' },
  { testId: 'toolbar-italic' },
  { testId: 'toolbar-strike' },
  { testId: 'toolbar-code' },
  { testId: 'toolbar-sub' },
  { testId: 'toolbar-sup' },
];

for (const { testId } of INLINE_BUTTONS) {
  test(`${testId} on empty selection: doc unchanged + hint visible`, async () => {
    await clearAndFocus();
    await clickToolbarButton(testId);
    expect(await getEditorDoc(page)).toBe('');
    // Hint is rendered and visible
    const hint = page.locator('[data-testid="toolbar-empty-hint"]');
    await expect(hint).toBeVisible();
  });

  test(`${testId} on empty line does NOT produce malformed markdown (****, ~~~~, etc.)`, async () => {
    await clearAndFocus();
    await clickToolbarButton(testId);
    const doc = await getEditorDoc(page);
    expect(doc).not.toBe('****');
    expect(doc).not.toBe('~~~~');
    expect(doc).not.toBe('**');
    expect(doc).not.toBe('``');
    expect(doc).not.toContain('<sub></sub>');
    expect(doc).not.toContain('<sup></sup>');
  });
}

test('non-empty selection + toolbar bold still wraps the selection (regression guard)', async () => {
  await clearAndFocus();
  await page.keyboard.type('hello world');
  await page.evaluate(() => {
    const content = document.querySelector('.cm-content') as HTMLElement | null;
    const view = (
      content as unknown as {
        cmTile?: { root?: { view?: { dispatch: (spec: object) => void; focus: () => void } } };
      }
    )?.cmTile?.root?.view;
    if (!view) return;
    view.dispatch({ selection: { anchor: 0, head: 5 }, userEvent: 'select' });
    view.focus();
  });
  await clickToolbarButton('toolbar-bold');
  expect(await getEditorDoc(page)).toBe('**hello** world');
});

test('toolbar bold hint auto-fades after ~1.8s', async () => {
  await clearAndFocus();
  await clickToolbarButton('toolbar-bold');
  const hint = page.locator('[data-testid="toolbar-empty-hint"]');
  await expect(hint).toBeVisible();
  // Hint clears via setTimeout(..., 1800).
  await page.waitForTimeout(2000);
  await expect(hint).toHaveCount(0);
});

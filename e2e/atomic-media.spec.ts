import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchClean, shutdownClean, getEditorDoc } from './_helpers';

/**
 * v0.2.23 — atomic Image / Link widget deletion contract.
 *
 * The unit suite (`tests/editor/atomicMedia.test.ts`) pins the lookup
 * + keymap logic; this spec drives the same scenarios through a real
 * Electron window with real `page.keyboard.press` events so we catch
 * any precedence / facet-ordering drift that would let
 * `@codemirror/commands`' default Backspace win the race.
 *
 * v0.2.23 lessons from [[feedback-real-ui-verification]]:
 *  - The unit test for "Backspace at the END of the visible label"
 *    passed (it called `findMediaAtEdge` directly).
 *  - The real-UI behaviour failed because the keymap was at default
 *    precedence, default Backspace ran first, and nicked the label's
 *    last char before our handler got a chance.
 *  - Pinning the actual key press path here would have caught that
 *    in CI rather than on the user's machine.
 *
 * One launched Electron app is shared across the suite because
 * spinning up 5 Electron instances back-to-back occasionally hangs on
 * macOS resource cleanup. Each test seeds its own doc via a CM
 * transaction, so the shared-app pattern doesn't leak state.
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

/**
 * Replace the whole doc with `text` and place the caret at `cursor`.
 * Uses a CM transaction (not keyboard typing) so the seed step is
 * independent of WYSIWYG escape-filter behaviour — we want each test
 * scenario to start from a known doc.
 */
async function seedDoc(text: string, cursor: number): Promise<void> {
  await page.evaluate(
    ({ t, c }) => {
      const root = document.querySelector('.cm-editor') as HTMLElement | null;
      if (!root) return;
      const content = root.querySelector('.cm-content') as HTMLElement | null;
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
        changes: { from: 0, to: view.state.doc.length, insert: t },
        selection: { anchor: c },
        userEvent: 'select',
      });
      view.focus();
    },
    { t: text, c: cursor },
  );
}

test('Backspace at the right edge of an image deletes the whole `![](url)`', async () => {
  const doc = 'before ![](u) after';
  const imgEnd = doc.indexOf(' after');
  await seedDoc(doc, imgEnd);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('before  after');
});

test('Backspace at node.to (just after `)`) deletes the whole `[label](url)`', async () => {
  const doc = 'see [click](https://e.com) end';
  const linkEnd = doc.indexOf(' end');
  await seedDoc(doc, linkEnd);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('Backspace at closeBracket (end of visible label) deletes the whole link — v0.2.23 regression', async () => {
  // The user-reported scenario: the hidden `](url)` suffix is
  // zero-width on screen, so clicking "right after the link" snaps
  // the caret to closeBracket. Before the fix, default Backspace
  // nicked the label's last char ('k' below) and the user saw
  // `[clic](https://e.com)` as raw text. After the fix, the whole
  // link disappears in one keystroke.
  const doc = 'see [click](https://e.com) end';
  const closeBracket = doc.indexOf(']');
  await seedDoc(doc, closeBracket);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('Backspace INSIDE the label still deletes a single char (no over-zealous atomicity)', async () => {
  const doc = 'see [click](https://e.com) end';
  const middle = doc.indexOf('click') + 1;
  await seedDoc(doc, middle);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see [lick](https://e.com) end');
});

test('Delete at node.from (just before `[`) deletes the whole link', async () => {
  const doc = 'see [click](https://e.com) end';
  const linkStart = doc.indexOf('[');
  await seedDoc(doc, linkStart);
  await page.keyboard.press('Delete');
  expect(await getEditorDoc(page)).toBe('see  end');
});

import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchClean, shutdownClean, getEditorDoc } from './_helpers';

/**
 * v0.2.28 — atomic boundary contract for `~subscript~`.
 *
 * Subscript has markerLen=1 and a single delimiter (~).
 * The Subscript parser requires non-whitespace immediately after
 * opening ~ and before closing ~, which our tests satisfy.
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

async function getCaretHead(): Promise<number> {
  return await page.evaluate(() => {
    const root = document.querySelector('.cm-editor') as HTMLElement | null;
    const content = root?.querySelector('.cm-content') as HTMLElement | null;
    const view = (
      content as unknown as {
        cmTile?: { root?: { view?: { state: { selection: { main: { head: number } } } } } };
      }
    )?.cmTile?.root?.view;
    return view ? view.state.selection.main.head : -1;
  });
}

test('Backspace at node.to (just after closing ~) deletes the whole `~sub~`', async () => {
  const doc = 'see ~sub~ end';
  const subEnd = doc.indexOf(' end');
  await seedDoc(doc, subEnd);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('Backspace at closeStart (end of label, before hidden ~) deletes the whole subscript — REGRESSION GUARD', async () => {
  const doc = 'see ~sub~ end';
  const closeStart = doc.indexOf('~', doc.indexOf('sub'));
  await seedDoc(doc, closeStart);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('Backspace at openEnd (start of label, after hidden ~) deletes the whole subscript', async () => {
  const doc = 'see ~sub~ end';
  const openEnd = doc.indexOf('~') + 1;
  await seedDoc(doc, openEnd);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('Backspace INSIDE the subscript label deletes a single char (label-editable)', async () => {
  const doc = 'see ~sub~ end';
  const insideLabel = doc.indexOf('sub') + 1;
  await seedDoc(doc, insideLabel);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see ~ub~ end');
});

test('Delete at node.from (just before opening ~) deletes the whole subscript', async () => {
  const doc = 'see ~sub~ end';
  const subStart = doc.indexOf('~');
  await seedDoc(doc, subStart);
  await page.keyboard.press('Delete');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('Delete at closeStart (end of label) deletes the whole subscript', async () => {
  const doc = 'see ~sub~ end';
  const closeStart = doc.indexOf('~', doc.indexOf('sub'));
  await seedDoc(doc, closeStart);
  await page.keyboard.press('Delete');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('ArrowRight from before `~sub~` skips the hidden opening `~`', async () => {
  const doc = 'see ~sub~ end';
  const subStart = doc.indexOf('~');
  await seedDoc(doc, subStart);
  await page.keyboard.press('ArrowRight');
  expect(await getCaretHead()).toBe(subStart + 1);
});

test('Subscript inside Bold (`pre **foo H~2~O baz** post`) — inner subscript deletes atomically', async () => {
  const doc = 'pre **foo H~2~O baz** post';
  // Caret right after the inner `~2~` closing `~`
  const innerSubEnd = doc.indexOf('~2~') + '~2~'.length;
  const innerSubStart = doc.indexOf('~2~');
  await seedDoc(doc, innerSubEnd);
  await page.keyboard.press('Backspace');
  // The inner subscript disappears; outer bold and surrounding text remain.
  const expectedDoc = doc.slice(0, innerSubStart) + doc.slice(innerSubEnd);
  expect(await getEditorDoc(page)).toBe(expectedDoc);
});

import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchClean, shutdownClean, getEditorDoc } from './_helpers';

/**
 * v0.2.27 — atomic boundary contract for `==hl==`.
 *
 * Same shape as atomic-italic.spec.ts. The spec-driven design means
 * `atomicInlineMarks.ts` registers HIGHLIGHT_SPEC with markerLen=2 next
 * to BOLD_SPEC and ITALIC_SPEC; this spec exercises the markerLen=2 path
 * through the real keymap chain so we catch boundary-offset bugs the unit
 * suite could miss.
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

test('Backspace at node.to (just after closing ==) deletes the whole `==hl==`', async () => {
  const doc = 'see ==hl== end';
  const hlEnd = doc.indexOf(' end');
  await seedDoc(doc, hlEnd);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('Backspace at closeStart (end of label, before hidden ==) deletes the whole highlight — REGRESSION GUARD', async () => {
  // markerLen=2 mirror of the v0.2.23 link regression: the hidden
  // closing `==` is zero-width, so caret at closeStart and node.to
  // collapse visually.
  const doc = 'see ==hl== end';
  const closeStart = doc.indexOf('==', doc.indexOf('hl'));
  await seedDoc(doc, closeStart);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('Backspace at openEnd (start of label, after hidden ==) deletes the whole highlight', async () => {
  const doc = 'see ==hl== end';
  const openEnd = doc.indexOf('==') + 2;
  await seedDoc(doc, openEnd);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('Backspace INSIDE the highlight label deletes a single char (label-editable)', async () => {
  const doc = 'see ==hl== end';
  const insideLabel = doc.indexOf('hl') + 1;
  await seedDoc(doc, insideLabel);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see ==l== end');
});

test('Delete at node.from (just before opening ==) deletes the whole highlight', async () => {
  const doc = 'see ==hl== end';
  const hlStart = doc.indexOf('==');
  await seedDoc(doc, hlStart);
  await page.keyboard.press('Delete');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('Delete at closeStart (end of label) deletes the whole highlight', async () => {
  const doc = 'see ==hl== end';
  const closeStart = doc.indexOf('==', doc.indexOf('hl'));
  await seedDoc(doc, closeStart);
  await page.keyboard.press('Delete');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('ArrowRight from before `==hl==` skips the hidden opening `==`', async () => {
  // markerLen=2 atomicRanges motion: caret at node.from + ArrowRight
  // should jump to openEnd = from + 2. Without atomicRanges the caret
  // would land inside the hidden marker.
  const doc = 'see ==hl== end';
  const hlStart = doc.indexOf('==');
  await seedDoc(doc, hlStart);
  await page.keyboard.press('ArrowRight');
  expect(await getCaretHead()).toBe(hlStart + 2);
});

test('Highlight inside Bold (`**foo ==bar== baz**`) — inner highlight deletes atomically', async () => {
  // Verifies the spec-driven INLINE_MARK_SPECS array iteration works
  // through the real keymap: the inner Highlight node should fire its
  // own atomic delete without being masked by the outer StrongEmphasis.
  const doc = 'pre **foo ==bar== baz** post';
  const innerHighlightEnd = doc.indexOf('==bar==') + '==bar=='.length;
  const innerHighlightStart = doc.indexOf('==bar==');
  await seedDoc(doc, innerHighlightEnd);
  await page.keyboard.press('Backspace');
  const expectedHead = doc.slice(0, innerHighlightStart) + doc.slice(innerHighlightEnd);
  expect(await getEditorDoc(page)).toBe(expectedHead);
});

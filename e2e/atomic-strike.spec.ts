import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchClean, shutdownClean, getEditorDoc } from './_helpers';

/**
 * v0.2.26 — atomic boundary contract for `~~strike~~`.
 *
 * Same shape as atomic-italic.spec.ts. The spec-driven design means
 * `atomicInlineMarks.ts` registers STRIKE_SPEC with markerLen=2 next
 * to BOLD_SPEC and ITALIC_SPEC; this spec exercises the markerLen=2
 * Strikethrough path through the real keymap chain so we catch any
 * boundary-offset bug the unit suite would miss.
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

test('Backspace at node.to (just after closing ~~) deletes the whole `~~strike~~`', async () => {
  const doc = 'see ~~strike~~ end';
  const strikeEnd = doc.indexOf(' end');
  await seedDoc(doc, strikeEnd);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('Backspace at closeStart (end of label, before hidden ~~) deletes the whole strike — REGRESSION GUARD', async () => {
  // markerLen=2 mirror of the v0.2.23 link regression: the hidden
  // closing `~~` is zero-width, so caret at closeStart and node.to
  // collapse visually.
  const doc = 'see ~~strike~~ end';
  const closeStart = doc.indexOf('~~', doc.indexOf('strike'));
  await seedDoc(doc, closeStart);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('Backspace at openEnd (start of label, after hidden ~~) deletes the whole strike', async () => {
  const doc = 'see ~~strike~~ end';
  const openEnd = doc.indexOf('~~') + 2;
  await seedDoc(doc, openEnd);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('Backspace INSIDE the strike label deletes a single char (label-editable)', async () => {
  const doc = 'see ~~strike~~ end';
  const insideLabel = doc.indexOf('strike') + 1;
  await seedDoc(doc, insideLabel);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see ~~trike~~ end');
});

test('Delete at node.from (just before opening ~~) deletes the whole strike', async () => {
  const doc = 'see ~~strike~~ end';
  const strikeStart = doc.indexOf('~~');
  await seedDoc(doc, strikeStart);
  await page.keyboard.press('Delete');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('Delete at closeStart (end of label) deletes the whole strike', async () => {
  const doc = 'see ~~strike~~ end';
  const closeStart = doc.indexOf('~~', doc.indexOf('strike'));
  await seedDoc(doc, closeStart);
  await page.keyboard.press('Delete');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('ArrowRight from before `~~strike~~` skips the hidden opening `~~`', async () => {
  // markerLen=2 atomicRanges motion: caret at node.from + ArrowRight
  // should jump to openEnd = from + 2, skipping the hidden marker.
  const doc = 'see ~~strike~~ end';
  const strikeStart = doc.indexOf('~~');
  await seedDoc(doc, strikeStart);
  await page.keyboard.press('ArrowRight');
  expect(await getCaretHead()).toBe(strikeStart + 2);
});

test('Strike inside Bold (`**foo ~~bar~~ baz**`) — inner strike deletes atomically', async () => {
  // Verifies the spec-driven INLINE_MARK_SPECS array iteration
  // works through the real keymap: the inner Strikethrough node should
  // fire its own atomic delete without being masked by the outer
  // StrongEmphasis.
  const doc = 'pre **foo ~~bar~~ baz** post';
  // Caret right after the inner `~~bar~~` closing `~~` (closeStart of
  // the inner strike, which is also between the inner label and
  // hidden marker).
  const innerStrikeEnd = doc.indexOf('~~bar~~') + '~~bar~~'.length;
  const innerStrikeStart = doc.indexOf('~~bar~~');
  await seedDoc(doc, innerStrikeEnd);
  await page.keyboard.press('Backspace');
  // The inner strike disappears; outer bold and surrounding text
  // remain intact.
  const expectedHead = doc.slice(0, innerStrikeStart) + doc.slice(innerStrikeEnd);
  expect(await getEditorDoc(page)).toBe(expectedHead);
});

test('Strikethrough toggle (menu IPC) on `~~strike~~` selection still unwraps with atomic ranges active', async () => {
  // Same explicit-intent exception as Cmd+B for Bold and Cmd+I for Italic.
  // toggleWrap dispatches its own changes and bypasses our keymap. We invoke
  // it via the production menu IPC channel ('menu:command'
  // 'strikethrough') — the same channel Cmd+Shift+X and the toolbar
  // Strikethrough button both fire. Direct page.keyboard.press('Meta+Shift+x')
  // is suppressed by macOS Electron in headless Playwright runs,
  // which would false-positive the contract.
  //
  // Two-step seed: insert doc first so atomicRanges settles around
  // the new Strikethrough node, then set selection in a separate
  // transaction.
  const labelStart = 'see ~~'.length;
  const labelEnd = labelStart + 'strike'.length;
  await seedDoc('see ~~strike~~ end', 0);
  await page.evaluate(
    ({ from, to }) => {
      const root = document.querySelector('.cm-editor') as HTMLElement | null;
      const content = root?.querySelector('.cm-content') as HTMLElement | null;
      const view = (
        content as unknown as {
          cmTile?: {
            root?: {
              view?: {
                dispatch: (spec: object) => void;
                state: { selection: { main: { anchor: number; head: number } } };
                focus: () => void;
              };
            };
          };
        }
      )?.cmTile?.root?.view;
      if (!view) return;
      view.dispatch({ selection: { anchor: from, head: to }, userEvent: 'select' });
      view.focus();
    },
    { from: labelStart, to: labelEnd },
  );
  // Trigger the strikethrough toggle via the production menu IPC path,
  // which is the same channel the Cmd+Shift+X accelerator and the toolbar
  // Strikethrough button both use. Direct page.keyboard.press('Meta+Shift+x')
  // is unreliable in headless Electron — the system text input layer
  // can swallow the shortcut on macOS before it reaches the menu
  // accelerator or the editor keymap. The IPC dispatch exercises
  // useMenuCommandRouter → toggleWrap(view, '~~'), which is the
  // actual logic we want to pin.
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    w?.webContents.send('menu:command', 'strikethrough');
  });
  await page.waitForTimeout(50);
  const postDoc = await getEditorDoc(page);
  expect(postDoc).toBe('see strike end');
});

import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchClean, shutdownClean, getEditorDoc } from './_helpers';

/**
 * v0.2.25 — atomic boundary contract for `*italic*` and `_italic_`.
 *
 * Same shape as atomic-bold.spec.ts. The spec-driven design means
 * `atomicInlineMarks.ts` registers ITALIC_SPEC with markerLen=1 next
 * to BOLD_SPEC; this spec exercises the markerLen=1 path through the
 * real keymap chain so we catch any boundary-offset bug the unit
 * suite would miss.
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

test('Backspace at node.to (just after closing *) deletes the whole `*italic*`', async () => {
  const doc = 'see *italic* end';
  const italEnd = doc.indexOf(' end');
  await seedDoc(doc, italEnd);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('Backspace at closeStart (end of label, before hidden *) deletes the whole italic — REGRESSION GUARD', async () => {
  // markerLen=1 mirror of the v0.2.23 link regression: the hidden
  // closing `*` is zero-width, so caret at closeStart and node.to
  // collapse visually.
  const doc = 'see *italic* end';
  const closeStart = doc.indexOf('*', doc.indexOf('italic'));
  await seedDoc(doc, closeStart);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('Backspace at openEnd (start of label, after hidden *) deletes the whole italic', async () => {
  const doc = 'see *italic* end';
  const openEnd = doc.indexOf('*') + 1;
  await seedDoc(doc, openEnd);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('Backspace INSIDE the italic label deletes a single char (label-editable)', async () => {
  const doc = 'see *italic* end';
  const insideLabel = doc.indexOf('italic') + 1;
  await seedDoc(doc, insideLabel);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see *talic* end');
});

test('Delete at node.from (just before opening *) deletes the whole italic', async () => {
  const doc = 'see *italic* end';
  const italStart = doc.indexOf('*');
  await seedDoc(doc, italStart);
  await page.keyboard.press('Delete');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('Delete at closeStart (end of label) deletes the whole italic', async () => {
  const doc = 'see *italic* end';
  const closeStart = doc.indexOf('*', doc.indexOf('italic'));
  await seedDoc(doc, closeStart);
  await page.keyboard.press('Delete');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('`_italic_` syntax also deletes atomically on Backspace at the right edge', async () => {
  const doc = 'see _italic_ end';
  const italEnd = doc.indexOf(' end');
  await seedDoc(doc, italEnd);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('ArrowRight from before `*italic*` skips the hidden opening `*`', async () => {
  // markerLen=1 atomicRanges motion: caret at node.from + ArrowRight
  // should jump to openEnd = from + 1, then label entry. Without
  // atomicRanges the caret would have landed at from + 1 anyway
  // (single char), so the stronger check is the "skip past the
  // hidden marker" semantics — for markerLen=1 the difference is
  // subtle, but the test pins the contract regardless.
  const doc = 'see *italic* end';
  const italStart = doc.indexOf('*');
  await seedDoc(doc, italStart);
  await page.keyboard.press('ArrowRight');
  expect(await getCaretHead()).toBe(italStart + 1);
});

test('Italic inside Bold (`**foo *bar* baz**`) — inner italic deletes atomically', async () => {
  // Verifies the spec-driven INLINE_MARK_SPECS array iteration
  // works through the real keymap: the inner Emphasis node should
  // fire its own atomic delete without being masked by the outer
  // StrongEmphasis.
  const doc = 'pre **foo *bar* baz** post';
  // Caret right after the inner `*bar*` closing `*` (closeStart of
  // the inner italic, which is also between the inner label and
  // hidden marker).
  const innerItalicEnd = doc.indexOf('*bar*') + '*bar*'.length;
  const innerItalicStart = doc.indexOf('*bar*');
  await seedDoc(doc, innerItalicEnd);
  await page.keyboard.press('Backspace');
  // The inner italic disappears; outer bold and surrounding text
  // remain intact.
  const expectedHead = doc.slice(0, innerItalicStart) + doc.slice(innerItalicEnd);
  expect(await getEditorDoc(page)).toBe(expectedHead);
});

test('Italic toggle (menu IPC) on `*italic*` selection still unwraps with atomic ranges active', async () => {
  // Same explicit-intent exception as Cmd+B for Bold. toggleWrap
  // dispatches its own changes and bypasses our keymap. We invoke
  // it via the production menu IPC channel ('menu:command'
  // 'italic') — the same channel Cmd+I and the toolbar Italic
  // button both fire. Direct page.keyboard.press('Meta+i') is
  // suppressed by macOS Electron in headless Playwright runs,
  // which would false-positive the contract.
  //
  // Two-step seed: insert doc first so atomicRanges settles around
  // the new Emphasis node, then set selection in a separate
  // transaction.
  const labelStart = 'see *'.length;
  const labelEnd = labelStart + 'italic'.length;
  await seedDoc('see *italic* end', 0);
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
  // Trigger the italic toggle via the production menu IPC path,
  // which is the same channel the Cmd+I accelerator and the toolbar
  // Italic button both use. Direct page.keyboard.press('Meta+i') is
  // unreliable in headless Electron — the system text input layer
  // can swallow Cmd+I on macOS before it reaches the menu
  // accelerator or the editor keymap. The IPC dispatch exercises
  // useMenuCommandRouter → toggleWrap(view, '*'), which is the
  // actual logic we want to pin.
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    w?.webContents.send('menu:command', 'italic');
  });
  await page.waitForTimeout(50);
  const postDoc = await getEditorDoc(page);
  expect(postDoc).toBe('see italic end');
});

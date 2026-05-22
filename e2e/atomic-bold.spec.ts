import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchClean, shutdownClean, getEditorDoc } from './_helpers';

/**
 * v0.2.24 — atomic boundary contract for `**bold**` and `__bold__`.
 *
 * Mirror of e2e/atomic-media.spec.ts for inline marks. The unit suite
 * (tests/editor/atomicInlineMarks.test.ts) pins findInlineMarkAtEdge;
 * this spec drives the same scenarios through page.keyboard.press so
 * the Prec.high keymap is actually exercised end-to-end. v0.2.23 unit
 * tests for Link Backspace passed while the real-UI behaviour failed
 * because `view.dispatch({changes})` bypasses the keymap chain; this
 * spec is the regression guard against repeating that pattern.
 *
 * Coverage layers (Codex review revisions):
 *   - Deletion boundaries (Backspace ×3 + Delete ×2 + `__` variant)
 *   - atomicRanges motion (ArrowRight, ArrowLeft, Shift+ArrowLeft)
 *   - Mode gate (Markdown/Source mode must NOT atomic-delete)
 *   - Cmd+B toggle coexistence
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

/** Read the caret head out of the live EditorView. */
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

test('Backspace at node.to (just after closing **) deletes the whole `**bold**`', async () => {
  const doc = 'see **bold** end';
  const boldEnd = doc.indexOf(' end');
  await seedDoc(doc, boldEnd);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('Backspace at closeStart (end of visible label) deletes the whole bold — REGRESSION GUARD', async () => {
  // The inline-mark equivalent of the v0.2.23 link regression: the
  // hidden closing `**` is zero-width on screen, so caret at "end of
  // label" and "after the bold" collapse to the same visual location.
  const doc = 'see **bold** end';
  const closeStart = doc.indexOf('**', doc.indexOf('bold'));
  await seedDoc(doc, closeStart);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('Backspace at openEnd (start of visible label, after hidden **) deletes the whole bold', async () => {
  const doc = 'see **bold** end';
  const openEnd = doc.indexOf('**') + 2;
  await seedDoc(doc, openEnd);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('Backspace INSIDE the label still deletes a single char (label-editable)', async () => {
  const doc = 'see **bold** end';
  const insideLabel = doc.indexOf('bold') + 1;
  await seedDoc(doc, insideLabel);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see **old** end');
});

test('Delete at node.from (just before opening **) deletes the whole bold', async () => {
  const doc = 'see **bold** end';
  const boldStart = doc.indexOf('**');
  await seedDoc(doc, boldStart);
  await page.keyboard.press('Delete');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('Delete at closeStart (end of label) deletes the whole bold', async () => {
  const doc = 'see **bold** end';
  const closeStart = doc.indexOf('**', doc.indexOf('bold'));
  await seedDoc(doc, closeStart);
  await page.keyboard.press('Delete');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('`__bold__` syntax also deletes atomically on Backspace at the right edge', async () => {
  const doc = 'see __bold__ end';
  const boldEnd = doc.indexOf(' end');
  await seedDoc(doc, boldEnd);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see  end');
});

test('ArrowRight from before `**bold**` skips over the hidden opening `**`', async () => {
  // Cursor-motion side of atomicRanges (deletion alone does not
  // prove atomicRanges works). Without atomicity caret lands at 1
  // (between the two `*`); with atomicity it jumps to openEnd = 2.
  const doc = 'see **bold** end';
  const boldStart = doc.indexOf('**');
  await seedDoc(doc, boldStart);
  await page.keyboard.press('ArrowRight');
  expect(await getCaretHead()).toBe(boldStart + 2);
});

test('ArrowLeft from after `**bold**` skips over the hidden closing `**`', async () => {
  const doc = 'see **bold** end';
  const boldEnd = doc.indexOf('**', doc.indexOf('bold')) + 2;
  await seedDoc(doc, boldEnd);
  await page.keyboard.press('ArrowLeft');
  expect(await getCaretHead()).toBe(boldEnd - 2);
});

test('Shift+ArrowLeft from after `**bold**` extends selection across the closing `**` atomically', async () => {
  // Selection extension is the third atomicRanges contract.
  const doc = 'see **bold** end';
  const boldEnd = doc.indexOf('**', doc.indexOf('bold')) + 2;
  await seedDoc(doc, boldEnd);
  await page.keyboard.press('Shift+ArrowLeft');
  expect(await getCaretHead()).toBe(boldEnd - 2);
});

test('Markdown (Source) mode: Backspace at bold boundary deletes ONE char, not the whole node', async () => {
  // Source mode strips liveDecorations; emphasis.ts is off; `**` is
  // user-visible source. shouldApplyAtomic must short-circuit.
  const doc = 'see **bold** end';
  const boldEnd = doc.indexOf(' end');
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w?.webContents.send('menu:command', { type: 'setEditMode', mode: 'markdown' });
  });
  await page.waitForTimeout(150);
  await seedDoc(doc, boldEnd);
  await page.keyboard.press('Backspace');
  expect(await getEditorDoc(page)).toBe('see **bold* end');
  // Restore WYSIWYG so subsequent tests start fresh.
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w?.webContents.send('menu:command', { type: 'setEditMode', mode: 'wysiwyg' });
  });
  await page.waitForTimeout(150);
});

test('Cmd+B on a `**bold**` selection still unwraps (toggleWrap unaffected)', async () => {
  // Boundary atomicity must not interfere with the explicit-intent
  // exception — Bold toggle via shortcut should still strip the
  // markers. toggleWrap uses view.dispatch directly so it bypasses
  // our keymap, but pinning the behaviour here makes the contract
  // explicit.
  const labelStart = 'see **'.length;
  const labelEnd = labelStart + 'bold'.length;
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
                state: { doc: { length: number } };
                focus: () => void;
              };
            };
          };
        }
      )?.cmTile?.root?.view;
      if (!view) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: 'see **bold** end' },
        selection: { anchor: from, head: to },
        userEvent: 'select',
      });
      view.focus();
    },
    { from: labelStart, to: labelEnd },
  );
  const isMac = process.platform === 'darwin';
  await page.keyboard.press(isMac ? 'Meta+b' : 'Control+b');
  expect(await getEditorDoc(page)).toBe('see bold end');
});

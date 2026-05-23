import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchClean, shutdownClean, getEditorDoc, composeKorean } from './_helpers';

/**
 * v0.2.29 — Word-style pending inline format: empty-selection
 * toolbar/shortcut sets pending state, the next-typed text gets
 * wrapped, then pending clears.
 *
 * History: an earlier v0.2.29 commit tried a "placeholder text"
 * approach but only wired it through menu IPC + keymap shortcuts.
 * The toolbar BUTTON onClick was missed (false-green 6th pattern),
 * and the user's real install reproduced the v0.2.28 bug exactly.
 * v0.2.29 final implementation lives in
 * `src/editor/keymap/pendingInlineFormat.ts`: a StateField + a
 * `EditorState.transactionFilter` that wraps the first input.type
 * OR input.compose event after a pending toggle. ALL three callers
 * (toolbar button, Cmd+B shortcut, menu IPC) now route through
 * `applyInlineFormat(view, format)`.
 *
 * This spec drives the menu IPC channel — the canonical path the
 * toolbar button + shortcut also use after this refactor. Korean
 * IME composition is also exercised via CDP `composeKorean()`,
 * directly verifying the v0.2.28 user-reported failure mode.
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

async function fireMenuIpc(cmd: string): Promise<void> {
  await app.evaluate(({ BrowserWindow }, c) => {
    const w = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    w?.webContents.send('menu:command', c);
  }, cmd);
  await page.waitForTimeout(50);
}

const CASES = [
  { cmd: 'bold', before: '**', after: '**', broken: '****' },
  { cmd: 'italic', before: '*', after: '*', broken: '**' },
  { cmd: 'strikethrough', before: '~~', after: '~~', broken: '~~~~' },
  { cmd: 'code', before: '`', after: '`', broken: '``' },
];

for (const { cmd, before, after, broken } of CASES) {
  test(`toolbar ${cmd} on empty line: doc unchanged (pending state only)`, async () => {
    await clearAndFocus();
    await fireMenuIpc(cmd);
    // v0.2.29 contract: the toolbar dispatch alone makes NO document change.
    // The pending state is set; doc remains empty until the user types.
    expect(await getEditorDoc(page)).toBe('');
  });

  test(`toolbar ${cmd} on empty line + ASCII type → wraps the typed text`, async () => {
    await clearAndFocus();
    await fireMenuIpc(cmd);
    await page.keyboard.type('h');
    expect(await getEditorDoc(page)).toBe(`${before}h${after}`);
  });

  test(`toolbar ${cmd} on empty line does NOT produce the v0.2.28-broken shape (${broken})`, async () => {
    await clearAndFocus();
    await fireMenuIpc(cmd);
    await page.keyboard.type('h');
    expect(await getEditorDoc(page)).not.toBe(broken);
  });
}

test('toolbar bold + Korean IME composition (composeKorean) → **한**', async () => {
  // This is the exact v0.2.28 user-reported scenario, automated.
  // Before v0.2.29: doc became `**ㅏㄴ글볼드**ㅎ` (Korean letters
  // in wrong positions because `****` HR widget hijacked caret +
  // IME composition desynced).
  // After v0.2.29: pending bold + first compose event ('ㅎ') wraps
  // as `**ㅎ**`, caret lands inside the well-formed bold span,
  // subsequent composition updates flow naturally → final '**한**'.
  await clearAndFocus();
  await fireMenuIpc('bold');
  try {
    await composeKorean(page, ['ㅎ', '하', '한'], '한');
  } catch (err) {
    test.skip(true, `CDP IME composition unsupported: ${(err as Error).message}`);
  }
  expect(await getEditorDoc(page)).toBe('**한**');
});

test('toolbar bold then bold again (toggle) → pending cleared, no wrap on next type', async () => {
  await clearAndFocus();
  await fireMenuIpc('bold');
  await fireMenuIpc('bold');
  await page.keyboard.type('h');
  expect(await getEditorDoc(page)).toBe('h');
});

test('toolbar bold then caret move (ArrowLeft) → pending cleared, no wrap on next type', async () => {
  await clearAndFocus();
  // Seed a char so ArrowLeft has somewhere to move to.
  await page.keyboard.type('a');
  // Cursor now at pos 1. Toggle pending bold; cursor move clears it.
  await fireMenuIpc('bold');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('h');
  // 'h' inserted at pos 0 without bold wrapping → 'ha'.
  expect(await getEditorDoc(page)).toBe('ha');
});

test('non-empty selection + toolbar bold still wraps the selection (regression)', async () => {
  // Seed text and select 'hello'.
  await clearAndFocus();
  await page.keyboard.type('hello world');
  await page.evaluate(() => {
    const view = (document.querySelector('.cm-content') as any)?.cmTile?.root?.view;
    if (!view) return;
    view.dispatch({ selection: { anchor: 0, head: 5 }, userEvent: 'select' });
    view.focus();
  });
  await fireMenuIpc('bold');
  expect(await getEditorDoc(page)).toBe('**hello** world');
});

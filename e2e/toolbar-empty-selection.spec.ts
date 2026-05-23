import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchClean, shutdownClean, getEditorDoc } from './_helpers';

/**
 * v0.2.29 — empty-selection toolbar inserts a localized placeholder,
 * not malformed markdown.
 *
 * Background (v0.2.28 user-reported bug):
 *   Click toolbar Bold on an empty line → `****` inserted → Lezer
 *   parses as HorizontalRule → <hr> widget renders → Korean IME
 *   composition gets routed into wrong positions because the block
 *   widget interferes with caret placement. Same shape of bug for
 *   Strike (`~~~~` → FencedCode), Italic (`**` malformed), Code
 *   (`` `` `` malformed), Sub / Sup (zero-width HTML slots).
 *
 * This spec drives the menu IPC channel — same channel Cmd+B and the
 * toolbar Bold button both fire (see useMenuCommandRouter.ts) — and
 * asserts:
 *   1. Empty-selection invocation produces `${before}${placeholder}${after}`
 *   2. The placeholder is selected (typing replaces it)
 *   3. The doc state is NEVER the v0.2.28-broken malformed shape
 *
 * Sub/Sup are not covered here — they go through `toggleSub` / `toggleSup`
 * helpers, not the menu IPC channel. Their placeholder contract is
 * pinned by tests/editor/toggleSupSub.test.ts (unit) and manual smoke
 * for the toolbar buttons. Korean IME composition is its own spec
 * (toolbar-ime-composition.spec.ts, CDP best-effort).
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
  // Give the renderer's useMenuCommandRouter handler one tick to dispatch.
  await page.waitForTimeout(50);
}

const CASES = [
  { cmd: 'bold', placeholder: '굵게', expected: '**굵게**', broken: '****' },
  { cmd: 'italic', placeholder: '기울임', expected: '*기울임*', broken: '**' },
  { cmd: 'strikethrough', placeholder: '취소선', expected: '~~취소선~~', broken: '~~~~' },
  { cmd: 'code', placeholder: '코드', expected: '`코드`', broken: '``' },
];

for (const { cmd, placeholder, expected, broken } of CASES) {
  test(`toolbar ${cmd} on empty line inserts ${expected} with placeholder selected`, async () => {
    await clearAndFocus();
    await fireMenuIpc(cmd);
    expect(await getEditorDoc(page)).toBe(expected);
  });

  test(`toolbar ${cmd} placeholder is selected — typing replaces it`, async () => {
    await clearAndFocus();
    await fireMenuIpc(cmd);
    // The placeholder is the active selection; typing replaces.
    // Use ASCII via page.keyboard.type to keep the test deterministic
    // (Korean IME composition is covered separately).
    await page.keyboard.type('xyz');
    const doc = await getEditorDoc(page);
    expect(doc).toContain('xyz');
    expect(doc).not.toContain(placeholder);
  });

  test(`toolbar ${cmd} on empty line does NOT produce the v0.2.28-broken shape (${broken})`, async () => {
    await clearAndFocus();
    await fireMenuIpc(cmd);
    expect(await getEditorDoc(page)).not.toBe(broken);
  });
}

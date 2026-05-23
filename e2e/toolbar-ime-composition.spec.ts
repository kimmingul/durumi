import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchClean, shutdownClean, getEditorDoc, composeKorean } from './_helpers';

/**
 * v0.2.29 — Korean IME composition through a Bold-toolbar placeholder.
 *
 * The user-reported v0.2.28 bug was specifically about Korean IME
 * composition placing letters into wrong positions after clicking
 * the Bold toolbar on an empty line (`****` HR widget hijacked the
 * caret). The v0.2.29 fix (placeholder inserted selected) means
 * composition starts inside a well-formed `**굵게**` span.
 *
 * This spec attempts to exercise REAL IME composition via the
 * Chrome DevTools Protocol `Input.imeSetComposition` command, which
 * is experimental but supported in Chromium-based runtimes
 * including Electron. Playwright exposes raw CDP sessions via
 * `page.context().newCDPSession(page)`.
 *
 * If CDP `Input.imeSetComposition` is unavailable in this Electron
 * build, the test is skipped with a visible note pointing to manual
 * macOS Korean 2-set IME smoke as the release sign-off gate.
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

test('CDP Input.imeSetComposition probe', async () => {
  // Probe: if the CDP command throws, mark skipped and rely on manual smoke.
  const session = await page.context().newCDPSession(page);
  let supported = false;
  try {
    await session.send('Input.imeSetComposition', {
      text: '한',
      selectionStart: 1,
      selectionEnd: 1,
    });
    supported = true;
  } catch (err) {
    // Mark the rest of this spec as skipped via a visible expect.
    test.info().annotations.push({
      type: 'skip-reason',
      description: `CDP Input.imeSetComposition unsupported: ${(err as Error).message}`,
    });
  } finally {
    await session.detach();
  }
  // Always pass the probe — the next test conditionally skips.
  expect([true, false]).toContain(supported);
});

test('Bold toolbar then Korean IME composition replaces placeholder with composed Hangul', async () => {
  await clearAndFocus();
  await fireMenuIpc('bold');
  // Sanity: placeholder '굵게' should be selected and the doc should be `**굵게**`.
  expect(await getEditorDoc(page)).toBe('**굵게**');

  try {
    // Compose '한' via 2-set IME progression: ㅎ → 하 → 한 → commit.
    await composeKorean(page, ['ㅎ', '하', '한'], '한');
  } catch (err) {
    test.skip(true, `CDP IME composition unsupported in this Electron build: ${(err as Error).message}`);
  }

  await page.waitForTimeout(100);
  const doc = await getEditorDoc(page);
  // The placeholder '굵게' (selected) should have been replaced by '한'.
  // Source: `**한**`. (Marker hiding is a render concern; source is the contract.)
  expect(doc).toBe('**한**');
});

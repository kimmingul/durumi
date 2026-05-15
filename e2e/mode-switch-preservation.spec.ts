import { test, expect, type ElectronApplication } from '@playwright/test';
import { launchClean, setMarkdownMode, setTyporaMode, setWysiwygMode, shutdownClean } from './_helpers';

async function launch() {
  const app = await launchClean();
  const page = await app.firstWindow();
  await page.waitForSelector('.cm-content');
  return { app, page };
}

async function shutdown(app: ElectronApplication) {
  await shutdownClean(app);
}

interface ViewSnapshot {
  caretLine: number;
  caretCh: number;
  scrollTop: number;
  caretClientY: number | null;
}

async function readSnapshot(page: import('@playwright/test').Page): Promise<ViewSnapshot> {
  return await page.evaluate(() => {
    const root = document.querySelector('.cm-editor') as HTMLElement | null;
    const content = root?.querySelector('.cm-content') as HTMLElement | null;
    type LineInfo = { number: number; from: number };
    type DocLike = { lineAt: (pos: number) => LineInfo };
    type ScrollDOM = { scrollTop: number; getBoundingClientRect: () => DOMRect };
    type CursorCoords = (pos: number) => { top: number } | null;
    type ViewLike = {
      state: { selection: { main: { head: number } }; doc: DocLike };
      scrollDOM: ScrollDOM;
      coordsAtPos: CursorCoords;
    };
    const tile = (content ?? root) as unknown as { cmTile?: { root?: { view?: ViewLike } } };
    const view = tile.cmTile?.root?.view;
    if (!view) {
      return { caretLine: 0, caretCh: 0, scrollTop: 0, caretClientY: null };
    }
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    const coords = view.coordsAtPos(head);
    return {
      caretLine: line.number,
      caretCh: head - line.from,
      scrollTop: view.scrollDOM.scrollTop,
      caretClientY: coords ? coords.top : null,
    };
  });
}

async function seedLongDoc(
  page: import('@playwright/test').Page,
  caretLine: number,
): Promise<void> {
  const lines: string[] = [];
  for (let i = 1; i <= 100; i++) lines.push(`Line ${i}: paragraph body for scroll preservation.`);
  const doc = lines.join('\n');
  // Place caret at the start of the requested line.
  await page.evaluate(
    ({ markdown, targetLine }) => {
      const root = document.querySelector('.cm-editor') as HTMLElement | null;
      if (!root) return;
      const content = root.querySelector('.cm-content') as HTMLElement | null;
      type ViewSeed = {
        state: { doc: { length: number; line: (n: number) => { from: number } } };
        dispatch: (s: unknown) => void;
        focus: () => void;
        scrollDOM: { scrollTop: number };
      };
      const tile = (content ?? root) as unknown as { cmTile?: { root?: { view?: ViewSeed } } };
      const view = tile.cmTile?.root?.view;
      if (!view) return;
      view.focus();
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: markdown },
        selection: { anchor: 0 },
        userEvent: 'input.testReset',
      });
      const target = view.state.doc.line(targetLine);
      view.dispatch({
        selection: { anchor: target.from },
        userEvent: 'select.test',
      });
    },
    { markdown: doc, targetLine: caretLine },
  );
  await page.waitForTimeout(120);
}

/**
 * v0.2.11 — Item 1. The mode-switch reconfigure must snapshot caret and
 * scrollTop before swapping the decoration compartment and restore both
 * after, so widget remount doesn't bounce the visible position.
 */
test('mode switch preserves caret line and scroll position across Document/Live/Source', async () => {
  const { app, page } = await launch();
  try {
    await seedLongDoc(page, 50);
    // Manually scroll down so line 50 is roughly mid-viewport.
    await page.evaluate(() => {
      const root = document.querySelector('.cm-editor') as HTMLElement | null;
      const content = root?.querySelector('.cm-content') as HTMLElement | null;
      type ViewLike = { scrollDOM: { scrollTop: number; scrollHeight: number; clientHeight: number } };
      const tile = (content ?? root) as unknown as { cmTile?: { root?: { view?: ViewLike } } };
      const view = tile.cmTile?.root?.view;
      if (!view) return;
      const sd = view.scrollDOM;
      sd.scrollTop = Math.max(0, (sd.scrollHeight - sd.clientHeight) * 0.5);
    });
    await page.waitForTimeout(80);

    const initial = await readSnapshot(page);
    expect(initial.caretLine).toBe(50);
    expect(initial.scrollTop).toBeGreaterThan(0);

    const flips: Array<{ to: 'wysiwyg' | 'typora' | 'markdown'; helper: () => Promise<void> }> = [
      { to: 'typora', helper: () => setTyporaMode(app, page) },
      { to: 'wysiwyg', helper: () => setWysiwygMode(app, page) },
      { to: 'markdown', helper: () => setMarkdownMode(app, page) },
      { to: 'wysiwyg', helper: () => setWysiwygMode(app, page) },
    ];

    for (const flip of flips) {
      await flip.helper();
      await page.waitForTimeout(120);
      const after = await readSnapshot(page);
      expect.soft(after.caretLine, `caret line after flip to ${flip.to}`).toBe(initial.caretLine);
      expect
        .soft(Math.abs(after.scrollTop - initial.scrollTop), `scrollTop drift after flip to ${flip.to}`)
        .toBeLessThanOrEqual(20);
    }
  } finally {
    await shutdown(app);
  }
});

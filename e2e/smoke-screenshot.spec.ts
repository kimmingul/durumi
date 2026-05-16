/**
 * v0.2 manual smoke-test screenshot capture (NOT part of the regular CI run).
 *
 * Opens `docs/v0.2-smoke-test.md` (the human-readable smoke fixture) inside
 * the built Electron app and takes 23 screenshots that cover every visually
 * verifiable feature shipped between v0.2.8 and v0.2.12. Shots 01–13 mirror
 * the original v0.2.8–v0.2.11 baseline (Sections A–E); shots 14–23 cover the
 * v0.2.12 expansion (Sections F–N) — heading levels, list depth, link
 * variants, code variants, citations, footnotes, math, and edge cases. The
 * orchestrator (a human) eyeballs the captured PNGs against the
 * `docs/v0.2-signoff.md` §6 checklist — this file does not assert pixel
 * content, it only drives the app into the right state and snaps the window.
 *
 * Gating: skipped unless `SMOKE=1` is set in the environment so the regular
 * `pnpm test:e2e` run doesn't pay the screenshot cost on every CI loop.
 *
 * Invocation:
 *   pnpm build && SMOKE=1 DURUMI_E2E=1 pnpm exec playwright test e2e/smoke-screenshot.spec.ts
 */

import { test, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { launchClean, setMarkdownMode, setTyporaMode, setWysiwygMode, shutdownClean } from './_helpers';

const FIXTURE_SRC = path.resolve(process.cwd(), 'docs', 'v0.2-smoke-test.md');
const SHOT_DIR = path.resolve(process.cwd(), 'e2e', 'screenshots', 'v0.2-smoke');

// Manual-only: keep this spec out of the default `pnpm test:e2e` run.
test.skip(process.env.SMOKE !== '1', 'set SMOKE=1 to run the v0.2 smoke screenshot capture');

async function launch() {
  const app = await launchClean();
  const page = await app.firstWindow();
  await page.waitForSelector('.cm-content');
  return { app, page };
}

async function shutdown(app: ElectronApplication) {
  await shutdownClean(app);
}

/** Open a markdown file via the same IPC the recent-files menu uses. */
async function openFixture(app: ElectronApplication, page: Page, mdPath: string) {
  await app.evaluate(async ({ BrowserWindow }, p: string) => {
    const win = BrowserWindow.getAllWindows()[0];
    win?.webContents.send('menu:command', { type: 'openRecent', path: p });
  }, mdPath);
  await page.waitForFunction(
    (expected: string) => {
      const cm = document.querySelector('.cm-content') as HTMLElement | null;
      return cm?.innerText.includes(expected) ?? false;
    },
    'Smoke Test',
    { timeout: 10_000 },
  );
  // Allow the live decorations + widgets one render tick to settle.
  await page.waitForTimeout(300);
}

/** Place the caret at the start of the given (1-based) source line. */
async function caretToLine(page: Page, line: number) {
  await page.evaluate((target: number) => {
    const root = document.querySelector('.cm-editor') as HTMLElement | null;
    const content = root?.querySelector('.cm-content') as HTMLElement | null;
    type ViewLike = {
      state: { doc: { lines: number; line: (n: number) => { from: number } } };
      dispatch: (s: unknown) => void;
      focus: () => void;
    };
    const tile = (content ?? root) as unknown as { cmTile?: { root?: { view?: ViewLike } } };
    const view = tile.cmTile?.root?.view;
    if (!view) return;
    view.focus();
    const safe = Math.max(1, Math.min(target, view.state.doc.lines));
    const info = view.state.doc.line(safe);
    view.dispatch({ selection: { anchor: info.from }, userEvent: 'select.smoke' });
  }, line);
  await page.waitForTimeout(120);
}

/** Scroll the editor's scroll DOM so the caret line sits roughly mid-viewport. */
async function scrollCaretIntoView(page: Page) {
  await page.evaluate(() => {
    const root = document.querySelector('.cm-editor') as HTMLElement | null;
    const content = root?.querySelector('.cm-content') as HTMLElement | null;
    type ViewLike = {
      state: { selection: { main: { head: number } } };
      coordsAtPos: (pos: number) => { top: number } | null;
      scrollDOM: { scrollTop: number; clientHeight: number; getBoundingClientRect: () => DOMRect };
    };
    const tile = (content ?? root) as unknown as { cmTile?: { root?: { view?: ViewLike } } };
    const view = tile.cmTile?.root?.view;
    if (!view) return;
    const head = view.state.selection.main.head;
    const c = view.coordsAtPos(head);
    if (!c) return;
    const sd = view.scrollDOM;
    const r = sd.getBoundingClientRect();
    // Distance from caret to viewport top, then move it to ~40% from top.
    const desiredFromTop = sd.clientHeight * 0.4;
    const drift = c.top - r.top - desiredFromTop;
    sd.scrollTop = Math.max(0, sd.scrollTop + drift);
  });
  await page.waitForTimeout(120);
}

/** Scroll to the very top of the document. */
async function scrollToTop(page: Page) {
  await page.evaluate(() => {
    const root = document.querySelector('.cm-editor') as HTMLElement | null;
    const content = root?.querySelector('.cm-content') as HTMLElement | null;
    type ViewLike = {
      dispatch: (s: unknown) => void;
      scrollDOM: { scrollTop: number };
      focus: () => void;
    };
    const tile = (content ?? root) as unknown as { cmTile?: { root?: { view?: ViewLike } } };
    const view = tile.cmTile?.root?.view;
    if (!view) return;
    view.focus();
    view.dispatch({ selection: { anchor: 0 }, userEvent: 'select.smoke' });
    view.scrollDOM.scrollTop = 0;
  });
  await page.waitForTimeout(120);
}

/** Find the (1-based) line number of the first line whose text matches needle. */
async function findLine(page: Page, needle: string): Promise<number> {
  return await page.evaluate((q: string) => {
    const root = document.querySelector('.cm-editor') as HTMLElement | null;
    const content = root?.querySelector('.cm-content') as HTMLElement | null;
    type DocLike = {
      lines: number;
      line: (n: number) => { text: string };
      toString: () => string;
    };
    type ViewLike = { state: { doc: DocLike } };
    const tile = (content ?? root) as unknown as { cmTile?: { root?: { view?: ViewLike } } };
    const view = tile.cmTile?.root?.view;
    if (!view) return 0;
    const total = view.state.doc.lines;
    for (let i = 1; i <= total; i++) {
      if (view.state.doc.line(i).text.includes(q)) return i;
    }
    return 0;
  }, needle);
}

async function snap(page: Page, name: string) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: false });
}

/**
 * Park a given source line near the top of the viewport (offsetPx from the
 * scroll-DOM top) and place the caret one line above it so it does not become
 * the active line. Used by Section F–N captures that need a section heading
 * pinned at the top so its body fits below in one frame.
 */
async function parkLineAtTop(page: Page, line: number, offsetPx = 60) {
  if (line <= 0) return;
  // Use CodeMirror 6's EditorView.scrollIntoView effect via the view's
  // constructor. This is the canonical way to scroll a position to the top
  // of the viewport with a precise yMargin — it materializes virtualized
  // lines and respects widget heights (which our scrollHeight-ratio
  // heuristic could not, because widgets like [toc] add visual height with
  // no corresponding source line count).
  await page.evaluate(
    (args: { line: number; offsetPx: number }) => {
      const root = document.querySelector('.cm-editor') as HTMLElement | null;
      const content = root?.querySelector('.cm-content') as HTMLElement | null;
      type ScrollIntoViewArg = unknown;
      type ViewLike = {
        state: { doc: { lines: number; line: (n: number) => { from: number } } };
        dispatch: (s: unknown) => void;
        focus: () => void;
        constructor: { scrollIntoView: (pos: number, opts?: { y?: string; yMargin?: number }) => ScrollIntoViewArg };
      };
      const tile = (content ?? root) as unknown as { cmTile?: { root?: { view?: ViewLike } } };
      const view = tile.cmTile?.root?.view;
      if (!view) return;
      view.focus();
      const safe = Math.max(1, Math.min(args.line, view.state.doc.lines));
      const info = view.state.doc.line(safe);
      const above = view.state.doc.line(Math.max(1, safe - 1));
      // Two effects in one transaction: move caret to one line above the
      // target (so the target heading isn't the "active line" in Live mode),
      // and force-scroll the target line to the top of the viewport with a
      // yMargin equal to the requested offsetPx.
      view.dispatch({
        selection: { anchor: above.from },
        effects: view.constructor.scrollIntoView(info.from, {
          y: 'start',
          yMargin: args.offsetPx,
        }),
        userEvent: 'select.smoke',
      });
    },
    { line, offsetPx },
  );
  await page.waitForTimeout(280);
  // One refinement pass in case CM's first scrollIntoView missed by a few px
  // due to widget heights settling after layout.
  await page.evaluate(
    (args: { line: number; offsetPx: number }) => {
      const root = document.querySelector('.cm-editor') as HTMLElement | null;
      const content = root?.querySelector('.cm-content') as HTMLElement | null;
      type ViewLike = {
        state: { doc: { line: (n: number) => { from: number } } };
        coordsAtPos: (pos: number) => { top: number } | null;
        scrollDOM: {
          scrollTop: number;
          scrollHeight: number;
          clientHeight: number;
          getBoundingClientRect: () => DOMRect;
        };
        requestMeasure?: () => void;
      };
      const tile = (content ?? root) as unknown as { cmTile?: { root?: { view?: ViewLike } } };
      const view = tile.cmTile?.root?.view;
      if (!view) return;
      const info = view.state.doc.line(args.line);
      const c = view.coordsAtPos(info.from);
      if (!c) return;
      const sd = view.scrollDOM;
      const r = sd.getBoundingClientRect();
      const d = c.top - r.top - args.offsetPx;
      if (Math.abs(d) < 4) return;
      sd.scrollTop = Math.max(0, Math.min(sd.scrollTop + d, sd.scrollHeight - sd.clientHeight));
      view.requestMeasure?.();
    },
    { line, offsetPx },
  );
  await page.waitForTimeout(140);
}

/** Best-effort wrapper that logs and continues if a section can't be located. */
async function captureSection(
  page: Page,
  needle: string,
  shotName: string,
  offsetPx = 60,
): Promise<void> {
  const line = await findLine(page, needle);
  if (line === 0) {
    // eslint-disable-next-line no-console
    console.warn(`[smoke] could not find line containing "${needle}" — capturing whatever is in view for ${shotName}`);
  } else {
    await parkLineAtTop(page, line, offsetPx);
  }
  await snap(page, shotName);
}

test.describe('v0.2 smoke screenshots', () => {
  test('capture all 23 reference shots', async () => {
    test.setTimeout(240_000);

    // Copy the fixture into tmpdir so the path-guard's DURUMI_E2E=1 tmpdir
    // bypass accepts it (matches the pattern used by round-trip.spec.ts).
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'durumi-smoke-'));
    const mdPath = path.join(tmpDir, 'v0.2-smoke-test.md');
    fs.copyFileSync(FIXTURE_SRC, mdPath);
    fs.mkdirSync(SHOT_DIR, { recursive: true });

    const { app, page } = await launch();
    try {
      await openFixture(app, page, mdPath);

      // ---- Base mode triplet (caret at top) ----

      await setWysiwygMode(app, page);
      await scrollToTop(page);
      await snap(page, '01-document-mode-top.png');

      await setTyporaMode(app, page);
      await scrollToTop(page);
      await snap(page, '02-live-mode-top.png');

      await setMarkdownMode(app, page);
      await scrollToTop(page);
      await snap(page, '03-source-mode-top.png');

      // ---- Document-mode parity contrast (Section A) ----

      const memoLine = await findLine(page, 'reviewer note: this is a memo');
      const cmLine = await findLine(page, '{++inserted++}');

      await setWysiwygMode(app, page);
      if (memoLine > 0) {
        await caretToLine(page, memoLine);
        await scrollCaretIntoView(page);
      }
      await snap(page, '04-document-memo-active.png');

      await setTyporaMode(app, page);
      if (memoLine > 0) {
        await caretToLine(page, memoLine);
        await scrollCaretIntoView(page);
      }
      await snap(page, '05-live-memo-active.png');

      await setWysiwygMode(app, page);
      if (cmLine > 0) {
        await caretToLine(page, cmLine);
        await scrollCaretIntoView(page);
      }
      await snap(page, '06-document-cm-active.png');

      await setTyporaMode(app, page);
      if (cmLine > 0) {
        await caretToLine(page, cmLine);
        await scrollCaretIntoView(page);
      }
      await snap(page, '07-live-cm-active.png');

      // ---- Live-preview parity (Section B) ----

      await setWysiwygMode(app, page);
      const inlineMarksLine = await findLine(page, 'highlighted text');
      if (inlineMarksLine > 0) {
        // Place caret OFF the line so highlight/sub/sup decorations render.
        await caretToLine(page, Math.max(1, inlineMarksLine - 1));
        await scrollCaretIntoView(page);
      }
      await snap(page, '08-document-highlights-subsup.png');

      // Scroll so the 5 alert callouts are all visible together.
      const noteAlertLine = await findLine(page, '[!NOTE]');
      if (noteAlertLine > 0) {
        // Park caret well above the alerts so none of them is the active line.
        await caretToLine(page, Math.max(1, noteAlertLine - 2));
        // Scroll so the NOTE alert sits near the top of the viewport, giving
        // room below for TIP/IMPORTANT/WARNING/CAUTION to all be in frame.
        await page.evaluate((line: number) => {
          const root = document.querySelector('.cm-editor') as HTMLElement | null;
          const content = root?.querySelector('.cm-content') as HTMLElement | null;
          type ViewLike = {
            state: { doc: { line: (n: number) => { from: number } } };
            coordsAtPos: (pos: number) => { top: number } | null;
            scrollDOM: { scrollTop: number; getBoundingClientRect: () => DOMRect };
          };
          const tile = (content ?? root) as unknown as { cmTile?: { root?: { view?: ViewLike } } };
          const view = tile.cmTile?.root?.view;
          if (!view) return;
          const info = view.state.doc.line(line);
          const c = view.coordsAtPos(info.from);
          if (!c) return;
          const sd = view.scrollDOM;
          const r = sd.getBoundingClientRect();
          // Move the NOTE line ~80px below the top — header label sits above it.
          const drift = c.top - r.top - 80;
          sd.scrollTop = Math.max(0, sd.scrollTop + drift);
        }, noteAlertLine);
        await page.waitForTimeout(150);
      }
      await snap(page, '09-document-alerts-all-five.png');

      // Nested blockquote — `> > [!NOTE]` should NOT be styled as an alert.
      const nestedLine = await findLine(page, 'This is a nested blockquote');
      if (nestedLine > 0) {
        await caretToLine(page, Math.max(1, nestedLine - 2));
        await scrollCaretIntoView(page);
      }
      await snap(page, '10-document-nested-blockquote.png');

      // ---- Round-trip section visual (Section C) ----

      const tableLine = await findLine(page, 'Center');
      if (tableLine > 0) {
        // Park caret well off the table so the cell render mode is active.
        await caretToLine(page, Math.max(1, tableLine - 3));
        await page.evaluate((line: number) => {
          const root = document.querySelector('.cm-editor') as HTMLElement | null;
          const content = root?.querySelector('.cm-content') as HTMLElement | null;
          type ViewLike = {
            state: { doc: { line: (n: number) => { from: number } } };
            coordsAtPos: (pos: number) => { top: number } | null;
            scrollDOM: { scrollTop: number; getBoundingClientRect: () => DOMRect };
          };
          const tile = (content ?? root) as unknown as { cmTile?: { root?: { view?: ViewLike } } };
          const view = tile.cmTile?.root?.view;
          if (!view) return;
          const info = view.state.doc.line(line);
          const c = view.coordsAtPos(info.from);
          if (!c) return;
          const sd = view.scrollDOM;
          const r = sd.getBoundingClientRect();
          // Park the table heading line ~40px from the top so table + math +
          // mermaid all fit in one shot.
          const drift = c.top - r.top - 40;
          sd.scrollTop = Math.max(0, sd.scrollTop + drift);
        }, tableLine);
        await page.waitForTimeout(200);
      }
      await snap(page, '11-document-table-math-mermaid.png');

      // ---- Mode-switch preservation (Section E) ----

      // Find a representative "Paragraph N" line in Section E (around N≈40 to
      // be roughly mid-section).
      const sectionELine = await findLine(page, 'Paragraph 40:');
      if (sectionELine > 0) {
        await caretToLine(page, sectionELine);
        await scrollCaretIntoView(page);
      }
      await snap(page, '12-pre-switch-line50.png');

      // 4 mode flips: Document -> Live -> Source -> Document -> Document.
      // (The trailing "Document" is technically a no-op flip but matches the
      // user-facing checklist phrasing.)
      await setTyporaMode(app, page);
      await setMarkdownMode(app, page);
      await setWysiwygMode(app, page);
      await setWysiwygMode(app, page);
      await page.waitForTimeout(200);
      await snap(page, '13-post-4-switches-line50.png');

      // ---- v0.2.12 expansion (Sections F–N) ----
      // Each capture: ensure Document mode, scroll the section header to ~60px
      // from the top so the section body fills the rest of the viewport, then
      // snap. captureSection() logs and continues if the heading can't be
      // located so a single missing section doesn't abort the whole run.

      // 14 — Section F: heading levels (H1–H6 + Setext)
      await setWysiwygMode(app, page);
      await captureSection(page, 'Section F — Heading levels', '14-document-headings-h1-h6.png', 40);

      // 15 — Section G: task list states + nesting
      await setWysiwygMode(app, page);
      await captureSection(page, 'Task list states', '15-document-task-list-states.png', 40);

      // 16 — Section H: link variants
      await setWysiwygMode(app, page);
      await captureSection(page, 'Section H — Links variants', '16-document-links-variants.png', 40);

      // 17 — Section I: code variants (inline + fenced + indented + overflow)
      await setWysiwygMode(app, page);
      await captureSection(page, 'Section I — Code variants', '17-document-code-variants.png', 40);

      // 18 — Section J: all five citation variants
      await setWysiwygMode(app, page);
      await captureSection(page, 'Section J — Citation variants', '18-document-citations-all.png', 40);

      // 19 — Section K: footnote refs + multi-line def + orphan
      await setWysiwygMode(app, page);
      await captureSection(page, 'Section K — Footnote', '19-document-footnote-variants.png', 40);

      // 20 — Section L: math variants (inline + block + special chars + bad)
      await setWysiwygMode(app, page);
      await captureSection(page, 'Section L — Math variants', '20-document-math-variants.png', 40);

      // 21 — Section M: edge cases (empty containers, adjacent marks)
      await setWysiwygMode(app, page);
      await captureSection(page, 'Section M — Edge cases', '21-document-edge-cases.png', 40);

      // 22 — Section M edge cases in Source mode (verify raw markdown survives)
      await setMarkdownMode(app, page);
      await captureSection(page, 'Section M — Edge cases', '22-source-mode-edge-cases.png', 40);

      // 23 — Section G task list in Live mode (active line widget vs off-line)
      await setTyporaMode(app, page);
      await captureSection(page, 'Task list states', '23-live-mode-task-list.png', 40);
    } finally {
      await shutdown(app);
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  });
});

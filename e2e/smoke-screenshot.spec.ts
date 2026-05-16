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

  /**
   * v0.2.15 expansion — sidebar/dialog UI captures that the editor-content
   * focused #01–23 set missed. Each capture drives the app into a known UI
   * state (tab switch, dialog open, theme toggle, etc.), screenshots it,
   * and where necessary returns to the baseline (Outline tab + Settings
   * closed + Light theme) before the next capture so subsequent shots are
   * not contaminated by leftover UI state.
   *
   * Skipping policy: if a UI affordance turns out not to exist or requires
   * external state (AI provider key, BibTeX file) that the e2e environment
   * does not seed, the capture either falls back to the most representative
   * adjacent state (e.g. AI tab while the palette is closed) or is skipped
   * with a console.warn so the orchestrator can spot the gap.
   */
  test('capture sidebar + dialog UI shots', async () => {
    test.setTimeout(180_000);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'durumi-smoke-ui-'));
    const mdPath = path.join(tmpDir, 'v0.2-smoke-test.md');
    fs.copyFileSync(FIXTURE_SRC, mdPath);
    fs.mkdirSync(SHOT_DIR, { recursive: true });

    const { app, page } = await launch();
    try {
      await openFixture(app, page, mdPath);
      // Start every capture from Document mode + scrolled to top so each
      // shot's editor-area baseline matches #01.
      await setWysiwygMode(app, page);
      await scrollToTop(page);

      // ---- 24 — Memo panel: focus a specific card (the v0.2 fixture's
      // "reviewer note: this is a memo" item) so the card pulses and the
      // memo panel's selection-driven UI is visible. We click in the editor
      // on the memo's line — useMemoCaretFocus then marks the corresponding
      // card as focused (pulse class, smooth-scrolled into view).
      const reviewerMemoLine = await findLine(page, 'reviewer note: this is a memo');
      if (reviewerMemoLine > 0) {
        await caretToLine(page, reviewerMemoLine);
        await scrollCaretIntoView(page);
        // Give the caret-focus hook a tick to mark the matching card.
        await page.waitForTimeout(300);
        // Also click directly on the memo card DOM (data-memo-from) so its
        // textarea takes focus and the card chrome is clearly emphasised.
        try {
          const cardHandle = await page.$('.cm-memo-card');
          if (cardHandle) await cardHandle.click({ position: { x: 80, y: 20 } });
        } catch {
          /* card may not be clickable if the panel is scrolled — best effort */
        }
        await page.waitForTimeout(200);
      } else {
        // eslint-disable-next-line no-console
        console.warn('[smoke] could not locate reviewer-note memo line for shot 24');
      }
      await snap(page, '24-memo-panel-detail.png');

      // ---- 25 — Right sidebar References tab (empty-state: no .bib loaded
      // in the e2e env). The right sidebar defaults to hidden so we use the
      // showReferences menu command to both reveal it AND activate the
      // References tab in one shot. The tab body renders the
      // "no bibliography file" empty UI.
      await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        w?.webContents.send('menu:command', 'showReferences');
      });
      await page
        .waitForSelector('[data-testid="right-sidebar-tab-references"]', { timeout: 4000 })
        .catch(() => undefined);
      await page.waitForTimeout(300);
      await snap(page, '25-right-sidebar-references-tab.png');

      // ---- 26 — Right sidebar AI tab (provider-not-configured state in
      // e2e env — the panel renders commands disabled). The AI palette
      // proper is shot in #27 separately.
      await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        w?.webContents.send('menu:command', 'showAi');
      });
      await page
        .waitForSelector('[data-testid="right-sidebar-tab-ai"]', { timeout: 4000 })
        .catch(() => undefined);
      await page.waitForTimeout(300);
      await snap(page, '26-right-sidebar-ai-tab.png');

      // ---- 27 — AI command palette overlay.
      //
      // v0.2.16 closed the preload-contract gap that previously stopped the
      // palette from mounting: `window.api.aiHasKey()` now exists, so the
      // menu IPC `openAiPalette` reliably mounts the `<AiCommandPalette>`
      // overlay. The e2e env still has no provider key configured, which is
      // the expected production path for first-run users — the palette
      // therefore renders in the `ai-palette-no-key` empty state. That
      // empty state is the meaningful capture: it shows users the exact
      // copy + framing they'll see before configuring a key.
      await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        w?.webContents.send('menu:command', 'openAiPalette');
      });
      const paletteAppeared = await page
        .waitForSelector('[data-testid="ai-palette"]', { timeout: 2000 })
        .then(() => true)
        .catch(() => false);
      if (!paletteAppeared) {
        // eslint-disable-next-line no-console
        console.warn(
          '[smoke] AI palette did not mount — capturing whatever framing is on screen for shot 27',
        );
      }
      await snap(page, '27-ai-command-palette-open.png');
      // Close the palette before moving on.
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      // ---- 28 — Left sidebar Search tab. The tab auto-focuses the search
      // input on mount; we type a couple of letters so the empty-results vs
      // populated-results UI is visible. The workspace is unset in the e2e
      // env so hits will be 0 — still a real capture of the search chrome.
      await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        w?.webContents.send('menu:command', 'showSearch');
      });
      await page.waitForTimeout(200);
      const searchInput = await page.$('.cm-search-input');
      if (searchInput) {
        await searchInput.fill('memo');
        // Let the 250ms debounce + result render settle.
        await page.waitForTimeout(500);
      }
      await snap(page, '28-search-tab.png');

      // ---- 29 — Left sidebar Outline tab. The fixture has H1–H6 in
      // Section F so the outline tree is visually rich. Switch back to the
      // outline tab via the menu command for parity with how a user gets
      // there.
      await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        w?.webContents.send('menu:command', 'showOutline');
      });
      await page.waitForTimeout(250);
      await snap(page, '29-outline-tab-with-headings.png');

      // ---- 30 — Settings dialog. Dispatched via the openSettings menu
      // command; the dialog is React.lazy so we wait for the dialog node.
      await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        w?.webContents.send('menu:command', 'openSettings');
      });
      await page
        .waitForSelector('[data-testid="settings-dialog"]', { timeout: 4000 })
        .catch(() => undefined);
      // Give styles + lazy-loaded section subcomponents time to layout.
      await page.waitForTimeout(500);
      await snap(page, '30-settings-dialog.png');
      // Close before the theme toggle so the next capture isn't the dialog.
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      // ---- 31 — Dark theme. The `toggleTheme` menu command flips light
      // ↔ dark based on the *currently resolved* theme. On a test machine
      // whose system theme is already dark, the resolved theme is dark on
      // launch (themePreference 'system'), so a single toggle would flip
      // to light and #31 would NOT be a dark capture. Check the current
      // `<html data-theme>` attribute first and only toggle if we need to.
      const beforeTheme = await page.evaluate(() =>
        document.documentElement.getAttribute('data-theme'),
      );
      if (beforeTheme !== 'dark') {
        await app.evaluate(({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows()[0];
          w?.webContents.send('menu:command', 'toggleTheme');
        });
        // Theme cascade + CodeMirror re-decoration take a moment.
        await page.waitForTimeout(500);
      }
      await snap(page, '31-dark-theme.png');
      // Restore the original theme for cleanliness so the temp userData
      // dir doesn't leak a sticky preference back into the orchestrator.
      const afterTheme = await page.evaluate(() =>
        document.documentElement.getAttribute('data-theme'),
      );
      if (afterTheme !== beforeTheme) {
        await app.evaluate(({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows()[0];
          w?.webContents.send('menu:command', 'toggleTheme');
        });
        await page.waitForTimeout(200);
      }
    } finally {
      await shutdown(app);
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  });

  /**
   * v0.2.17 — deeper interaction scenarios (smoke v4 expansion, shots #32+).
   *
   * What this block adds over #01–31:
   *  - Explicit Light vs Dark theme captures driven through the Settings
   *    dialog's RadioGroup (not the toggleTheme menu command, which depends
   *    on the resolved system theme — #31 may have been inconclusive on a
   *    machine whose system theme is already dark).
   *  - Table editing surface (v0.2.4–v0.2.7): cell focus mid-edit, cell
   *    blurred back to render mode, the hover overlay with +row/+col
   *    controls, and the table-style popover preset picker.
   *  - Memo panel reply composer + hide-resolved toggle (multi-memo path).
   *  - Workspace folder open (programmatic via prefsSet + reload to skip
   *    the OS picker dialog) so the file tree shows real entries, plus a
   *    right-click context menu shot.
   *  - Crossref search empty state in the right-sidebar References tab.
   *
   * Each capture restores enough state for the next shot to start from
   * a known baseline (Document mode, scrolled appropriately, dialogs/
   * popovers closed). Where an affordance is hard to drive deterministically
   * we log and snap whatever is on-screen so the orchestrator still gets
   * a frame to triage.
   */
  test('capture deeper interaction scenarios', async () => {
    test.setTimeout(240_000);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'durumi-smoke-v4-'));
    const mdPath = path.join(tmpDir, 'v0.2-smoke-test.md');
    fs.copyFileSync(FIXTURE_SRC, mdPath);
    fs.mkdirSync(SHOT_DIR, { recursive: true });

    // Workspace folder for shots #40-41 — seeded with a few markdown files
    // so the file tree has visible entries (the e2e launch otherwise opens
    // with no workspace folder).
    const wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'durumi-smoke-v4-ws-'));
    fs.writeFileSync(path.join(wsDir, 'alpha.md'), '# alpha\n\nBody A\n');
    fs.writeFileSync(path.join(wsDir, 'beta.md'), '# beta\n\nBody B\n');
    fs.writeFileSync(path.join(wsDir, 'notes.md'), '# notes\n\nBody C\n');
    fs.mkdirSync(path.join(wsDir, 'subdir'));
    fs.writeFileSync(path.join(wsDir, 'subdir', 'inner.md'), '# inner\n\nNested\n');

    /**
     * Open the Settings dialog, select a theme radio (Light/Dark/System),
     * close the dialog, then wait for the `data-theme` attribute on <html>
     * to actually reflect the new value. Using the dialog (not the
     * toggleTheme menu command) makes the capture deterministic regardless
     * of system theme.
     */
    async function setThemeViaSettings(
      app: ElectronApplication,
      page: Page,
      theme: 'light' | 'dark' | 'system',
    ): Promise<void> {
      await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        w?.webContents.send('menu:command', 'openSettings');
      });
      await page
        .waitForSelector('[data-testid="settings-dialog"]', { timeout: 4000 })
        .catch(() => undefined);
      await page.waitForTimeout(200);
      const radio = page.locator(`[data-testid="settings-theme-${theme}"]`).first();
      const visible = await radio
        .isVisible({ timeout: 2000 })
        .catch(() => false);
      if (visible) {
        await radio.check({ force: true });
      } else {
        // eslint-disable-next-line no-console
        console.warn(`[smoke] settings-theme-${theme} radio not visible — capturing as-is`);
      }
      // Close the dialog so the editor area is on screen for the capture.
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-testid="settings-dialog"]', {
        state: 'detached',
        timeout: 2000,
      }).catch(() => undefined);
      // Let the theme cascade through.
      await page.waitForTimeout(400);
    }

    const { app, page } = await launch();
    try {
      await openFixture(app, page, mdPath);
      await setWysiwygMode(app, page);
      await scrollToTop(page);

      // ---- 32 — Light theme explicitly set via Settings (independent of
      // system theme; differs from #01 which inherits whatever resolved
      // theme the launch picked up). Compare against #33 to verify the
      // theme switch actually re-paints.
      await setThemeViaSettings(app, page, 'light');
      await scrollToTop(page);
      await snap(page, '32-light-theme-explicit.png');

      // ---- 33 — Dark theme explicitly set via Settings. Unlike #31
      // (which used the toggleTheme menu and may have been a no-op on
      // dark-system test machines), this radio-set path forces dark.
      await setThemeViaSettings(app, page, 'dark');
      await scrollToTop(page);
      await snap(page, '33-dark-theme-explicit.png');

      // Restore light theme for the remaining shots so the orchestrator
      // can compare them visually against the existing light-mode #01-31.
      await setThemeViaSettings(app, page, 'light');

      // ---- 34 — Table cell focused (mid-edit). The Section C fixture
      // table is on lines 47-50. We park it near the top, then click the
      // first body cell so the contentEditable cell takes focus and the
      // cell-edit visual state (per invariant #12) is on screen.
      await setWysiwygMode(app, page);
      const tableLine34 = await findLine(page, 'Center');
      if (tableLine34 > 0) {
        await parkLineAtTop(page, tableLine34, 80);
      }
      const cellFocus = await page
        .$('.cm-table-row-body .cm-table-cell[contenteditable="true"]');
      if (cellFocus) {
        try {
          await cellFocus.click();
          // Settle the focus ring + any toolbar.
          await page.waitForTimeout(250);
        } catch {
          /* fall through — capture whatever's visible */
        }
      } else {
        // eslint-disable-next-line no-console
        console.warn('[smoke] could not find table body cell for shot 34');
      }
      await snap(page, '34-table-cell-focused.png');

      // ---- 35 — Table cell blurred (back to render mode). Click the
      // editor body well below the table to drop the cell's contentEditable
      // focus, then snap. Should show the rendered (non-edit) appearance.
      await page.locator('.cm-content').click({ position: { x: 10, y: 350 } });
      await page.waitForTimeout(200);
      // Re-park the table near the top in case the click scrolled us.
      if (tableLine34 > 0) {
        await parkLineAtTop(page, tableLine34, 80);
      }
      await snap(page, '35-table-cell-blurred.png');

      // ---- 36 — Table hover toolbar (v0.2.5 floating action overlay).
      // Hover a body cell to surface the +row/+col/delete buttons. The
      // overlay testids are `table-action-row-below`, `-row-above`,
      // `-col-left`, `-col-right`, `-row-delete`, `-col-delete`.
      if (tableLine34 > 0) {
        await parkLineAtTop(page, tableLine34, 80);
      }
      const hoverCell = page
        .locator('.cm-table-row-body .cm-table-cell[contenteditable="true"]')
        .first();
      const hoverVisible = await hoverCell
        .isVisible({ timeout: 1500 })
        .catch(() => false);
      if (hoverVisible) {
        await hoverCell.hover();
        await page
          .waitForSelector('[data-testid="table-action-row-below"]', { timeout: 2000 })
          .catch(() => {
            // eslint-disable-next-line no-console
            console.warn('[smoke] table action overlay did not appear for shot 36');
          });
        await page.waitForTimeout(200);
      }
      await snap(page, '36-table-hover-toolbar.png');
      // Move the mouse away so the overlay clears before the next shot.
      await page.mouse.move(0, 0);
      await page.waitForTimeout(150);

      // ---- 37 — Table style popover (v0.2.6 preset picker). The gear
      // icon lives on the header row; click it to surface the popover.
      if (tableLine34 > 0) {
        await parkLineAtTop(page, tableLine34, 80);
      }
      // Hover the header row to make the gear discoverable.
      const headerCell = page
        .locator('.cm-table-row-header .cm-table-cell')
        .first();
      const headerVisible = await headerCell
        .isVisible({ timeout: 1500 })
        .catch(() => false);
      if (headerVisible) {
        await headerCell.hover();
      }
      const gear = page.locator('[data-testid="table-style-gear"]').first();
      const gearVisible = await gear
        .isVisible({ timeout: 1500 })
        .catch(() => false);
      if (gearVisible) {
        await gear.click({ force: true });
        await page
          .waitForSelector('[data-testid="table-style-popover"]', { timeout: 2000 })
          .catch(() => {
            // eslint-disable-next-line no-console
            console.warn('[smoke] table-style-popover did not open for shot 37');
          });
        await page.waitForTimeout(200);
      } else {
        // eslint-disable-next-line no-console
        console.warn('[smoke] table-style-gear not visible for shot 37 — snapping fallback');
      }
      await snap(page, '37-table-style-popover.png');
      // Close the popover via Escape before subsequent shots.
      await page.keyboard.press('Escape');
      await page
        .waitForSelector('[data-testid="table-style-popover"]', {
          state: 'detached',
          timeout: 2000,
        })
        .catch(() => undefined);

      // ---- 38 — Memo reply input. Open the Memos panel, click the
      // first visible memo card's "Reply" button to open the composer,
      // then focus the textarea so the capture shows the input ready
      // for typing. Avoid moving the caret beforehand — the memo cards
      // get repositioned in absolute layout when the active line changes,
      // which can race with the button click.
      await scrollToTop(page);
      await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        w?.webContents.send('menu:command', 'showMemos');
      });
      await page
        .waitForSelector('[data-testid="memo-card-reply-open"]', { timeout: 4000 })
        .catch(() => undefined);
      await page.waitForTimeout(400);
      // Use the LAST reply-open button (the lower one is less likely to
      // be clipped if the panel's absolute layout pushes the first one
      // above the visible area). Both belong to legitimate memo cards.
      const replyOpen = page.locator('[data-testid="memo-card-reply-open"]').last();
      const replyOpenCount = await page
        .locator('[data-testid="memo-card-reply-open"]')
        .count();
      if (replyOpenCount > 0) {
        // scrollIntoViewIfNeeded so the absolute-positioned card is in
        // the visible viewport before clicking.
        await replyOpen.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => undefined);
        await replyOpen.click({ force: true }).catch(() => undefined);
        await page
          .waitForSelector('[data-testid="memo-card-reply-input"]', { timeout: 2000 })
          .catch(() => undefined);
        const replyInput = page.locator('[data-testid="memo-card-reply-input"]').last();
        const inputVisible = await replyInput
          .isVisible({ timeout: 1500 })
          .catch(() => false);
        if (inputVisible) {
          await replyInput.click({ force: true }).catch(() => undefined);
          await page.keyboard.type('Thanks for the note.', { delay: 5 });
          await page.waitForTimeout(150);
        } else {
          // eslint-disable-next-line no-console
          console.warn('[smoke] memo-card-reply-input not visible after open for shot 38');
        }
      } else {
        // eslint-disable-next-line no-console
        console.warn('[smoke] no memo-card-reply-open found for shot 38');
      }
      await snap(page, '38-memo-reply-input.png');

      // ---- 39 — Memo "Hide resolved" toggle in the panel header.
      // The fixture has a couple of memos; mark the first one resolved
      // via its checkbox, then capture the panel state showing the
      // resolved styling (strikethrough + lower opacity) on that card.
      const resolvedCheckbox = page
        .locator('[data-testid="memo-card-resolved"]')
        .first();
      const resolvedVisible = await resolvedCheckbox
        .isVisible({ timeout: 1500 })
        .catch(() => false);
      if (resolvedVisible) {
        await resolvedCheckbox.check({ force: true }).catch(() => undefined);
        // Toggle hide-resolved OFF so the resolved card is still visible
        // in the capture (default is hidden).
        const hideResolved = page
          .locator('[data-testid="memo-panel-hide-resolved"]')
          .first();
        const hrVisible = await hideResolved
          .isVisible({ timeout: 1000 })
          .catch(() => false);
        if (hrVisible) {
          await hideResolved.uncheck({ force: true }).catch(() => undefined);
        }
        await page.waitForTimeout(250);
      } else {
        // eslint-disable-next-line no-console
        console.warn('[smoke] memo-card-resolved checkbox not visible for shot 39');
      }
      await snap(page, '39-memo-resolved-toggle.png');

      // ---- 40 — File tree with a real workspace folder. We seed the
      // folder list via prefsSet + reload (same pattern as
      // workspaces.spec.ts) because window.api.dialogOpenFolder would
      // otherwise spawn an OS picker the e2e harness can't drive. The
      // path-guard accepts tmpdir paths under DURUMI_E2E=1.
      await page.evaluate(async (wsPath: string) => {
        const api = (window as unknown as {
          api: {
            prefsSet: (x: {
              workspaceFolders: string[];
              sidebar?: { visible: boolean; activeTab: 'files'; width: number };
            }) => Promise<void>;
          };
        }).api;
        await api.prefsSet({
          workspaceFolders: [wsPath],
          sidebar: { visible: true, activeTab: 'files', width: 315 },
        });
      }, wsDir);
      await page.reload();
      await page.waitForSelector('.cm-content', { timeout: 5000 });
      // Re-open the fixture (reload reset the open document).
      await openFixture(app, page, mdPath);
      await setWysiwygMode(app, page);
      await page
        .waitForSelector('.cm-tree-root-label', { timeout: 5000 })
        .catch(() => {
          // eslint-disable-next-line no-console
          console.warn('[smoke] cm-tree-root-label not visible for shot 40');
        });
      await page.waitForTimeout(300);
      await snap(page, '40-file-tree-with-folder.png');

      // ---- 41 — File tree context menu. Right-click the first file row
      // to surface the rename/delete/etc context menu (testid
      // `cm-context-menu`).
      const fileRow = page.locator('.cm-tree-row-file').first();
      const fileRowVisible = await fileRow
        .isVisible({ timeout: 1500 })
        .catch(() => false);
      if (fileRowVisible) {
        await fileRow.click({ button: 'right' }).catch(() => undefined);
        await page
          .waitForSelector('[data-testid="cm-context-menu"]', { timeout: 2000 })
          .catch(() => {
            // eslint-disable-next-line no-console
            console.warn('[smoke] cm-context-menu did not appear for shot 41');
          });
        await page.waitForTimeout(200);
      } else {
        // eslint-disable-next-line no-console
        console.warn('[smoke] no file row visible for shot 41');
      }
      await snap(page, '41-file-tree-context-menu.png');
      // Dismiss the context menu.
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);

      // ---- 42 — Crossref search with a query typed. Open the right
      // sidebar References tab, type a couple of letters into the search
      // input — depending on network connectivity in the e2e env this
      // will land on either the offline badge, the empty-results state,
      // or the loading spinner. All three are useful captures of the
      // search chrome that #25 (which had no query typed) missed.
      await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        w?.webContents.send('menu:command', 'showReferences');
      });
      await page
        .waitForSelector('[data-testid="references-search-input"]', { timeout: 4000 })
        .catch(() => undefined);
      const searchInput = page.locator('[data-testid="references-search-input"]').first();
      const searchInputVisible = await searchInput
        .isVisible({ timeout: 1500 })
        .catch(() => false);
      if (searchInputVisible) {
        // The input is disabled when offline; in that case typing is a no-op
        // but the capture still shows the offline UI.
        const disabled = await searchInput.getAttribute('disabled').catch(() => null);
        if (disabled === null) {
          await searchInput.fill('CRISPR systematic review');
          // Let the debounced search hit either loading or results state.
          await page.waitForTimeout(900);
        }
      } else {
        // eslint-disable-next-line no-console
        console.warn('[smoke] references-search-input not visible for shot 42');
      }
      await snap(page, '42-crossref-search-empty.png');
    } finally {
      await shutdown(app);
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
      try {
        fs.rmSync(wsDir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  });
});

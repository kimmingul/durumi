import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import { setMarkdownMode, setTyporaMode, setWysiwygMode } from './_helpers';

const APP_ENTRY = path.resolve(process.cwd(), 'out', 'main', 'main.cjs');

async function launch() {
  const app = await electron.launch({ args: [APP_ENTRY] });
  const page = await app.firstWindow();
  await page.waitForSelector('.cm-content');
  return { app, page };
}

async function shutdown(app: ElectronApplication) {
  await app.evaluate(({ app: a }) => a.exit(0));
}

type Mode = 'wysiwyg' | 'typora' | 'markdown';

async function setMode(app: ElectronApplication, page: Page, mode: Mode): Promise<void> {
  if (mode === 'wysiwyg') return setWysiwygMode(app, page);
  if (mode === 'typora') return setTyporaMode(app, page);
  return setMarkdownMode(app, page);
}

/**
 * Seed the editor doc + place caret at `anchor`. Bypasses the wysiwyg
 * escape filter by going through `view.dispatch` directly — we need
 * verbatim markdown text in the buffer regardless of mode.
 */
async function seed(page: Page, doc: string, anchor: number): Promise<void> {
  await page.evaluate(
    ({ markdown, a }) => {
      const root = document.querySelector('.cm-editor') as HTMLElement | null;
      if (!root) return;
      const content = root.querySelector('.cm-content') as HTMLElement | null;
      type ViewSeed = {
        state: { doc: { length: number } };
        dispatch: (s: unknown) => void;
        focus: () => void;
      };
      const tile = (content ?? root) as unknown as { cmTile?: { root?: { view?: ViewSeed } } };
      const view = tile.cmTile?.root?.view;
      if (!view) return;
      view.focus();
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: markdown },
        userEvent: 'input.testReset',
      });
      // Set the selection in a SEPARATE dispatch so it survives any
      // decoration-rebuild reordering that the change transaction triggers.
      view.dispatch({ selection: { anchor: a }, userEvent: 'select.test' });
    },
    { markdown: doc, a: anchor },
  );
  await page.waitForTimeout(120);
}

/**
 * Insert a syllable at the editor's CURRENT selection by dispatching
 * directly through the EditorView. `page.keyboard.insertText` routes via
 * the DOM `beforeinput` path which CodeMirror may map back to a different
 * doc position when WYSIWYG marker hiding (Decoration.replace) breaks the
 * one-to-one character map between rendered DOM and document offsets.
 *
 * This direct-dispatch path is what every committed Hangul syllable
 * eventually lands as inside CM (see `EditorView.contentDOM` → input
 * read → `view.dispatch({ changes })`), so it exercises the same final
 * code path the IME would. It's the "weaker substitute" called out in
 * the task spec for headless Electron.
 */
async function imeComposeAtSelection(page: Page, syllable: string): Promise<void> {
  await page.evaluate(
    (s) => {
      const root = document.querySelector('.cm-editor') as HTMLElement | null;
      if (!root) return;
      const content = root.querySelector('.cm-content') as HTMLElement | null;
      type ViewLike = {
        state: { selection: { main: { head: number; anchor: number } } };
        dispatch: (s: unknown) => void;
      };
      const tile = (content ?? root) as unknown as { cmTile?: { root?: { view?: ViewLike } } };
      const view = tile.cmTile?.root?.view;
      if (!view) return;
      const head = view.state.selection.main.head;
      const anchor = view.state.selection.main.anchor;
      const from = Math.min(head, anchor);
      const to = Math.max(head, anchor);
      view.dispatch({
        changes: { from, to, insert: s },
        selection: { anchor: from + s.length },
        userEvent: 'input.type',
      });
    },
    syllable,
  );
  await page.waitForTimeout(40);
}

async function readDoc(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const root = document.querySelector('.cm-editor') as HTMLElement | null;
    if (!root) return '';
    const content = root.querySelector('.cm-content') as HTMLElement | null;
    type ViewLike = { state: { doc: { toString(): string } } };
    const tile = (content ?? root) as unknown as { cmTile?: { root?: { view?: ViewLike } } };
    return tile.cmTile?.root?.view?.state.doc.toString() ?? '';
  });
}

/**
 * Drive a Korean syllable into the editor at the seeded caret. We use
 * direct EditorView dispatch because in headless Electron there is no OS
 * IME and `keyboard.insertText` routes through the DOM's `beforeinput`
 * path which can map back to a different doc offset when WYSIWYG marker
 * hiding (`Decoration.replace`) breaks the rendered-DOM ↔ doc-offset
 * one-to-one map. This is the "weaker substitute" called out in the task
 * spec — it exercises the same final code path every committed Hangul
 * syllable hits inside CM6 in production. Table cells (which run their
 * own contentEditable + native composition handlers) take a separate
 * keyboard-typing path below.
 */
async function imeCompose(page: Page, syllable: string): Promise<void> {
  return imeComposeAtSelection(page, syllable);
}

interface Construct {
  /** Short id used in the test title. */
  id: string;
  /** Full doc text seeded into the editor. */
  doc: string;
  /** Caret offset placed mid-construct (between markers). */
  caret: number;
  /** Substring that must appear in the doc after composition (the syllable inserted at caret). */
  expected: (syllable: string) => string;
  /**
   * Optional locator the test can probe to check the construct's decoration
   * survived. `null` means we skip that probe (table cells render differently
   * across modes and the focused cell doesn't carry a decoration class).
   */
  decorationSelector: string | null;
}

const SYLLABLE = '가';

const constructs: Construct[] = [
  {
    id: 'bold',
    doc: 'lead **체** tail',
    caret: 'lead **체'.length,
    expected: (s) => `**체${s}**`,
    decorationSelector: '.cm-md-bold',
  },
  {
    id: 'italic',
    doc: 'lead *체* tail',
    caret: 'lead *체'.length,
    expected: (s) => `*체${s}*`,
    decorationSelector: '.cm-md-italic',
  },
  {
    id: 'citation',
    doc: 'pre [@key] post',
    caret: 'pre [@key'.length,
    expected: (s) => `[@key${s}]`,
    decorationSelector: '.cm-md-citation',
  },
  {
    id: 'memo',
    doc: 'lead %% memo body %% tail',
    caret: 'lead %% memo body'.length,
    expected: (s) => `memo body${s} %%`,
    decorationSelector: '.cm-memo-chat-icon, .cm-memo-active',
  },
  {
    id: 'cmInsert',
    doc: 'lead {++ ins ++} tail',
    caret: 'lead {++ ins'.length,
    expected: (s) => `ins${s} ++}`,
    decorationSelector: '.cm-cm-insert',
  },
  {
    id: 'tableCell',
    // Header + separator + body row. Caret aimed at the body cell's `체`
    // so the IME compose lands inside an editable cell.
    doc: '| h1 | h2 |\n|---|---|\n| 체 |  |\n',
    caret: '| h1 | h2 |\n|---|---|\n| 체'.length,
    expected: (s) => `| 체${s} |`,
    decorationSelector: null,
  },
];

const modes: Mode[] = ['wysiwyg', 'typora', 'markdown'];

test.describe('Korean IME composition mid-construct (v0.2.11 matrix)', () => {
  for (const construct of constructs) {
    for (const mode of modes) {
      test(`${construct.id} × ${mode}`, async () => {
        const { app, page } = await launch();
        try {
          await setMode(app, page, mode);
          await seed(page, construct.doc, construct.caret);

          // Table cells in non-Source modes run a separate contentEditable
          // pipeline; we need to focus the actual cell DOM node and use
          // page.keyboard.type so the cell's input/composition listeners
          // fire (mirroring `e2e/table-cell-edit.spec.ts`).
          if (construct.id === 'tableCell' && mode !== 'markdown') {
            const bodyCell = page
              .locator('.cm-table-row-body .cm-table-cell[contenteditable="true"]')
              .first();
            await bodyCell.waitFor({ state: 'visible', timeout: 2000 }).catch(() => undefined);
            const visible = await bodyCell.isVisible().catch(() => false);
            if (visible) {
              await bodyCell.click();
              await page.keyboard.press('End');
              await page.keyboard.type(SYLLABLE);
              await page.waitForTimeout(80);
              // Blur the cell so the syncCell handler flushes the text back
              // into the markdown buffer.
              await page.locator('.cm-content').click({ position: { x: 5, y: 200 } });
              await page.waitForTimeout(80);
            } else {
              await imeCompose(page, SYLLABLE);
            }
          } else {
            await imeCompose(page, SYLLABLE);
          }

          const finalDoc = await readDoc(page);
          // Assert the syllable appears WITHIN the construct, not before/after.
          const wantSubstring = construct.expected(SYLLABLE);
          expect.soft(finalDoc, `${construct.id} × ${mode} — substring`).toContain(wantSubstring);

          // Decoration survival check: the marker class for this construct
          // must still render somewhere in the DOM after composition.
          //
          // Skipped for:
          //  - Source mode (the live decoration set is unloaded by design).
          //  - Live (typora) + citation/cmInsert: invariant #1 reveals raw
          //    source on the active line so the rendered widget is
          //    intentionally absent on the line being edited. Document mode
          //    still renders the decoration uniformly (v0.2.8/v0.2.9 fix),
          //    so we check it there.
          //  - Table cells (mode-dependent sub-active cell pattern).
          const skipDecoSurvival =
            !construct.decorationSelector ||
            mode === 'markdown' ||
            (mode === 'typora' && (construct.id === 'citation' || construct.id === 'cmInsert'));
          if (!skipDecoSurvival && construct.decorationSelector) {
            const hits = await page.locator(construct.decorationSelector).count();
            expect.soft(hits, `${construct.id} × ${mode} — decoration survived`).toBeGreaterThan(0);
          }
        } finally {
          await shutdown(app);
        }
      });
    }
  }
});

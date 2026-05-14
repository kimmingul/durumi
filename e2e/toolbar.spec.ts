import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import path from 'node:path';
import { getEditorDoc, setMarkdownMode } from './_helpers';

/**
 * End-to-end coverage for the Document-mode (WYSIWYG) editor toolbar that
 * landed in commit 2acf163: 28 buttons + 1 style dropdown + the link dialog
 * + the table-size hover-grid popover.
 *
 * Strategy notes (per the implementing-agent gotchas):
 *  - The toolbar mounts only when `editMode === 'wysiwyg'`, which is the
 *    shipped default. We therefore launch into Document mode and switch to
 *    Markdown mode only in the negative test that asserts the toolbar is
 *    absent there.
 *  - Toolbar buttons dispatch transactions programmatically and so bypass
 *    the WYSIWYG escape filter — raw `**`, `~~`, `$$`, etc. land in the
 *    document and `view.state.doc.toString()` returns the unescaped source.
 *  - To assert active state we drive a real `keyup` (the toolbar's refresh
 *    listener is bound to `keyup`/`mouseup`/`focus`).
 *  - `app.exit(0)` is used in every test to bypass the dirty-close beforeunload
 *    guard, matching the convention in the other specs in this directory.
 */

const APP_ENTRY = path.resolve(process.cwd(), 'out', 'main', 'main.cjs');

async function launch() {
  const app = await electron.launch({ args: [APP_ENTRY] });
  const page = await app.firstWindow();
  await page.waitForSelector('.cm-content');
  // Make sure the toolbar mounted before we start clicking buttons —
  // editor + toolbar mount on different ticks under packaged Electron.
  await page.waitForSelector('[data-testid=editor-toolbar]', { timeout: 5000 });
  await page.click('.cm-content');
  return { app, page };
}

async function shutdown(app: ElectronApplication) {
  await app.evaluate(({ app: a }) => a.exit(0));
}

/** Select-all helper that uses the platform mod key. */
async function selectAll(page: import('@playwright/test').Page) {
  if (process.platform === 'darwin') await page.keyboard.press('Meta+A');
  else await page.keyboard.press('Control+A');
}

// =================================================================
// A. Smoke
// =================================================================

test('A1: toolbar mounts in Document mode with style select + all 27 buttons', async () => {
  const { app, page } = await launch();
  // Root + style select.
  await expect(page.locator('[data-testid=editor-toolbar]')).toBeVisible();
  await expect(page.locator('[data-testid=editor-toolbar-style]')).toBeVisible();
  // The 27 button testids the toolbar exposes: 6 inline marks + 5 list/indent
  // + 10 insert + 5 CriticMarkup + 1 inline memo.
  const ids = [
    'toolbar-bold', 'toolbar-italic', 'toolbar-strike', 'toolbar-code',
    'toolbar-sup', 'toolbar-sub',
    'toolbar-bullet', 'toolbar-numbered', 'toolbar-task',
    'toolbar-outdent', 'toolbar-indent',
    'toolbar-link', 'toolbar-image', 'toolbar-table',
    'toolbar-math-inline', 'toolbar-math', 'toolbar-footnote',
    'toolbar-citation', 'toolbar-hr', 'toolbar-mermaid', 'toolbar-toc',
    'toolbar-cm-insert', 'toolbar-cm-delete', 'toolbar-cm-substitute',
    'toolbar-cm-highlight', 'toolbar-cm-comment',
    'toolbar-memo',
  ];
  const count = await page.locator('[data-testid=editor-toolbar] button.editor-toolbar-btn').count();
  expect(count).toBe(ids.length);
  for (const id of ids) {
    await expect(page.locator(`[data-testid=${id}]`)).toBeVisible();
  }
  await shutdown(app);
});

test('A2: toolbar is NOT mounted in Markdown (source) mode', async () => {
  const { app, page } = await launch();
  await setMarkdownMode(app, page);
  await expect(page.locator('[data-testid=editor-toolbar]')).toHaveCount(0);
  await shutdown(app);
});

// =================================================================
// B. Inline marks
// =================================================================

test('B1: Bold wraps selection in **…**', async () => {
  const { app, page } = await launch();
  await page.keyboard.type('hello');
  await selectAll(page);
  await page.click('[data-testid=toolbar-bold]');
  expect(await getEditorDoc(page)).toBe('**hello**');
  await shutdown(app);
});

test('B2: Italic wraps selection in *…*', async () => {
  const { app, page } = await launch();
  await page.keyboard.type('hello');
  await selectAll(page);
  await page.click('[data-testid=toolbar-italic]');
  expect(await getEditorDoc(page)).toBe('*hello*');
  await shutdown(app);
});

test('B3: Strike wraps selection in ~~…~~', async () => {
  const { app, page } = await launch();
  await page.keyboard.type('hello');
  await selectAll(page);
  await page.click('[data-testid=toolbar-strike]');
  expect(await getEditorDoc(page)).toBe('~~hello~~');
  await shutdown(app);
});

test('B4: Inline code wraps selection in `…`', async () => {
  const { app, page } = await launch();
  await page.keyboard.type('hello');
  await selectAll(page);
  await page.click('[data-testid=toolbar-code]');
  expect(await getEditorDoc(page)).toBe('`hello`');
  await shutdown(app);
});

test('B5: Sup wraps selection in <sup>…</sup>', async () => {
  const { app, page } = await launch();
  await page.keyboard.type('x');
  await selectAll(page);
  await page.click('[data-testid=toolbar-sup]');
  expect(await getEditorDoc(page)).toBe('<sup>x</sup>');
  await shutdown(app);
});

test('B6: Sub wraps selection in <sub>…</sub>', async () => {
  const { app, page } = await launch();
  await page.keyboard.type('x');
  await selectAll(page);
  await page.click('[data-testid=toolbar-sub]');
  expect(await getEditorDoc(page)).toBe('<sub>x</sub>');
  await shutdown(app);
});

test('B7: Bold button shows pressed state when caret is inside **…**', async () => {
  const { app, page } = await launch();
  await page.keyboard.type('hi');
  await selectAll(page);
  await page.click('[data-testid=toolbar-bold]');
  // After clicking Bold, selection sits at `**[hi]**`. We need a real keyup
  // for the refresh listener to re-detect inlineMarks at the caret. Pressing
  // ArrowLeft + ArrowRight keeps the caret inside `hi` and emits real
  // keydown/keyup events. The view must be focused for keyboard to land.
  await page.click('.cm-content');
  // Place caret inside `hi`: position 3 (between `*` and `h`) by pressing
  // Home then ArrowRight thrice.
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  // Force a fresh keyup at the now-current position.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  // Give the toolbar's refresh effect a tick.
  await page.waitForTimeout(50);
  const pressed = await page.getAttribute('[data-testid=toolbar-bold]', 'aria-pressed');
  expect(pressed).toBe('true');
  await shutdown(app);
});

// =================================================================
// C. Lists & indent
// =================================================================

test('C1: Bullet list — pressing button on blank line inserts "- "', async () => {
  const { app, page } = await launch();
  await page.click('[data-testid=toolbar-bullet]');
  // Caret is now after `- `. Type the item text.
  await page.click('.cm-content');
  await page.keyboard.press('End');
  await page.keyboard.type('item');
  expect(await getEditorDoc(page)).toBe('- item');
  await shutdown(app);
});

test('C2: Numbered list — pressing button on blank line inserts "1. "', async () => {
  const { app, page } = await launch();
  await page.click('[data-testid=toolbar-numbered]');
  await page.click('.cm-content');
  await page.keyboard.press('End');
  await page.keyboard.type('item');
  expect(await getEditorDoc(page)).toBe('1. item');
  await shutdown(app);
});

test('C3: Task list — pressing button on blank line inserts "- [ ] "', async () => {
  const { app, page } = await launch();
  await page.click('[data-testid=toolbar-task]');
  await page.click('.cm-content');
  await page.keyboard.press('End');
  await page.keyboard.type('item');
  expect(await getEditorDoc(page)).toBe('- [ ] item');
  await shutdown(app);
});

test('C4: Indent then outdent round-trips a bullet line', async () => {
  const { app, page } = await launch();
  // Set up `- a` first.
  await page.click('[data-testid=toolbar-bullet]');
  await page.click('.cm-content');
  await page.keyboard.press('End');
  await page.keyboard.type('a');
  expect(await getEditorDoc(page)).toBe('- a');
  // Indent: CM6's indentMore adds the configured unit (2 spaces in this
  // codebase, see editor extensions). Asserting "starts with two spaces"
  // tolerates the unit choice without being brittle.
  await page.click('[data-testid=toolbar-indent]');
  const indented = await getEditorDoc(page);
  expect(indented.startsWith('  ')).toBe(true);
  expect(indented).toContain('- a');
  // Outdent back.
  await page.click('[data-testid=toolbar-outdent]');
  expect(await getEditorDoc(page)).toBe('- a');
  await shutdown(app);
});

// =================================================================
// D. Insert
// =================================================================

test('D1: Link button opens dialog with selection pre-filled in text field', async () => {
  const { app, page } = await launch();
  await page.keyboard.type('Durumi');
  await selectAll(page);
  await page.click('[data-testid=toolbar-link]');
  // Lazy-loaded — wait for the dialog to mount.
  await page.waitForSelector('[data-testid=insert-link-dialog]', { timeout: 5000 });
  const textValue = await page.inputValue('[data-testid=insert-link-text]');
  expect(textValue).toBe('Durumi');
  await page.click('[data-testid=insert-link-cancel]');
  await shutdown(app);
});

test('D2: Link confirm with URL inserts [text](url)', async () => {
  const { app, page } = await launch();
  await page.keyboard.type('Durumi');
  await selectAll(page);
  await page.click('[data-testid=toolbar-link]');
  await page.waitForSelector('[data-testid=insert-link-dialog]', { timeout: 5000 });
  await page.fill('[data-testid=insert-link-url]', 'https://example.com');
  await page.click('[data-testid=insert-link-confirm]');
  // Wait for dialog to unmount before asserting (otherwise we race the
  // dispatch).
  await page.waitForSelector('[data-testid=insert-link-dialog]', { state: 'detached', timeout: 5000 });
  expect(await getEditorDoc(page)).toBe('[Durumi](https://example.com)');
  await shutdown(app);
});

test('D3: Link confirm with URL + title inserts [text](url "title")', async () => {
  const { app, page } = await launch();
  await page.keyboard.type('Durumi');
  await selectAll(page);
  await page.click('[data-testid=toolbar-link]');
  await page.waitForSelector('[data-testid=insert-link-dialog]', { timeout: 5000 });
  await page.fill('[data-testid=insert-link-url]', 'https://example.com');
  await page.fill('[data-testid=insert-link-title-input]', 'Home');
  await page.click('[data-testid=insert-link-confirm]');
  await page.waitForSelector('[data-testid=insert-link-dialog]', { state: 'detached', timeout: 5000 });
  expect(await getEditorDoc(page)).toBe('[Durumi](https://example.com "Home")');
  await shutdown(app);
});

test('D4: Link cancel does not modify the document', async () => {
  const { app, page } = await launch();
  await page.keyboard.type('Durumi');
  const before = await getEditorDoc(page);
  await selectAll(page);
  await page.click('[data-testid=toolbar-link]');
  await page.waitForSelector('[data-testid=insert-link-dialog]', { timeout: 5000 });
  await page.fill('[data-testid=insert-link-url]', 'https://nope.example');
  await page.click('[data-testid=insert-link-cancel]');
  await page.waitForSelector('[data-testid=insert-link-dialog]', { state: 'detached', timeout: 5000 });
  expect(await getEditorDoc(page)).toBe(before);
  await shutdown(app);
});

test('D5: Table popover opens on click and closes on Escape', async () => {
  const { app, page } = await launch();
  await page.click('[data-testid=toolbar-table]');
  await expect(page.locator('[data-testid=table-size-popover]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid=table-size-popover]')).toHaveCount(0);
  await shutdown(app);
});

test('D6: Table cell 3x4 inserts a header + 2 data rows × 4 columns', async () => {
  const { app, page } = await launch();
  await page.click('[data-testid=toolbar-table]');
  await page.waitForSelector('[data-testid=table-size-popover]');
  await page.click('[data-testid=table-size-cell-3-4]');
  // Wait for popover to dismiss.
  await page.waitForSelector('[data-testid=table-size-popover]', { state: 'detached', timeout: 2000 });
  const doc = await getEditorDoc(page);
  const lines = doc.split('\n').filter((l) => l.trim().length > 0);
  // 1 header row + 1 separator row + 2 data rows = 4 lines with `|`.
  expect(lines.length).toBe(4);
  // Each row has 4 columns → 5 `|` characters.
  for (const line of lines) {
    expect((line.match(/\|/g) ?? []).length).toBe(5);
  }
  // The separator row uses `-`.
  expect(lines[1]).toMatch(/^\|\s*-+/);
  await shutdown(app);
});

test('D7: Math inline wraps selection in $…$', async () => {
  const { app, page } = await launch();
  await page.keyboard.type('x');
  await selectAll(page);
  await page.click('[data-testid=toolbar-math-inline]');
  expect(await getEditorDoc(page)).toBe('$x$');
  await shutdown(app);
});

test('D8: Math block inserts a $$ … $$ skeleton', async () => {
  const { app, page } = await launch();
  await page.click('[data-testid=toolbar-math]');
  const doc = await getEditorDoc(page);
  // `$$\n\n$$` with the caret on the middle (empty) line.
  expect(doc).toBe('$$\n\n$$');
  await shutdown(app);
});

test('D9: Footnote inserts a [^N] anchor and a [^N]: definition', async () => {
  const { app, page } = await launch();
  await page.click('[data-testid=toolbar-footnote]');
  const doc = await getEditorDoc(page);
  expect(doc).toMatch(/\[\^1\]/); // anchor at caret
  expect(doc).toMatch(/\[\^1\]:/); // definition (with colon)
  await shutdown(app);
});

test('D10: Horizontal rule inserts a `---` block', async () => {
  const { app, page } = await launch();
  await page.click('[data-testid=toolbar-hr]');
  const doc = await getEditorDoc(page);
  expect(doc).toContain('---');
  // The HR insertion is its own paragraph.
  expect(doc.split('\n').some((l) => l === '---')).toBe(true);
  await shutdown(app);
});

test('D11: Mermaid inserts a ```mermaid fenced block', async () => {
  const { app, page } = await launch();
  await page.click('[data-testid=toolbar-mermaid]');
  const doc = await getEditorDoc(page);
  expect(doc).toContain('```mermaid');
  expect(doc).toContain('```');
  await shutdown(app);
});

test('D12: TOC button inserts [toc]', async () => {
  const { app, page } = await launch();
  await page.click('[data-testid=toolbar-toc]');
  const doc = await getEditorDoc(page);
  expect(doc).toContain('[toc]');
  await shutdown(app);
});

// =================================================================
// E. CriticMarkup
// =================================================================

test('E1: CM insert wraps selection in {++ … ++}', async () => {
  const { app, page } = await launch();
  await page.keyboard.type('hi');
  await selectAll(page);
  await page.click('[data-testid=toolbar-cm-insert]');
  // wrapCriticMarkup adds a single space inside the braces — `{++ hi ++}`.
  expect(await getEditorDoc(page)).toBe('{++ hi ++}');
  await shutdown(app);
});

test('E2: CM delete wraps selection in {-- … --}', async () => {
  const { app, page } = await launch();
  await page.keyboard.type('hi');
  await selectAll(page);
  await page.click('[data-testid=toolbar-cm-delete]');
  expect(await getEditorDoc(page)).toBe('{-- hi --}');
  await shutdown(app);
});

test('E3: CM substitute wraps selection as old half of {~~ … ~> … ~~}', async () => {
  const { app, page } = await launch();
  await page.keyboard.type('hi');
  await selectAll(page);
  await page.click('[data-testid=toolbar-cm-substitute]');
  // Selection becomes the "old" half; new half is empty.
  expect(await getEditorDoc(page)).toBe('{~~ hi ~>  ~~}');
  await shutdown(app);
});

test('E4: CM highlight wraps selection in {== … ==}', async () => {
  const { app, page } = await launch();
  await page.keyboard.type('hi');
  await selectAll(page);
  await page.click('[data-testid=toolbar-cm-highlight]');
  expect(await getEditorDoc(page)).toBe('{== hi ==}');
  await shutdown(app);
});

test('E5: CM comment wraps selection in {>> … <<}', async () => {
  const { app, page } = await launch();
  await page.keyboard.type('hi');
  await selectAll(page);
  await page.click('[data-testid=toolbar-cm-comment]');
  expect(await getEditorDoc(page)).toBe('{>> hi <<}');
  await shutdown(app);
});

// =================================================================
// F. Inline memo (NOT CriticMarkup)
// =================================================================

test('F1: Memo wraps selection in %% … %%', async () => {
  const { app, page } = await launch();
  await page.keyboard.type('todo');
  await selectAll(page);
  await page.click('[data-testid=toolbar-memo]');
  // wrapComment uses ` %% trimmed %% ` shape — one space each side.
  expect(await getEditorDoc(page)).toBe('%% todo %%');
  await shutdown(app);
});

// =================================================================
// G. Style dropdown
// =================================================================

test('G1: Style dropdown — Heading 1 prefixes line with "# "', async () => {
  const { app, page } = await launch();
  await page.keyboard.type('Title');
  await page.selectOption('[data-testid=editor-toolbar-style]', 'h1');
  expect(await getEditorDoc(page)).toBe('# Title');
  await shutdown(app);
});

test('G2: Style dropdown — Blockquote prefixes line with "> "', async () => {
  const { app, page } = await launch();
  await page.keyboard.type('Quote me');
  await page.selectOption('[data-testid=editor-toolbar-style]', 'blockquote');
  expect(await getEditorDoc(page)).toBe('> Quote me');
  await shutdown(app);
});

test('G3: Style dropdown — Code Block wraps document in ``` fences', async () => {
  const { app, page } = await launch();
  await page.keyboard.type('code');
  // Move caret to end so insertCodeBlock takes the empty-selection branch
  // and inserts the fence around the caret. We explicitly select-all so the
  // selection branch runs — that's the well-defined toolbar UX path.
  await selectAll(page);
  await page.selectOption('[data-testid=editor-toolbar-style]', 'codeBlock');
  const doc = await getEditorDoc(page);
  // insertCodeBlock with a selection produces ```text\ncode\n```
  expect(doc).toMatch(/^```/);
  expect(doc).toContain('code');
  expect(doc.endsWith('```')).toBe(true);
  await shutdown(app);
});

// =================================================================
// H. Citation (smoke only — palette content depends on bibliography)
// =================================================================

test('H1: Citation button does NOT crash (smoke — palette depends on bib state)', async () => {
  // The citation button calls `onOpenCitePalette` from props; with no
  // bibliography wired up in a fresh launch it should still no-op cleanly.
  // We just assert the doc didn't change and the toolbar is still healthy.
  const { app, page } = await launch();
  const before = await getEditorDoc(page);
  await page.click('[data-testid=toolbar-citation]');
  await page.waitForTimeout(150);
  // Toolbar is still mounted.
  await expect(page.locator('[data-testid=editor-toolbar]')).toBeVisible();
  expect(await getEditorDoc(page)).toBe(before);
  await shutdown(app);
});

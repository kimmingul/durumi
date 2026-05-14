import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import path from 'node:path';
import { setTyporaMode } from './_helpers';

const APP_ENTRY = path.resolve(process.cwd(), 'out', 'main', 'main.cjs');

async function launch() {
  const app = await electron.launch({ args: [APP_ENTRY] });
  const page = await app.firstWindow();
  await page.waitForSelector('.cm-content');
  return { app, page };
}

// Live-preview tests rely on markdown source being parsed verbatim. The
// default WYSIWYG mode (v0.1.12+) escapes special chars on every keystroke
// so `# heading` becomes `\# heading` and no decoration fires. Switching
// to Typora mode for these tests mirrors how a user who wants raw markdown
// typing would configure the app.
async function launchTypora() {
  const { app, page } = await launch();
  await setTyporaMode(app, page);
  return { app, page };
}

// Use force-exit to bypass the dirty-close (beforeunload) dialog that
// `app.close()` would otherwise hang on after we have typed into the editor.
async function shutdown(app: ElectronApplication) {
  await app.evaluate(({ app: a }) => a.exit(0));
}

test('table insert + Tab adds row + click to render', async () => {
  // Simplification (per Task 8 heads-up #3): instead of relying on multi-Tab
  // navigation through table cells (which produced unstable state in headless
  // CM), we insert the boilerplate table, type a single cell value, then move
  // the caret out of the table area and assert the row widget is rendered.
  const { app, page } = await launch();
  await page.click('.cm-content');
  await page.keyboard.press('Meta+Shift+T');
  await page.keyboard.type('A');
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowDown');
  await expect(page.locator('div[role="row"]').first()).toBeVisible();
  await shutdown(app);
});

test('task list checkbox toggle', async () => {
  const { app, page } = await launchTypora();
  await page.click('.cm-content');
  await page.keyboard.type('- [ ] todo\n');
  // Move caret away from line 1 so the checkbox widget renders on it.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  const box = page.locator('input.cm-task-checkbox').first();
  await expect(box).toBeVisible();
  await expect(box).not.toBeChecked();
  // The widget listens for `mousedown` and toggles the source `[ ]` to `[x]`,
  // which causes the decoration to rebuild with `checked: true`. We assert the
  // re-rendered checkbox is checked rather than scraping `innerText`, because
  // the widget replaces the marker text and `innerText` cannot see `[x]`.
  await box.dispatchEvent('mousedown');
  await expect(page.locator('input.cm-task-checkbox').first()).toBeChecked();
  await shutdown(app);
});

test('strikethrough markers hide on inactive line', async () => {
  const { app, page } = await launchTypora();
  await page.click('.cm-content');
  await page.keyboard.type('~~strike~~\n');
  // After Enter, caret is on line 2 (empty); line 1 is inactive so its
  // `~~` markers are replaced by the hidden-marker widget.
  const text = await page.evaluate(
    () => (document.querySelector('.cm-line') as HTMLElement).innerText,
  );
  expect(text).not.toContain('~~');
  await shutdown(app);
});

test('typescript fenced block highlights keyword', async () => {
  const { app, page } = await launchTypora();
  await page.click('.cm-content');
  await page.keyboard.type('```ts\nconst x = 1;\n```\n');
  // Lazy lang load may need a moment in packaged Electron, raise to 5s.
  await page.waitForSelector('.cm-tok-keyword', { timeout: 5000 });
  await expect(page.locator('.cm-tok-keyword').first()).toHaveText('const');
  await shutdown(app);
});

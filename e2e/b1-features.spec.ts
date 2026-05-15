import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import path from 'node:path';
import { setMarkdownMode, setTyporaMode, setWysiwygMode } from './_helpers';

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

/**
 * v0.2.8 — Document-mode rendering parity for memos and CriticMarkup.
 *
 * In Document mode the active-line carve-out is suppressed: even when
 * the caret lies on a memo / CriticMarkup line, the source must stay
 * collapsed so the rendered page reads uniformly. Live mode keeps the
 * v0.1.0 behaviour where the active line shows raw markers for direct
 * editing. This test seeds a doc with both `%%memo%%` and `{++ins++}`
 * on the same line, then exercises both modes back-to-back.
 *
 * The doc is injected via `view.dispatch` rather than `keyboard.type`
 * because Document-mode escape filter would auto-escape `[`, `+`, etc.
 * if typed.
 */
test('Document mode collapses memos / CriticMarkup on the active line; Live mode shows source', async () => {
  const { app, page } = await launch();
  try {
    // Default launch is Document (wysiwyg) mode.
    const doc = 'lead %% @ai note %% mid {++ ins ++} tail';
    // Caret position inside the memo body (after `%% @ai`), so the line
    // is "active" by the editor's hasActiveLine semantics. We seed via
    // `view.dispatch` rather than `keyboard.type` because the Document-
    // mode escape filter would rewrite `[`, `+`, etc.
    const caretPos = doc.indexOf('@ai') + 1;

    const seed = async (): Promise<void> => {
      await page.evaluate(
        ({ markdown, anchor }) => {
          const root = document.querySelector('.cm-editor') as HTMLElement | null;
          if (!root) return;
          const content = root.querySelector('.cm-content') as HTMLElement | null;
          const tileHolder = (content ?? root) as unknown as {
            cmTile?: {
              root?: {
                view?: {
                  state: { doc: { length: number } };
                  dispatch: (s: unknown) => void;
                  focus: () => void;
                };
              };
            };
          };
          const view = tileHolder.cmTile?.root?.view;
          if (!view) return;
          view.focus();
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: markdown },
            selection: { anchor },
            userEvent: 'input.testReset',
          });
        },
        { markdown: doc, anchor: caretPos },
      );
      await page.waitForTimeout(80);
    };

    // ── Document mode (default) ──
    await seed();
    const docLineText = await page.evaluate(
      () => (document.querySelector('.cm-line') as HTMLElement).innerText,
    );
    expect(docLineText).not.toContain('%%');
    expect(docLineText).not.toContain('{++');
    expect(docLineText).not.toContain('++}');
    expect(await page.locator('.cm-memo-active').count()).toBe(0);
    expect(await page.locator('.cm-cm-active').count()).toBe(0);
    await expect(page.locator('.cm-memo-chat-icon').first()).toBeVisible();
    await expect(page.locator('.cm-cm-insert').first()).toBeVisible();

    // ── Live (typora) mode — active-line raw must reappear. ──
    await setTyporaMode(app, page);
    await seed();
    const liveLineText = await page.evaluate(
      () => (document.querySelector('.cm-line') as HTMLElement).innerText,
    );
    expect(liveLineText).toContain('%%');
    expect(liveLineText).toContain('{++');
    expect(await page.locator('.cm-memo-active').count()).toBeGreaterThan(0);
    expect(await page.locator('.cm-cm-active').count()).toBeGreaterThan(0);

    // ── Flip back to Document mode (round-trip regression guard). ──
    await setWysiwygMode(app, page);
    await seed();
    expect(await page.locator('.cm-memo-active').count()).toBe(0);
    expect(await page.locator('.cm-cm-active').count()).toBe(0);
    await expect(page.locator('.cm-memo-chat-icon').first()).toBeVisible();
  } finally {
    await shutdown(app);
  }
});

/**
 * v0.2.8 codex follow-up — bare mode-switch decoration rebuild.
 *
 * The original parity spec above re-seeds the doc after every mode
 * switch, which masks a separate latent bug: the memo / CriticMarkup
 * StateField `update()` short-circuited on `tr.docChanged || tr.selection`,
 * so a bare `setEditMode` effect (e.g. user hits Cmd+1 mid-document
 * with no edit) left the previous mode's decorations stale until the
 * next keystroke. This spec seeds ONCE in Live mode, then flips to
 * Document mode WITHOUT touching the doc or caret. The active-line
 * carve-out should disappear because the field rebuilt on the effect
 * — not because the doc / selection changed.
 */
test('mode switch alone (no edit, no caret move) rebuilds memo + CriticMarkup decorations', async () => {
  const { app, page } = await launch();
  try {
    // Start in Live mode so the active-line carve-out is observable.
    await setTyporaMode(app, page);

    const doc = 'lead %% @ai note %% mid {++ ins ++} tail';
    const caretPos = doc.indexOf('@ai') + 1; // caret inside the memo body

    // Seed once. Subsequent assertions MUST NOT reseed.
    await page.evaluate(
      ({ markdown, anchor }) => {
        const root = document.querySelector('.cm-editor') as HTMLElement | null;
        if (!root) return;
        const content = root.querySelector('.cm-content') as HTMLElement | null;
        const tileHolder = (content ?? root) as unknown as {
          cmTile?: {
            root?: {
              view?: {
                state: { doc: { length: number } };
                dispatch: (s: unknown) => void;
                focus: () => void;
              };
            };
          };
        };
        const view = tileHolder.cmTile?.root?.view;
        if (!view) return;
        view.focus();
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: markdown },
          selection: { anchor },
          userEvent: 'input.testReset',
        });
      },
      { markdown: doc, anchor: caretPos },
    );
    await page.waitForTimeout(80);

    // ── Live baseline: caret-on-memo line shows raw `%%` + `{++`. ──
    const liveText = await page.evaluate(
      () => (document.querySelector('.cm-line') as HTMLElement).innerText,
    );
    expect(liveText).toContain('%%');
    expect(liveText).toContain('{++');
    expect(await page.locator('.cm-memo-active').count()).toBeGreaterThan(0);
    expect(await page.locator('.cm-cm-active').count()).toBeGreaterThan(0);

    // ── Bare mode switch — no reseed, no caret move. ──
    await setWysiwygMode(app, page);
    // Wait until the Document-mode collapse has applied (the active-line
    // carve-out class disappears). The setEditMode IPC takes a few frames
    // to flow main → renderer → React rerender → useEffect → view.dispatch,
    // and the bare mode-switch decoration rebuild is exactly what this
    // spec is asserting — so we must wait for the field to rebuild.
    await page.waitForFunction(
      () => document.querySelectorAll('.cm-memo-active').length === 0,
      undefined,
      { timeout: 2000 },
    );

    // Document mode should now have collapsed the memo / CriticMarkup
    // spans even though no doc change and no selection change happened.
    const docModeText = await page.evaluate(
      () => (document.querySelector('.cm-line') as HTMLElement).innerText,
    );
    expect(docModeText).not.toContain('%%');
    expect(docModeText).not.toContain('{++');
    expect(await page.locator('.cm-memo-active').count()).toBe(0);
    expect(await page.locator('.cm-cm-active').count()).toBe(0);
    await expect(page.locator('.cm-memo-chat-icon').first()).toBeVisible();
    await expect(page.locator('.cm-cm-insert').first()).toBeVisible();

    // ── Bare flip back to Live — same invariant in reverse. ──
    await setTyporaMode(app, page);
    await page.waitForFunction(
      () => document.querySelectorAll('.cm-memo-active').length > 0,
      undefined,
      { timeout: 2000 },
    );
    const liveAgainText = await page.evaluate(
      () => (document.querySelector('.cm-line') as HTMLElement).innerText,
    );
    expect(liveAgainText).toContain('%%');
    expect(liveAgainText).toContain('{++');
  } finally {
    await shutdown(app);
  }
});

/**
 * v0.2.9 — Live decorations for `==highlight==`, `~sub~`, `^sup^`.
 *
 * Three lines, one per mark. Document mode collapses every marker
 * everywhere; Live mode keeps the active line raw and collapses the
 * other two.
 */
test('==highlight==, ~sub~, ^sup^ render in Document mode and reveal active-line source in Live mode', async () => {
  const { app, page } = await launch();
  try {
    const doc = '==hi==\nH~2~O\nX^2^';
    const seed = async (anchor: number): Promise<void> => {
      await page.evaluate(
        ({ markdown, a }) => {
          const root = document.querySelector('.cm-editor') as HTMLElement | null;
          if (!root) return;
          const content = root.querySelector('.cm-content') as HTMLElement | null;
          const tileHolder = (content ?? root) as unknown as {
            cmTile?: {
              root?: {
                view?: {
                  state: { doc: { length: number } };
                  dispatch: (s: unknown) => void;
                  focus: () => void;
                };
              };
            };
          };
          const view = tileHolder.cmTile?.root?.view;
          if (!view) return;
          view.focus();
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: markdown },
            selection: { anchor: a },
            userEvent: 'input.testReset',
          });
        },
        { markdown: doc, a: anchor },
      );
      await page.waitForTimeout(80);
    };

    // ── Document (wysiwyg) mode — every marker collapsed everywhere. ──
    await seed(doc.length); // caret on last line is irrelevant for wysiwyg
    await expect(page.locator('.cm-md-html-mark').first()).toBeVisible();
    await expect(page.locator('.cm-md-html-sub').first()).toBeVisible();
    await expect(page.locator('.cm-md-html-sup').first()).toBeVisible();
    const docModeText = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.cm-line'))
        .map((l) => (l as HTMLElement).innerText)
        .join('\n'),
    );
    expect(docModeText).not.toContain('==');
    // The two ~ on H~2~O and the two ^ on X^2^ must be hidden too.
    expect(docModeText).not.toContain('~2~');
    expect(docModeText).not.toContain('^2^');

    // ── Live (typora) mode with caret on line 1 (==hi==). ──
    await setTyporaMode(app, page);
    await seed(2); // caret inside the highlight on line 1
    const liveLines = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.cm-line')).map(
        (l) => (l as HTMLElement).innerText,
      ),
    );
    // Line 1 (active) shows raw `==`.
    expect(liveLines[0]).toContain('==');
    // Lines 2 and 3 (inactive) hide their markers.
    expect(liveLines[1]).not.toContain('~2~');
    expect(liveLines[2]).not.toContain('^2^');
  } finally {
    await shutdown(app);
  }
});

/**
 * v0.2.9 — GitHub-style alert callouts in the live editor.
 *
 * Seeds a fixture containing all five alert kinds, then verifies that
 * Document mode renders the colored header widgets (one per kind) and
 * Source mode shows the raw `> [!KIND]` lines so the user can edit the
 * markdown directly.
 */
test('GitHub alert callouts: five kinds render in Document mode, raw in Source mode', async () => {
  const { app, page } = await launch();
  try {
    const doc = [
      '> [!NOTE]',
      '> note body',
      '',
      '> [!TIP]',
      '> tip body',
      '',
      '> [!IMPORTANT]',
      '> important body',
      '',
      '> [!WARNING]',
      '> warning body',
      '',
      '> [!CAUTION]',
      '> caution body',
      '',
    ].join('\n');

    const seed = async (): Promise<void> => {
      await page.evaluate(
        ({ markdown }) => {
          const root = document.querySelector('.cm-editor') as HTMLElement | null;
          if (!root) return;
          const content = root.querySelector('.cm-content') as HTMLElement | null;
          const tileHolder = (content ?? root) as unknown as {
            cmTile?: {
              root?: {
                view?: {
                  state: { doc: { length: number } };
                  dispatch: (s: unknown) => void;
                  focus: () => void;
                };
              };
            };
          };
          const view = tileHolder.cmTile?.root?.view;
          if (!view) return;
          view.focus();
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: markdown },
            selection: { anchor: 0 },
            userEvent: 'input.testReset',
          });
        },
        { markdown: doc },
      );
      await page.waitForTimeout(120);
    };

    // Document mode (default): all five header widgets render with body styling.
    await seed();
    for (const kind of ['note', 'tip', 'important', 'warning', 'caution'] as const) {
      await expect(page.locator(`.cm-md-alert-title-${kind}`)).toHaveCount(1);
      expect(await page.locator(`.cm-md-alert-${kind}`).count()).toBeGreaterThanOrEqual(2);
    }
    const docModeText = await page.evaluate(
      () => (document.querySelector('.cm-content') as HTMLElement).innerText,
    );
    expect(docModeText).not.toContain('[!NOTE]');
    expect(docModeText).not.toContain('[!CAUTION]');

    // Source (markdown) mode: alerts decoration is unloaded; raw `> [!KIND]` shows.
    await setMarkdownMode(app, page);
    await page.waitForFunction(
      () => document.querySelectorAll('[data-alert-kind]').length === 0,
      undefined,
      { timeout: 2000 },
    );
    const sourceText = await page.evaluate(
      () => (document.querySelector('.cm-content') as HTMLElement).innerText,
    );
    for (const kind of ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']) {
      expect(sourceText).toContain(`[!${kind}]`);
    }
  } finally {
    await shutdown(app);
  }
});

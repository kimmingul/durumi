import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { alertsDecoration, alertsTheme } from '../../src/editor/decorations/alerts';
import { blockquoteDecoration } from '../../src/editor/decorations/blockquote';
import { emphasisDecoration } from '../../src/editor/decorations/emphasis';
import { CitationExtension } from '../../src/editor/markdownExt/citation';
import { citationDecoration } from '../../src/editor/decorations/citation';
import {
  editModeStateExtension,
  setEditMode,
  type EditMode,
} from '../../src/editor/editMode';

function setup(
  doc: string,
  cursor: number,
  mode: EditMode = 'wysiwyg',
  extras: ReturnType<typeof alertsDecoration>[] = [],
): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [
        editModeStateExtension(),
        markdown({
          base: markdownLanguage,
          extensions: [GFM, CitationExtension],
        }),
        alertsDecoration(),
        alertsTheme,
        ...extras,
      ],
    }),
    parent,
  });
  view.dispatch({
    effects: setEditMode.of(mode),
    selection: { anchor: cursor },
    userEvent: 'select',
  });
  return view;
}

describe('alertsDecoration — five kinds in Document mode', () => {
  const cases: Array<{ src: string; cls: string; label: string }> = [
    { src: '> [!NOTE]\n> body\n', cls: 'cm-md-alert-note', label: 'Note' },
    { src: '> [!TIP]\n> body\n', cls: 'cm-md-alert-tip', label: 'Tip' },
    { src: '> [!IMPORTANT]\n> body\n', cls: 'cm-md-alert-important', label: 'Important' },
    { src: '> [!WARNING]\n> body\n', cls: 'cm-md-alert-warning', label: 'Warning' },
    { src: '> [!CAUTION]\n> body\n', cls: 'cm-md-alert-caution', label: 'Caution' },
  ];
  for (const { src, cls, label } of cases) {
    it(`${cls}: header replaced with widget + body styled`, () => {
      const v = setup(src, 0);
      const widget = v.dom.querySelector(`.cm-md-alert-title-${cls.split('-').pop()}`);
      expect(widget, `${cls} widget present`).toBeTruthy();
      expect(widget?.textContent).toContain(label);
      // No raw `[!KIND]` text in the rendered DOM line.
      expect(v.dom.textContent ?? '').not.toContain('[!');
      // The body line carries the colored class.
      expect(v.dom.querySelectorAll(`.${cls}`).length).toBeGreaterThanOrEqual(2);
      v.destroy();
    });
  }
});

describe('alertsDecoration — Live mode active-line behavior', () => {
  it('shows raw [!NOTE] when caret is on the header line in Live mode', () => {
    const doc = '> [!NOTE]\n> body\n';
    // Caret inside `[!NOTE]` (offset 5 lands inside the bracket span).
    const v = setup(doc, 5, 'typora');
    expect(v.dom.textContent ?? '').toContain('[!NOTE]');
    expect(v.dom.querySelector('.cm-md-alert-title-note')).toBeNull();
    v.destroy();
  });

  it('hides the [!NOTE] header when caret is on a different line in Live mode', () => {
    const doc = '> [!NOTE]\n> body\n\nparagraph\n';
    // Caret on the trailing paragraph.
    const v = setup(doc, doc.length - 1, 'typora');
    expect(v.dom.querySelector('.cm-md-alert-title-note')).toBeTruthy();
    v.destroy();
  });

  it('hides the [!NOTE] header even on the active line in Document (WYSIWYG) mode', () => {
    const doc = '> [!NOTE]\n> body\n';
    const v = setup(doc, 5, 'wysiwyg'); // caret on header
    expect(v.dom.querySelector('.cm-md-alert-title-note')).toBeTruthy();
    expect(v.dom.textContent ?? '').not.toContain('[!NOTE]');
    v.destroy();
  });
});

describe('alertsDecoration — mode-only switch regression', () => {
  it('rebuilds decorations on a bare setEditMode effect (no doc/selection change)', () => {
    const doc = '> [!TIP]\n> body\n';
    // Start in Live mode with caret on the header — raw `[!TIP]` visible.
    const v = setup(doc, 5, 'typora');
    expect(v.dom.querySelector('.cm-md-alert-title-tip')).toBeNull();
    expect(v.dom.textContent ?? '').toContain('[!TIP]');
    // Mode-only transaction: no `changes`, no `selection`.
    v.dispatch({ effects: setEditMode.of('wysiwyg') });
    expect(v.dom.querySelector('.cm-md-alert-title-tip')).toBeTruthy();
    expect(v.dom.textContent ?? '').not.toContain('[!TIP]');
    v.destroy();
  });
});

describe('alertsDecoration — negative cases', () => {
  it('plain blockquote without [!KIND] gets no alert decoration', () => {
    const doc = '> just a quote\n> more body\n';
    const v = setup(doc, 0);
    expect(v.dom.querySelector('.cm-md-alert-title-note')).toBeNull();
    expect(v.dom.querySelector('.cm-md-alert-line')).toBeNull();
    v.destroy();
  });

  it('blockquote whose first line has trailing junk after [!NOTE] is NOT an alert', () => {
    // GitHub spec / markdown-it-github-alerts allows trailing content (it
    // becomes part of the title), but our editor takes the strict reading
    // that the header line must be exactly `[!KIND]`. This guards against
    // false positives like `> [!NOTE] something else`.
    const doc = '> [!NOTE] not just a label\n> body\n';
    const v = setup(doc, 0);
    expect(v.dom.querySelector('.cm-md-alert-title-note')).toBeNull();
    v.destroy();
  });

  it('nested blockquote `> > [!NOTE]` does NOT promote to an alert', () => {
    const doc = 'lead\n\n> outer\n> > [!NOTE]\n> > nested body\n';
    const v = setup(doc, 0);
    expect(v.dom.querySelector('.cm-md-alert-title-note')).toBeNull();
    v.destroy();
  });

  // codex follow-up: the original `isNestedBlockquote` walked parents only,
  // so it caught the INNER layer of `> > [!NOTE]` but the OUTER `Blockquote`
  // node still passed the guard. Its first line `> > [!NOTE]` then got eaten
  // by the strip regex `/^[ \t]*(?:>[ \t]?)+/` and the alert was incorrectly
  // promoted. The fix detects nested-blockquote DESCENDANTS too, so any
  // wrapper around a `> > […]` chain skips the alert promotion.
  it('two-level `> > [!NOTE]` (header on its own line) does NOT promote to an alert', () => {
    const doc = '> > [!NOTE]\n> > body\n';
    const v = setup(doc, 0);
    expect(v.dom.querySelector('.cm-md-alert-title-note')).toBeNull();
    expect(v.dom.querySelector('.cm-md-alert-line')).toBeNull();
    v.destroy();
  });

  it('three-level `> > > [!NOTE]` (header on its own line) does NOT promote to an alert', () => {
    const doc = '> > > [!NOTE]\n> > > body\n';
    const v = setup(doc, 0);
    expect(v.dom.querySelector('.cm-md-alert-title-note')).toBeNull();
    expect(v.dom.querySelector('.cm-md-alert-line')).toBeNull();
    v.destroy();
  });
});

describe('alertsDecoration — case insensitive matching', () => {
  it('matches `> [!note]` (lowercase)', () => {
    const v = setup('> [!note]\n> body\n', 0);
    expect(v.dom.querySelector('.cm-md-alert-title-note')).toBeTruthy();
    v.destroy();
  });

  it('matches `> [!Note]` (mixed case)', () => {
    const v = setup('> [!Note]\n> body\n', 0);
    expect(v.dom.querySelector('.cm-md-alert-title-note')).toBeTruthy();
    v.destroy();
  });

  it('matches `> [!WaRnInG]` (random case)', () => {
    const v = setup('> [!WaRnInG]\n> body\n', 0);
    expect(v.dom.querySelector('.cm-md-alert-title-warning')).toBeTruthy();
    v.destroy();
  });
});

describe('alertsDecoration — layering with other decorations', () => {
  it('layers cleanly with blockquote line decoration (still cm-md-blockquote)', () => {
    const doc = '> [!NOTE]\n> body line\n';
    const v = setup(doc, 0, 'wysiwyg', [blockquoteDecoration()]);
    expect(v.dom.querySelector('.cm-md-blockquote')).toBeTruthy();
    expect(v.dom.querySelector('.cm-md-alert-title-note')).toBeTruthy();
    v.destroy();
  });

  it('does not eat inline emphasis inside the alert body', () => {
    const doc = '> [!TIP]\n> body with **bold** word\n';
    const v = setup(doc, 0, 'wysiwyg', [
      blockquoteDecoration(),
      emphasisDecoration(),
    ]);
    // emphasis decoration adds a `cm-md-marker-hidden` widget around `**`.
    expect(v.dom.querySelectorAll('.cm-md-marker-hidden').length).toBeGreaterThan(0);
    // Body word still visible (not eaten by the alert layer).
    expect(v.dom.textContent ?? '').toContain('bold');
    v.destroy();
  });

  it('citation `[@key]` inside an alert body still renders as superscript', () => {
    const doc = '> [!NOTE]\n> See [@smith] for details.\n';
    const v = setup(doc, 0, 'wysiwyg', [citationDecoration()]);
    expect(v.dom.querySelector('.cm-md-citation')).toBeTruthy();
    expect(v.dom.textContent ?? '').not.toContain('[@smith]');
    v.destroy();
  });

  // codex follow-up: every alert line ALSO carries `.cm-md-blockquote`
  // (from `blockquoteDecoration()`), and `src/styles/global.css` paints
  // `.cm-md-blockquote { border-left: 3px solid var(--border); }` with
  // equal specificity to the editor-theme rule. Without `!important` the
  // cascade lets the gray blockquote border win and the kind colour
  // disappears. This test asserts the alert-side rule is marked
  // `!important` for every kind so the kind colour is the visible one.
  it('alert border-left rules are marked !important for every kind', () => {
    // Render once to ensure the theme stylesheet is mounted in the DOM.
    const v = setup('> [!NOTE]\n> body\n', 0, 'wysiwyg', [blockquoteDecoration()]);
    const sheets = Array.from(document.styleSheets);
    const allRules: string[] = [];
    for (const sheet of sheets) {
      try {
        const rules = sheet.cssRules ? Array.from(sheet.cssRules) : [];
        for (const r of rules) allRules.push(r.cssText);
      } catch {
        // cross-origin or unreadable sheet — ignore
      }
    }
    const kinds = ['note', 'tip', 'important', 'warning', 'caution'] as const;
    for (const kind of kinds) {
      const rule = allRules.find(
        (t) => t.includes(`cm-md-alert-${kind}`) && t.toLowerCase().includes('border-left'),
      );
      expect(rule, `alert ${kind} border-left rule present`).toBeTruthy();
      expect(
        rule!.toLowerCase().includes('!important'),
        `alert ${kind} border-left must use !important to win the cascade against .cm-md-blockquote`,
      ).toBe(true);
    }
    v.destroy();
  });
});

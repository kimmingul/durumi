import { describe, expect, it } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import {
  editModeStateExtension,
  setEditMode,
  type EditMode,
} from '../../src/editor/editMode';
import { emphasisDecoration } from '../../src/editor/decorations/emphasis';
import { headingDecoration } from '../../src/editor/decorations/heading';
import { linkDecoration } from '../../src/editor/decorations/link';
import { inlineCodeDecoration } from '../../src/editor/decorations/inlineCode';
import { strikethroughDecoration } from '../../src/editor/decorations/strikethrough';
import { blockquoteDecoration } from '../../src/editor/decorations/blockquote';
import { htmlInlineDecoration } from '../../src/editor/decorations/htmlInline';
import { escapeDecoration } from '../../src/editor/decorations/escape';
import { horizontalRuleDecoration } from '../../src/editor/decorations/horizontalRule';

/**
 * v0.1.12 (revised) — sanity tests that each marker-hiding decoration
 * plugin honours WYSIWYG mode by hiding its markers EVEN ON THE ACTIVE
 * LINE. Together they encode the v0.1.0 invariant relaxation: inline
 * marker hiding via empty `cm-md-marker-hidden` widgets is IME-safe, so
 * WYSIWYG renders uniformly across active and inactive lines.
 *
 * Block-widget plugins (image, math, mermaid, table, taskList,
 * horizontalRule, etc.) are deliberately omitted — they still skip the
 * active line in every mode to preserve the editing affordance.
 */
function setupActiveLine(doc: string, mode: EditMode = 'wysiwyg'): EditorView {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(Math.min(3, doc.length)),
    extensions: [
      editModeStateExtension(),
      markdown({ base: markdownLanguage, extensions: [GFM] }),
      emphasisDecoration(),
      headingDecoration(),
      linkDecoration(),
      inlineCodeDecoration(),
      strikethroughDecoration(),
      blockquoteDecoration(),
      htmlInlineDecoration(),
      escapeDecoration(),
      horizontalRuleDecoration(),
    ],
  });
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({ state, parent });
  view.dispatch({
    effects: setEditMode.of(mode),
    selection: EditorSelection.cursor(Math.min(3, doc.length)),
    userEvent: 'select',
  });
  return view;
}

function hiddenCount(view: EditorView): number {
  return view.dom.querySelectorAll('.cm-md-marker-hidden').length;
}

describe('WYSIWYG mode — each plugin hides markers on the active line', () => {
  it('emphasis: `**bold**` hides both ** even with caret on the line', () => {
    const view = setupActiveLine('**bold**');
    expect(hiddenCount(view)).toBeGreaterThanOrEqual(2);
    view.destroy();
  });

  it('heading: `# Heading` hides `# ` even with caret on the line', () => {
    const view = setupActiveLine('# Heading');
    expect(hiddenCount(view)).toBeGreaterThanOrEqual(1);
    view.destroy();
  });

  it('inline code: `` `code` `` hides backticks even with caret on the line', () => {
    const view = setupActiveLine('`code`');
    expect(hiddenCount(view)).toBeGreaterThanOrEqual(2);
    view.destroy();
  });

  it('link: `[Text]` hides `[` and `]` even with caret on the line', () => {
    const view = setupActiveLine('[Text]');
    expect(hiddenCount(view)).toBeGreaterThanOrEqual(2);
    view.destroy();
  });

  it('strikethrough: `~~gone~~` hides both ~~ even with caret on the line', () => {
    const view = setupActiveLine('~~gone~~');
    expect(hiddenCount(view)).toBeGreaterThanOrEqual(2);
    view.destroy();
  });

  it('blockquote: `> quoted` hides `> ` even with caret on the line', () => {
    const view = setupActiveLine('> quoted');
    expect(hiddenCount(view)).toBeGreaterThanOrEqual(1);
    view.destroy();
  });

  it('htmlInline: `<sup>1</sup>` hides both tags even with caret on the line', () => {
    const view = setupActiveLine('<sup>1</sup>');
    expect(hiddenCount(view)).toBeGreaterThanOrEqual(2);
    view.destroy();
  });

  it('escape: `\\*` hides leading `\\` even with caret on the line', () => {
    const view = setupActiveLine('\\*');
    expect(hiddenCount(view)).toBeGreaterThanOrEqual(1);
    view.destroy();
  });

  it('horizontalRule: `---` renders as <hr> even with caret on the line', () => {
    const view = setupActiveLine('\n\n---\n\nbody');
    // The HR widget replaces the `---` source; check the DOM for an <hr>.
    const hrs = view.dom.querySelectorAll('hr');
    expect(hrs.length).toBeGreaterThanOrEqual(1);
    view.destroy();
  });

  it('Typora mode: HR shows source `---` when caret is on the line', () => {
    const view = setupActiveLine('\n\n---\n\nbody', 'typora');
    // Move caret to the HR line (position 4 lands on the first dash of `---`).
    view.dispatch({ selection: { anchor: 4 }, userEvent: 'select' });
    const hrs = view.dom.querySelectorAll('hr');
    expect(hrs.length).toBe(0);
    view.destroy();
  });

  it('Typora mode: same plugins KEEP markers visible on the active line', () => {
    const view = setupActiveLine('**bold**', 'typora');
    expect(hiddenCount(view)).toBe(0);
    view.destroy();
  });

  it('Typora mode: heading marker visible on active line', () => {
    const view = setupActiveLine('# Heading', 'typora');
    expect(hiddenCount(view)).toBe(0);
    view.destroy();
  });
});

import { describe, it, expect } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { applyInlineFormat } from '../../src/editor/keymap/pendingInlineFormat';

function makeView(doc = '', cursor = 0): EditorView {
  return new EditorView({
    state: EditorState.create({ doc, selection: { anchor: cursor } }),
    parent: document.body.appendChild(document.createElement('div')),
  });
}

/**
 * v0.2.29 — minimal contract for applyInlineFormat.
 *
 * v0.2.29 went through two failed designs (placeholder text, then
 * Word-style pending format with a transactionFilter) before
 * accepting the IME-safety constraint imposed by the WYSIWYG-on-
 * source pattern (CodeMirror + atomic ranges over markdown source).
 * The final v0.2.29 contract:
 *
 *   - Non-empty selection → wrap / unwrap via toggleWrap (existing
 *     behaviour, returns true)
 *   - Empty selection → NO-OP, returns false (toolbar caller surfaces
 *     a transient "Select text first" hint near the clicked button)
 *
 * Word-like type-ahead format is deferred to v0.3.x architectural
 * work — see docs/DOCUMENT_MODE_PRINCIPLES.md §7.
 */

describe('applyInlineFormat — v0.2.29 contract', () => {
  it('non-empty selection wraps and returns true (bold)', () => {
    const v = makeView('hello world', 0);
    v.dispatch({ selection: EditorSelection.range(0, 5) }); // 'hello'
    const applied = applyInlineFormat(v, 'bold');
    expect(applied).toBe(true);
    expect(v.state.doc.toString()).toBe('**hello** world');
    v.destroy();
  });

  it('non-empty selection that is already wrapped UNWRAPS (bold)', () => {
    const v = makeView('**hello** world', 0);
    v.dispatch({ selection: EditorSelection.range(2, 7) }); // 'hello' inside marks
    const applied = applyInlineFormat(v, 'bold');
    expect(applied).toBe(true);
    expect(v.state.doc.toString()).toBe('hello world');
    v.destroy();
  });

  it('empty selection NO-OPS and returns false (signals toolbar to show hint)', () => {
    const v = makeView('hello', 5);
    const applied = applyInlineFormat(v, 'bold');
    expect(applied).toBe(false);
    expect(v.state.doc.toString()).toBe('hello'); // doc unchanged
    v.destroy();
  });

  it('empty selection on empty doc NO-OPS — no malformed transient markdown', () => {
    // The v0.2.28 user-reported bug was that empty-selection toolbar
    // Bold inserted `****` (HorizontalRule). v0.2.29 contract: NO doc
    // change at all on empty selection.
    const v = makeView('', 0);
    const applied = applyInlineFormat(v, 'bold');
    expect(applied).toBe(false);
    expect(v.state.doc.toString()).toBe('');
    v.destroy();
  });

  it('italic with selection wraps with single asterisk', () => {
    const v = makeView('hello', 0);
    v.dispatch({ selection: EditorSelection.range(0, 5) });
    applyInlineFormat(v, 'italic');
    expect(v.state.doc.toString()).toBe('*hello*');
    v.destroy();
  });

  it('strike with selection wraps with double tilde', () => {
    const v = makeView('hello', 0);
    v.dispatch({ selection: EditorSelection.range(0, 5) });
    applyInlineFormat(v, 'strike');
    expect(v.state.doc.toString()).toBe('~~hello~~');
    v.destroy();
  });

  it('code with selection wraps with backtick', () => {
    const v = makeView('hello', 0);
    v.dispatch({ selection: EditorSelection.range(0, 5) });
    applyInlineFormat(v, 'code');
    expect(v.state.doc.toString()).toBe('`hello`');
    v.destroy();
  });

  it('sub with selection wraps with HTML <sub>', () => {
    const v = makeView('H2O', 0);
    v.dispatch({ selection: EditorSelection.range(1, 2) }); // '2'
    applyInlineFormat(v, 'sub');
    expect(v.state.doc.toString()).toBe('H<sub>2</sub>O');
    v.destroy();
  });

  it('sup with selection wraps with HTML <sup>', () => {
    const v = makeView('E=mc2', 0);
    v.dispatch({ selection: EditorSelection.range(4, 5) }); // '2'
    applyInlineFormat(v, 'sup');
    expect(v.state.doc.toString()).toBe('E=mc<sup>2</sup>');
    v.destroy();
  });
});

import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { expandMacro, buildMacroKeymap } from '../../src/editor/keymap/macros';

function mkView(doc = '', selFrom = 0, selTo = selFrom): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor: selFrom, head: selTo },
  });
  return new EditorView({ state });
}

describe('expandMacro', () => {
  it('replaces ${YYYY}-${MM}-${DD} with a current-date-shaped string', () => {
    const v = mkView();
    const r = expandMacro('${YYYY}-${MM}-${DD}', v);
    expect(r.text).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.cursorOffset).toBeNull();
  });

  it('replaces ${date} and ${time} with the same shape', () => {
    const v = mkView();
    expect(expandMacro('${date}', v).text).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(expandMacro('${time}', v).text).toMatch(/^\d{2}:\d{2}$/);
  });

  it('replaces ${HH}:${mm} with hour:minute', () => {
    const v = mkView();
    expect(expandMacro('${HH}:${mm}', v).text).toMatch(/^\d{2}:\d{2}$/);
  });

  it('returns cursor offset for ${cursor} and strips the marker', () => {
    const v = mkView();
    const r = expandMacro('foo${cursor}bar', v);
    expect(r.text).toBe('foobar');
    expect(r.cursorOffset).toBe(3);
  });

  it('cursor offset works after other token expansion', () => {
    const v = mkView();
    const r = expandMacro('[${date}]${cursor}', v);
    expect(r.text).toMatch(/^\[\d{4}-\d{2}-\d{2}\]$/);
    expect(r.cursorOffset).toBe(r.text.length);
  });

  it('replaces ${selection} with the current selection text', () => {
    const v = mkView('hello world', 0, 5);
    expect(expandMacro('[${selection}]', v).text).toBe('[hello]');
  });

  it('replaces ${selection} with empty string when there is no selection', () => {
    const v = mkView('abc', 0, 0);
    expect(expandMacro('<${selection}>', v).text).toBe('<>');
  });

  it('leaves unknown tokens verbatim', () => {
    const v = mkView();
    expect(expandMacro('foo ${unknown} bar', v).text).toBe('foo ${unknown} bar');
  });

  it('passes a literal that contains no tokens through unchanged', () => {
    const v = mkView();
    const r = expandMacro('\n\n---\n\n', v);
    expect(r.text).toBe('\n\n---\n\n');
    expect(r.cursorOffset).toBeNull();
  });
});

describe('buildMacroKeymap', () => {
  it('produces an Extension that does not throw when added to a state', () => {
    const ext = buildMacroKeymap([
      { name: 'X', keybind: 'Mod-Shift-D', insertion: '${date}' },
    ]);
    const state = EditorState.create({ doc: '', extensions: [ext] });
    // Just constructing a view with this extension is enough; we don't try
    // to fire keys in jsdom (B1 #2).
    const view = new EditorView({ state });
    expect(view.state.doc.toString()).toBe('');
    view.destroy();
  });

  it('handles an empty macro list', () => {
    const ext = buildMacroKeymap([]);
    const state = EditorState.create({ doc: '', extensions: [ext] });
    const view = new EditorView({ state });
    view.destroy();
    expect(state.doc.toString()).toBe('');
  });
});

import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { wrapSelection, unwrapIfWrapped } from '../../src/editor/keymap/toggleWrap';

function makeView(doc: string, anchor: number, head: number) {
  const state = EditorState.create({ doc, selection: { anchor, head } });
  return new EditorView({ state, parent: document.body.appendChild(document.createElement('div')) });
}

describe('toggleWrap', () => {
  it('wraps a non-wrapped selection', () => {
    const v = makeView('hello world', 0, 5);
    wrapSelection(v, '**', '**');
    expect(v.state.doc.toString()).toBe('**hello** world');
    v.destroy();
  });
  it('unwraps when selection is already wrapped', () => {
    const v = makeView('**hello** world', 2, 7);
    unwrapIfWrapped(v, '**', '**');
    expect(v.state.doc.toString()).toBe('hello world');
    v.destroy();
  });
});

// v0.2.29 — empty-selection behavior moved to pendingInlineFormat.ts
// (Word-style "pending format" state). The placeholder approach pioneered
// here in an earlier v0.2.29 commit turned out NOT to cover the toolbar
// onClick path (false-green 6th pattern) — see PR #8 history. Tests for
// the new empty-selection contract live in tests/editor/pendingInlineFormat.test.ts.

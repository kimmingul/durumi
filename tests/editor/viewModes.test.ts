import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  focusModeField,
  setFocusMode,
  setTypewriterMode,
  typewriterModeField,
  viewModes,
} from '../../src/editor/viewModes';

function setup(doc: string, cursor = 0): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [markdown({ base: markdownLanguage }), viewModes()],
  });
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({ state, parent });
}

describe('focus mode', () => {
  it('starts disabled and adds no decorations', () => {
    const view = setup('# A\n\n# B\n\n# C\n', 0);
    expect(view.state.field(focusModeField)).toBe(false);
    expect(view.dom.querySelectorAll('.cm-focus-dim').length).toBe(0);
    expect(view.dom.querySelectorAll('.cm-focus-active').length).toBe(0);
    view.destroy();
  });

  it('dims non-active lines when enabled', () => {
    const doc = 'first paragraph\n\nsecond paragraph\n\nthird paragraph\n';
    const view = setup(doc, doc.indexOf('second'));
    view.dispatch({ effects: setFocusMode.of(true) });
    expect(view.state.field(focusModeField)).toBe(true);
    const active = view.dom.querySelectorAll('.cm-focus-active');
    const dim = view.dom.querySelectorAll('.cm-focus-dim');
    expect(active.length).toBeGreaterThan(0);
    expect(dim.length).toBeGreaterThan(0);
    view.destroy();
  });

  it('toggles back off cleanly', () => {
    const view = setup('para one\n\npara two\n', 0);
    view.dispatch({ effects: setFocusMode.of(true) });
    view.dispatch({ effects: setFocusMode.of(false) });
    expect(view.state.field(focusModeField)).toBe(false);
    expect(view.dom.querySelectorAll('.cm-focus-dim').length).toBe(0);
    view.destroy();
  });
});

describe('typewriter mode', () => {
  it('starts disabled and toggles on/off via state effect', () => {
    const view = setup('a\nb\nc', 0);
    expect(view.state.field(typewriterModeField)).toBe(false);
    view.dispatch({ effects: setTypewriterMode.of(true) });
    expect(view.state.field(typewriterModeField)).toBe(true);
    view.dispatch({ effects: setTypewriterMode.of(false) });
    expect(view.state.field(typewriterModeField)).toBe(false);
    view.destroy();
  });
});

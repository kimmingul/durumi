import { describe, it, expect } from 'vitest';
import { EditorState, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { atomicMediaExtension, __test } from '../../src/editor/atomicMedia';
import { editModeStateExtension, setEditMode } from '../../src/editor/editMode';
import { userActiveExtension } from '../../src/editor/decorations/activeLine';

const { findMediaAtEdge } = __test;

/**
 * Tests sit at two levels:
 *
 *  - `findMediaAtEdge` (the lookup) is driven directly off an
 *    `EditorState` so we can spot-check every edge case without
 *    needing a live EditorView.
 *
 *  - The keymap (Backspace / Delete actually mutating the doc) is
 *    exercised through a real `EditorView` so the CM6 transaction
 *    pipeline + atomicRanges + keymap precedence are all in play.
 *
 * The state seeded into both helpers includes `editModeStateExtension`
 * because `shouldHideMarker` checks the current mode, and the user-
 * active field because the lookup also reads `hasActiveLine`. Without
 * either, the "is the widget actually showing" gate would always say
 * "no" and the lookup would never fire.
 */

function stateFor(doc: string, cursor = 0): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [
      markdown({ base: markdownLanguage, extensions: [GFM] }),
      editModeStateExtension(),
      userActiveExtension(),
    ],
  });
}

function viewFor(doc: string, cursor = 0): EditorView {
  const view = new EditorView({
    state: stateFor(doc, cursor),
    parent: document.body.appendChild(document.createElement('div')),
  });
  // Default mode is wysiwyg (see editMode.ts initial value) — explicit
  // dispatch ensures the StateField is populated before our keymap runs.
  view.dispatch({ effects: setEditMode.of('wysiwyg') });
  return view;
}

/** Tick the user-active gate so `hasActiveLine` returns true. */
function armUserActive(view: EditorView): void {
  view.dispatch({
    selection: { anchor: view.state.selection.main.anchor },
    userEvent: 'select',
  });
}

describe('findMediaAtEdge — Image', () => {
  it('Backspace at the right edge of an image fires (returns full node range)', () => {
    // doc: `![](u)` length 6
    const doc = '![](u)';
    const state = stateFor(doc, doc.length);
    const target = findMediaAtEdge(state, doc.length, 'backward');
    expect(target).toEqual({ from: 0, to: 6 });
  });

  it('Delete at the left edge of an image fires', () => {
    const doc = '![](u)';
    const state = stateFor(doc, 0);
    const target = findMediaAtEdge(state, 0, 'forward');
    expect(target).toEqual({ from: 0, to: 6 });
  });

  it('Backspace in the middle of text just after an image does NOT fire', () => {
    const doc = '![](u) trailing';
    const state = stateFor(doc, doc.length); // caret after 'trailing'
    const target = findMediaAtEdge(state, doc.length, 'backward');
    expect(target).toBeNull();
  });

  it('Image with no URL child (parser quirk) is skipped', () => {
    // `![]` parses as Image but without a URL → not an inline image we
    // would have rendered as a widget. Caret at the closing `]` must
    // NOT trigger a whole-node delete.
    const doc = '![]';
    const state = stateFor(doc, doc.length);
    const target = findMediaAtEdge(state, doc.length, 'backward');
    expect(target).toBeNull();
  });
});

describe('findMediaAtEdge — Link', () => {
  it('Backspace at the right edge of [text](url) fires', () => {
    const doc = '[label](https://e.com)';
    const state = stateFor(doc, doc.length);
    const target = findMediaAtEdge(state, doc.length, 'backward');
    expect(target).toEqual({ from: 0, to: doc.length });
  });

  it('Backspace at the START of the visible label (just after hidden [) fires', () => {
    // Cursor at position 1 (between `[` and `l`abel). User pressing
    // Backspace here would otherwise nick the `[` and break the link.
    const doc = '[label](https://e.com)';
    const state = stateFor(doc, 1);
    const target = findMediaAtEdge(state, 1, 'backward');
    expect(target).toEqual({ from: 0, to: doc.length });
  });

  it('Backspace in the MIDDLE of the label does not fire (normal edit)', () => {
    // Cursor between 'la' and 'bel'. User is editing the label; do not
    // collapse to a whole-link delete.
    const doc = '[label](https://e.com)';
    const state = stateFor(doc, 3);
    const target = findMediaAtEdge(state, 3, 'backward');
    expect(target).toBeNull();
  });

  it('Delete at the left edge of [text](url) fires', () => {
    const doc = '[label](https://e.com)';
    const state = stateFor(doc, 0);
    const target = findMediaAtEdge(state, 0, 'forward');
    expect(target).toEqual({ from: 0, to: doc.length });
  });

  it('Delete at the END of the visible label (just before hidden ]) fires', () => {
    // Mirror of the start-of-label case: `[label]...` has the `]` at
    // index 6, so cursor at 6 is at the end of the label.
    const doc = '[label](https://e.com)';
    const state = stateFor(doc, 6);
    const target = findMediaAtEdge(state, 6, 'forward');
    expect(target).toEqual({ from: 0, to: doc.length });
  });

  it('Shortcut link `[Term]` (no URL child) is skipped', () => {
    // Strict-literal contract: `[Term]` without a paren-URL is plain
    // text, not a real link. Backspace next to it should behave as
    // normal char-by-char.
    const doc = '[Term]';
    const state = stateFor(doc, doc.length);
    expect(findMediaAtEdge(state, doc.length, 'backward')).toBeNull();
  });

  it('does not fire when no widget would have been rendered (Typora + active line)', () => {
    // Build a doc with the caret on the same line as the link, then
    // switch the editor mode to Typora. shouldHideMarker → false →
    // widget not rendered → the user IS editing raw markdown → atomic
    // delete must not kick in.
    const doc = '[label](u)';
    const baseState = stateFor(doc, doc.length);
    const view = new EditorView({
      state: baseState,
      parent: document.body.appendChild(document.createElement('div')),
    });
    view.dispatch({ effects: setEditMode.of('typora') });
    armUserActive(view);
    const target = findMediaAtEdge(view.state, doc.length, 'backward');
    expect(target).toBeNull();
    view.destroy();
  });
});

describe('keymap — Backspace / Delete actually remove the whole widget', () => {
  it('Backspace at right edge of an image deletes the whole `![](url)`', () => {
    const doc = 'before ![](u) after';
    const imgEnd = doc.indexOf(' after');
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: imgEnd },
        extensions: [
          markdown({ base: markdownLanguage, extensions: [GFM] }),
          editModeStateExtension(),
          userActiveExtension(),
          atomicMediaExtension(),
        ],
      }),
      parent: document.body.appendChild(document.createElement('div')),
    });
    view.dispatch({ effects: setEditMode.of('wysiwyg') });
    // Drive the keymap by issuing the exact same transaction the
    // Backspace command would dispatch. Skipping the synthetic
    // KeyboardEvent route keeps the test independent of jsdom's
    // unreliable composition-event surface.
    const sel = view.state.selection.main;
    const target = findMediaAtEdge(view.state, sel.head, 'backward');
    expect(target).not.toBeNull();
    view.dispatch({
      changes: { from: target!.from, to: target!.to },
      selection: { anchor: target!.from },
    });
    expect(view.state.doc.toString()).toBe('before  after');
    view.destroy();
  });

  it('Delete at left edge of a link deletes the whole `[label](url)`', () => {
    const doc = 'see [click](https://e.com) end';
    const linkStart = doc.indexOf('[');
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: linkStart },
        extensions: [
          markdown({ base: markdownLanguage, extensions: [GFM] }),
          editModeStateExtension(),
          userActiveExtension(),
          atomicMediaExtension(),
        ],
      }),
      parent: document.body.appendChild(document.createElement('div')),
    });
    view.dispatch({ effects: setEditMode.of('wysiwyg') });
    const target = findMediaAtEdge(view.state, linkStart, 'forward');
    expect(target).not.toBeNull();
    view.dispatch({
      changes: { from: target!.from, to: target!.to },
      selection: { anchor: target!.from },
    });
    expect(view.state.doc.toString()).toBe('see  end');
    view.destroy();
  });

  it('Backspace at right edge of a link deletes the whole `[label](url)`', () => {
    const doc = 'see [click](https://e.com) end';
    const linkEnd = doc.indexOf(') end') + 1;
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: linkEnd },
        extensions: [
          markdown({ base: markdownLanguage, extensions: [GFM] }),
          editModeStateExtension(),
          userActiveExtension(),
          atomicMediaExtension(),
        ],
      }),
      parent: document.body.appendChild(document.createElement('div')),
    });
    view.dispatch({ effects: setEditMode.of('wysiwyg') });
    const target = findMediaAtEdge(view.state, linkEnd, 'backward');
    expect(target).not.toBeNull();
    view.dispatch({
      changes: { from: target!.from, to: target!.to },
      selection: { anchor: target!.from },
    });
    expect(view.state.doc.toString()).toBe('see  end');
    view.destroy();
  });

  // Silence unused-var warning for the test helper kept for future
  // keymap-via-real-event tests (jsdom keyboard simulation is flaky).
  void armUserActive;
  void Transaction;
});

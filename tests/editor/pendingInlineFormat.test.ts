import { describe, it, expect } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  applyInlineFormat,
  clearPendingInlineFormat,
  getPendingFormat,
  pendingInlineFormatExtension,
  togglePendingInlineFormat,
} from '../../src/editor/keymap/pendingInlineFormat';
import { editModeStateExtension, setEditMode } from '../../src/editor/editMode';

/**
 * v0.2.29 — Word-style pending inline format state machine.
 *
 * Tests the contract:
 *   - Empty selection + applyInlineFormat → pending state set, no doc change
 *   - Non-empty selection + applyInlineFormat → doc wrap, no pending state
 *   - Next input.type / input.compose with pending → wrap + clear
 *   - Caret move with no doc change → clear pending
 *   - Mode switch (setEditMode) → clear pending
 *   - Loop guard: re-emitted userEvents do not double-wrap
 */

function makeView(doc = '', cursor = 0): EditorView {
  return new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [pendingInlineFormatExtension(), editModeStateExtension()],
    }),
    parent: document.body.appendChild(document.createElement('div')),
  });
}

describe('pendingInlineFormatField', () => {
  it('starts with no pending format', () => {
    const v = makeView('', 0);
    expect(getPendingFormat(v.state)).toBeNull();
    v.destroy();
  });

  it('togglePendingInlineFormat sets the pending format', () => {
    const v = makeView('', 0);
    v.dispatch({ effects: togglePendingInlineFormat.of('bold') });
    expect(getPendingFormat(v.state)).toBe('bold');
    v.destroy();
  });

  it('toggling same format twice clears it', () => {
    const v = makeView('', 0);
    v.dispatch({ effects: togglePendingInlineFormat.of('bold') });
    v.dispatch({ effects: togglePendingInlineFormat.of('bold') });
    expect(getPendingFormat(v.state)).toBeNull();
    v.destroy();
  });

  it('toggling a different format replaces (single-slot v0.2.29)', () => {
    const v = makeView('', 0);
    v.dispatch({ effects: togglePendingInlineFormat.of('bold') });
    v.dispatch({ effects: togglePendingInlineFormat.of('italic') });
    expect(getPendingFormat(v.state)).toBe('italic');
    v.destroy();
  });

  it('clearPendingInlineFormat resets to null', () => {
    const v = makeView('', 0);
    v.dispatch({ effects: togglePendingInlineFormat.of('bold') });
    v.dispatch({ effects: clearPendingInlineFormat.of(null) });
    expect(getPendingFormat(v.state)).toBeNull();
    v.destroy();
  });

  it('caret-only selection change clears pending', () => {
    const v = makeView('hello', 0);
    v.dispatch({ effects: togglePendingInlineFormat.of('bold') });
    expect(getPendingFormat(v.state)).toBe('bold');
    v.dispatch({ selection: { anchor: 3 } });
    expect(getPendingFormat(v.state)).toBeNull();
    v.destroy();
  });

  it('mode switch clears pending', () => {
    const v = makeView('', 0);
    v.dispatch({ effects: togglePendingInlineFormat.of('bold') });
    v.dispatch({ effects: setEditMode.of('markdown') });
    expect(getPendingFormat(v.state)).toBeNull();
    v.destroy();
  });
});

describe('applyInlineFormat — empty vs non-empty selection', () => {
  it('empty selection sets pending, NO doc change', () => {
    const v = makeView('hello ', 6);
    applyInlineFormat(v, 'bold');
    expect(v.state.doc.toString()).toBe('hello ');
    expect(getPendingFormat(v.state)).toBe('bold');
    v.destroy();
  });

  it('non-empty selection wraps the selection, NO pending set', () => {
    const v = makeView('hello world', 0);
    v.dispatch({ selection: EditorSelection.range(0, 5) }); // 'hello'
    applyInlineFormat(v, 'bold');
    expect(v.state.doc.toString()).toBe('**hello** world');
    expect(getPendingFormat(v.state)).toBeNull();
    v.destroy();
  });

  it('non-empty selection that is already wrapped UNWRAPS', () => {
    const v = makeView('**hello** world', 0);
    v.dispatch({ selection: EditorSelection.range(2, 7) }); // 'hello' inside marks
    applyInlineFormat(v, 'bold');
    expect(v.state.doc.toString()).toBe('hello world');
    v.destroy();
  });

  it('sub/sup format uses HTML markers', () => {
    const v = makeView('H2O', 0);
    v.dispatch({ selection: EditorSelection.range(1, 2) }); // '2'
    applyInlineFormat(v, 'sub');
    expect(v.state.doc.toString()).toBe('H<sub>2</sub>O');
    v.destroy();
  });
});

describe('transactionFilter — input.type wrapping', () => {
  it('first input.type after pending bold wraps the typed text', () => {
    const v = makeView('', 0);
    applyInlineFormat(v, 'bold');
    expect(getPendingFormat(v.state)).toBe('bold');
    // Simulate user typing 'h'
    v.dispatch(v.state.update({ changes: { from: 0, insert: 'h' }, userEvent: 'input.type' }));
    expect(v.state.doc.toString()).toBe('**h**');
    // Caret should land between 'h' and the closing '**'
    expect(v.state.selection.main.head).toBe(3);
    // Pending cleared
    expect(getPendingFormat(v.state)).toBeNull();
    v.destroy();
  });

  it('non-toggle pending strike wraps with ~~', () => {
    const v = makeView('', 0);
    applyInlineFormat(v, 'strike');
    v.dispatch(v.state.update({ changes: { from: 0, insert: 'h' }, userEvent: 'input.type' }));
    expect(v.state.doc.toString()).toBe('~~h~~');
    v.destroy();
  });

  it('multi-char insertion (e.g., paste) still wraps', () => {
    const v = makeView('', 0);
    applyInlineFormat(v, 'bold');
    v.dispatch(v.state.update({ changes: { from: 0, insert: 'hello' }, userEvent: 'input.type' }));
    expect(v.state.doc.toString()).toBe('**hello**');
    // Caret should be after 'hello', before closing '**'
    expect(v.state.selection.main.head).toBe(7);
    v.destroy();
  });

  it('after wrap, subsequent input.type does NOT re-wrap (pending cleared)', () => {
    const v = makeView('', 0);
    applyInlineFormat(v, 'bold');
    v.dispatch(v.state.update({ changes: { from: 0, insert: 'h' }, userEvent: 'input.type' }));
    expect(v.state.doc.toString()).toBe('**h**');
    // User types 'e' next — should land at caret position 3 (inside bold span)
    v.dispatch(v.state.update({ changes: { from: 3, insert: 'e' }, userEvent: 'input.type' }));
    expect(v.state.doc.toString()).toBe('**he**');
    v.destroy();
  });

  it('NO pending state → input.type passes through unchanged', () => {
    const v = makeView('', 0);
    v.dispatch(v.state.update({ changes: { from: 0, insert: 'h' }, userEvent: 'input.type' }));
    expect(v.state.doc.toString()).toBe('h');
    v.destroy();
  });

  it('loop guard: re-emitted input.type.pending-format does not double-wrap', () => {
    const v = makeView('', 0);
    applyInlineFormat(v, 'bold');
    // First dispatch: filter rewrites this to **h** with userEvent input.type.pending-format
    v.dispatch(v.state.update({ changes: { from: 0, insert: 'h' }, userEvent: 'input.type' }));
    expect(v.state.doc.toString()).toBe('**h**');
    // Doc is **h**, not ****h**** — confirms filter didn't process its own output.
    v.destroy();
  });
});

describe('transactionFilter — input.compose (IME) wrapping', () => {
  it('first input.compose after pending bold wraps the composing text', () => {
    const v = makeView('', 0);
    applyInlineFormat(v, 'bold');
    // Simulate first IME composition event with 'ㅎ'.
    v.dispatch(v.state.update({ changes: { from: 0, insert: 'ㅎ' }, userEvent: 'input.compose' }));
    expect(v.state.doc.toString()).toBe('**ㅎ**');
    expect(getPendingFormat(v.state)).toBeNull();
    v.destroy();
  });

  it('subsequent input.compose updates inside the new bold span do NOT re-wrap', () => {
    const v = makeView('', 0);
    applyInlineFormat(v, 'bold');
    // First compose event: 'ㅎ' → **ㅎ**, caret at pos 3
    v.dispatch(v.state.update({ changes: { from: 0, insert: 'ㅎ' }, userEvent: 'input.compose' }));
    expect(v.state.doc.toString()).toBe('**ㅎ**');
    // Subsequent compose: IME replaces 'ㅎ' at pos 2..3 with '하'
    v.dispatch(
      v.state.update({ changes: { from: 2, to: 3, insert: '하' }, userEvent: 'input.compose' }),
    );
    expect(v.state.doc.toString()).toBe('**하**');
    v.destroy();
  });
});

describe('caret move clears pending without wrapping', () => {
  it('pending + arrow key (selection change, no doc change) → cleared', () => {
    const v = makeView('hello', 5);
    applyInlineFormat(v, 'bold');
    expect(getPendingFormat(v.state)).toBe('bold');
    // Simulate arrow-left: selection move, no doc change.
    v.dispatch({ selection: { anchor: 4 }, userEvent: 'select' });
    expect(getPendingFormat(v.state)).toBeNull();
    // Now typing should NOT wrap.
    v.dispatch(v.state.update({ changes: { from: 4, insert: 'X' }, userEvent: 'input.type' }));
    expect(v.state.doc.toString()).toBe('hellXo');
    v.destroy();
  });
});

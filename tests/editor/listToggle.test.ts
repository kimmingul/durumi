import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  toggleBulletList,
  toggleNumberedList,
  toggleTaskList,
} from '../../src/editor/keymap/listToggle';

/**
 * v0.2.19 list-toggle helpers powering the Document-mode toolbar buttons.
 * Covers bugs #1-#4 from the v0.2.18 manual-test report:
 *   - multi-line selection applies / removes the marker on every line
 *   - numbered list continues from the previous line's number when
 *     toggling a single new line after an existing item
 *   - blank lines inside a selection are skipped
 *   - toggle-off when every selected line already has the marker
 */

function setup(doc: string, anchor: number, head = anchor): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc, selection: { anchor, head } }),
    parent: document.body.appendChild(document.createElement('div')),
  });
  return view;
}

describe('toggleBulletList (bug #1 - multi-line)', () => {
  it('prepends "- " to every line in a multi-line selection', () => {
    const doc = 'one\ntwo\nthree';
    const view = setup(doc, 0, doc.length);
    expect(toggleBulletList(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('- one\n- two\n- three');
    view.destroy();
  });

  it('prepends "- " on a single line when there is no selection', () => {
    const view = setup('only', 2);
    expect(toggleBulletList(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('- only');
    view.destroy();
  });

  it('strips the bullet from every line when all selected lines are bullets', () => {
    const doc = '- one\n- two\n- three';
    const view = setup(doc, 0, doc.length);
    toggleBulletList(view);
    expect(view.state.doc.toString()).toBe('one\ntwo\nthree');
    view.destroy();
  });

  it('replaces existing numbered prefixes with "- " in the same pass', () => {
    const doc = '1. one\n2. two';
    const view = setup(doc, 0, doc.length);
    toggleBulletList(view);
    expect(view.state.doc.toString()).toBe('- one\n- two');
    view.destroy();
  });

  it('skips blank lines inside the selection', () => {
    const doc = 'one\n\nthree';
    const view = setup(doc, 0, doc.length);
    toggleBulletList(view);
    expect(view.state.doc.toString()).toBe('- one\n\n- three');
    view.destroy();
  });

  it('handles a selection that starts mid-line and ends mid-line', () => {
    const doc = 'one\ntwo\nthree';
    // selection from inside "one" through inside "three"
    const anchor = 1;
    const head = doc.length - 2;
    const view = setup(doc, anchor, head);
    toggleBulletList(view);
    expect(view.state.doc.toString()).toBe('- one\n- two\n- three');
    view.destroy();
  });

  it('treats a selection ending exactly at the next line\'s start as covering the previous line only', () => {
    // selection from start of "one" up to but NOT including "two"
    const doc = 'one\ntwo';
    const view = setup(doc, 0, 4); // "one\n" (4 chars including newline)
    toggleBulletList(view);
    expect(view.state.doc.toString()).toBe('- one\ntwo');
    view.destroy();
  });
});

describe('toggleNumberedList (bug #2 - multi-line)', () => {
  it('numbers every line in a multi-line selection sequentially', () => {
    const doc = 'one\ntwo\nthree';
    const view = setup(doc, 0, doc.length);
    toggleNumberedList(view);
    expect(view.state.doc.toString()).toBe('1. one\n2. two\n3. three');
    view.destroy();
  });

  it('strips numbered prefixes from every line when all selected lines are numbered', () => {
    const doc = '1. one\n2. two\n3. three';
    const view = setup(doc, 0, doc.length);
    toggleNumberedList(view);
    expect(view.state.doc.toString()).toBe('one\ntwo\nthree');
    view.destroy();
  });

  it('replaces bullet prefixes with consecutive numbers', () => {
    const doc = '- one\n- two';
    const view = setup(doc, 0, doc.length);
    toggleNumberedList(view);
    expect(view.state.doc.toString()).toBe('1. one\n2. two');
    view.destroy();
  });
});

describe('toggleNumberedList (bug #3 - continuity)', () => {
  it('continues numbering when the previous non-blank line is a numbered item', () => {
    // User typed "1. apple" then moved to next line "banana" and clicked
    // the numbered button. Expected: "2. banana", not "1. banana".
    const doc = '1. apple\nbanana';
    const head = doc.length;
    const view = setup(doc, head);
    toggleNumberedList(view);
    expect(view.state.doc.toString()).toBe('1. apple\n2. banana');
    view.destroy();
  });

  it('continues from N+1 even with a blank line separating the items', () => {
    const doc = '3. third\n\nfourth';
    const head = doc.length;
    const view = setup(doc, head);
    toggleNumberedList(view);
    expect(view.state.doc.toString()).toBe('3. third\n\n4. fourth');
    view.destroy();
  });

  it('starts at 1 when the previous line is not a numbered item', () => {
    const doc = '- bullet\nbanana';
    const head = doc.length;
    const view = setup(doc, head);
    toggleNumberedList(view);
    expect(view.state.doc.toString()).toBe('- bullet\n1. banana');
    view.destroy();
  });

  it('starts at 1 at the top of the document', () => {
    const view = setup('first', 5);
    toggleNumberedList(view);
    expect(view.state.doc.toString()).toBe('1. first');
    view.destroy();
  });

  it('multi-line selection after a numbered item continues from N+1, then increments', () => {
    const doc = '5. five\nsix\nseven\neight';
    // select all three plain lines below "5. five"
    const anchor = '5. five\n'.length;
    const head = doc.length;
    const view = setup(doc, anchor, head);
    toggleNumberedList(view);
    expect(view.state.doc.toString()).toBe('5. five\n6. six\n7. seven\n8. eight');
    view.destroy();
  });
});

describe('toggleTaskList (bug #4 - multi-line)', () => {
  it('prepends "- [ ] " to every line in a multi-line selection', () => {
    const doc = 'one\ntwo\nthree';
    const view = setup(doc, 0, doc.length);
    toggleTaskList(view);
    expect(view.state.doc.toString()).toBe('- [ ] one\n- [ ] two\n- [ ] three');
    view.destroy();
  });

  it('strips the checkbox prefix from every line when all are tasks', () => {
    const doc = '- [ ] one\n- [x] two';
    const view = setup(doc, 0, doc.length);
    toggleTaskList(view);
    expect(view.state.doc.toString()).toBe('one\ntwo');
    view.destroy();
  });

  it('inserts "[ ] " after an existing bullet (keeps the bullet)', () => {
    const view = setup('- already a bullet', 18);
    toggleTaskList(view);
    expect(view.state.doc.toString()).toBe('- [ ] already a bullet');
    view.destroy();
  });

  it('leaves lines that are already tasks untouched in mixed selections', () => {
    const doc = '- [ ] done\nplain';
    const view = setup(doc, 0, doc.length);
    toggleTaskList(view);
    // mixed: the second line gets a fresh "- [ ] " prefix; the first is left alone
    expect(view.state.doc.toString()).toBe('- [ ] done\n- [ ] plain');
    view.destroy();
  });

  it('skips blank lines in the selection', () => {
    const doc = 'one\n\nthree';
    const view = setup(doc, 0, doc.length);
    toggleTaskList(view);
    expect(view.state.doc.toString()).toBe('- [ ] one\n\n- [ ] three');
    view.destroy();
  });
});

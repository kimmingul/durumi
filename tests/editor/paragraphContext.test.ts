import { describe, it, expect } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import { currentParagraph } from '../../src/editor/paragraphContext';

function stateAt(doc: string, caret: number): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.single(caret),
  });
}

describe('currentParagraph', () => {
  it('returns null when the caret sits on a blank line', () => {
    const s = stateAt('alpha\n\nbeta', 6); // blank line
    expect(currentParagraph(s)).toBeNull();
  });

  it('returns the single line when surrounded by blanks', () => {
    const s = stateAt('alpha\n\nbeta\n\ngamma', 8); // inside "beta"
    const r = currentParagraph(s);
    expect(r).not.toBeNull();
    expect(r!.text).toBe('beta');
    expect(r!.startLine).toBe(3);
    expect(r!.endLine).toBe(3);
  });

  it('expands across consecutive non-blank lines', () => {
    const doc = 'one\ntwo\nthree\n\nfour';
    const s = stateAt(doc, 5); // inside "two"
    const r = currentParagraph(s);
    expect(r!.text).toBe('one\ntwo\nthree');
    expect(r!.startLine).toBe(1);
    expect(r!.endLine).toBe(3);
  });

  it('clamps at document boundaries', () => {
    const s = stateAt('first\nsecond', 2);
    const r = currentParagraph(s);
    expect(r!.text).toBe('first\nsecond');
    expect(r!.startLine).toBe(1);
    expect(r!.endLine).toBe(2);
  });

  it('reports byte ranges (from..to) consistent with the slice', () => {
    const doc = 'alpha\n\nbeta gamma\n\ndelta';
    const s = stateAt(doc, 10); // inside "beta gamma"
    const r = currentParagraph(s);
    expect(doc.slice(r!.from, r!.to)).toBe('beta gamma');
  });

  it('treats whitespace-only lines as blank delimiters', () => {
    const doc = 'one\n   \ntwo';
    const s = stateAt(doc, 1); // inside "one"
    const r = currentParagraph(s);
    expect(r!.text).toBe('one');
    expect(r!.endLine).toBe(1);
  });
});

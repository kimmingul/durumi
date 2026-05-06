import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { getActiveLineRange } from '../../src/editor/decorations/activeLine';

describe('getActiveLineRange', () => {
  it('returns the line containing the primary selection head', () => {
    const state = EditorState.create({ doc: 'one\ntwo\nthree' });
    const moved = state.update({ selection: { anchor: 5 } }).state;
    const range = getActiveLineRange(moved);
    expect(range.from).toBe(4);
    expect(range.to).toBe(7);
    expect(range.number).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import {
  currentEditMode,
  EDIT_MODES,
  editModeStateExtension,
  isEditMode,
  isMarkdownMode,
  isWysiwygMode,
  setEditMode,
} from '../../src/editor/editMode';

function makeState() {
  return EditorState.create({ doc: 'hello', extensions: [editModeStateExtension()] });
}

describe('editMode', () => {
  it('lists exactly three modes', () => {
    expect(EDIT_MODES).toEqual(['wysiwyg', 'typora', 'markdown']);
  });

  it('isEditMode guard accepts valid values and rejects others', () => {
    expect(isEditMode('wysiwyg')).toBe(true);
    expect(isEditMode('typora')).toBe(true);
    expect(isEditMode('markdown')).toBe(true);
    expect(isEditMode('source')).toBe(false);
    expect(isEditMode(undefined)).toBe(false);
    expect(isEditMode(42)).toBe(false);
  });

  it('defaults to wysiwyg on a fresh state', () => {
    const s = makeState();
    expect(currentEditMode(s)).toBe('wysiwyg');
    expect(isWysiwygMode(s)).toBe(true);
    expect(isMarkdownMode(s)).toBe(false);
  });

  it('updates via setEditMode effect', () => {
    const s = makeState();
    const tr = s.update({ effects: setEditMode.of('typora') });
    expect(currentEditMode(tr.state)).toBe('typora');
    expect(isWysiwygMode(tr.state)).toBe(false);

    const tr2 = tr.state.update({ effects: setEditMode.of('markdown') });
    expect(currentEditMode(tr2.state)).toBe('markdown');
    expect(isMarkdownMode(tr2.state)).toBe(true);
  });

  it('persists through unrelated transactions', () => {
    const s = makeState();
    const set = s.update({ effects: setEditMode.of('markdown') }).state;
    const after = set.update({ changes: { from: 0, insert: 'X' } }).state;
    expect(currentEditMode(after)).toBe('markdown');
  });

  it('currentEditMode falls back to typora when the field is absent (legacy test compat)', () => {
    const bare = EditorState.create({ doc: 'no field' });
    expect(currentEditMode(bare)).toBe('typora');
  });
});

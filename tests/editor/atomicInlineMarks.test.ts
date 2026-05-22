import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { __test } from '../../src/editor/atomicInlineMarks';
import { editModeStateExtension, setEditMode } from '../../src/editor/editMode';
import { userActiveExtension } from '../../src/editor/decorations/activeLine';
import { EditorView } from '@codemirror/view';

const { findInlineMarkAtEdge } = __test;

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

function armUserActive(view: EditorView): void {
  view.dispatch({
    selection: { anchor: view.state.selection.main.anchor },
    userEvent: 'select',
  });
}

describe('findInlineMarkAtEdge — Bold (`**`)', () => {
  it('returns null when the lookup runs and nothing matches', () => {
    const doc = 'plain text';
    const state = stateFor(doc, 0);
    expect(findInlineMarkAtEdge(state, 0, 'backward')).toBeNull();
  });

  // armUserActive + setEditMode are wired in by Task 2 gating tests;
  // touching them here keeps lint quiet between Task 1 and Task 2
  // commits without introducing a real assertion.
  void armUserActive;
  void setEditMode;
});

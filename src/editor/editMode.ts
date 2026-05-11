import { EditorState, Extension, StateEffect, StateField } from '@codemirror/state';

/**
 * Edit display mode (v0.1.11).
 *
 * - `wysiwyg`: markdown markers are hidden EVERYWHERE — including the active
 *   line. Block widgets (image, math, mermaid) still reveal their source on
 *   the active line for editing (active-line invariant on `Decoration.replace`
 *   is preserved for IME safety), but inline markers (`*`, `_`, `#`, …) are
 *   collapsed via `Decoration.mark` + CSS `display: none`.
 * - `typora`: legacy behaviour — markers hidden on inactive lines, raw on
 *   the active line. What Durumi v0.1.0-v0.1.10 shipped.
 * - `markdown`: no live decorations at all. Plain markdown source.
 *
 * The three modes are swapped via a `Compartment` in `MarkdownEditor.tsx`
 * so reconfigure is cheap and preserves cursor + scroll state.
 */
export type EditMode = 'wysiwyg' | 'typora' | 'markdown';

export const EDIT_MODES: readonly EditMode[] = ['wysiwyg', 'typora', 'markdown'] as const;

export function isEditMode(value: unknown): value is EditMode {
  return value === 'wysiwyg' || value === 'typora' || value === 'markdown';
}

export const setEditMode = StateEffect.define<EditMode>();

export const editModeField: StateField<EditMode> = StateField.define<EditMode>({
  create() {
    return 'wysiwyg';
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setEditMode)) return e.value;
    }
    return value;
  },
});

export function currentEditMode(state: EditorState): EditMode {
  // Field-not-registered fallback is `typora` so legacy decoration tests
  // (which set up an EditorState without `editModeStateExtension`) keep
  // asserting the v0.1.0-style active-line invariant — i.e. raw markers
  // on the active line. Production always registers the field via
  // `MarkdownEditor`, so the production initial value comes from the
  // field's `create()` (`'wysiwyg'`), not from this fallback.
  return state.field(editModeField, false) ?? 'typora';
}

export function isWysiwygMode(state: EditorState): boolean {
  return currentEditMode(state) === 'wysiwyg';
}

export function isMarkdownMode(state: EditorState): boolean {
  return currentEditMode(state) === 'markdown';
}

/**
 * Extension bundle that registers the StateField so any decoration plugin
 * can read the current mode via `currentEditMode(state)`. Keep this loaded
 * unconditionally (outside the mode Compartment) so reading the mode never
 * fails.
 */
export function editModeStateExtension(): Extension {
  return editModeField;
}

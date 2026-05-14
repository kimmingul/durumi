import { EditorState, Extension, StateEffect, StateField } from '@codemirror/state';

/**
 * Absolute path of the document currently loaded in the editor, or
 * `null` when no file is bound (new unsaved buffer).
 *
 * Threaded through the editor as a `StateField` so widgets that need
 * to resolve workspace-relative paths — image src, future PDF embed,
 * etc. — can read it at decoration-build time. The MarkdownEditor
 * dispatches `setDocPath.of(filePath)` whenever its `filePath` prop
 * changes.
 *
 * Same shape as `editModeField` so the pattern is recognisable.
 */
export const setDocPath = StateEffect.define<string | null>();

export const docPathField: StateField<string | null> = StateField.define<string | null>({
  create() {
    return null;
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setDocPath)) return e.value;
    }
    return value;
  },
});

export function currentDocPath(state: EditorState): string | null {
  // Test states that don't register the field get null (same UX as "no
  // file open"). Production always registers via `MarkdownEditor`.
  return state.field(docPathField, false) ?? null;
}

export function docPathStateExtension(): Extension {
  return docPathField;
}

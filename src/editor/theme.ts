import { EditorView } from '@codemirror/view';

export function makeTheme() {
  return EditorView.theme({
    '&': {
      background: 'var(--bg)',
      color: 'var(--fg)',
      height: '100%',
    },
    '.cm-content': {
      caretColor: 'var(--fg)',
      padding: '32px 64px',
      maxWidth: '800px',
      margin: '0 auto',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--fg)' },
    '&.cm-focused .cm-selectionBackground, ::selection': { background: 'var(--selection)' },
    '.cm-activeLine': { backgroundColor: 'transparent' },
    '.cm-gutters': { background: 'var(--bg)', color: 'var(--muted-fg)', border: 'none' },
  });
}

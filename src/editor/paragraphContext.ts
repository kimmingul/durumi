import type { EditorState } from '@codemirror/state';

/**
 * Extracts the paragraph surrounding the caret. A paragraph is delimited by
 * one or more blank lines (the standard markdown convention). This helper
 * is the v0.1.7 foundation for the v0.1.8 AI track — when LLM-driven
 * citation suggestion lands, it needs "what is the current paragraph the
 * user is writing" as input. Keeping the helper free-standing in v0.1.7
 * lets us unit-test it in isolation now and wire it up later.
 *
 * Returns null when the caret sits on a blank line or no editor state is
 * available.
 */
export interface ParagraphContext {
  /** Document-relative byte range of the paragraph. */
  from: number;
  to: number;
  /** Raw paragraph text including any newlines between non-empty lines. */
  text: string;
  /** Line numbers (1-based) at the start and end of the paragraph. */
  startLine: number;
  endLine: number;
}

export function currentParagraph(state: EditorState): ParagraphContext | null {
  const sel = state.selection.main;
  const caretLine = state.doc.lineAt(sel.head);
  if (caretLine.text.trim().length === 0) return null;

  let startLine = caretLine.number;
  while (startLine > 1) {
    const prev = state.doc.line(startLine - 1);
    if (prev.text.trim().length === 0) break;
    startLine--;
  }
  let endLine = caretLine.number;
  while (endLine < state.doc.lines) {
    const next = state.doc.line(endLine + 1);
    if (next.text.trim().length === 0) break;
    endLine++;
  }
  const startInfo = state.doc.line(startLine);
  const endInfo = state.doc.line(endLine);
  return {
    from: startInfo.from,
    to: endInfo.to,
    text: state.doc.sliceString(startInfo.from, endInfo.to),
    startLine,
    endLine,
  };
}

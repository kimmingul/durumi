import type { EditorView } from '@codemirror/view';
import { toggleWrap } from './toggleWrap';

/**
 * v0.2.29 — Inline-format dispatcher used by toolbar, keymap, menu IPC.
 *
 * Design history & current contract:
 *
 * v0.2.28 inserted `${before}${after}` on empty selection (e.g.
 * `****` for Bold) and placed caret between the markers. That
 * collided with CommonMark block parsers (`****` → HorizontalRule)
 * AND broke Korean IME composition because the WYSIWYG-on-source
 * pattern (CodeMirror decorations + atomic ranges over markdown
 * source) is fundamentally fragile when the doc mutates mid-IME-
 * composition.
 *
 * v0.2.29 first tried a "placeholder text" approach (e.g. insert
 * `**굵게**` with placeholder selected) — still broke IME composition
 * because the same source-mutation-during-compose problem.
 *
 * v0.2.29 then tried Word-style "pending format" with a transactionFilter
 * that wrapped the first input.type or input.compose transaction.
 * ASCII worked; real macOS Korean IME still desynced because rewriting
 * the doc during composition (even on the first event) confuses the
 * IME's composing-range tracking.
 *
 * v0.2.29 final (this file): on empty selection, NO-OP. The toolbar
 * caller surfaces a transient tooltip "텍스트를 먼저 선택해주세요" so the
 * user knows the click was acknowledged. Shortcut + menu IPC paths
 * silently no-op (no convenient UI surface).
 *
 * This trades Word-like type-ahead UX for guaranteed IME safety. Real
 * Word-like UX is deferred to v0.3.x architectural work — see
 * docs/DOCUMENT_MODE_PRINCIPLES.md §7 "Buried Problem".
 *
 * Existing toggleWrap behaviour on NON-EMPTY selections is unchanged:
 * `applyInlineFormat(view, 'bold')` with a real selection wraps /
 * unwraps as before.
 */

export type InlineFormat = 'bold' | 'italic' | 'strike' | 'code' | 'sub' | 'sup';

interface FormatMarkers {
  before: string;
  after: string;
}

const FORMAT_MARKERS: Record<InlineFormat, FormatMarkers> = {
  bold: { before: '**', after: '**' },
  italic: { before: '*', after: '*' },
  strike: { before: '~~', after: '~~' },
  code: { before: '`', after: '`' },
  sub: { before: '<sub>', after: '</sub>' },
  sup: { before: '<sup>', after: '</sup>' },
};

/**
 * Apply the inline format if the selection is non-empty (wrap /
 * unwrap via toggleWrap). Returns `true` on dispatch, `false` on
 * empty-selection no-op so callers (toolbar) can surface a tooltip.
 */
export function applyInlineFormat(view: EditorView, format: InlineFormat): boolean {
  const sel = view.state.selection.main;
  if (sel.empty) return false;
  const { before, after } = FORMAT_MARKERS[format];
  return toggleWrap(view, before, after);
}

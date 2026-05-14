import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

/**
 * Result of `inlineMarksAt`: which inline marks "cover" the given position.
 *
 * `bold`/`italic`/`strike`/`code` are detected via the lezer markdown tree
 * (StrongEmphasis, Emphasis, Strikethrough, InlineCode). `sup`/`sub` are
 * detected two ways:
 *   - The InlineExtras parser emits `Superscript` / `Subscript` nodes for
 *     `^x^` / `~x~` source — those are picked up by the tree walk.
 *   - The toolbar toggles wrap selection in `<sup>...</sup>` / `<sub>...</sub>`
 *     HTML. The lezer markdown grammar doesn't tag HTML tag content, so we
 *     additionally scan the current line for the HTML form.
 */
export interface InlineMarkActiveSet {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  code: boolean;
  sup: boolean;
  sub: boolean;
}

const EMPTY_SET: InlineMarkActiveSet = {
  bold: false,
  italic: false,
  strike: false,
  code: false,
  sup: false,
  sub: false,
};

/**
 * Walk up the syntax tree from `pos` and flag which inline-mark ancestor
 * nodes we see. We use `resolveInner` because at the boundary between two
 * sibling nodes (e.g. immediately after an `*` run) we want the node that
 * actually contains the caret, not a zero-width frontier.
 */
export function inlineMarksAt(state: EditorState, pos: number): InlineMarkActiveSet {
  const result: InlineMarkActiveSet = { ...EMPTY_SET };
  const tree = syntaxTree(state);
  // resolveInner with side=-1 keeps us inside the node when the caret sits
  // right at the closing mark — closer to user intent than the default.
  const node = tree.resolveInner(pos, -1);
  let cur: typeof node | null = node;
  while (cur) {
    const name = cur.type.name;
    if (name === 'StrongEmphasis') result.bold = true;
    else if (name === 'Emphasis') result.italic = true;
    else if (name === 'Strikethrough') result.strike = true;
    else if (name === 'InlineCode') result.code = true;
    else if (name === 'Superscript') result.sup = true;
    else if (name === 'Subscript') result.sub = true;
    cur = cur.parent;
  }

  // HTML-form <sup>/<sub> are not part of the lezer node graph for inline
  // content. Scan the current line to catch the toggleSup / toggleSub case.
  if (!result.sup) {
    if (htmlTagWrapsPos(state, pos, 'sup')) result.sup = true;
  }
  if (!result.sub) {
    if (htmlTagWrapsPos(state, pos, 'sub')) result.sub = true;
  }
  return result;
}

/**
 * Returns true if `pos` is strictly inside an `<tag>` open / `</tag>` close
 * pair on the current line. Scope is intentionally line-local: HTML sup/sub
 * almost always sits on one line, and unbounded scans on a 100k-char doc
 * would be wasteful for an idle toolbar refresh.
 */
function htmlTagWrapsPos(state: EditorState, pos: number, tag: 'sup' | 'sub'): boolean {
  const line = state.doc.lineAt(pos);
  const text = line.text;
  const rel = pos - line.from;
  const openRe = new RegExp(`<${tag}>`, 'gi');
  const closeRe = new RegExp(`</${tag}>`, 'gi');
  let lastOpen = -1;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(text)) !== null) {
    if (m.index + m[0].length <= rel) lastOpen = m.index + m[0].length;
    else break;
  }
  if (lastOpen < 0) return false;
  // A matching close between lastOpen and rel breaks the wrap.
  closeRe.lastIndex = lastOpen;
  const c = closeRe.exec(text);
  if (c && c.index < rel) return false;
  return true;
}

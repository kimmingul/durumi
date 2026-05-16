import type { MarkdownConfig, InlineContext, Element } from '@lezer/markdown';
import { tags as t } from '@lezer/highlight';

const LBRACE = 123; // '{'
const RBRACE = 125; // '}'
const PLUS = 43;    // '+'
const MINUS = 45;   // '-'
const TILDE = 126;  // '~'
const EQUAL = 61;   // '='
const GT = 62;      // '>'
const LT = 60;      // '<'
const NEWLINE = 10;

/**
 * Parsers for the five CriticMarkup track-changes operators.
 *
 *   - Insertion:   `{++ added text ++}`
 *   - Deletion:    `{-- deleted text --}`
 *   - Substitution: `{~~ old ~> new ~~}`
 *   - Highlight:   `{== marked ==}`     (distinct from `==text==`)
 *   - Comment:     `{>> short comment <<}`
 *
 * All five are inline-only in v0.1.4 (multi-line bodies are rejected so the
 * parser doesn't fight with paragraph break boundaries).
 *
 * Each parser is character-code-gated and ordered `before: 'Emphasis'` so it
 * runs ahead of the existing single-tilde Subscript, double-tilde
 * Strikethrough, and double-equal Highlight parsers — putting `{~~` and
 * `{==` ahead of `~~` and `==` is non-negotiable for correctness.
 *
 * Empty bodies and unbalanced operators fall through (return -1), matching
 * the gating philosophy in `comments.ts` so that a malformed `{++…}` simply
 * renders as plain text rather than producing a degenerate node.
 */

interface ParsedSubstitution {
  /** Index of the `~>` separator (relative to the source). */
  arrowAt: number;
  /** Index of the closing `~~}` opener. */
  closeAt: number;
}

function findSubstitutionParts(
  cx: InlineContext,
  bodyStart: number,
  end: number,
): ParsedSubstitution | null {
  // Walk the body looking for `~>` then `~~}`. Both must appear, in order,
  // on the same logical line.
  let arrowAt = -1;
  let i = bodyStart;
  while (i < end - 1) {
    const ch = cx.char(i);
    if (ch === NEWLINE) return null;
    if (ch === TILDE && cx.char(i + 1) === GT && arrowAt === -1) {
      arrowAt = i;
    }
    if (
      ch === TILDE &&
      cx.char(i + 1) === TILDE &&
      cx.char(i + 2) === RBRACE
    ) {
      // v0.2.14: allow `arrowAt + 2 === i` (zero-length new side, e.g.
      // `{~~old~>~~}`). The arrow must still appear (`arrowAt >= 0`) and
      // must not visually overlap the closer (`arrowAt + 2 > i` would
      // mean the closer's first `~` is part of the arrow which is
      // impossible — the arrow is `~>` not `~~`).
      if (arrowAt < 0 || arrowAt + 2 > i) return null;
      return { arrowAt, closeAt: i };
    }
    i++;
  }
  return null;
}

function scanForCloser(
  cx: InlineContext,
  pos: number,
  inner: number,
  closer1: number,
  closer2: number,
): number {
  // Return the index of the start of the two-char closing pair followed by
  // `}`, or -1 if not found before EOF/newline. `pos` is the start of the
  // body to scan.
  //
  // v0.2.14: the prior `i <= inner` guard rejected zero-length bodies (e.g.
  // `{++++}`). We now allow `i === inner` so empty CM spans are recognised
  // as well-formed; the decoration layer renders them as styled but
  // visually empty marks in Document mode.
  let i = pos;
  while (i < cx.end - 1) {
    const ch = cx.char(i);
    if (ch === NEWLINE) return -1;
    if (
      ch === closer1 &&
      cx.char(i + 1) === closer2 &&
      cx.char(i + 2) === RBRACE
    ) {
      if (i < inner) {
        i++;
        continue;
      }
      return i;
    }
    i++;
  }
  return -1;
}

export const CriticMarkupExtension: MarkdownConfig = {
  defineNodes: [
    { name: 'CmInsert', style: t.inserted },
    { name: 'CmInsertMark', style: t.processingInstruction },
    { name: 'CmDelete', style: t.deleted },
    { name: 'CmDeleteMark', style: t.processingInstruction },
    { name: 'CmSubstitution', style: t.changed },
    { name: 'CmSubMark', style: t.processingInstruction },
    { name: 'CmSubArrow', style: t.processingInstruction },
    { name: 'CmSubOld', style: t.deleted },
    { name: 'CmSubNew', style: t.inserted },
    { name: 'CmHighlight', style: t.special(t.emphasis) },
    { name: 'CmHighlightMark', style: t.processingInstruction },
    { name: 'CmComment', style: t.comment },
    { name: 'CmCommentMark', style: t.processingInstruction },
    { name: 'CmCommentBody', style: t.comment },
  ],
  parseInline: [
    {
      name: 'CmInsert',
      parse(cx, next, pos) {
        if (next !== LBRACE) return -1;
        if (cx.char(pos + 1) !== PLUS || cx.char(pos + 2) !== PLUS) return -1;
        const inner = pos + 3;
        const closeAt = scanForCloser(cx, inner, inner, PLUS, PLUS);
        if (closeAt < 0) return -1;
        // v0.2.14: empty / whitespace-only body is now accepted so the
        // decoration layer can render a styled (zero-width or whitespace)
        // mark in Document mode instead of leaking raw `{++++}`. The
        // closer-position guard inside `scanForCloser` keeps the original
        // `closeAt > inner` invariant when the body has at least one char
        // between `{++` and `++}`.
        const open = cx.elt('CmInsertMark', pos, inner);
        const close = cx.elt('CmInsertMark', closeAt, closeAt + 3);
        return cx.addElement(
          cx.elt('CmInsert', pos, closeAt + 3, [open, close]),
        );
      },
      before: 'Emphasis',
    },
    {
      name: 'CmDelete',
      parse(cx, next, pos) {
        if (next !== LBRACE) return -1;
        if (cx.char(pos + 1) !== MINUS || cx.char(pos + 2) !== MINUS) return -1;
        const inner = pos + 3;
        const closeAt = scanForCloser(cx, inner, inner, MINUS, MINUS);
        if (closeAt < 0) return -1;
        // v0.2.14: see CmInsert above — empty body accepted at parser level.
        const open = cx.elt('CmDeleteMark', pos, inner);
        const close = cx.elt('CmDeleteMark', closeAt, closeAt + 3);
        return cx.addElement(
          cx.elt('CmDelete', pos, closeAt + 3, [open, close]),
        );
      },
      before: 'Emphasis',
    },
    {
      name: 'CmSubstitution',
      parse(cx, next, pos) {
        if (next !== LBRACE) return -1;
        if (cx.char(pos + 1) !== TILDE || cx.char(pos + 2) !== TILDE) return -1;
        const inner = pos + 3;
        const parts = findSubstitutionParts(cx, inner, cx.end);
        if (!parts) return -1;
        const oldFrom = inner;
        const oldTo = parts.arrowAt;
        const newFrom = parts.arrowAt + 2;
        const newTo = parts.closeAt;
        if (oldTo < oldFrom || newTo < newFrom) return -1;
        // v0.2.14: allow empty old / empty new (e.g. `{~~~>~~}` or `{~~ ~> ~~}`).
        // The decoration layer renders the styled marks even when zero-width
        // so Document mode shows the arrow widget without leaking raw braces.
        const children: Element[] = [];
        children.push(cx.elt('CmSubMark', pos, inner));
        if (oldTo > oldFrom) {
          children.push(cx.elt('CmSubOld', oldFrom, oldTo));
        }
        children.push(cx.elt('CmSubArrow', parts.arrowAt, parts.arrowAt + 2));
        if (newTo > newFrom) {
          children.push(cx.elt('CmSubNew', newFrom, newTo));
        }
        children.push(
          cx.elt('CmSubMark', parts.closeAt, parts.closeAt + 3),
        );
        return cx.addElement(
          cx.elt('CmSubstitution', pos, parts.closeAt + 3, children),
        );
      },
      // Must beat both InlineExtras' Subscript and GFM's Strikethrough — both
      // run before Emphasis. `before: 'Emphasis'` is sufficient because lezer
      // resolves first-match-wins and our parser fires only on `{`, which
      // neither Subscript nor Strikethrough match.
      before: 'Emphasis',
    },
    {
      name: 'CmHighlight',
      parse(cx, next, pos) {
        if (next !== LBRACE) return -1;
        if (cx.char(pos + 1) !== EQUAL || cx.char(pos + 2) !== EQUAL) return -1;
        const inner = pos + 3;
        const closeAt = scanForCloser(cx, inner, inner, EQUAL, EQUAL);
        if (closeAt < 0) return -1;
        // v0.2.14: empty body accepted — see CmInsert above.
        const open = cx.elt('CmHighlightMark', pos, inner);
        const close = cx.elt('CmHighlightMark', closeAt, closeAt + 3);
        return cx.addElement(
          cx.elt('CmHighlight', pos, closeAt + 3, [open, close]),
        );
      },
      before: 'Emphasis',
    },
    {
      name: 'CmComment',
      parse(cx, next, pos) {
        if (next !== LBRACE) return -1;
        if (cx.char(pos + 1) !== GT || cx.char(pos + 2) !== GT) return -1;
        const inner = pos + 3;
        // For comments the closer is `<<}`.
        const closeAt = scanForCloser(cx, inner, inner, LT, LT);
        if (closeAt < 0) return -1;
        // v0.2.14: empty body accepted — see CmInsert above. The pill widget
        // still renders even when the body preview is empty.
        const open = cx.elt('CmCommentMark', pos, inner);
        const children = [open];
        if (closeAt > inner) {
          children.push(cx.elt('CmCommentBody', inner, closeAt));
        }
        children.push(cx.elt('CmCommentMark', closeAt, closeAt + 3));
        return cx.addElement(
          cx.elt('CmComment', pos, closeAt + 3, children),
        );
      },
      before: 'Emphasis',
    },
  ],
};

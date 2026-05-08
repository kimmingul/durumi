import { syntaxTree } from '@codemirror/language';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { Extension, RangeSetBuilder } from '@codemirror/state';
import { scanBlockMath, scanInlineMath } from './math/scan';

/**
 * Disables Electron/Chromium's contenteditable spell-checker inside code
 * regions. Without this, fenced code blocks, inline code, YAML front matter,
 * and math source all get red-underlined as misspellings — distracting noise
 * for medical writing where R snippets and TeX are common.
 *
 * Approach: emit `Decoration.mark` ranges with `attributes: { spellcheck:
 * 'false' }`. Chromium honours `spellcheck="false"` on any contenteditable
 * subtree by skipping spell-check on its descendant text nodes, so the
 * underlines disappear without affecting prose elsewhere.
 *
 * Targets:
 *   - FencedCode / CodeBlock     (lezer node)
 *   - InlineCode                 (lezer node)
 *   - FrontMatter                (lezer node, via FrontMatterExtension)
 *   - Inline math `$...$`        (regex scan; only matters when caret is on
 *                                  the line and the text is shown raw)
 *   - Block math `$$...$$`       (regex scan; same caveat)
 *
 * Math regions are typically replaced by KaTeX widgets, so spell-check never
 * sees their text. But when the caret enters a math block the source becomes
 * editable text again, and we want to avoid underlining `\frac` etc.
 */
const SPELLCHECK_NODES = new Set(['FencedCode', 'CodeBlock', 'InlineCode', 'FrontMatter']);

interface Range {
  from: number;
  to: number;
}

function collectRanges(view: EditorView): Range[] {
  const ranges: Range[] = [];
  const tree = syntaxTree(view.state);
  // Iterate the whole document, not just visible ranges: marks on lines just
  // outside the viewport still need the attribute when scrolled into view.
  tree.iterate({
    enter(node) {
      if (SPELLCHECK_NODES.has(node.name)) {
        ranges.push({ from: node.from, to: node.to });
        // Don't descend — children of a code block are all already covered.
        if (node.name === 'FencedCode' || node.name === 'CodeBlock') return false;
      }
      return undefined;
    },
  });

  const blockMath = scanBlockMath(view.state);
  for (const m of blockMath) ranges.push({ from: m.from, to: m.to });
  for (const m of scanInlineMath(view.state, blockMath)) {
    ranges.push({ from: m.from, to: m.to });
  }

  // RangeSetBuilder requires non-decreasing `from`. Sort, then drop overlaps
  // (a fenced block can subsume an inline-code-shaped substring inside it).
  ranges.sort((a, b) => (a.from - b.from) || (a.to - b.to));
  const merged: Range[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.from < last.to) {
      // Skip ranges that fall inside an earlier one. If the new one extends
      // further, widen the last range instead of leaving a gap.
      if (r.to > last.to) last.to = r.to;
      continue;
    }
    merged.push({ ...r });
  }
  return merged;
}

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const ranges = collectRanges(view);
  for (const r of ranges) {
    if (r.from === r.to) continue;
    builder.add(
      r.from,
      r.to,
      Decoration.mark({ attributes: { spellcheck: 'false' } }),
    );
  }
  return builder.finish();
}

/**
 * CodeMirror extension that tags code, front matter, and math regions with
 * `spellcheck="false"` so Electron's spell-checker skips them.
 *
 * CodeMirror 6 sets `spellcheck="false"` on `.cm-content` by default — that
 * would silence spell-check everywhere. We flip the content default back to
 * `true` (so prose gets checked) and then layer per-range `false` overrides
 * via mark decorations on top.
 */
const enableSpellcheckOnContent = EditorView.contentAttributes.of({
  spellcheck: 'true',
});

const exclusionPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = build(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export function spellcheckExclusion(): Extension {
  return [enableSpellcheckOnContent, exclusionPlugin];
}

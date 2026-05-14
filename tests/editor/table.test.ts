import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { tableDecoration, parseAlignmentForTest, computeColWidthsForTest } from '../../src/editor/decorations/table';

function makeView(doc: string, cursor: number): EditorView {
  return new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [markdown({ base: markdownLanguage, extensions: [GFM] }), tableDecoration()],
    }),
    parent: document.body,
  });
}

function rows(view: EditorView): HTMLElement[] {
  return Array.from(view.contentDOM.querySelectorAll<HTMLElement>('[role="row"]'));
}

describe('parseAlignmentForTest', () => {
  it('parses 4 alignment forms', () => {
    expect(parseAlignmentForTest('| --- | :-- | :-: | --: |')).toEqual([
      'default',
      'left',
      'center',
      'right',
    ]);
  });
});

describe('computeColWidthsForTest', () => {
  it('emits fr units proportional to the longest cell text', () => {
    const fr = computeColWidthsForTest([
      ['a', 'longer cell'],
      ['1', '2'],
    ]);
    expect(fr).toMatch(/minmax\(80px, 1fr\)\s+minmax\(80px, 11fr\)/);
  });
});

const DOC = '| H1 | H2 |\n| --- | --- |\n| a | b |\nafter';

describe('tableDecoration', () => {
  it('replaces all 3 table lines with row widgets when cursor is outside', () => {
    const view = makeView(DOC, DOC.length);
    const rs = rows(view);
    expect(rs.length).toBe(3);
    view.destroy();
  });

  it('Phase 3.1.1 deviation: renders all rows as widgets even when the caret is inside the table', () => {
    // INVARIANT-DEVIATION: pre-v0.2.4 behaviour kept the caret row raw so
    // the user could edit the markdown source. v0.2.4 makes the cells
    // contentEditable so the widget IS the editing surface — the active
    // line no longer suppresses the row's widget. See `table.ts` JSDoc
    // and CONTRIBUTING.md #11.
    const view = makeView(DOC, 3);
    expect(rows(view).length).toBe(3);
    view.destroy();
  });

  it('emits no widgets when no Table node is present', () => {
    const view = makeView('plain text', 0);
    expect(rows(view).length).toBe(0);
    view.destroy();
  });

  it('does not treat pipes inside fenced code as a table', () => {
    const code = '```\n| a | b |\n| --- | --- |\n| 1 | 2 |\n```\n';
    const view = makeView(code, code.length);
    expect(rows(view).length).toBe(0);
    view.destroy();
  });
});

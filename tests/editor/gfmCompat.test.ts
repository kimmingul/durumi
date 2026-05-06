import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';

function nodeNames(doc: string): Set<string> {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })],
  });
  const names = new Set<string>();
  syntaxTree(state).iterate({
    enter(n) {
      names.add(n.name);
    },
  });
  return names;
}

describe('GFM compatibility with Phase A node names', () => {
  it('preserves all Phase A node names', () => {
    const sample = [
      '# heading 1',
      '## heading 2',
      '**bold** and *italic* text',
      '`inline code`',
      '[link](https://example.com)',
      '![alt](./img.png)',
      '> quote',
      '- list item',
      '1. ordered',
      '---',
      '```ts',
      'const x = 1;',
      '```',
    ].join('\n\n');
    const names = nodeNames(sample);
    for (const required of [
      'ATXHeading1',
      'ATXHeading2',
      'StrongEmphasis',
      'Emphasis',
      'InlineCode',
      'Link',
      'Image',
      'Blockquote',
      'BulletList',
      'OrderedList',
      'ListItem',
      'HorizontalRule',
      'FencedCode',
    ]) {
      expect(names, `missing ${required}`).toContain(required);
    }
  });

  it('introduces GFM node names', () => {
    // Note: table rows must be consecutive lines (not blank-separated) for the
    // GFM parser to recognise the construct as a Table.
    const sample = ['~~strike~~', '- [ ] todo', '- [x] done', '| a | b |\n|---|---|\n| 1 | 2 |'].join('\n\n');
    const names = nodeNames(sample);
    for (const required of ['Strikethrough', 'Task', 'Table', 'TableHeader', 'TableDelimiter', 'TableRow', 'TableCell']) {
      expect(names, `missing ${required}`).toContain(required);
    }
  });
});

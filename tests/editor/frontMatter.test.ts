import { describe, it, expect } from 'vitest';
import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { FrontMatterExtension } from '../../src/editor/markdownExt/frontMatter';
import {
  frontMatterDecoration,
  frontMatterTheme,
} from '../../src/editor/decorations/frontMatter';

function setup(doc: string, cursor = 0): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [
      markdown({
        base: markdownLanguage,
        extensions: [GFM, FrontMatterExtension],
      }),
      frontMatterDecoration(),
      frontMatterTheme,
    ],
  });
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({ state, parent });
  view.dispatch({ selection: { anchor: cursor }, userEvent: 'select' });
  return view;
}

function nodesOfType(view: EditorView, name: string) {
  const out: Array<{ from: number; to: number }> = [];
  syntaxTree(view.state).iterate({
    enter(node) {
      if (node.name === name) out.push({ from: node.from, to: node.to });
    },
  });
  return out;
}

describe('FrontMatterExtension (lezer parser)', () => {
  it('recognises a complete YAML front matter block', () => {
    const doc = '---\ntitle: Foo\n---\n# Body';
    const view = setup(doc, doc.length);
    const fm = nodesOfType(view, 'FrontMatter');
    expect(fm).toHaveLength(1);
    // Node spans from the opening `---` to the end of the closing `---` line
    // (the trailing newline belongs to the next block).
    expect(fm[0]?.from).toBe(0);
    expect(fm[0]?.to).toBe(doc.indexOf('# Body') - 1);
    // Nothing inside the YAML region should be parsed as a heading or HR.
    expect(nodesOfType(view, 'HorizontalRule')).toHaveLength(0);
    expect(nodesOfType(view, 'SetextHeading2')).toHaveLength(0);
    view.destroy();
  });

  it('does not classify a `---` later in the document as front matter', () => {
    const doc = 'intro\n\n---\n\ntail';
    const view = setup(doc, 0);
    expect(nodesOfType(view, 'FrontMatter')).toHaveLength(0);
    view.destroy();
  });

  it('emits a FrontMatter region for an unterminated opening block (still typing)', () => {
    const doc = '---\ntitle: WIP';
    const view = setup(doc, doc.length);
    const fm = nodesOfType(view, 'FrontMatter');
    expect(fm).toHaveLength(1);
    expect(fm[0]?.from).toBe(0);
    view.destroy();
  });
});

describe('frontMatterDecoration', () => {
  it('replaces the YAML region with a summary widget when the caret is elsewhere', async () => {
    const doc = '---\ntitle: Foo\nauthor: Min\n---\n# Body';
    const view = setup(doc, doc.length); // caret in body
    // js-yaml is now dynamic-imported by the front-matter decoration so it
    // doesn't bloat the renderer's eager bundle. The loader plugin kicks off
    // the import on first scan and dispatches a render tick once parsing is
    // available. Pre-load it here and trigger a state update so the summary
    // widget upgrades from the cold-path "Front matter" label to the parsed
    // title/author summary the assertions below expect.
    await import('../../shared/frontMatter');
    // Tick the editor so the loader plugin's idle path fires, plus give the
    // microtask queue a turn so the deferred `renderTick` dispatch lands.
    view.dispatch({});
    await new Promise((r) => setTimeout(r, 0));
    const summary = view.dom.querySelector('.cm-md-frontmatter-summary');
    expect(summary).not.toBeNull();
    expect(summary?.textContent).toContain('Foo');
    expect(summary?.textContent).toContain('Min');
    view.destroy();
  });

  it('shows the raw YAML when the caret is inside the block', () => {
    const doc = '---\ntitle: Foo\n---\n# Body';
    const view = setup(doc, 5); // inside YAML
    const summary = view.dom.querySelector('.cm-md-frontmatter-summary');
    expect(summary).toBeNull();
    expect(view.dom.textContent).toContain('title: Foo');
    view.destroy();
  });
});

import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { languages as lezerLangs } from '@codemirror/language-data';
import { codeHighlight, getLangCacheForTest } from '../../src/editor/decorations/codeHighlight';

function makeView(doc: string): EditorView {
  return new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        markdown({ base: markdownLanguage, codeLanguages: lezerLangs, extensions: [GFM] }),
        codeHighlight(),
      ],
    }),
    parent: document.body,
  });
}

function classNamesAt(view: EditorView, doc: string, needle: string): string[] {
  const idx = doc.indexOf(needle);
  if (idx < 0) return [];
  const out: string[] = [];
  const fields = view.state.facet(EditorView.decorations);
  for (const f of fields) {
    const set = typeof f === 'function' ? f(view) : f;
    set.between(idx, idx + needle.length, (_from, _to, deco) => {
      const cls = (deco.spec as { class?: string }).class;
      if (cls) out.push(cls);
    });
  }
  return out;
}

describe('codeHighlight', () => {
  it('emits no decorations for a fenced block without lang', async () => {
    const doc = '```\nconst x = 1;\n```';
    const view = makeView(doc);
    await Promise.resolve();
    const klasses = classNamesAt(view, doc, 'const');
    expect(klasses).toEqual([]);
    view.destroy();
  });

  it('emits no decorations for unknown lang and logs no errors', () => {
    const errors: unknown[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errors.push(a);
    const doc = '```weirdlang\nbody\n```';
    const view = makeView(doc);
    expect(classNamesAt(view, doc, 'body')).toEqual([]);
    console.error = orig;
    expect(errors).toEqual([]);
    view.destroy();
  });

  it('emits cm-tok-keyword for "const" once ts lang resolves', async () => {
    const doc = '```ts\nconst x = 1;\n```';
    const view = makeView(doc);
    const cache = getLangCacheForTest();
    const start = Date.now();
    while (!cache.has('typescript') && !cache.has('ts') && Date.now() - start < 2000) {
      await new Promise((r) => setTimeout(r, 20));
    }
    await new Promise((r) => setTimeout(r, 30));
    const klasses = classNamesAt(view, doc, 'const');
    expect(klasses).toContain('cm-tok-keyword');
    view.destroy();
  });
});

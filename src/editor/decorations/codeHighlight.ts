import { syntaxTree, LanguageDescription, Language } from '@codemirror/language';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { Extension, RangeSetBuilder, StateEffect } from '@codemirror/state';
import { languages as lezerLangs } from '@codemirror/language-data';
import { highlightTree } from '@lezer/highlight';
import { tokenStyle } from '../../export/tokenStyle';

const langCache = new Map<string, Language>();
const pendingLoads = new Set<string>();

export function getLangCacheForTest(): Map<string, Language> {
  return langCache;
}

const rebuildHighlight = StateEffect.define<number>();

let seqCounter = 0;
function bumpSeq(): number {
  return ++seqCounter;
}

interface FencedRange {
  bodyFrom: number;
  bodyTo: number;
  lang: string | null;
}

function matchCache(lang: string): Language | undefined {
  const k = lang.toLowerCase();
  if (langCache.has(k)) return langCache.get(k);
  const desc = LanguageDescription.matchLanguageName(lezerLangs, lang, true);
  if (desc && langCache.has(desc.name.toLowerCase())) {
    return langCache.get(desc.name.toLowerCase());
  }
  return undefined;
}

function collectFenced(view: EditorView): FencedRange[] {
  const out: FencedRange[] = [];
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'FencedCode') return;
        const cur = node.node;
        let lang: string | null = null;
        const info = cur.getChild('CodeInfo');
        if (info) lang = view.state.sliceDoc(info.from, info.to).trim() || null;
        const text = cur.getChild('CodeText');
        if (!text) return;
        out.push({ bodyFrom: text.from, bodyTo: text.to, lang });
      },
    });
  }
  return out;
}

function emitTokens(builder: RangeSetBuilder<Decoration>, view: EditorView, r: FencedRange, lang: Language): void {
  const code = view.state.sliceDoc(r.bodyFrom, r.bodyTo);
  const tree = lang.parser.parse(code);
  highlightTree(tree, tokenStyle, (from, to, classes) => {
    if (!classes) return;
    builder.add(r.bodyFrom + from, r.bodyFrom + to, Decoration.mark({ class: classes }));
  });
}

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const ranges = collectFenced(view);
  for (const r of ranges) {
    if (r.lang === null) continue;
    const cached = matchCache(r.lang);
    if (cached) {
      emitTokens(builder, view, r, cached);
      continue;
    }
    if (pendingLoads.has(r.lang)) continue;
    const desc = LanguageDescription.matchLanguageName(lezerLangs, r.lang, true);
    if (!desc) continue;
    pendingLoads.add(r.lang);
    void desc.load().then((support) => {
      langCache.set(desc.name.toLowerCase(), support.language);
      for (const a of desc.alias) langCache.set(a.toLowerCase(), support.language);
      pendingLoads.delete(r.lang as string);
      const nextSeq = bumpSeq();
      view.dispatch({ effects: rebuildHighlight.of(nextSeq) });
    });
  }
  return builder.finish();
}

export function codeHighlight(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      seq = 0;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(u: ViewUpdate) {
        let needsRebuild = u.docChanged || u.viewportChanged;
        for (const tr of u.transactions) {
          for (const e of tr.effects) {
            if (e.is(rebuildHighlight) && e.value >= this.seq) {
              this.seq = e.value;
              needsRebuild = true;
            }
          }
        }
        if (needsRebuild) {
          this.decorations = build(u.view);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}

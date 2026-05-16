import MarkdownIt from 'markdown-it';
// markdown-it@14 ships its types via `export = MarkdownIt` where MarkdownIt
// is BOTH a constructor (the default import) AND a namespace (plugins, Token,
// Options, etc.). Under `moduleResolution: bundler` the default `import X`
// only resolves the value, so namespace members like `X.PluginSimple` fail
// with TS2702. The dist file directly exports the merged namespace.
import type * as MarkdownItNs from 'markdown-it/dist/index.cjs.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error - markdown-it-task-lists ships no type declarations
import taskListsPlugin from 'markdown-it-task-lists';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error - markdown-it-footnote ships no type declarations
import footnotePlugin from 'markdown-it-footnote';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error - markdown-it-mark ships no type declarations
import markPlugin from 'markdown-it-mark';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error - markdown-it-sub ships no type declarations
import subPlugin from 'markdown-it-sub';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error - markdown-it-sup ships no type declarations
import supPlugin from 'markdown-it-sup';
import githubAlertsPlugin from 'markdown-it-github-alerts';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error - markdown-it-attrs ships its own d.ts but plugin export
//   types are too loose for `MarkdownIt.PluginSimple` without a cast.
import attrsPlugin from 'markdown-it-attrs';
import { prefetchLang, highlightCodeSync } from './highlightCode';
import { getExportStyles } from './exportStyles';
import { injectMath } from './renderMath';
import { preprocessMermaid } from './renderMermaid';
import { escapeHtml } from './escapeHtml';
import { parseFrontMatter, frontMatterString } from '../../shared/frontMatter';
import { promoteComments, stripComments } from '../../shared/comments';
import { transformCm } from '../../shared/criticMarkup';
import { parseHeadings, buildOutlineTree, OutlineNode } from '../editor/outline';
import { slugify } from './slug';
import { parseBibTeX, indexBibEntries } from '../../shared/bibtex';
import {
  applyCitations,
  collectCitationKeys,
  formatBibliography,
} from '../../shared/citation';

const taskLists = taskListsPlugin as unknown as MarkdownItNs.PluginWithOptions<{
  enabled?: boolean;
  label?: boolean;
  labelAfter?: boolean;
}>;

// `html: true` so the `<div class="mermaid-rendered">…SVG…</div>` injected by
// preprocessMermaid passes through to the rendered output. Acceptable trust
// boundary: the user is exporting their own document.
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  breaks: false,
  highlight: (code: string, lang: string): string => {
    // Return only span markup; markdown-it adds its standard <pre><code> wrapper.
    return highlightCodeSync(code, lang);
  },
})
  .use(taskLists, { enabled: false, label: false })
  .use(footnotePlugin as MarkdownItNs.PluginSimple)
  .use(markPlugin as MarkdownItNs.PluginSimple)
  .use(subPlugin as MarkdownItNs.PluginSimple)
  .use(supPlugin as MarkdownItNs.PluginSimple)
  .use(githubAlertsPlugin as unknown as MarkdownItNs.PluginSimple)
  // v0.2.6 — Pandoc-style `{.class data-foo="bar"}` attributes on block
  // elements. Used by the per-table line-styling feature so a
  // `{.durumi-table data-top-rule="2px solid"}` line above a markdown
  // table promotes the rendered `<table>` to carry those attributes.
  .use(attrsPlugin as MarkdownItNs.PluginWithOptions, {
    leftDelimiter: '{',
    rightDelimiter: '}',
    allowedAttributes: [], // empty = allow all
  });

// v0.2.6 — translate `data-*` table attributes into per-table inline
// styles + an injected `<style>` block. Each styled table gets a unique
// `id` (`durumi-table-<n>`) so the scoped CSS targets exactly that
// table's rows / cells without leaking onto other tables.
md.core.ruler.push('durumi-table-style', (state) => {
  const tokens = state.tokens;
  // Pass 1 — drain the pre-tokenize `pendingDurumiAttrs` queue onto each
  // matching table_open token, in document order. The queue is populated
  // by `extractDurumiTableAttrs` in `renderHtml` (one entry per leading
  // `{.durumi-table ...}` line that was stripped from the source).
  if (pendingDurumiAttrs.length > 0) {
    const queue = pendingDurumiAttrs;
    let qi = 0;
    for (let i = 0; i < tokens.length && qi < queue.length; i++) {
      const tok = tokens[i];
      if (tok?.type !== 'table_open') continue;
      const pairs = queue[qi++];
      if (!pairs) continue;
      tok.attrJoin('class', 'durumi-table');
      for (const [k, v] of pairs) tok.attrSet(k, v);
    }
    // Reset for the next call (renderHtml is one-shot but the `md` instance
    // is module-singleton, so we must clear).
    pendingDurumiAttrs = [];
  }
  // Pass 2 — render styles for every table_open with the durumi-table class.
  let serial = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok?.type !== 'table_open') continue;
    const cls = tok.attrGet('class') ?? '';
    if (!/\bdurumi-table\b/.test(cls)) continue;
    const id = `durumi-table-${++serial}`;
    tok.attrSet('id', id);
    const inserted = rewriteTableStyleAttrs(tokens, i, id);
    // `rewriteTableStyleAttrs` may splice a `<style>` html_block before the
    // current table_open. Advance `i` past the inserted token so the next
    // iteration doesn't re-process the same table_open and produce an
    // infinite chain of style blocks.
    if (inserted) i += 1;
  }
});

function rewriteTableStyleAttrs(
  tokens: MarkdownItNs.Token[],
  tableOpenIdx: number,
  id: string,
): boolean {
  const tok = tokens[tableOpenIdx]!;
  const attrs = tok.attrs ?? [];
  const get = (name: string): string | null => {
    for (const [k, v] of attrs) {
      if (k === name) return v;
    }
    return null;
  };
  const top = get('data-top-rule');
  const header = get('data-header-separator') ?? get('data-header-rule');
  const row = get('data-row-rules');
  const vert = get('data-vert-rules') ?? get('data-vertical-rules');
  const bottom = get('data-bottom-rule');
  const pad = get('data-cell-pad') ?? get('data-cell-padding');
  // Inline-style the table itself for top / bottom rule + cell-pad.
  const tableStyles: string[] = [];
  if (top) tableStyles.push(`border-top: ${cssBorder(top)}`);
  if (bottom) tableStyles.push(`border-bottom: ${cssBorder(bottom)}`);
  if (top || bottom) tableStyles.push('border-collapse: collapse');
  if (tableStyles.length > 0) {
    const existing = tok.attrGet('style') ?? '';
    tok.attrSet('style', [existing, tableStyles.join('; ')].filter(Boolean).join('; '));
  }
  // Inject a scoped <style> block right before the table.
  const css: string[] = [];
  css.push(`#${id} th, #${id} td { border: 0; }`);
  if (pad) css.push(`#${id} th, #${id} td { padding: ${pad}; }`);
  if (header) css.push(`#${id} thead th { border-bottom: ${cssBorder(header)}; }`);
  if (row) css.push(`#${id} tbody tr:not(:last-child) td { border-bottom: ${cssBorder(row)}; }`);
  if (vert) {
    css.push(`#${id} th + th, #${id} td + td { border-left: ${cssBorder(vert)}; }`);
  }
  if (bottom) css.push(`#${id} tbody tr:last-child td { border-bottom: ${cssBorder(bottom)}; }`);
  if (css.length > 0) {
    const styleTok = new (tokens[0]!.constructor as new (
      type: string,
      tag: string,
      nesting: number,
    ) => MarkdownItNs.Token)('html_block', '', 0);
    styleTok.content = `<style>${css.join(' ')}</style>\n`;
    tokens.splice(tableOpenIdx, 0, styleTok);
    return true;
  }
  return false;
}

function cssBorder(shorthand: string): string {
  const trimmed = shorthand.trim().toLowerCase();
  if (trimmed === 'none' || trimmed.startsWith('0 ') || trimmed === '0') return '0';
  return shorthand;
}

/**
 * v0.2.6 — `{.durumi-table data-*}` attr blocks immediately above a
 * markdown table. Used as a side-channel between the pre-md-it source
 * pass and the post-tokenize core ruler so we don't depend on
 * markdown-it-attrs' trailing-attrs semantics (which mis-routes a second
 * attrs block onto the previous table).
 */
type DurumiAttrPairs = Array<[string, string]>;
let pendingDurumiAttrs: DurumiAttrPairs[] = [];

const PANDOC_TABLE_ATTRS_RE =
  /^\{[^{}\n]*\.durumi-table[^{}\n]*\}[ \t]*\n(?:[ \t]*\n)+(?=\|)/gm;

function extractDurumiTableAttrs(source: string): {
  source: string;
  attrs: DurumiAttrPairs[];
} {
  const attrs: DurumiAttrPairs[] = [];
  const stripped = source.replace(PANDOC_TABLE_ATTRS_RE, (match) => {
    const firstNl = match.indexOf('\n');
    const attrLine = match.slice(0, firstNl).trim();
    const inner = attrLine.slice(1, -1).trim();
    const pairs: DurumiAttrPairs = [];
    const re = /data-([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(inner)) !== null) {
      pairs.push([`data-${m[1]}`, m[2] ?? m[3] ?? '']);
    }
    attrs.push(pairs);
    // Replace the attr line + blank-line gap with a single blank line so the
    // table position in the doc shifts minimally and remaining offsets stay
    // sensible for downstream passes (mermaid, TOC, citations).
    return '';
  });
  return { source: stripped, attrs };
}

// Add slugified id attributes to ATX headings so the TOC's `#anchor` links
// resolve. Mutates the heading_open token in place inside markdown-it's
// core ruler so slug counters can disambiguate duplicates per render.
md.core.ruler.push('durumi-heading-anchors', (state) => {
  const seen = new Map<string, number>();
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i]?.type !== 'heading_open') continue;
    const inline = tokens[i + 1];
    if (!inline || inline.type !== 'inline') continue;
    const text = (inline.children ?? [])
      .filter((t) => t.type === 'text' || t.type === 'code_inline')
      .map((t) => t.content)
      .join('')
      .trim();
    if (!text) continue;
    const id = slugify(text, seen);
    tokens[i]!.attrSet('id', id);
  }
});


const FENCE_LANG_RE = /^```([\w+-]+)\s*$/gm;

function extractLangs(markdown: string): string[] {
  const out = new Set<string>();
  let match: RegExpExecArray | null;
  FENCE_LANG_RE.lastIndex = 0;
  while ((match = FENCE_LANG_RE.exec(markdown)) !== null) {
    if (match[1]) out.add(match[1]);
  }
  return Array.from(out);
}

const TOC_LINE_RE = /^[ \t]*\[toc\][ \t]*$/gim;

function renderTocHtml(headings: OutlineNode[]): string {
  if (headings.length === 0) {
    return '<nav class="toc"><p class="toc-empty">(empty table of contents)</p></nav>';
  }
  const seen = new Map<string, number>();
  const renderList = (nodes: OutlineNode[]): string => {
    const items = nodes
      .map(
        (n) =>
          `<li class="toc-h${n.level}"><a href="#${slugify(n.text, seen)}">${escapeHtml(n.text)}</a>${
            n.children.length > 0 ? renderList(n.children) : ''
          }</li>`,
      )
      .join('');
    return `<ul>${items}</ul>`;
  };
  return `<nav class="toc">${renderList(headings)}</nav>`;
}

export interface RenderHtmlOptions {
  /** Optional BibTeX source. When provided, `[@key]` citations are resolved. */
  bibliography?: string | null;
  /**
   * `true` keeps `%%` memos in the rendered output as visible blockquotes
   * (review-mode export). Default `false` strips them entirely — the safe
   * default for medical-research manuscript submission.
   */
  includeComments?: boolean;
  /**
   * `true` keeps CriticMarkup track-changes operators visible in the rendered
   * output as `<ins>/<del>/<mark>/<aside>` (preserve mode). Default `false`
   * applies an "accept all changes" pass — insertions kept, deletions
   * dropped, substitutions resolved to the new text, comments dropped.
   */
  preserveAnnotations?: boolean;
}

export async function renderHtml(
  markdown: string,
  title: string,
  customCss = '',
  options: RenderHtmlOptions = {},
): Promise<string> {
  const fm = parseFrontMatter(markdown);
  let source = fm.endOffset > 0 ? fm.body : markdown;

  // Apply the comment policy BEFORE citation/TOC processing so a memo can't
  // smuggle a `[@key]` into the citation numbering pass, and so the TOC
  // regex never matches a `[toc]` written inside a memo.
  source = options.includeComments ? promoteComments(source) : stripComments(source);

  // CriticMarkup transforms run AFTER comment processing — a `%% memo %%`
  // could have wrapped a `{++ ... ++}` run, and we want the comment policy
  // to win. Default mode is `accept` (matching `exportPreserveAnnotations
  // === false`), which strips visible review markers and produces a clean
  // submission-ready document.
  source = transformCm(source, options.preserveAnnotations ? 'preserve' : 'accept', 'html');

  // Citations: replace `[@key]` with numbered <sup> markers and append a
  // References section before the rest of the rendering pipeline runs. Done
  // pre-markdown-it because the rendered HTML must pass through `html: true`.
  let bibliographyHtml = '';
  if (options.bibliography) {
    const parsed = parseBibTeX(options.bibliography);
    const idx = indexBibEntries(parsed);
    const orderedKeys = collectCitationKeys(source);
    const numberMap = new Map<string, number>();
    let n = 1;
    for (const k of orderedKeys) {
      if (idx.has(k)) {
        numberMap.set(k, n);
        n++;
      }
    }
    if (numberMap.size > 0) {
      source = applyCitations(source, numberMap);
      const formatted = formatBibliography(orderedKeys, idx);
      bibliographyHtml = renderBibliography(formatted);
    }
  }

  // v0.2.6 — strip leading `{.durumi-table ...}` attribute blocks from
  // the source and capture them as a side-channel queue. The core ruler
  // reads them back and applies the attrs to the matching table_open
  // tokens. We bypass `markdown-it-attrs` for these blocks because the
  // plugin has trailing-attrs semantics (attrs attach to the *previous*
  // block), so two adjacent `{.durumi-table}` blocks would mis-route.
  const pandocTableAttrs = extractDurumiTableAttrs(source);
  source = pandocTableAttrs.source;
  pendingDurumiAttrs = pandocTableAttrs.attrs;

  const headings = buildOutlineTree(parseHeadings(source));
  const tocHtml = renderTocHtml(headings);
  const withToc = source.replace(TOC_LINE_RE, () => tocHtml);
  const preprocessed = await preprocessMermaid(withToc);
  const langs = extractLangs(preprocessed);
  await Promise.all(langs.map((l) => prefetchLang(l)));
  const body = md.render(preprocessed);
  const bodyWithMath = injectMath(body);
  const styles = getExportStyles();
  const userBlock = customCss ? `\n${customCss}` : '';
  const fmTitle = frontMatterString(fm, 'title');
  const finalTitle = fmTitle && fmTitle.trim().length > 0 ? fmTitle : title;
  const meta = renderMetaTags(fm);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(finalTitle)}</title>${meta}
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.css">
<style>${styles}${userBlock}</style>
</head>
<body>
<main class="export-content">
${bodyWithMath}${bibliographyHtml}
</main>
</body>
</html>`;
}

function renderBibliography(items: ReturnType<typeof formatBibliography>): string {
  if (items.length === 0) return '';
  const lis = items
    .map((c) => `<li id="ref-${encodeURIComponent(c.entry.key)}">${c.html}</li>`)
    .join('\n');
  return `\n<section class="references">\n<h2>References</h2>\n<ol>\n${lis}\n</ol>\n</section>`;
}

function renderMetaTags(fm: ReturnType<typeof parseFrontMatter>): string {
  if (!fm.data) return '';
  const out: string[] = [];
  const author = frontMatterString(fm, 'author');
  if (author) out.push(`<meta name="author" content="${escapeHtml(author)}">`);
  const subject = frontMatterString(fm, 'subject');
  if (subject) out.push(`<meta name="description" content="${escapeHtml(subject)}">`);
  const keywords = frontMatterString(fm, 'keywords');
  if (keywords) out.push(`<meta name="keywords" content="${escapeHtml(keywords)}">`);
  return out.length === 0 ? '' : '\n' + out.join('\n');
}

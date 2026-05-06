import MarkdownIt from 'markdown-it';
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
import { prefetchLang, highlightCodeSync } from './highlightCode';
import { getExportStyles } from './exportStyles';
import { injectMath } from './renderMath';
import { preprocessMermaid } from './renderMermaid';
import { escapeHtml } from './escapeHtml';
import { parseFrontMatter, frontMatterString } from '../../shared/frontMatter';
import { parseHeadings, buildOutlineTree, OutlineNode } from '../editor/outline';
import { slugify } from './slug';

const taskLists = taskListsPlugin as unknown as MarkdownIt.PluginWithOptions<{
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
  .use(footnotePlugin as MarkdownIt.PluginSimple)
  .use(markPlugin as MarkdownIt.PluginSimple)
  .use(subPlugin as MarkdownIt.PluginSimple)
  .use(supPlugin as MarkdownIt.PluginSimple)
  .use(githubAlertsPlugin as unknown as MarkdownIt.PluginSimple);

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
    tokens[i].attrSet('id', id);
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

export async function renderHtml(
  markdown: string,
  title: string,
  customCss = '',
): Promise<string> {
  const fm = parseFrontMatter(markdown);
  const source = fm.endOffset > 0 ? fm.body : markdown;
  // Compute TOC from headings, then substitute `[toc]` lines with the rendered
  // <nav>. Done before markdown-it sees the source so the TOC is treated as
  // raw HTML (md.html=true allows passthrough).
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
  // Front matter overrides the caller-supplied title and contributes meta tags.
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
${bodyWithMath}
</main>
</body>
</html>`;
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

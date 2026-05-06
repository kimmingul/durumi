import MarkdownIt from 'markdown-it';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error - markdown-it-task-lists ships no type declarations
import taskListsPlugin from 'markdown-it-task-lists';
import { prefetchLang, highlightCodeSync } from './highlightCode';
import { getExportStyles } from './exportStyles';
import { injectMath } from './renderMath';
import { preprocessMermaid } from './renderMermaid';
import { escapeHtml } from './escapeHtml';

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
}).use(taskLists, { enabled: false, label: false });


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

export async function renderHtml(
  markdown: string,
  title: string,
  customCss = '',
): Promise<string> {
  const preprocessed = await preprocessMermaid(markdown);
  const langs = extractLangs(preprocessed);
  await Promise.all(langs.map((l) => prefetchLang(l)));
  const body = md.render(preprocessed);
  const bodyWithMath = injectMath(body);
  const styles = getExportStyles();
  const userBlock = customCss ? `\n${customCss}` : '';
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
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

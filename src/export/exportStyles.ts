const STYLES = `
@page { size: A4; margin: 1.5cm; }

* { box-sizing: border-box; }

html, body { margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo",
               "Malgun Gothic", "Noto Sans KR", "Helvetica Neue", Arial, sans-serif;
  font-size: 14px;
  line-height: 1.7;
  color: #24292e;
  background: #ffffff;
}

main.export-content {
  max-width: 800px;
  margin: 2rem auto;
  padding: 0 1rem;
}

h1, h2, h3, h4, h5, h6 {
  margin-top: 1.6em;
  margin-bottom: 0.6em;
  line-height: 1.3;
  page-break-after: avoid;
}
h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.2em; }
h3 { font-size: 1.25em; }
h4 { font-size: 1em; }
h5 { font-size: 0.875em; }
h6 { font-size: 0.85em; color: #6a737d; }

p, ul, ol, blockquote, pre, table { margin: 0 0 1em 0; }

a { color: #0366d6; text-decoration: underline; }

ul, ol { padding-left: 2em; }

li > input[type="checkbox"] { margin-right: 0.4em; vertical-align: middle; }

blockquote {
  padding: 0 1em;
  color: #6a737d;
  border-left: 0.25em solid #dfe2e5;
}

code {
  font-family: "SF Mono", Menlo, Monaco, Consolas, "Courier New", monospace;
  font-size: 0.9em;
  padding: 0.2em 0.4em;
  background: #f6f8fa;
  border-radius: 3px;
}

pre {
  font-family: "SF Mono", Menlo, Monaco, Consolas, "Courier New", monospace;
  font-size: 0.9em;
  padding: 12px 16px;
  background: #f6f8fa;
  border-radius: 6px;
  overflow-x: auto;
  page-break-inside: avoid;
  line-height: 1.5;
}
pre code {
  padding: 0;
  background: transparent;
  border-radius: 0;
}

table {
  border-collapse: collapse;
  display: table;
  width: 100%;
  page-break-inside: avoid;
}
th, td {
  padding: 6px 13px;
  border: 1px solid #dfe2e5;
}
tr:nth-child(2n) { background: #f6f8fa; }
th { font-weight: 600; background: #f0f3f6; }

img { max-width: 100%; height: auto; }

hr {
  border: 0;
  border-top: 1px solid #eaecef;
  margin: 2em 0;
}

del, s { text-decoration: line-through; opacity: 0.7; }

nav.toc {
  margin: 1em 0 1.5em;
  padding: 12px 18px;
  border-left: 3px solid #6c7a89;
  background: rgba(108, 122, 137, 0.06);
  border-radius: 0 4px 4px 0;
}
nav.toc ul { list-style: none; padding-left: 1em; margin: 0; }
nav.toc > ul { padding-left: 0; }
nav.toc li.toc-h1 { font-weight: 600; }
nav.toc a { text-decoration: none; color: #0366d6; }
nav.toc a:hover { text-decoration: underline; }
nav.toc .toc-empty { color: #888; font-style: italic; margin: 0; }

.footnotes {
  margin-top: 2em;
  padding-top: 1em;
  border-top: 1px solid #eaecef;
  font-size: 0.9em;
  color: #444;
}
.footnotes ol { padding-left: 1.5em; }
.footnote-ref a, .footnote-backref { text-decoration: none; }

mark { background: #fff5b1; padding: 0 2px; border-radius: 2px; }

.markdown-alert {
  border-left: 4px solid #888;
  background: rgba(120, 120, 120, 0.06);
  padding: 8px 14px;
  margin: 1em 0;
  border-radius: 0 4px 4px 0;
}
.markdown-alert > p { margin: 0.4em 0; }
.markdown-alert-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  margin-bottom: 0.2em;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 0.85em;
}
.markdown-alert-note      { border-left-color: #0969da; background: rgba(9, 105, 218, 0.06); }
.markdown-alert-note .markdown-alert-title    { color: #0969da; }
.markdown-alert-tip       { border-left-color: #1a7f37; background: rgba(26, 127, 55, 0.06); }
.markdown-alert-tip .markdown-alert-title     { color: #1a7f37; }
.markdown-alert-important { border-left-color: #8250df; background: rgba(130, 80, 223, 0.06); }
.markdown-alert-important .markdown-alert-title { color: #8250df; }
.markdown-alert-warning   { border-left-color: #9a6700; background: rgba(154, 103, 0, 0.06); }
.markdown-alert-warning .markdown-alert-title { color: #9a6700; }
.markdown-alert-caution   { border-left-color: #cf222e; background: rgba(207, 34, 46, 0.06); }
.markdown-alert-caution .markdown-alert-title { color: #cf222e; }
sub, sup { font-size: 0.78em; }
sub { vertical-align: sub; }
sup { vertical-align: super; }

.cm-tok-keyword  { color: #d73a49; }
.cm-tok-string   { color: #032f62; }
.cm-tok-comment  { color: #6a737d; font-style: italic; }
.cm-tok-number   { color: #005cc5; }
.cm-tok-function { color: #6f42c1; }
.cm-tok-type     { color: #d73a49; }
.cm-tok-variable { color: #24292e; }
.cm-tok-operator { color: #d73a49; }
.cm-tok-punct    { color: #24292e; }
.cm-tok-atom     { color: #005cc5; }
`;

export function getExportStyles(): string {
  return STYLES;
}

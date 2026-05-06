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

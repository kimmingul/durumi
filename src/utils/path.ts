export function basenameOf(filePath: string | null, fallback = 'untitled.md'): string {
  if (!filePath) return fallback;
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? fallback;
}

export function stripMarkdownExt(name: string): string {
  return name.replace(/\.(md|markdown)$/i, '');
}

/**
 * Detects whether a path uses Windows-style backslash separators. We pick the
 * separator that already dominates the input so joins/dirnames stay native.
 */
function pathSep(p: string): '/' | '\\' {
  // Even on Windows, mixed separators are common (Node accepts both). Treat
  // a path as Windows-style only when it contains a backslash and no forward
  // slash; otherwise prefer POSIX which is also what fs.promises returns on
  // macOS / Linux.
  if (p.includes('\\') && !p.includes('/')) return '\\';
  return '/';
}

/**
 * Returns the parent directory of `filePath`. Behaves like Node's
 * `path.dirname` for both POSIX and Windows-style separators, but works in
 * the renderer where `node:path` isn't available. The trailing separator is
 * never preserved.
 */
export function dirnameOf(filePath: string): string {
  if (!filePath) return '';
  const sep = pathSep(filePath);
  // Strip a single trailing separator so `dirname('/a/b/')` returns `/a`.
  let p = filePath;
  if (p.length > 1 && (p.endsWith('/') || p.endsWith('\\'))) p = p.slice(0, -1);
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  if (idx < 0) return '';
  if (idx === 0) return sep; // Root dir, e.g. "/foo" -> "/"
  return p.slice(0, idx);
}

/**
 * Joins a directory path and a child name using the directory's separator
 * style. Trailing separators on `dir` are normalised first.
 */
export function joinPath(dir: string, name: string): string {
  if (!dir) return name;
  const sep = pathSep(dir);
  let d = dir;
  while (d.length > 1 && (d.endsWith('/') || d.endsWith('\\'))) {
    d = d.slice(0, -1);
  }
  if (d === '/' || d === '\\') return d + name;
  return d + sep + name;
}

/**
 * Returns `child` expressed relative to `root` if `child` lives inside it,
 * otherwise returns `child` unchanged. Used for "Copy relative path" — we
 * fall back to the absolute path so the clipboard never ends up empty.
 */
export function relativePathOf(root: string, child: string): string {
  if (!root) return child;
  if (child === root) return '';
  if (child.startsWith(root + '/')) return child.slice(root.length + 1);
  if (child.startsWith(root + '\\')) return child.slice(root.length + 1);
  return child;
}

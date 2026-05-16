import { promises as fs } from 'node:fs';
import { join, sep } from 'node:path';

export interface SearchOptions {
  /** Search needle. Either plain text or a regex source (see `regex`). */
  query: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  /** Treat `query` as a JavaScript regex source. */
  regex?: boolean;
}

export interface SearchHit {
  /** Workspace-relative path of the matching file (forward slashes). */
  relPath: string;
  /** Absolute path of the matching file. */
  absPath: string;
  /** 1-based line number. */
  line: number;
  /** Column offset of the match within the line (0-based). */
  column: number;
  /** Text of the matching line, trimmed of trailing newline. */
  preview: string;
  /** Length of the match within the preview. */
  matchLength: number;
}

const EXCLUDE_DIRS = new Set([
  'node_modules',
  'out',
  'dist',
  'dist-build',
  'target',
  'build',
  '.git',
  '.DS_Store',
  '.vscode',
  '.idea',
  '.next',
  '.nuxt',
]);

const TEXT_EXT = /\.(md|markdown|txt|tex|csv|json|yaml|yml)$/i;
const MAX_FILE_BYTES = 1 * 1024 * 1024;
const MAX_HITS = 500;
const PROBE_BYTES = 8 * 1024;

export function buildMatcher(opts: SearchOptions): RegExp | null {
  if (opts.query.length === 0) return null;
  const flags = 'g' + (opts.caseSensitive ? '' : 'i');
  let pattern: string;
  if (opts.regex) {
    pattern = opts.query;
  } else {
    pattern = escapeRegExp(opts.query);
    if (opts.wholeWord) pattern = `\\b${pattern}\\b`;
  }
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function searchInWorkspace(
  rootPath: string,
  opts: SearchOptions,
): Promise<SearchHit[]> {
  const matcher = buildMatcher(opts);
  if (!matcher) return [];
  const hits: SearchHit[] = [];
  await walk(rootPath, rootPath, matcher, hits);
  return hits;
}

async function walk(
  rootPath: string,
  current: string,
  matcher: RegExp,
  hits: SearchHit[],
): Promise<void> {
  if (hits.length >= MAX_HITS) return;
  let entries: { name: string; isDirectory: () => boolean; isFile: () => boolean }[];
  try {
    entries = (await fs.readdir(current, { withFileTypes: true })) as never;
  } catch {
    return;
  }
  for (const entry of entries) {
    if (hits.length >= MAX_HITS) return;
    if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      await walk(rootPath, join(current, entry.name), matcher, hits);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!TEXT_EXT.test(entry.name)) continue;
    const abs = join(current, entry.name);
    await scanFile(rootPath, abs, matcher, hits);
  }
}

async function scanFile(
  rootPath: string,
  abs: string,
  matcher: RegExp,
  hits: SearchHit[],
): Promise<void> {
  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    return;
  }
  if (stat.size > MAX_FILE_BYTES) return;
  let buf: Buffer;
  try {
    buf = await fs.readFile(abs);
  } catch {
    return;
  }
  if (containsNul(buf, PROBE_BYTES)) return;
  const text = buf.toString('utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (hits.length >= MAX_HITS) return;
    const line = lines[i];
    if (line === undefined) continue;
    for (const m of line.matchAll(matcher)) {
      const idx = m.index ?? 0;
      hits.push({
        relPath: relPath(rootPath, abs),
        absPath: abs,
        line: i + 1,
        column: idx,
        preview: line,
        matchLength: m[0].length,
      });
      if (hits.length >= MAX_HITS) return;
    }
  }
}

function containsNul(buf: Buffer, probe: number): boolean {
  const limit = Math.min(buf.length, probe);
  for (let i = 0; i < limit; i++) if (buf[i] === 0) return true;
  return false;
}

function relPath(root: string, abs: string): string {
  if (abs === root) return '';
  if (abs.startsWith(root + sep)) {
    return abs.slice(root.length + 1).replace(/\\/g, '/');
  }
  return abs.replace(/\\/g, '/');
}

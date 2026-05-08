import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';

export interface PandocInfo {
  binary: string;
  version: string;
}

const WELL_KNOWN_BIN_LOCATIONS = [
  '/usr/local/bin/pandoc',
  '/opt/homebrew/bin/pandoc',
  '/usr/bin/pandoc',
  'C:/Program Files/Pandoc/pandoc.exe',
  'C:/Program Files (x86)/Pandoc/pandoc.exe',
];

let cache: { override: string | null; result: PandocInfo | null } | null = null;

/**
 * Returns information about the pandoc binary, or null when none is found.
 *
 * Lookup order:
 *   1. The explicit `override` path, if provided and valid.
 *   2. `pandoc` resolved via the parent process PATH.
 *   3. A handful of well-known install locations.
 *
 * Cached per `override` value for the lifetime of the process; call
 * `clearPandocCache()` after the user changes the override path.
 */
export async function detectPandoc(override: string | null = null): Promise<PandocInfo | null> {
  if (cache && cache.override === override) return cache.result;
  const candidates: string[] = [];
  if (override && override.trim().length > 0) candidates.push(override.trim());
  candidates.push('pandoc');
  candidates.push(...WELL_KNOWN_BIN_LOCATIONS);

  for (const cand of candidates) {
    const info = await probe(cand);
    if (info) {
      cache = { override, result: info };
      return info;
    }
  }
  cache = { override, result: null };
  return null;
}

/** Drops the lookup cache. Call after the user changes the override path. */
export function clearPandocCache(): void {
  cache = null;
}

async function probe(bin: string): Promise<PandocInfo | null> {
  // For absolute paths we double-check the file exists first; cuts down on
  // ENOENT noise when spawning.
  if (bin.includes('/') || bin.includes('\\')) {
    try {
      await fs.access(bin);
    } catch {
      return null;
    }
  }
  const result = await runProcess(bin, ['--version'], '', 5_000);
  if (!result.ok) return null;
  const firstLine = result.stdout.split('\n')[0]?.trim() ?? '';
  const m = /^pandoc(?:\.exe)?\s+(\S+)/i.exec(firstLine);
  if (!m) return null;
  return { binary: bin, version: m[1] };
}

export interface RunPandocOptions {
  /** Markdown source to feed to pandoc on stdin. */
  input: string;
  /** Output file path (passed via -o). Pandoc decides format from extension. */
  outputPath: string;
  /** Optional explicit pandoc binary; null/undefined = auto-detect. */
  override?: string | null;
  /** Extra command-line args appended after the standard ones. */
  extraArgs?: readonly string[];
  /** Soft timeout in milliseconds (default 30s). */
  timeoutMs?: number;
}

export interface PandocResult {
  ok: boolean;
  /** Filled when ok=false: human-readable reason. */
  error?: string;
  /** Filled when ok=false: stderr contents from pandoc, if available. */
  stderr?: string;
}

export interface ImportPandocOptions {
  /** Absolute path to the source document. */
  inputPath: string;
  /** Pandoc input format, e.g. `docx`, `odt`, `rtf`. */
  fromFormat: string;
  /** Optional explicit pandoc binary; null/undefined = auto-detect. */
  override?: string | null;
  /** Soft timeout (default 30s). */
  timeoutMs?: number;
}

export interface ImportResult {
  ok: boolean;
  markdown?: string;
  error?: string;
  stderr?: string;
}

/**
 * Reads a non-markdown source via pandoc and returns the converted Markdown
 * string. Used by the .docx import flow.
 */
export async function importViaPandoc(opts: ImportPandocOptions): Promise<ImportResult> {
  const info = await detectPandoc(opts.override ?? null);
  if (!info) {
    return {
      ok: false,
      error:
        'Pandoc not found on your system. Install it from https://pandoc.org/installing.html or set a custom path in preferences.',
    };
  }
  const args = [
    '-f',
    opts.fromFormat,
    '-t',
    'markdown+yaml_metadata_block+footnotes+definition_lists+pipe_tables-raw_html',
    '--wrap=none',
    opts.inputPath,
  ];
  const r = await runProcess(info.binary, args, '', opts.timeoutMs ?? 30_000);
  if (!r.ok) return { ok: false, error: r.error ?? 'import failed', stderr: r.stderr };
  return { ok: true, markdown: r.stdout };
}

/**
 * Runs pandoc with `markdown+yaml_metadata_block+footnotes` as the input
 * format and the given output path. Returns a structured result rather than
 * throwing so callers can present a friendly error.
 */
export async function runPandoc(opts: RunPandocOptions): Promise<PandocResult> {
  const info = await detectPandoc(opts.override ?? null);
  if (!info) {
    return {
      ok: false,
      error:
        'Pandoc not found on your system. Install it from https://pandoc.org/installing.html or set a custom path in preferences.',
    };
  }
  const args = [
    '-f',
    'markdown+yaml_metadata_block+footnotes+definition_lists+pipe_tables+raw_html',
    '-o',
    opts.outputPath,
    '--standalone',
    ...(opts.extraArgs ?? []),
  ];
  const result = await runProcess(info.binary, args, opts.input, opts.timeoutMs ?? 30_000);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? 'pandoc failed',
      stderr: result.stderr,
    };
  }
  return { ok: true };
}

interface ProcessResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}

function runProcess(
  bin: string,
  args: readonly string[],
  stdinData: string,
  timeoutMs: number,
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn(bin, [...args], { windowsHide: true });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      resolve({ ok: false, stdout, stderr, error: `timeout after ${timeoutMs}ms` });
    }, timeoutMs);
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr?.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr, error: err.message });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true, stdout, stderr });
      else resolve({ ok: false, stdout, stderr, error: `exited with code ${code}` });
    });
    if (child.stdin) {
      child.stdin.end(stdinData, 'utf8');
    } else if (!settled) {
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr, error: 'failed to obtain stdin' });
    }
  });
}

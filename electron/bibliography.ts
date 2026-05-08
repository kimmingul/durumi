import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

const CANDIDATE_NAMES = ['references.bib', 'references.bibtex', 'bibliography.bib'];

/**
 * Walks up from `startDir` looking for the first bibliography file. Stops at
 * `stopAt` (inclusive) — typically the workspace root. Returns the absolute
 * path to the file plus its decoded contents, or null when nothing is found.
 *
 * Designed for the export flow: caller is the markdown file being exported.
 * We climb at most 32 levels to avoid pathological symlink loops.
 */
export interface BibliographyHit {
  path: string;
  source: string;
}

export async function findBibliographyFor(
  filePath: string | null,
  workspaceRoots: readonly string[],
): Promise<BibliographyHit | null> {
  let dir = filePath ? dirname(filePath) : null;
  if (!dir) {
    // No file open yet — fall back to scanning each workspace root once.
    for (const root of workspaceRoots) {
      const hit = await probeDir(root);
      if (hit) return hit;
    }
    return null;
  }
  const stopAt = pickStopRoot(dir, workspaceRoots);
  for (let i = 0; i < 32; i++) {
    const hit = await probeDir(dir);
    if (hit) return hit;
    if (dir === stopAt) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function probeDir(dir: string): Promise<BibliographyHit | null> {
  for (const name of CANDIDATE_NAMES) {
    const candidate = join(dir, name);
    try {
      const source = await fs.readFile(candidate, 'utf8');
      return { path: candidate, source };
    } catch {
      // ignore — try next candidate
    }
  }
  return null;
}

function pickStopRoot(dir: string, roots: readonly string[]): string {
  let best: string | null = null;
  for (const root of roots) {
    if (dir === root || dir.startsWith(root + '/') || dir.startsWith(root + '\\')) {
      if (!best || root.length > best.length) best = root;
    }
  }
  return best ?? dir;
}

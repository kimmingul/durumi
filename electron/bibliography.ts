import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { discoverProjectFor } from './projectDiscovery';
import { manifestBibliographyPath } from '../shared/workspaceManifest';

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

/**
 * 프로젝트를 아는 서지 해석 (REQ-WS-040).
 *
 * 소유 프로젝트의 매니페스트가 `bibliography` 경로를 선언하면 그것이 기존
 * walk-up보다 우선한다. 키가 없거나, 스키마 위반(인라인 서지 항목 —
 * REQ-WS-039)이거나, 선언된 파일을 읽을 수 없으면 `findBibliographyFor`가
 * **변경 없이** 그대로 적용된다 — 기존 탐색 순서
 * (`references.bib` → `references.bibtex` → `bibliography.bib`)는 손대지 않았다.
 *
 * 읽기 실패 시 폴백은 SPEC이 정하지 않은 부분에 대한 선택이다: 편집·저장을
 * 계속 가능하게 두는 쪽(REQ-WS-007의 태도)과 AC-WS-055가 스키마 위반에 대해
 * 정한 폴백 방향을 따랐다.
 */
export async function findBibliographyForDocument(
  filePath: string | null,
  workspaceRoots: readonly string[],
): Promise<BibliographyHit | null> {
  const discovery = await discoverProjectFor(filePath);
  if (discovery.kind === 'project') {
    const relPath = manifestBibliographyPath(discovery.manifest);
    if (relPath) {
      const declared = join(discovery.root, relPath);
      try {
        return { path: declared, source: await fs.readFile(declared, 'utf8') };
      } catch {
        // 선언된 파일이 없거나 읽히지 않으면 기존 탐색으로 되돌아간다.
      }
    }
  }
  return findBibliographyFor(filePath, workspaceRoots);
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

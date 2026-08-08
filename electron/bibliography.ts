import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { discoverProjectFor } from './projectDiscovery';

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
 * 매니페스트 선언 경로를 채택하지 못한 사유.
 *
 * `schema-violation`은 값이 경로가 아니라 인라인 서지 항목인 경우이고
 * (REQ-WS-039), 나머지는 경로는 맞으나 읽지 못한 경우다 (REQ-WS-056).
 */
export type BibliographyFallbackReason =
  | 'schema-violation'
  | 'missing'
  | 'permission-denied'
  | 'not-a-file'
  | 'unreadable';

export interface BibliographyFallback {
  /** 매니페스트가 선언한, 채택하지 못한 경로. */
  declaredPath: string;
  reason: BibliographyFallbackReason;
}

export interface BibliographyResolution {
  hit: BibliographyHit | null;
  /** 선언 경로를 쓰지 못해 walk-up으로 물러섰을 때만 채워진다. */
  fallback: BibliographyFallback | null;
}

/**
 * 읽기 오류를 폴백 사유로 분류한다.
 *
 * 순수 함수로 떼어 낸 이유: 실제 EACCES를 만들려면 실행 사용자가 root가
 * 아니어야 해서 검사가 비결정적이 된다. 분류 규칙만 따로 검증한다.
 */
export function bibliographyFallbackReason(err: unknown): BibliographyFallbackReason {
  const code = (err as { code?: unknown } | null)?.code;
  switch (code) {
    case 'ENOENT':
      return 'missing';
    case 'EACCES':
    case 'EPERM':
      return 'permission-denied';
    case 'EISDIR':
      return 'not-a-file';
    default:
      return 'unreadable';
  }
}

/**
 * 프로젝트를 아는 서지 해석 (REQ-WS-040, REQ-WS-056).
 *
 * 소유 프로젝트의 매니페스트가 `bibliography` 경로를 선언하면 그것이 기존
 * walk-up보다 우선한다. 선언 경로를 쓸 수 없으면 `findBibliographyFor`가
 * **변경 없이** 그대로 적용되며 — 기존 탐색 순서는 손대지 않았다 — 폴백이
 * 일어났다는 사실과 문제의 선언 경로를 함께 돌려준다.
 *
 * **조용한 폴백은 실패다** (REQ-WS-056). 보고 없이 물러서면 매니페스트의 오타
 * 하나가 다른 서지 파일로 조용히 해결되어, 사용자가 의도하지 않은 참고문헌으로
 * 원고를 쓰고도 끝까지 알 수 없다. 표시 자체는 UI(M8/SPEC-2)의 몫이고 이
 * 함수는 표시에 필요한 사실을 반환값에 싣는다.
 */
export async function findBibliographyForDocument(
  filePath: string | null,
  workspaceRoots: readonly string[],
): Promise<BibliographyResolution> {
  const discovery = await discoverProjectFor(filePath);
  let fallback: BibliographyFallback | null = null;

  if (discovery.kind === 'project') {
    const declared = discovery.manifest.bibliography;
    if (declared.kind === 'path') {
      const absolute = join(discovery.root, declared.relPath);
      try {
        const source = await fs.readFile(absolute, 'utf8');
        return { hit: { path: absolute, source }, fallback: null };
      } catch (err) {
        fallback = {
          declaredPath: declared.relPath,
          reason: bibliographyFallbackReason(err),
        };
      }
    } else if (declared.kind === 'invalid') {
      // 값이 경로가 아니다 — 인라인 서지 항목 등 (REQ-WS-039).
      fallback = { declaredPath: '', reason: 'schema-violation' };
    }
  }

  return { hit: await findBibliographyFor(filePath, workspaceRoots), fallback };
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

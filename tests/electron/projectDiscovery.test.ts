import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { vi } from 'vitest';

// pathGuard는 preferences를 통해 electron을 끌어오므로 node-env에서 막아둔다
// (tests/electron/pathGuard.test.ts와 같은 방식).
vi.mock('electron', () => ({}));

import {
  discoverProjectFor,
  projectFolderPaths,
  MAX_WALK_UP_LEVELS,
  type ProjectDiscovery,
} from '../../electron/projectDiscovery';
import {
  findBibliographyFor,
  findBibliographyForDocument,
  bibliographyFallbackReason,
} from '../../electron/bibliography';
import {
  assertAllowedPath,
  isAllowedPath,
  PathNotAllowedError,
  _resetSessionForTests,
  _setPrefsReaderForTests,
  _resetPrefsReaderForTests,
  allowSessionPath,
} from '../../electron/pathGuard';
import { MANIFEST_FILENAME } from '@shared/workspaceManifest';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'durumi-proj-'));
  _resetSessionForTests();
  _setPrefsReaderForTests(async () => ({ workspaceFolders: [], recentFiles: [] }));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  _resetSessionForTests();
  _resetPrefsReaderForTests();
});

async function writeManifest(at: string, body: string): Promise<string> {
  const p = join(at, MANIFEST_FILENAME);
  await writeFile(p, body, 'utf8');
  return p;
}

const sha256 = async (p: string): Promise<string> =>
  createHash('sha256').update(await readFile(p)).digest('hex');

function expectProject(d: ProjectDiscovery): Extract<ProjectDiscovery, { kind: 'project' }> {
  if (d.kind !== 'project') throw new Error(`expected project, got ${d.kind}`);
  return d;
}

describe('walk-up 탐색 — REQ-WS-004 / AC-WS-001', () => {
  it('매니페스트를 가진 상위 디렉터리를 소유 프로젝트로 보고한다', async () => {
    await writeManifest(dir, 'name: cohort-2026\n');
    await mkdir(join(dir, 'manuscript'));
    await writeFile(join(dir, 'manuscript', 'a.md'), '# x');

    const d = expectProject(await discoverProjectFor(join(dir, 'manuscript', 'a.md')));
    expect(d.root).toBe(resolve(dir));
    expect(d.manifest.name).toBe('cohort-2026');
    expect(d.manifestPath).toBe(join(resolve(dir), MANIFEST_FILENAME));
  });

  it('파일과 같은 디렉터리의 매니페스트도 찾는다', async () => {
    await writeManifest(dir, 'name: flat\n');
    await writeFile(join(dir, 'a.md'), '# x');
    expect(expectProject(await discoverProjectFor(join(dir, 'a.md'))).root).toBe(resolve(dir));
  });

  it('열린 파일이 없으면 프로젝트 없음이다', async () => {
    expect((await discoverProjectFor(null)).kind).toBe('none');
  });
});

describe('최근접 매니페스트가 이긴다 — REQ-WS-005 / AC-WS-003', () => {
  it('depth가 작은 쪽을 소유 프로젝트로 고른다', async () => {
    await writeManifest(dir, 'name: outer\n');
    await mkdir(join(dir, 'sub'));
    await writeManifest(join(dir, 'sub'), 'name: inner\n');
    await writeFile(join(dir, 'sub', 'a.md'), '# x');

    const d = expectProject(await discoverProjectFor(join(dir, 'sub', 'a.md')));
    expect(d.root).toBe(join(resolve(dir), 'sub'));
    expect(d.manifest.name).toBe('inner');
  });

  it('최근접이 손상이면 상위의 정상 매니페스트로 강등하지 않는다', async () => {
    // REQ-WS-008: 손상은 "프로젝트 없음"으로도, 상위 프로젝트로도 강등되지 않는다.
    await writeManifest(dir, 'name: outer-valid\n');
    await mkdir(join(dir, 'sub'));
    await writeManifest(join(dir, 'sub'), 'name: [unclosed\n');
    await writeFile(join(dir, 'sub', 'a.md'), '# x');

    const d = await discoverProjectFor(join(dir, 'sub', 'a.md'));
    expect(d.kind).toBe('corrupt');
    if (d.kind !== 'corrupt') return;
    expect(d.root).toBe(join(resolve(dir), 'sub'));
  });
});

describe('탐색 상한 — REQ-WS-004 / AC-WS-002', () => {
  /** `dir` 아래로 `depth`단 중첩 디렉터리를 만들고 최하위 경로를 돌려준다. */
  async function nest(depth: number): Promise<string> {
    const leaf = join(dir, ...Array.from({ length: depth }, (_, i) => `d${i}`));
    await mkdir(leaf, { recursive: true });
    return leaf;
  }

  it('상한은 기존 .bib walk-up과 같은 32다', () => {
    expect(MAX_WALK_UP_LEVELS).toBe(32);
  });

  it('상한 안쪽의 매니페스트는 찾는다', async () => {
    const leaf = await nest(MAX_WALK_UP_LEVELS - 1);
    await writeManifest(dir, 'name: deep\n');
    await writeFile(join(leaf, 'a.md'), '# x');
    expect((await discoverProjectFor(join(leaf, 'a.md'))).kind).toBe('project');
  });

  it('33단계 위에만 있으면 프로젝트 없음이고 오류가 없다', async () => {
    const leaf = await nest(33);
    await writeManifest(dir, 'name: too-far\n');
    await writeFile(join(leaf, 'a.md'), '# x');
    expect((await discoverProjectFor(join(leaf, 'a.md'))).kind).toBe('none');
  });

  it('기존 .bib walk-up과 32단계 상한이 같다', async () => {
    // "동일한 상한"(REQ-WS-004)을 문장이 아니라 동작으로 고정한다.
    //
    // `findBibliographyFor`는 워크스페이스 루트에서도 멈추므로(`pickStopRoot`),
    // 32단계 상한만 비교하려면 루트를 탐색 범위 밖에 두어야 한다. 여기서는
    // 상한에 걸리는 지점이 두 구현에서 같은지만 본다 — 워크스페이스 루트
    // 정지 조건은 discovery에 없다(§보고 참조).
    for (const depth of [MAX_WALK_UP_LEVELS - 1, 33]) {
      const scratch = await mkdtemp(join(tmpdir(), 'durumi-reach-'));
      try {
        const leaf = join(scratch, ...Array.from({ length: depth }, (_, i) => `d${i}`));
        await mkdir(leaf, { recursive: true });
        await writeManifest(scratch, 'name: reach\n');
        await writeFile(join(scratch, 'references.bib'), '@article{a}');
        await writeFile(join(leaf, 'a.md'), '# x');

        const manifestFound = (await discoverProjectFor(join(leaf, 'a.md'))).kind !== 'none';
        const bibFound = (await findBibliographyFor(join(leaf, 'a.md'), [scratch])) !== null;
        expect(manifestFound, `depth=${depth}`).toBe(bibFound);
      } finally {
        await rm(scratch, { recursive: true, force: true });
      }
    }
  });
});

describe('매니페스트 부재는 오류가 아니다 — REQ-WS-006 / AC-WS-004', () => {
  it('어떤 상위에도 없으면 프로젝트 없음으로 조용히 연다', async () => {
    await writeFile(join(dir, 'a.md'), '# x');
    const d = await discoverProjectFor(join(dir, 'a.md'));
    expect(d).toEqual({ kind: 'none' });
  });
});

describe('손상된 매니페스트 — REQ-WS-007, 008 / AC-WS-005, AC-WS-006', () => {
  it('유효하지 않은 YAML은 손상 상태로 파싱 오류를 노출한다', async () => {
    const p = await writeManifest(dir, 'name: [unclosed\n');
    await writeFile(join(dir, 'a.md'), '# x');

    const d = await discoverProjectFor(join(dir, 'a.md'));
    expect(d.kind).toBe('corrupt');
    if (d.kind !== 'corrupt') return;
    expect(d.reason).toBe('yaml');
    expect(d.message.length).toBeGreaterThan(0);
    expect(d.manifestPath).toBe(p);
  });

  it('읽기 전후 매니페스트 바이트가 변하지 않는다 (자동 수정 금지)', async () => {
    const p = await writeManifest(dir, '# 사용자 주석\nname: [unclosed\n');
    await writeFile(join(dir, 'a.md'), '# x');
    const before = await sha256(p);
    await discoverProjectFor(join(dir, 'a.md'));
    expect(await sha256(p)).toBe(before);
  });

  it('필수 키 name 결여는 손상과 동일 취급이며 프로젝트 없음이 아니다', async () => {
    await writeManifest(dir, 'version: 1\n');
    await writeFile(join(dir, 'a.md'), '# x');

    const d = await discoverProjectFor(join(dir, 'a.md'));
    expect(d.kind).toBe('corrupt');
    if (d.kind !== 'corrupt') return;
    expect(d.reason).toBe('missing-name');
  });
});

describe('규약 폴더 — REQ-WS-010, 011 / AC-WS-008, AC-WS-009, AC-WS-010', () => {
  it('재정의가 절대 경로로 해석된다', async () => {
    await writeManifest(dir, 'name: x\nfolders:\n  figures: output/fig\n');
    await writeFile(join(dir, 'a.md'), '# x');

    const d = expectProject(await discoverProjectFor(join(dir, 'a.md')));
    const paths = projectFolderPaths(d);
    expect(paths.figures).toBe(join(resolve(dir), 'output', 'fig'));
  });

  it('루트 밖 재정의는 기본값의 절대 경로로 되돌아간다', async () => {
    await writeManifest(dir, 'name: x\nfolders:\n  data: ../elsewhere\n');
    await writeFile(join(dir, 'a.md'), '# x');

    const d = expectProject(await discoverProjectFor(join(dir, 'a.md')));
    expect(projectFolderPaths(d).data).toBe(join(resolve(dir), 'data'));
  });

  it('다섯 역할이 모두 프로젝트 루트 안의 절대 경로다', async () => {
    await writeManifest(dir, 'name: x\n');
    await writeFile(join(dir, 'a.md'), '# x');

    const d = expectProject(await discoverProjectFor(join(dir, 'a.md')));
    const paths = projectFolderPaths(d);
    expect(Object.keys(paths).sort()).toEqual(
      ['data', 'figures', 'manuscript', 'reference', 'scripts'].sort(),
    );
    for (const p of Object.values(paths)) {
      expect(p.startsWith(resolve(dir))).toBe(true);
    }
    expect(paths.reference).toBe(join(resolve(dir), 'reference'));
  });

  it('규약 폴더를 자동 생성하지 않는다', async () => {
    await writeManifest(dir, 'name: x\n');
    await writeFile(join(dir, 'a.md'), '# x');
    const before = (await readdir(dir)).sort();

    const d = expectProject(await discoverProjectFor(join(dir, 'a.md')));
    projectFolderPaths(d);

    expect((await readdir(dir)).sort()).toEqual(before);
  });

  it('규약 폴더가 없어도 프로젝트는 정상이다', async () => {
    await writeManifest(dir, 'name: x\n');
    await writeFile(join(dir, 'a.md'), '# x');
    expect((await discoverProjectFor(join(dir, 'a.md'))).kind).toBe('project');
  });
});

describe('프로젝트 발견이 신뢰를 넓히지 않는다 — REQ-WS-012 / AC-WS-011 (D-6)', () => {
  it('E2E 우회가 꺼져 있어야 이 절의 단언이 유효하다', () => {
    // DURUMI_E2E=1이면 tmpdir 전체가 신뢰되어 아래 단언이 공허해진다.
    expect(process.env.DURUMI_E2E).not.toBe('1');
  });

  it('매니페스트 발견만으로 루트 하위 미신뢰 경로가 신뢰되지 않는다', async () => {
    await writeManifest(dir, 'name: x\n');
    await mkdir(join(dir, 'manuscript'));
    const doc = join(dir, 'manuscript', 'a.md');
    await writeFile(doc, '# x');
    // 파일을 여는 기존 경로가 준 Tier-2 신뢰만 있는 상태를 재현한다.
    allowSessionPath(doc);

    const d = expectProject(await discoverProjectFor(doc));
    expect(d.root).toBe(resolve(dir));

    // 루트 바로 아래의 다른 경로는 여전히 신뢰 밖이다.
    const secret = join(resolve(dir), 'secret.txt');
    expect(await isAllowedPath(secret)).toBe(false);
    await expect(assertAllowedPath(secret)).rejects.toBeInstanceOf(PathNotAllowedError);

    // 규약 폴더도 마찬가지다 — 해석된 경로는 신뢰와 무관하다.
    expect(await isAllowedPath(projectFolderPaths(d).data)).toBe(false);
  });

  it('discovery는 신뢰 승격 API를 호출하지 않는다', async () => {
    // 행위 단언(위)과 짝을 이루는 구조 단언. 새 승격 경로가 추가되면 여기서 잡힌다.
    const src = await readFile(join(process.cwd(), 'electron', 'projectDiscovery.ts'), 'utf8');
    for (const forbidden of [
      'allowSessionPath',
      'allowSessionTree',
      'assertPrefsPatchAllowed',
      'setPreferences',
      'workspaceFolders',
    ]) {
      expect(src, forbidden).not.toContain(forbidden);
    }
  });
});

describe('서지 경로 해석 — REQ-WS-040 / AC-WS-042, AC-WS-043, AC-WS-055', () => {
  it('매니페스트 bibliography가 walk-up보다 우선한다', async () => {
    await writeManifest(dir, 'name: x\nbibliography: refs/custom.bib\n');
    await mkdir(join(dir, 'refs'));
    await writeFile(join(dir, 'refs', 'custom.bib'), '@article{custom}');
    await writeFile(join(dir, 'references.bib'), '@article{adjacent}');
    await writeFile(join(dir, 'a.md'), '# x');

    const r = await findBibliographyForDocument(join(dir, 'a.md'), []);
    expect(r.hit?.path).toBe(join(resolve(dir), 'refs', 'custom.bib'));
    expect(r.hit?.source).toContain('custom');
    expect(r.fallback).toBeNull();
  });

  it('bibliography 키가 없으면 기존 walk-up 결과와 동일하다', async () => {
    await writeManifest(dir, 'name: x\n');
    await writeFile(join(dir, 'references.bib'), '@article{a}');
    await writeFile(join(dir, 'a.md'), '# x');

    const legacy = await findBibliographyFor(join(dir, 'a.md'), []);
    const next = await findBibliographyForDocument(join(dir, 'a.md'), []);
    expect(next.hit).toEqual(legacy);
    expect(next.hit?.path).toBe(join(dir, 'references.bib'));
  });

  it('프로젝트가 없으면 기존 walk-up 결과와 동일하다', async () => {
    await writeFile(join(dir, 'references.bibtex'), '@article{b}');
    await mkdir(join(dir, 'sub'));
    await writeFile(join(dir, 'sub', 'a.md'), '# x');

    const legacy = await findBibliographyFor(join(dir, 'sub', 'a.md'), [dir]);
    const next = await findBibliographyForDocument(join(dir, 'sub', 'a.md'), [dir]);
    expect(next.hit).toEqual(legacy);
    expect(next.hit?.path).toBe(join(dir, 'references.bibtex'));
  });

  it('인라인 서지 항목은 채택되지 않고 walk-up으로 폴백한다', async () => {
    await writeManifest(dir, 'name: x\nbibliography:\n  title: A paper\n  doi: 10.1/xyz\n');
    await writeFile(join(dir, 'references.bib'), '@article{fallback}');
    await writeFile(join(dir, 'a.md'), '# x');

    const r = await findBibliographyForDocument(join(dir, 'a.md'), []);
    expect(r.hit?.path).toBe(join(dir, 'references.bib'));
    expect(r.hit?.source).toContain('fallback');
    expect(r.fallback!.reason).toBe('schema-violation');
  });

  it('선언된 경로를 읽을 수 없으면 폴백하되 그 사실을 보고한다 (AC-WS-070)', async () => {
    // 조용한 폴백은 실패다 — 매니페스트 오타가 다른 서지 파일로 조용히
    // 해결되면 사용자가 잘못된 참고문헌을 쓰고도 알 수 없다.
    await writeManifest(dir, 'name: x\nbibliography: refs/typo.bib\n');
    await writeFile(join(dir, 'references.bib'), '@article{fallback}');
    await writeFile(join(dir, 'a.md'), '# x');

    const r = await findBibliographyForDocument(join(dir, 'a.md'), []);
    expect(r.hit?.path).toBe(join(dir, 'references.bib'));
    expect(r.fallback).not.toBeNull();
    expect(r.fallback!.declaredPath).toBe('refs/typo.bib');
    expect(r.fallback!.reason).toBe('missing');
  });

  it('선언 경로가 디렉터리여도 같은 결과가 나온다 (AC-WS-070)', async () => {
    await mkdir(join(dir, 'refs'));
    await mkdir(join(dir, 'refs', 'notafile.bib'));
    await writeManifest(dir, 'name: x\nbibliography: refs/notafile.bib\n');
    await writeFile(join(dir, 'references.bib'), '@article{fallback}');
    await writeFile(join(dir, 'a.md'), '# x');

    const r = await findBibliographyForDocument(join(dir, 'a.md'), []);
    expect(r.hit?.path).toBe(join(dir, 'references.bib'));
    expect(r.fallback!.declaredPath).toBe('refs/notafile.bib');
    expect(r.fallback!.reason).toBe('not-a-file');
  });

  it('권한 거부도 폴백 사유로 분류된다 (AC-WS-070)', () => {
    // 실제로 EACCES를 만들려면 root 여부에 의존하므로 비결정적이다.
    // 사유 분류는 순수 함수로 떼어 내 오류 코드로 직접 검증한다.
    expect(bibliographyFallbackReason({ code: 'EACCES' })).toBe('permission-denied');
    expect(bibliographyFallbackReason({ code: 'EPERM' })).toBe('permission-denied');
    expect(bibliographyFallbackReason({ code: 'ENOENT' })).toBe('missing');
    expect(bibliographyFallbackReason({ code: 'EISDIR' })).toBe('not-a-file');
    expect(bibliographyFallbackReason({ code: 'WHATEVER' })).toBe('unreadable');
    expect(bibliographyFallbackReason(new Error('no code'))).toBe('unreadable');
  });

  it('폴백이 없으면 fallback이 null이다', async () => {
    await writeManifest(dir, 'name: x\n');
    await writeFile(join(dir, 'references.bib'), '@article{a}');
    await writeFile(join(dir, 'a.md'), '# x');

    const r = await findBibliographyForDocument(join(dir, 'a.md'), []);
    expect(r.fallback).toBeNull();
  });

  it('손상된 매니페스트는 서지 해석을 막지 않는다', async () => {
    await writeManifest(dir, 'name: [unclosed\n');
    await writeFile(join(dir, 'references.bib'), '@article{a}');
    await writeFile(join(dir, 'a.md'), '# x');

    const r = await findBibliographyForDocument(join(dir, 'a.md'), []);
    expect(r.hit?.path).toBe(join(dir, 'references.bib'));
    expect(r.fallback).toBeNull();
  });
});

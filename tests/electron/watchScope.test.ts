import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

vi.mock('electron', () => ({}));

import { resolveWatchScope, registerWatchScope, refreshProjectTree } from '../../electron/watchScope';
import { discoverProjectFor, type ProjectDiscovery } from '../../electron/projectDiscovery';
import { MANIFEST_FILENAME } from '@shared/workspaceManifest';
import { PathNotAllowedError } from '../../electron/pathGuard';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'durumi-scope-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function projectWith(manifestBody: string): Promise<ProjectDiscovery> {
  await writeFile(join(dir, MANIFEST_FILENAME), manifestBody, 'utf8');
  await writeFile(join(dir, 'a.md'), '# x');
  return discoverProjectFor(join(dir, 'a.md'));
}

const R = (...seg: string[]): string => join(resolve(dir), ...seg);

describe('열린 파일은 위치 무관 전부 감시 — REQ-WS-013 / AC-WS-012', () => {
  it('프로젝트가 없어도 열린 파일이 감시 목록에 든다', () => {
    const scope = resolveWatchScope({
      openFiles: ['/elsewhere/notes.md', '/other/x.csv'],
      project: { kind: 'none' },
    });
    expect(scope.files.sort()).toEqual(['/elsewhere/notes.md', '/other/x.csv'].sort());
    expect(scope.folders).toEqual([]);
  });

  it('손상된 매니페스트여도 열린 파일 감시는 계속된다', async () => {
    const project = await projectWith('name: [unclosed\n');
    expect(project.kind).toBe('corrupt');
    const scope = resolveWatchScope({ openFiles: [R('a.md')], project });
    expect(scope.files).toEqual([R('a.md')]);
    expect(scope.folders).toEqual([]);
  });
});

describe('규약 폴더 추가 감시 — REQ-WS-045 / AC-WS-056, AC-WS-057', () => {
  it('data 역할을 뺀 네 폴더가 감시 목록에 든다', async () => {
    const project = await projectWith('name: x\n');
    const scope = resolveWatchScope({ openFiles: [], project });
    expect(scope.folders.sort()).toEqual(
      [R('manuscript'), R('reference'), R('figures'), R('scripts')].sort(),
    );
    expect(scope.folders).not.toContain(R('data'));
  });

  it('folders 재정의가 감시 경로에 반영된다', async () => {
    const project = await projectWith('name: x\nfolders:\n  figures: output/fig\n');
    const scope = resolveWatchScope({ openFiles: [], project });
    expect(scope.folders).toContain(R('output', 'fig'));
    expect(scope.folders).not.toContain(R('figures'));
  });
});

describe('제외는 역할 기반이다 — REQ-WS-046 / AC-WS-066', () => {
  it('folders.data가 재정의되면 그 경로 하나만 제외된다', async () => {
    const project = await projectWith('name: x\nfolders:\n  data: archive\n');
    const scope = resolveWatchScope({ openFiles: [], project });
    expect(scope.excluded).toEqual([R('archive')]);
    expect(scope.folders).not.toContain(R('archive'));
  });

  it('이름이 data인 manuscript 폴더는 제외되지 않는다', async () => {
    // 리터럴 경로 기준으로 제외하면 이 설정에서 원고 폴더 감시가 끊겨
    // REQ-WS-045를 정면으로 위반한다.
    const project = await projectWith('name: x\nfolders:\n  data: archive\n  manuscript: data\n');
    const scope = resolveWatchScope({ openFiles: [], project });

    expect(scope.excluded).toEqual([R('archive')]);
    expect(scope.excluded).toHaveLength(1);
    expect(scope.folders).toContain(R('data'));
  });

  it('제외 경로는 언제나 정확히 하나다', async () => {
    for (const body of ['name: x\n', 'name: x\nfolders:\n  data: archive\n']) {
      const project = await projectWith(body);
      expect(resolveWatchScope({ openFiles: [], project }).excluded).toHaveLength(1);
    }
  });
});

describe('폴더 제외가 열린 파일 감시를 무효화하지 않는다 — REQ-WS-046 / AC-WS-057b', () => {
  it('data/ 안이라도 열려 있으면 감시 목록에 든다', async () => {
    const project = await projectWith('name: x\n');
    const openInData = R('data', 'notes.md');
    const scope = resolveWatchScope({ openFiles: [openInData], project });

    expect(scope.files).toContain(openInData);
    expect(scope.folders).not.toContain(R('data'));
  });

  it('재정의된 data 역할 경로 안의 열린 파일도 마찬가지다', async () => {
    const project = await projectWith('name: x\nfolders:\n  data: archive\n');
    const openInArchive = R('archive', 'raw.csv');
    const scope = resolveWatchScope({ openFiles: [openInArchive], project });
    expect(scope.files).toContain(openInArchive);
  });
});

describe('감시가 pathGuard를 우회하지 않는다 — REQ-WS-019 / AC-WS-018', () => {
  it('신뢰되지 않은 경로는 등록이 거부된다', async () => {
    const registered: string[] = [];
    await expect(
      registerWatchScope(
        { files: ['/untrusted/x.md'], folders: [], excluded: [] },
        {
          assertAllowed: async (p) => {
            throw new PathNotAllowedError(p);
          },
          watch: async (p) => {
            registered.push(p);
          },
        },
      ),
    ).rejects.toBeInstanceOf(PathNotAllowedError);
    expect(registered).toEqual([]);
  });

  it('신뢰된 경로만 등록된다', async () => {
    const registered: string[] = [];
    await registerWatchScope(
      { files: ['/ok/a.md'], folders: ['/ok/manuscript'], excluded: ['/ok/data'] },
      {
        assertAllowed: async () => {},
        watch: async (p) => {
          registered.push(p);
        },
      },
    );
    expect(registered.sort()).toEqual(['/ok/a.md', '/ok/manuscript'].sort());
    expect(registered).not.toContain('/ok/data');
  });

  it('모든 등록 대상이 예외 없이 검증을 거친다', async () => {
    const asserted: string[] = [];
    await registerWatchScope(
      { files: ['/ok/a.md'], folders: ['/ok/manuscript', '/ok/figures'], excluded: [] },
      {
        assertAllowed: async (p) => {
          asserted.push(p);
        },
        watch: async () => {},
      },
    );
    expect(asserted.sort()).toEqual(['/ok/a.md', '/ok/manuscript', '/ok/figures'].sort());
  });
});

describe('수동 새로고침 — REQ-WS-047 / AC-WS-058', () => {
  it('data 역할 경로를 포함해 프로젝트 트리를 재열거한다', async () => {
    const project = await projectWith('name: x\n');
    await mkdir(R('data'));
    await mkdir(R('manuscript'));
    await writeFile(R('data', 'raw.csv'), 'a,b');
    await writeFile(R('manuscript', 'ch1.md'), '# ch1');

    const listed = await refreshProjectTree(project);
    expect(listed).toContain(R('data', 'raw.csv'));
    expect(listed).toContain(R('manuscript', 'ch1.md'));
  });

  it('감시에서 빠진 data 변경을 표면화하는 유일한 경로다', async () => {
    const project = await projectWith('name: x\n');
    await mkdir(R('data'));

    const before = await refreshProjectTree(project);
    expect(before).not.toContain(R('data', 'late.csv'));

    await writeFile(R('data', 'late.csv'), 'x');
    const after = await refreshProjectTree(project);
    expect(after).toContain(R('data', 'late.csv'));
  });

  it('재정의된 data 역할 경로도 재열거에 포함된다', async () => {
    const project = await projectWith('name: x\nfolders:\n  data: archive\n');
    await mkdir(R('archive'));
    await writeFile(R('archive', 'raw.csv'), 'x');
    expect(await refreshProjectTree(project)).toContain(R('archive', 'raw.csv'));
  });

  it('없는 규약 폴더는 오류가 아니다 (REQ-WS-011)', async () => {
    const project = await projectWith('name: x\n');
    await expect(refreshProjectTree(project)).resolves.toEqual([]);
  });

  it('프로젝트가 없으면 빈 목록이다', async () => {
    expect(await refreshProjectTree({ kind: 'none' })).toEqual([]);
  });

  it('재열거가 디렉터리를 만들지 않는다', async () => {
    const project = await projectWith('name: x\n');
    const { readdir } = await import('node:fs/promises');
    const before = (await readdir(dir)).sort();
    await refreshProjectTree(project);
    expect((await readdir(dir)).sort()).toEqual(before);
  });
});

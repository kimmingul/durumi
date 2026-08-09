import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { MenuCommand } from '@shared/ipc-contract';
import { EXCLUDED_WATCH_ROLE } from '@shared/projectFolders';
import { MANIFEST_FILENAME } from '@shared/workspaceManifest';

vi.mock('electron', () => ({}));

import { resolveWatchScope } from '../../electron/watchScope';
import { discoverProjectFor, projectFolderPaths, type ProjectDiscovery } from '../../electron/projectDiscovery';
import { installFakeApi, mountApp, type MountedApp } from '../_helpers/appHarness';
import { useWorkspaceStore } from '../../src/store/workspaceStore';
import { useReconciliationStore } from '../../src/store/reconciliationStore';

/**
 * SPEC-V03-WORKSPACE-002 M3 — **패널 수가 감시 범위를 흔들지 않는다**.
 *
 * 대상 AC: AC-PANEL-057 / 057b ↔ REQ-PANEL-057, REQ-WS-046, REQ-WS-057b.
 *
 * ## 왜 두 계층이 한 파일에 있는가
 *
 * 이 AC는 두 축을 동시에 주장한다 — main의 범위 해석에서 **data 역할 폴더가
 * 빠진다**는 것과, 렌더러에서 **그 폴더 안의 파일이라도 패널이 열면 감시된다**는
 * 것. 둘을 갈라 두면 어느 쪽도 혼자서는 "폴더는 빼되 그 안의 열린 파일은 뺀 게
 * 아니다"를 말하지 못한다. 경계가 곧 이 AC의 내용이므로 함께 판정한다.
 *
 * ## 배선하지 않은 것 (기록)
 *
 * `resolveWatchScope` / `registerWatchScope`는 **프로덕션 호출부가 0곳**이다
 * (`plan.md` §A.4). M3의 어느 대상 요구도 그 배선을 생산하지 않으므로
 * (`대상 요구:` REQ-PANEL-050·051·052·055·056·057) 여기서 배선하지 않는다 —
 * AC 문언이 "감시 범위를 해석한다"이므로 순수 함수로 판정하는 것이 문언에 맞고,
 * 배선을 끼워 넣는 것은 소유자 없는 범위 확장이다. 관측으로만 남긴다.
 */

let dir: string;
let app: MountedApp | null = null;
let menuSubscribers: Array<(cmd: MenuCommand) => void>;
let watched: Array<[string, string]>;
let unwatched: string[];

const workspace = () => useWorkspaceStore.getState();

const R = (...seg: string[]): string => join(resolve(dir), ...seg);

async function projectWith(manifestBody: string): Promise<ProjectDiscovery> {
  await writeFile(join(dir, MANIFEST_FILENAME), manifestBody, 'utf8');
  await writeFile(join(dir, 'a.md'), '# x');
  return discoverProjectFor(join(dir, 'a.md'));
}

const sendMenuCommand = (cmd: MenuCommand): void => {
  act(() => {
    for (const cb of menuSubscribers) cb(cmd);
  });
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'durumi-panel-scope-'));
  menuSubscribers = [];
  watched = [];
  unwatched = [];
  workspace().reset();
  useReconciliationStore.getState().reset();
});

afterEach(async () => {
  app?.unmount();
  app = null;
  workspace().reset();
  useReconciliationStore.getState().reset();
  await rm(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

describe('AC-PANEL-057 — data 역할 경로 제외가 패널 수와 무관하다', () => {
  it('패널이 셋이어도 제외는 정확히 하나이며 folders가 data 역할로 해석한 경로다', async () => {
    const project = await projectWith('name: x\n');
    const dataPath = projectFolderPaths(project as never)[EXCLUDED_WATCH_ROLE];

    const scope = resolveWatchScope({
      openFiles: [R('manuscript', 'a.md'), R('scripts', 'b.py'), R('data', 'c.csv')],
      project,
    });

    expect(scope.excluded).toHaveLength(1);
    expect(scope.excluded[0], 'data 역할로 해석된 경로가 아니다').toBe(dataPath);
    expect(scope.folders, '제외되어야 할 폴더가 감시 목록에 들었다').not.toContain(dataPath);
  });

  it('패널이 하나일 때와 제외 결과가 동일하다', async () => {
    const project = await projectWith('name: x\n');

    const three = resolveWatchScope({
      openFiles: [R('manuscript', 'a.md'), R('scripts', 'b.py'), R('data', 'c.csv')],
      project,
    });
    const one = resolveWatchScope({ openFiles: [R('manuscript', 'a.md')], project });

    expect(three.excluded, '패널 수가 제외 결과를 바꿨다').toEqual(one.excluded);
    expect(three.folders.sort(), '패널 수가 규약 폴더 감시를 바꿨다').toEqual(one.folders.sort());
  });

  it('재정의된 data 역할에서도 패널 수와 무관하다', async () => {
    // 리터럴 이름 `data`가 아니라 **역할**이 제외 기준이라는 것이 REQ-WS-046이고,
    // 패널 수는 그 기준에 아무 영향이 없다.
    const project = await projectWith('name: x\nfolders:\n  data: archive\n  manuscript: data\n');

    const many = resolveWatchScope({
      openFiles: [R('data', 'a.md'), R('archive', 'raw.csv'), R('scripts', 'b.py')],
      project,
    });
    const single = resolveWatchScope({ openFiles: [R('data', 'a.md')], project });

    expect(many.excluded).toEqual([R('archive')]);
    expect(many.excluded).toEqual(single.excluded);
    expect(many.folders, '이름이 data인 원고 폴더가 제외됐다').toContain(R('data'));
  });
});

describe('AC-PANEL-057b — data 역할 경로 안의 파일을 패널로 열면 감시된다', () => {
  it('data 역할 폴더 자체는 여전히 규약 폴더 감시에서 제외되어 있다', async () => {
    const project = await projectWith('name: x\n');
    const dataFile = R('data', 'raw.csv');

    const scope = resolveWatchScope({ openFiles: [dataFile], project });

    expect(scope.files, '열린 파일이 감시 목록에서 빠졌다').toContain(dataFile);
    expect(scope.folders, 'data 폴더 자체가 감시 목록에 들었다').not.toContain(R('data'));
    expect(scope.excluded).toEqual([R('data')]);
  });

  it('그 파일을 보조 패널로 열면 감시 등록된다', async () => {
    // 진입점을 통과해서 판정한다 — 스토어를 직접 부르면 "보조 패널로 연다"가
    // 실제로 도달 가능한지가 판정에서 빠진다(plan.md §C.0 네 번째 조항의 취지).
    await mkdir(join(dir, 'data'), { recursive: true });
    const dataFile = R('data', 'raw.csv');
    await writeFile(dataFile, 'x,y\n1,2\n', 'utf8');

    installFakeApi({
      onMenuCommand: (cb: (cmd: MenuCommand) => void) => {
        menuSubscribers.push(cb);
        return () => {
          menuSubscribers = menuSubscribers.filter((s) => s !== cb);
        };
      },
      watchOpenFile: async (p: string, c: string) => {
        watched.push([p, c]);
      },
      unwatchOpenFile: async (p: string) => {
        unwatched.push(p);
      },
      noteOpenFileContent: async () => {},
      fileOpen: async () => ({ path: dataFile, content: 'x,y\n1,2\n' }),
      confirmDiscard: async () => 'discard' as const,
    });

    act(() => {
      workspace().openInActivePanel(R('manuscript', 'a.md'), '# 원고\n');
    });
    app = mountApp();

    // 보조 패널을 만들고 그 패널에 data 역할 경로의 파일을 연다.
    sendMenuCommand('splitPanel');
    expect(workspace().panels).toHaveLength(2);
    sendMenuCommand('open');
    await act(async () => {});

    const manuscript = R('manuscript', 'a.md');
    const paths = watched.map(([p]) => p);
    expect(paths, 'data 역할 경로의 파일이 감시 등록되지 않았다').toContain(dataFile);

    // 그 파일이 실제로 **보조 패널**에 들어갔다.
    const panelPaths = workspace().panels.map(
      (p) => workspace().documents.get(p.documentId)?.path ?? null,
    );
    expect(panelPaths, '보조 패널이 아니라 원고 패널을 갈아치웠다').toEqual([manuscript, dataFile]);

    // 원고 패널의 감시는 **지금도** 살아 있다. 등록 이력이 아니라 해제 부재로
    // 판정한다 — 이력만 보면 "등록됐다가 방금 풀렸다"를 통과시킨다.
    expect(unwatched, '보조 패널의 등록이 원고 패널의 감시를 풀었다').not.toContain(manuscript);
  });
});

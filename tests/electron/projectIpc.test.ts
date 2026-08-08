import { describe, it, expect, beforeEach, vi } from 'vitest';

/** ipcMain 핸들러를 붙잡아 직접 호출한다. */
const handlers = new Map<string, (...a: unknown[]) => unknown>();
const sent: Array<{ channel: string; payload: unknown }> = [];

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn),
  },
  BrowserWindow: {
    getAllWindows: () => [
      { webContents: { send: (channel: string, payload: unknown) => sent.push({ channel, payload }) } },
    ],
  },
}));

import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { registerProjectHandlers, toProjectState, _resetProjectIpcForTests } from '../../electron/ipc/project';
import {
  PathNotAllowedError,
  allowSessionPath,
  _resetSessionForTests,
  _setPrefsReaderForTests,
  _resetPrefsReaderForTests,
} from '../../electron/pathGuard';
import { discoverProjectFor } from '../../electron/projectDiscovery';
import { MANIFEST_FILENAME } from '@shared/workspaceManifest';

let dir: string;
const call = (ch: string, ...args: unknown[]): Promise<unknown> => {
  const fn = handlers.get(ch);
  if (!fn) throw new Error(`no handler: ${ch}`);
  return Promise.resolve(fn({}, ...args));
};

beforeEach(async () => {
  handlers.clear();
  sent.length = 0;
  _resetProjectIpcForTests();
  _resetSessionForTests();
  _setPrefsReaderForTests(async () => ({ workspaceFolders: [], recentFiles: [] }));
  dir = await mkdtemp(join(tmpdir(), 'durumi-ipc-'));
  registerProjectHandlers();
});

describe('모든 채널이 pathGuard를 먼저 통과한다 — REQ-WS-019', () => {
  const CHANNELS: Array<[string, unknown[]]> = [
    ['project:discover', ['/untrusted/a.md']],
    ['project:refresh', ['/untrusted/a.md']],
    ['project:watchOpenFile', ['/untrusted/a.md', '']],
    ['project:unwatchOpenFile', ['/untrusted/a.md']],
    ['project:noteOpenFileContent', ['/untrusted/a.md', '']],
  ];

  it('다섯 채널이 모두 등록된다', () => {
    for (const [ch] of CHANNELS) expect(handlers.has(ch), ch).toBe(true);
  });

  for (const [ch, args] of CHANNELS) {
    it(`${ch}가 신뢰 밖 경로를 거부한다`, async () => {
      await expect(call(ch, ...args)).rejects.toBeInstanceOf(PathNotAllowedError);
    });
  }

  it('거부된 호출은 렌더러로 아무것도 보내지 않는다', async () => {
    await call('project:watchOpenFile', '/untrusted/a.md', '').catch(() => {});
    expect(sent).toEqual([]);
  });
});

describe('project:discover — 경계를 넘는 필드만 넘긴다', () => {
  it('신뢰된 파일의 프로젝트를 보고한다', async () => {
    await writeFile(join(dir, MANIFEST_FILENAME), 'name: study\n# 사용자 주석\nsecret_key: hidden\n', 'utf8');
    const doc = join(dir, 'a.md');
    await writeFile(doc, '# x', 'utf8');
    allowSessionPath(doc);

    const state = (await call('project:discover', doc)) as { kind: string; name?: string };
    expect(state.kind).toBe('project');
    expect(state.name).toBe('study');
  });

  it('매니페스트 원문·주석·미정의 키가 경계를 넘지 않는다', async () => {
    await writeFile(
      join(dir, MANIFEST_FILENAME),
      'name: study\n# 비밀 주석\nsecret_key: hidden-value\n',
      'utf8',
    );
    const doc = join(dir, 'a.md');
    await writeFile(doc, '# x', 'utf8');
    allowSessionPath(doc);

    const serialized = JSON.stringify(await call('project:discover', doc));
    expect(serialized).not.toContain('hidden-value');
    expect(serialized).not.toContain('비밀 주석');
    expect(serialized).not.toContain('secret_key');
  });

  it('손상된 매니페스트도 파일 내용을 흘리지 않는다', async () => {
    await writeFile(join(dir, MANIFEST_FILENAME), 'name: [unclosed\nsecret: leak-me\n', 'utf8');
    const doc = join(dir, 'a.md');
    await writeFile(doc, '# x', 'utf8');
    allowSessionPath(doc);

    const state = (await call('project:discover', doc)) as { kind: string };
    expect(state.kind).toBe('corrupt');
    expect(JSON.stringify(state)).not.toContain('leak-me');
  });
});

describe('감시 등록·해제 — 실제 경로', () => {
  it('신뢰된 파일을 등록하고 해제한다', async () => {
    const doc = join(dir, 'a.md');
    await writeFile(doc, '# x', 'utf8');
    allowSessionPath(doc);

    await expect(call('project:watchOpenFile', doc, '# x')).resolves.toBeUndefined();
    await expect(call('project:noteOpenFileContent', doc, '# y')).resolves.toBeUndefined();
    await expect(call('project:unwatchOpenFile', doc)).resolves.toBeUndefined();
  });

  it('같은 디렉터리의 두 파일을 등록해도 해제가 조기에 끊기지 않는다', async () => {
    const a = join(dir, 'a.md');
    const b = join(dir, 'b.md');
    await writeFile(a, '# a', 'utf8');
    await writeFile(b, '# b', 'utf8');
    allowSessionPath(a);
    allowSessionPath(b);

    await call('project:watchOpenFile', a, '# a');
    await call('project:watchOpenFile', b, '# b');
    await call('project:unwatchOpenFile', a);
    // b는 아직 감시 중이어야 한다 — 재등록이 오류 없이 통과하면 살아 있다.
    await expect(call('project:noteOpenFileContent', b, '# b2')).resolves.toBeUndefined();
    await call('project:unwatchOpenFile', b);
  });

  it('메시지 정리가 원문 발췌를 잘라낸다', async () => {
    const { sanitizeParseMessage } = await import('../../electron/ipc/project');
    const raw = 'bad indentation (2:8)\n\n 1 | name: x\n 2 | secret: leak\n-----^';
    expect(sanitizeParseMessage(raw)).toBe('bad indentation (2:8)');
    expect(sanitizeParseMessage(raw)).not.toContain('leak');
  });
});

describe('toProjectState — 좁히기 순수 함수', () => {
  it('프로젝트 없음을 그대로 넘긴다', () => {
    expect(toProjectState({ kind: 'none' })).toEqual({ kind: 'none' });
  });

  it('역할별 절대 경로를 담는다', async () => {
    await writeFile(join(dir, MANIFEST_FILENAME), 'name: x\nfolders:\n  figures: out/fig\n', 'utf8');
    await writeFile(join(dir, 'a.md'), '# x', 'utf8');
    const d = await discoverProjectFor(join(dir, 'a.md'));
    const state = toProjectState(d) as { folders: Record<string, string> };
    expect(state.folders.figures).toBe(join(resolve(dir), 'out', 'fig'));
  });
});

describe('project:refresh — REQ-WS-047', () => {
  it('data 역할 경로를 포함해 재열거한다', async () => {
    await writeFile(join(dir, MANIFEST_FILENAME), 'name: x\n', 'utf8');
    await mkdir(join(dir, 'data'));
    await writeFile(join(dir, 'data', 'raw.csv'), 'a,b', 'utf8');
    const doc = join(dir, 'a.md');
    await writeFile(doc, '# x', 'utf8');
    allowSessionPath(doc);

    const listed = (await call('project:refresh', doc)) as string[];
    expect(listed).toContain(join(resolve(dir), 'data', 'raw.csv'));
  });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  _resetSessionForTests();
  _resetPrefsReaderForTests();
});

import { afterEach } from 'vitest';

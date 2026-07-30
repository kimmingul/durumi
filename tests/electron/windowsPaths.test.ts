import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';

const spawnMock = vi.hoisted(() => vi.fn());
const fsAccessMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  default: { spawn: spawnMock },
  spawn: spawnMock,
}));

// pdf.ts 소스 가드에서 readFileSync 가 필요하므로 부분 목킹한다 —
// promises.access 만 가로채고 나머지는 실제 구현을 유지.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: { ...actual, promises: { access: fsAccessMock } },
    promises: { access: fsAccessMock },
  };
});

import { detectPandoc, clearPandocCache } from '../../electron/pandoc';

/**
 * Windows는 release.yml 이 NSIS 인스톨러를 빌드·게시하지만 어떤 CI 잡도
 * Windows에서 테스트를 돌리지 않았고, process.platform === 'win32' 를
 * 모킹하는 유닛 테스트도 하나도 없었다. 그 결과 pandoc 탐지의 Windows
 * 경로·확장자 처리와 pdf 의 드라이브 문자 처리가 검증 없이 존재했다.
 *
 * 이 파일은 플랫폼 무관하게 검증 가능한 부분(경로 후보, .exe 배너 파싱,
 * 백슬래시 경로 판정)을 덮는다. 실제 Windows 런타임 동작은 이 커밋에서
 * 함께 추가한 ci.yml 의 windows-latest 잡이 확인한다.
 */

const REPO_ROOT = join(__dirname, '..', '..');

class FakeChild extends EventEmitter {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  constructor(opts: { stdoutChunks?: string[]; exitCode?: number }) {
    super();
    this.stdin = { end: vi.fn() } as unknown as Writable;
    this.stdout = makeReadable(opts.stdoutChunks ?? []);
    this.stderr = makeReadable([]);
    setTimeout(() => this.emit('close', opts.exitCode ?? 0), 0);
  }
  kill() {}
}

function makeReadable(chunks: string[]): Readable {
  const r = new EventEmitter() as unknown as Readable;
  (r as unknown as { setEncoding: () => void }).setEncoding = () => {};
  setTimeout(() => {
    for (const c of chunks) r.emit('data', c);
  }, 0);
  return r;
}

beforeEach(() => {
  spawnMock.mockReset();
  fsAccessMock.mockReset();
  clearPandocCache();
});

describe('pandoc 탐지 — Windows 경로 후보', () => {
  it('PATH 탐지가 실패하면 Program Files 경로를 후보로 시도한다', async () => {
    spawnMock.mockImplementation(() => new FakeChild({ exitCode: 1 }));
    fsAccessMock.mockRejectedValue(new Error('ENOENT'));
    await detectPandoc(null);

    const probed = fsAccessMock.mock.calls.map((c) => String(c[0]));
    expect(probed).toContain('C:/Program Files/Pandoc/pandoc.exe');
    expect(probed).toContain('C:/Program Files (x86)/Pandoc/pandoc.exe');
  });

  it('Program Files 경로에서 pandoc을 찾으면 그것을 쓴다', async () => {
    const WIN = 'C:/Program Files/Pandoc/pandoc.exe';
    fsAccessMock.mockImplementation(async (p: string) => {
      if (p !== WIN) throw new Error('ENOENT');
    });
    spawnMock.mockImplementation((bin: string) =>
      bin === WIN
        ? new FakeChild({ stdoutChunks: ['pandoc.exe 3.1.2\n'], exitCode: 0 })
        : new FakeChild({ exitCode: 1 }),
    );
    const r = await detectPandoc(null);
    expect(r).toEqual({ binary: WIN, version: '3.1.2' });
  });
});

describe('pandoc 탐지 — .exe 버전 배너', () => {
  it('"pandoc.exe 3.1.2" 배너에서 버전을 뽑는다', async () => {
    fsAccessMock.mockResolvedValue(undefined);
    spawnMock.mockImplementation(() =>
      new FakeChild({ stdoutChunks: ['pandoc.exe 3.1.2\nFeatures: …\n'], exitCode: 0 }),
    );
    const r = await detectPandoc(null);
    expect(r?.version).toBe('3.1.2');
  });

  it('확장자 없는 "pandoc 3.5" 배너도 계속 인식한다 (회귀 방지)', async () => {
    fsAccessMock.mockResolvedValue(undefined);
    spawnMock.mockImplementation(() =>
      new FakeChild({ stdoutChunks: ['pandoc 3.5\n'], exitCode: 0 }),
    );
    const r = await detectPandoc(null);
    expect(r?.version).toBe('3.5');
  });
});

describe('pandoc 탐지 — 백슬래시 경로', () => {
  it('백슬래시 override를 경로로 보고 존재 여부를 먼저 확인한다', async () => {
    const WIN = 'C:\\tools\\pandoc.exe';
    fsAccessMock.mockResolvedValue(undefined);
    spawnMock.mockImplementation(() =>
      new FakeChild({ stdoutChunks: ['pandoc.exe 3.2\n'], exitCode: 0 }),
    );
    const r = await detectPandoc(WIN);
    expect(fsAccessMock.mock.calls.map((c) => String(c[0]))).toContain(WIN);
    expect(r?.binary).toBe(WIN);
  });

  it('존재하지 않는 백슬래시 경로는 spawn하지 않고 건너뛴다', async () => {
    const WIN = 'C:\\missing\\pandoc.exe';
    fsAccessMock.mockImplementation(async (p: string) => {
      if (p === WIN) throw new Error('ENOENT');
    });
    spawnMock.mockImplementation(() => new FakeChild({ exitCode: 1 }));
    await detectPandoc(WIN);
    expect(spawnMock.mock.calls.map((c) => String(c[0]))).not.toContain(WIN);
  });
});

describe('pdf 내보내기 — 드라이브 문자 안전성', () => {
  // pathToFileURL 의 드라이브 문자 처리는 Node 자체가 플랫폼에 따라 다르게
  // 동작해 macOS/Linux 에서 의미 있게 재현할 수 없다. 대신 문자열 결합으로의
  // 회귀(= 'file://' + path, Windows 에서 깨지는 형태)를 소스 수준에서 막는다.
  const RAW = readFileSync(join(REPO_ROOT, 'electron/pdf.ts'), 'utf8');
  // 주석은 제외한다 — pdf.ts 는 "plain string concat ('file://' + path) produces
  // invalid URLs there" 라고 그 안티패턴을 설명하는 주석을 갖고 있어서,
  // 원문 그대로 검사하면 올바른 코드가 자기 설명 때문에 실패한다.
  const CODE = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('pathToFileURL 을 사용한다', () => {
    expect(CODE).toMatch(/pathToFileURL\s*\(/);
  });

  it("'file://' 문자열 결합으로 URL을 만들지 않는다", () => {
    expect(CODE).not.toMatch(/['"`]file:\/\/['"`]\s*\+/);
  });
});

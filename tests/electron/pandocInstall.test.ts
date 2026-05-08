import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Readable, Writable } from 'node:stream';

const spawnMock = vi.hoisted(() => vi.fn());
const fsAccessMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  default: { spawn: spawnMock },
  spawn: spawnMock,
}));

vi.mock('node:fs', () => ({
  default: { promises: { access: fsAccessMock } },
  promises: { access: fsAccessMock },
}));

import {
  detectHomebrew,
  installPandocViaHomebrew,
} from '../../electron/pandoc';

class FakeChild extends EventEmitter {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  killed = false;
  constructor(opts: {
    stdoutChunks?: string[];
    stderrChunks?: string[];
    exitCode?: number;
    emitErrorBeforeExit?: Error;
  }) {
    super();
    const chunks = opts.stdoutChunks ?? [];
    const errChunks = opts.stderrChunks ?? [];
    this.stdin = makeWritable();
    this.stdout = makeReadable(chunks);
    this.stderr = makeReadable(errChunks);
    if (opts.emitErrorBeforeExit) {
      setTimeout(() => this.emit('error', opts.emitErrorBeforeExit!), 0);
    } else {
      setTimeout(() => this.emit('close', opts.exitCode ?? 0), 0);
    }
  }
  kill() {
    this.killed = true;
  }
}

function makeReadable(chunks: string[]): Readable {
  const r = new EventEmitter() as unknown as Readable;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (r as any).setEncoding = () => {};
  setTimeout(() => {
    for (const c of chunks) r.emit('data', c);
  }, 0);
  return r;
}

function makeWritable(): Writable {
  return {
    end: vi.fn(),
  } as unknown as Writable;
}

beforeEach(() => {
  spawnMock.mockReset();
  fsAccessMock.mockReset();
});

describe('detectHomebrew', () => {
  it('returns the brew path when `which brew` succeeds', async () => {
    spawnMock.mockImplementation((bin: string, args: string[]) => {
      expect(bin).toBe('which');
      expect(args).toEqual(['brew']);
      return new FakeChild({
        stdoutChunks: ['/opt/homebrew/bin/brew\n'],
        exitCode: 0,
      });
    });
    const r = await detectHomebrew();
    expect(r).toBe('/opt/homebrew/bin/brew');
  });

  it('returns null when `which brew` exits non-zero', async () => {
    spawnMock.mockImplementation(() => new FakeChild({ exitCode: 1 }));
    const r = await detectHomebrew();
    expect(r).toBeNull();
  });

  it('returns null when `which brew` prints an empty path', async () => {
    spawnMock.mockImplementation(() =>
      new FakeChild({ stdoutChunks: ['\n'], exitCode: 0 }),
    );
    const r = await detectHomebrew();
    expect(r).toBeNull();
  });
});

describe('installPandocViaHomebrew', () => {
  it('returns ok=true on a successful brew install and streams chunks', async () => {
    let callCount = 0;
    spawnMock.mockImplementation((bin: string, args: string[]) => {
      callCount++;
      if (callCount === 1) {
        // detectHomebrew probe
        expect(bin).toBe('which');
        expect(args).toEqual(['brew']);
        return new FakeChild({
          stdoutChunks: ['/opt/homebrew/bin/brew\n'],
          exitCode: 0,
        });
      }
      // brew install pandoc
      expect(bin).toBe('/opt/homebrew/bin/brew');
      expect(args).toEqual(['install', 'pandoc']);
      return new FakeChild({
        stdoutChunks: ['==> Downloading pandoc\n', '==> Pouring pandoc.bottle\n'],
        stderrChunks: ['Warning: stuff\n'],
        exitCode: 0,
      });
    });
    const chunks: string[] = [];
    const r = await installPandocViaHomebrew((c) => chunks.push(c));
    expect(r.ok).toBe(true);
    expect(chunks.join('')).toContain('Downloading pandoc');
    expect(chunks.join('')).toContain('Warning: stuff');
  });

  it('returns code=brew-missing when which brew fails', async () => {
    spawnMock.mockImplementation(() => new FakeChild({ exitCode: 1 }));
    const r = await installPandocViaHomebrew(() => {});
    expect(r.ok).toBe(false);
    expect(r.code).toBe('brew-missing');
    expect(r.error).toMatch(/Homebrew/i);
  });

  it('returns code=install-failed when brew install exits non-zero', async () => {
    let callCount = 0;
    spawnMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return new FakeChild({
          stdoutChunks: ['/opt/homebrew/bin/brew\n'],
          exitCode: 0,
        });
      }
      return new FakeChild({ stderrChunks: ['Error: dependency missing\n'], exitCode: 1 });
    });
    const r = await installPandocViaHomebrew(() => {});
    expect(r.ok).toBe(false);
    expect(r.code).toBe('install-failed');
    expect(r.stderr).toContain('dependency missing');
  });

  it('swallows exceptions thrown by the chunk listener', async () => {
    let callCount = 0;
    spawnMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return new FakeChild({
          stdoutChunks: ['/opt/homebrew/bin/brew\n'],
          exitCode: 0,
        });
      }
      return new FakeChild({
        stdoutChunks: ['line one\n'],
        exitCode: 0,
      });
    });
    const r = await installPandocViaHomebrew(() => {
      throw new Error('listener boom');
    });
    expect(r.ok).toBe(true);
  });
});

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
  detectPandoc,
  runPandoc,
  importViaPandoc,
  clearPandocCache,
} from '../../electron/pandoc';

class FakeChild extends EventEmitter {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  killed = false;
  constructor(opts: { stdoutChunks?: string[]; stderrChunks?: string[]; exitCode?: number; emitErrorBeforeExit?: Error }) {
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
  clearPandocCache();
});

describe('detectPandoc', () => {
  it('returns null when no candidate succeeds', async () => {
    spawnMock.mockImplementation(() => new FakeChild({ exitCode: 1 }));
    fsAccessMock.mockRejectedValue(new Error('ENOENT'));
    const r = await detectPandoc(null);
    expect(r).toBeNull();
  });

  it('returns binary + version when probe succeeds', async () => {
    spawnMock.mockImplementation(() =>
      new FakeChild({ stdoutChunks: ['pandoc 3.5\nFeatures: …\n'], exitCode: 0 }),
    );
    fsAccessMock.mockResolvedValue(undefined);
    const r = await detectPandoc(null);
    expect(r).toEqual({ binary: 'pandoc', version: '3.5' });
  });

  it('honours an override path before PATH lookup', async () => {
    fsAccessMock.mockResolvedValue(undefined);
    spawnMock.mockImplementation((bin: string) => {
      if (bin === '/custom/pandoc') {
        return new FakeChild({ stdoutChunks: ['pandoc 4.0.1\n'], exitCode: 0 });
      }
      return new FakeChild({ exitCode: 1 });
    });
    const r = await detectPandoc('/custom/pandoc');
    expect(r?.binary).toBe('/custom/pandoc');
    expect(r?.version).toBe('4.0.1');
  });

  it('caches results per override key', async () => {
    fsAccessMock.mockResolvedValue(undefined);
    spawnMock.mockImplementation(() =>
      new FakeChild({ stdoutChunks: ['pandoc 3.0\n'], exitCode: 0 }),
    );
    await detectPandoc(null);
    await detectPandoc(null);
    // PATH lookup runs once for the first call only.
    const callsForPath = spawnMock.mock.calls.filter((c) => c[0] === 'pandoc');
    expect(callsForPath.length).toBe(1);
  });
});

describe('runPandoc', () => {
  it('returns ok=false with a friendly error when pandoc is missing', async () => {
    fsAccessMock.mockRejectedValue(new Error('ENOENT'));
    spawnMock.mockImplementation(() => new FakeChild({ exitCode: 1 }));
    const r = await runPandoc({ input: 'x', outputPath: '/tmp/x.docx' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Pandoc not found/);
  });

  it('returns ok=true after a successful run', async () => {
    fsAccessMock.mockResolvedValue(undefined);
    let callCount = 0;
    spawnMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // detect probe
        return new FakeChild({ stdoutChunks: ['pandoc 3.0\n'], exitCode: 0 });
      }
      return new FakeChild({ exitCode: 0 });
    });
    const r = await runPandoc({ input: '# x\n', outputPath: '/tmp/out.docx' });
    expect(r.ok).toBe(true);
  });

  it('captures stderr on failure', async () => {
    fsAccessMock.mockResolvedValue(undefined);
    let callCount = 0;
    spawnMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return new FakeChild({ stdoutChunks: ['pandoc 3.0\n'], exitCode: 0 });
      }
      return new FakeChild({ exitCode: 99, stderrChunks: ['parse error: …'] });
    });
    const r = await runPandoc({ input: 'bad', outputPath: '/tmp/out.docx' });
    expect(r.ok).toBe(false);
    expect(r.stderr).toContain('parse error');
    expect(r.error).toMatch(/exited with code 99/);
  });
});

describe('importViaPandoc', () => {
  it('returns the converted markdown on stdout', async () => {
    fsAccessMock.mockResolvedValue(undefined);
    let callCount = 0;
    spawnMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return new FakeChild({ stdoutChunks: ['pandoc 3.0\n'], exitCode: 0 });
      return new FakeChild({
        stdoutChunks: ['# Title\n\nBody from docx\n'],
        exitCode: 0,
      });
    });
    const r = await importViaPandoc({ inputPath: '/x.docx', fromFormat: 'docx' });
    expect(r.ok).toBe(true);
    expect(r.markdown).toContain('Body from docx');
  });

  it('reports an error when pandoc cannot read the source', async () => {
    fsAccessMock.mockResolvedValue(undefined);
    let callCount = 0;
    spawnMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return new FakeChild({ stdoutChunks: ['pandoc 3.0\n'], exitCode: 0 });
      return new FakeChild({ stderrChunks: ['could not read'], exitCode: 1 });
    });
    const r = await importViaPandoc({ inputPath: '/missing.docx', fromFormat: 'docx' });
    expect(r.ok).toBe(false);
    expect(r.stderr).toContain('could not read');
  });

  it('returns an install hint when pandoc itself is missing', async () => {
    fsAccessMock.mockRejectedValue(new Error('ENOENT'));
    spawnMock.mockImplementation(() => new FakeChild({ exitCode: 1 }));
    const r = await importViaPandoc({ inputPath: '/x.docx', fromFormat: 'docx' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Pandoc not found/);
  });
});

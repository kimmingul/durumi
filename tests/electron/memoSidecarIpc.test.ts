import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// `electron/ipc.ts` imports `electron`; stub the surface our helpers don't
// reach so the file loads in jsdom. The handlers themselves never register
// in this test (we call the helper functions directly).
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
  dialog: {},
  ipcMain: { handle: vi.fn() },
  nativeTheme: { on: vi.fn(), shouldUseDarkColors: false },
  shell: { openExternal: vi.fn() },
}));

import {
  memoSidecarPathFor,
  readMemoSidecar,
  writeMemoSidecar,
} from '../../electron/ipc';
import { addReply, emptySidecar, ensureMeta } from '../../shared/memoSidecar';

const NOW = new Date('2026-05-09T12:00:00.000Z');

let workDir = '';
let docPath = '';

beforeEach(async () => {
  workDir = await fs.mkdtemp(join(tmpdir(), 'durumi-sidecar-'));
  docPath = join(workDir, 'paper.md');
  await fs.writeFile(docPath, '# paper\n', 'utf8');
});

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true });
});

describe('memoSidecarPathFor', () => {
  it('appends `.comments.json` to the doc path', () => {
    expect(memoSidecarPathFor('/abs/paper.md')).toBe('/abs/paper.md.comments.json');
  });
});

describe('readMemoSidecar', () => {
  it('returns null when the sidecar file is missing', async () => {
    const result = await readMemoSidecar(docPath);
    expect(result).toBeNull();
  });

  it('returns the parsed sidecar after a write', async () => {
    let s = ensureMeta(emptySidecar(), 'abc', 'Min', NOW);
    s = addReply(
      s,
      'abc',
      { id: 'r1', author: 'AI', text: 'hi', createdAt: NOW.toISOString() },
      NOW,
    );
    await writeMemoSidecar(docPath, s);
    const back = await readMemoSidecar(docPath);
    expect(back).toEqual(s);
  });

  it('returns null on malformed JSON', async () => {
    await fs.writeFile(memoSidecarPathFor(docPath), '}{ not json', 'utf8');
    const result = await readMemoSidecar(docPath);
    expect(result).toBeNull();
  });
});

describe('writeMemoSidecar', () => {
  it('writes pretty JSON with 2-space indent', async () => {
    const s = ensureMeta(emptySidecar(), 'abc', 'Min', NOW);
    await writeMemoSidecar(docPath, s);
    const raw = await fs.readFile(memoSidecarPathFor(docPath), 'utf8');
    expect(raw).toContain('  "version": 1');
  });

  it('overwrites an existing sidecar atomically', async () => {
    const s1 = ensureMeta(emptySidecar(), 'abc', 'Min', NOW);
    await writeMemoSidecar(docPath, s1);
    const s2 = ensureMeta(s1, 'def', 'Min', NOW);
    await writeMemoSidecar(docPath, s2);
    const back = await readMemoSidecar(docPath);
    expect(back?.memos.def).toBeDefined();
    expect(back?.memos.abc).toBeDefined();
  });

  it('does not leave a `.tmp` file behind on success', async () => {
    const s = ensureMeta(emptySidecar(), 'abc', 'Min', NOW);
    await writeMemoSidecar(docPath, s);
    const entries = await fs.readdir(workDir);
    expect(entries.filter((e) => e.includes('.tmp-'))).toHaveLength(0);
  });
});

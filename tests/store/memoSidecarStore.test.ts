import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useMemoSidecarStore } from '../../src/store/memoSidecarStore';
import { emptySidecar, ensureMeta } from '../../shared/memoSidecar';

const NOW = new Date('2026-05-09T12:00:00.000Z');

interface ApiMock {
  memoSidecarRead: ReturnType<typeof vi.fn>;
  memoSidecarWrite: ReturnType<typeof vi.fn>;
}

function installApiMock(): ApiMock {
  const api: ApiMock = {
    memoSidecarRead: vi.fn().mockResolvedValue(null),
    memoSidecarWrite: vi.fn().mockResolvedValue(undefined),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = api;
  return api;
}

beforeEach(() => {
  // Reset the store to its pristine shape between tests.
  useMemoSidecarStore.setState({
    docPath: null,
    sidecar: emptySidecar(),
    loading: false,
    dirty: false,
    authorName: 'TestUser',
  });
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).api;
});

describe('memoSidecarStore', () => {
  it('loadFor(null) clears state and stays in memory-only mode', async () => {
    installApiMock();
    await useMemoSidecarStore.getState().loadFor(null);
    expect(useMemoSidecarStore.getState().docPath).toBeNull();
    expect(useMemoSidecarStore.getState().loading).toBe(false);
  });

  it('loadFor(path) calls memoSidecarRead and applies the result', async () => {
    const api = installApiMock();
    const loaded = ensureMeta(emptySidecar(), 'abc', 'Foo', NOW);
    api.memoSidecarRead.mockResolvedValueOnce(loaded);
    await useMemoSidecarStore.getState().loadFor('/tmp/paper.md');
    expect(api.memoSidecarRead).toHaveBeenCalledWith('/tmp/paper.md');
    expect(useMemoSidecarStore.getState().sidecar).toEqual(loaded);
    expect(useMemoSidecarStore.getState().docPath).toBe('/tmp/paper.md');
  });

  it('falls back to an empty sidecar when memoSidecarRead returns null', async () => {
    const api = installApiMock();
    api.memoSidecarRead.mockResolvedValueOnce(null);
    await useMemoSidecarStore.getState().loadFor('/tmp/paper.md');
    expect(useMemoSidecarStore.getState().sidecar).toEqual(emptySidecar());
  });

  it('addReply marks dirty and creates a thread entry', () => {
    installApiMock();
    useMemoSidecarStore.setState({ docPath: '/tmp/p.md', authorName: 'TestUser' });
    useMemoSidecarStore.getState().addReply('abc', 'looks good');
    const state = useMemoSidecarStore.getState();
    expect(state.dirty).toBe(true);
    expect(state.sidecar.memos.abc?.thread).toHaveLength(1);
    expect(state.sidecar.memos.abc?.thread[0]?.text).toBe('looks good');
    expect(state.sidecar.memos.abc?.thread[0]?.author).toBe('TestUser');
  });

  it('addReply ignores empty text', () => {
    installApiMock();
    useMemoSidecarStore.setState({ docPath: '/tmp/p.md' });
    useMemoSidecarStore.getState().addReply('abc', '   ');
    expect(useMemoSidecarStore.getState().sidecar.memos.abc).toBeUndefined();
    expect(useMemoSidecarStore.getState().dirty).toBe(false);
  });

  it('markResolved toggles state', () => {
    installApiMock();
    useMemoSidecarStore.setState({ docPath: '/tmp/p.md' });
    useMemoSidecarStore.getState().markResolved('abc', true);
    expect(useMemoSidecarStore.getState().sidecar.memos.abc?.resolved).toBe(true);
    useMemoSidecarStore.getState().markResolved('abc', false);
    expect(useMemoSidecarStore.getState().sidecar.memos.abc?.resolved).toBe(false);
  });

  it('migrateId preserves thread + resolved across an id change', () => {
    installApiMock();
    useMemoSidecarStore.setState({ docPath: '/tmp/p.md' });
    useMemoSidecarStore.getState().addReply('old', 'a reply');
    useMemoSidecarStore.getState().markResolved('old', true);
    useMemoSidecarStore.getState().migrateId('old', 'new');
    const after = useMemoSidecarStore.getState().sidecar;
    expect(after.memos.old).toBeUndefined();
    expect(after.memos.new?.resolved).toBe(true);
    expect(after.memos.new?.thread).toHaveLength(1);
  });

  it('saveIfDirty writes the sidecar via the IPC api', async () => {
    const api = installApiMock();
    useMemoSidecarStore.setState({
      docPath: '/tmp/p.md',
      sidecar: ensureMeta(emptySidecar(), 'abc', 'Foo', NOW),
      dirty: true,
    });
    await useMemoSidecarStore.getState().saveIfDirty();
    expect(api.memoSidecarWrite).toHaveBeenCalledTimes(1);
    expect(useMemoSidecarStore.getState().dirty).toBe(false);
  });

  it('saveIfDirty is a no-op when not dirty', async () => {
    const api = installApiMock();
    useMemoSidecarStore.setState({ docPath: '/tmp/p.md', dirty: false });
    await useMemoSidecarStore.getState().saveIfDirty();
    expect(api.memoSidecarWrite).not.toHaveBeenCalled();
  });

  it('saveIfDirty is a no-op when no docPath is set (untitled)', async () => {
    const api = installApiMock();
    useMemoSidecarStore.setState({ docPath: null, dirty: true });
    await useMemoSidecarStore.getState().saveIfDirty();
    expect(api.memoSidecarWrite).not.toHaveBeenCalled();
  });

  it('saveIfDirty re-marks dirty when the write fails', async () => {
    const api = installApiMock();
    api.memoSidecarWrite.mockRejectedValueOnce(new Error('disk full'));
    useMemoSidecarStore.setState({ docPath: '/tmp/p.md', dirty: true });
    await useMemoSidecarStore.getState().saveIfDirty();
    expect(useMemoSidecarStore.getState().dirty).toBe(true);
  });

  it('setAuthor coerces empty input to "Anonymous"', () => {
    installApiMock();
    useMemoSidecarStore.getState().setAuthor('');
    expect(useMemoSidecarStore.getState().authorName).toBe('Anonymous');
    useMemoSidecarStore.getState().setAuthor('Min');
    expect(useMemoSidecarStore.getState().authorName).toBe('Min');
  });
});

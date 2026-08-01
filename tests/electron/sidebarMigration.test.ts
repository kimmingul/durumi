import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';

const fileStore = new Map<string, string>();

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/durumi-test-sbmig' },
}));

const readFile = vi.fn(async (p: string) => {
  if (!fileStore.has(p)) {
    const e = new Error('ENOENT') as NodeJS.ErrnoException;
    e.code = 'ENOENT';
    throw e;
  }
  return fileStore.get(p)!;
});
const writeFile = vi.fn(async (p: string, c: string) => {
  fileStore.set(p, c);
});

vi.mock('node:fs/promises', () => ({ default: { readFile, writeFile }, readFile, writeFile }));
vi.mock('node:fs', () => {
  const promises = { readFile, writeFile };
  return { default: { promises }, promises };
});

const PREFS_PATH = join('/tmp/durumi-test-sbmig', 'preferences.json');

beforeEach(() => {
  fileStore.clear();
  vi.resetModules();
});

/**
 * 메모/변경 탭이 좌측 사이드바에서 우측으로 이동(v0.2.31)하면서 필요한
 * prefs 마이그레이션. 기존 사용자가 사라진 탭에 머문 채 업데이트하면
 * 좌측이 빈 탭을 가리키게 되므로, v0.1.8.4 의 references/ai 이동과 동일한
 * 방식으로 우측에 넘겨준다.
 */

async function loadWith(prefs: Record<string, unknown>) {
  fileStore.set(PREFS_PATH, JSON.stringify(prefs));
  const { getPreferences } = await import('../../electron/preferences');
  return getPreferences();
}

describe('사이드바 탭 이동 마이그레이션', () => {
  it('좌측 comments 에 머물던 사용자를 우측 memo 탭으로 넘긴다', async () => {
    const p = await loadWith({ theme: 'system', sidebar: { activeTab: 'comments' } });
    expect(p.sidebar.activeTab).toBe('files');
    expect(p.rightSidebar.activeTab).toBe('memo');
    expect(p.rightSidebar.visible).toBe(true);
  });

  it('좌측 changes 에 머물던 사용자를 우측 changes 탭으로 넘긴다', async () => {
    const p = await loadWith({ theme: 'system', sidebar: { activeTab: 'changes' } });
    expect(p.sidebar.activeTab).toBe('files');
    expect(p.rightSidebar.activeTab).toBe('changes');
    expect(p.rightSidebar.visible).toBe(true);
  });

  it('여전히 존재하는 좌측 탭은 건드리지 않는다', async () => {
    for (const tab of ['files', 'outline', 'search']) {
      fileStore.clear();
      vi.resetModules();
      const p = await loadWith({ theme: 'system', sidebar: { activeTab: tab } });
      expect(p.sidebar.activeTab).toBe(tab);
    }
  });

  it('v0.1.8.4 의 references/ai 이동도 계속 동작한다 (회귀 방지)', async () => {
    const p = await loadWith({ theme: 'system', sidebar: { activeTab: 'references' } });
    expect(p.sidebar.activeTab).toBe('files');
    expect(p.rightSidebar.activeTab).toBe('references');
  });

  it('우측 사이드바 폭 등 기존 설정을 보존한다', async () => {
    const p = await loadWith({
      theme: 'system',
      sidebar: { activeTab: 'comments', width: 300 },
      rightSidebar: { width: 420 },
    });
    expect(p.sidebar.width).toBe(300);
    expect(p.rightSidebar.width).toBe(420);
    expect(p.rightSidebar.activeTab).toBe('memo');
  });
});

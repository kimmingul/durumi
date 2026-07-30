import { describe, it, expect, vi, beforeEach } from 'vitest';

const fileStore = new Map<string, string>();

vi.mock('electron', () => ({
  app: {
    getPath: (k: string) => (k === 'home' ? '/Users/testuser' : '/tmp/durumi-test-log'),
  },
}));

const appendFile = vi.fn(async (p: string, c: string) => {
  fileStore.set(p, (fileStore.get(p) ?? '') + c);
});
const stat = vi.fn(async (p: string) => {
  if (!fileStore.has(p)) {
    const e = new Error('ENOENT') as NodeJS.ErrnoException;
    e.code = 'ENOENT';
    throw e;
  }
  return { size: Buffer.byteLength(fileStore.get(p)!, 'utf8') };
});
const rename = vi.fn(async (from: string, to: string) => {
  fileStore.set(to, fileStore.get(from) ?? '');
  fileStore.delete(from);
});

vi.mock('node:fs/promises', () => ({
  default: { appendFile, stat, rename },
  appendFile,
  stat,
  rename,
}));

vi.mock('node:fs', () => {
  const promises = { appendFile, stat, rename };
  return { default: { promises }, promises };
});

const LOG_PATH = '/tmp/durumi-test-log/durumi.log';
const ROTATED_PATH = '/tmp/durumi-test-log/durumi.log.1';

beforeEach(() => {
  fileStore.clear();
  appendFile.mockClear();
  stat.mockClear();
  rename.mockClear();
  vi.resetModules();
});

/**
 * 로깅 서브시스템 부재 결함의 회귀 테스트. 이전에는 ad-hoc console.* 호출만
 * 있었고 레벨·파일 sink·리댁션이 없어, dict.ts 의 "see logs" 안내가 가리킬
 * 실제 로그가 존재하지 않았다. assetProtocol.ts 의 파일 append 선례를
 * 일반화한 것이다.
 */

describe('log — 파일 sink', () => {
  it('레벨과 타임스탬프를 포함한 한 줄을 append한다', async () => {
    const { logWarn } = await import('../../electron/log');
    await logWarn('macros', 'parse failed');
    const content = fileStore.get(LOG_PATH) ?? '';
    expect(content).toContain('WARN');
    expect(content).toContain('[macros]');
    expect(content).toContain('parse failed');
    // ISO 8601 타임스탬프
    expect(content).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(content.endsWith('\n')).toBe(true);
  });

  it('여러 호출을 누적한다 (덮어쓰지 않는다)', async () => {
    const { logInfo, logError } = await import('../../electron/log');
    await logInfo('a', 'first');
    await logError('b', 'second');
    const lines = (fileStore.get(LOG_PATH) ?? '').trim().split('\n');
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('first');
    expect(lines[1]).toContain('second');
  });

  it('레벨별로 다른 라벨을 쓴다', async () => {
    const { logInfo, logWarn, logError } = await import('../../electron/log');
    await logInfo('s', 'i');
    await logWarn('s', 'w');
    await logError('s', 'e');
    const content = fileStore.get(LOG_PATH) ?? '';
    expect(content).toContain('INFO');
    expect(content).toContain('WARN');
    expect(content).toContain('ERROR');
  });

  it('Error 객체의 메시지를 함께 남긴다', async () => {
    const { logWarn } = await import('../../electron/log');
    await logWarn('macros', 'watch failed', new Error('EACCES on watch'));
    expect(fileStore.get(LOG_PATH)).toContain('EACCES on watch');
  });
});

describe('log — 홈 경로 리댁션', () => {
  it('메시지의 홈 디렉터리를 ~ 로 치환한다', async () => {
    const { logWarn } = await import('../../electron/log');
    await logWarn('fs', 'failed to read /Users/testuser/Documents/secret.md');
    const content = fileStore.get(LOG_PATH) ?? '';
    expect(content).not.toContain('/Users/testuser');
    expect(content).toContain('~/Documents/secret.md');
  });

  it('Error 메시지의 홈 경로도 치환한다', async () => {
    const { logError } = await import('../../electron/log');
    await logError('fs', 'boom', new Error('ENOENT /Users/testuser/x'));
    expect(fileStore.get(LOG_PATH)).not.toContain('/Users/testuser');
  });
});

describe('log — 회전', () => {
  it('상한을 넘으면 .1 로 회전하고 새 파일에 쓴다', async () => {
    const mod = await import('../../electron/log');
    // 상한을 넘기는 기존 내용을 심는다
    fileStore.set(LOG_PATH, 'x'.repeat(mod.MAX_LOG_BYTES + 1));
    await mod.logWarn('s', 'after rotation');
    expect(rename).toHaveBeenCalledWith(LOG_PATH, ROTATED_PATH);
    const current = fileStore.get(LOG_PATH) ?? '';
    expect(current).toContain('after rotation');
    // 회전된 파일에는 이전 내용만
    expect(fileStore.get(ROTATED_PATH)).not.toContain('after rotation');
  });

  it('상한 이하면 회전하지 않는다', async () => {
    const mod = await import('../../electron/log');
    fileStore.set(LOG_PATH, 'small\n');
    await mod.logWarn('s', 'no rotation');
    expect(rename).not.toHaveBeenCalled();
    expect(fileStore.get(LOG_PATH)).toContain('small');
  });
});

describe('log — 최선 노력 (never throws)', () => {
  it('append 실패를 삼킨다', async () => {
    appendFile.mockRejectedValueOnce(new Error('EROFS'));
    const { logWarn } = await import('../../electron/log');
    await expect(logWarn('s', 'm')).resolves.toBeUndefined();
  });

  it('stat 실패를 삼키고 계속 쓴다', async () => {
    stat.mockRejectedValueOnce(new Error('EIO'));
    const { logWarn } = await import('../../electron/log');
    await expect(logWarn('s', 'm')).resolves.toBeUndefined();
  });

  it('rename 실패를 삼킨다', async () => {
    const mod = await import('../../electron/log');
    fileStore.set(LOG_PATH, 'x'.repeat(mod.MAX_LOG_BYTES + 1));
    rename.mockRejectedValueOnce(new Error('EBUSY'));
    await expect(mod.logWarn('s', 'm')).resolves.toBeUndefined();
  });
});

describe('log — 콘솔 이중 출력', () => {
  it('레벨에 맞는 console 함수로도 낸다 (dev 터미널 가시성)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const info = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { logInfo, logWarn, logError } = await import('../../electron/log');
    await logInfo('s', 'i');
    await logWarn('s', 'w');
    await logError('s', 'e');
    expect(info).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
    info.mockRestore();
  });

  it('파일 쓰기가 실패해도 콘솔 출력은 이미 나간다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    appendFile.mockRejectedValueOnce(new Error('EROFS'));
    const { logWarn } = await import('../../electron/log');
    await logWarn('s', 'still visible');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('콘솔 출력도 홈 경로를 리댁션한다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { logWarn } = await import('../../electron/log');
    await logWarn('fs', 'read /Users/testuser/a.md');
    expect(String(warn.mock.calls[0]?.[0])).not.toContain('/Users/testuser');
    warn.mockRestore();
  });
});

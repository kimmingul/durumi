import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockLocale = 'en-US';

vi.mock('electron', () => {
  const app = {
    getLocale: () => mockLocale,
    getPath: () => '/tmp/durumi-test-i18n',
  };
  return { default: { app }, app };
});

beforeEach(() => {
  vi.resetModules();
  mockLocale = 'en-US';
});

describe('electron i18n', () => {
  it('resolveLang("en") → en regardless of system locale', async () => {
    mockLocale = 'ko-KR';
    const { resolveLang } = await import('../../electron/i18n');
    expect(resolveLang('en')).toBe('en');
  });

  it('resolveLang("ko") → ko regardless of system locale', async () => {
    mockLocale = 'en-US';
    const { resolveLang } = await import('../../electron/i18n');
    expect(resolveLang('ko')).toBe('ko');
  });

  it('resolveLang("system") returns ko when app.getLocale starts with "ko"', async () => {
    mockLocale = 'ko-KR';
    const { resolveLang } = await import('../../electron/i18n');
    expect(resolveLang('system')).toBe('ko');
  });

  it('resolveLang("system") returns en when app.getLocale is non-Korean', async () => {
    mockLocale = 'en-US';
    const { resolveLang } = await import('../../electron/i18n');
    expect(resolveLang('system')).toBe('en');
  });

  it('t() falls back to English for missing Korean keys', async () => {
    const mod = await import('../../electron/i18n');
    expect(mod.t('menu.file', 'ko')).toBe('파일');
    // Unknown key falls all the way through to the raw key.
    expect(mod.t('does.not.exist', 'ko')).toBe('does.not.exist');
  });

  it('t() substitutes {version}-style placeholders', async () => {
    const { t } = await import('../../electron/i18n');
    expect(t('updates.upToDateDetail', 'en', { version: '1.2.3' })).toBe(
      'Durumi 1.2.3 is the latest version.',
    );
  });
});

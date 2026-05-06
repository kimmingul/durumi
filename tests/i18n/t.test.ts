import { describe, it, expect } from 'vitest';
import { t, setLanguageGlobal, getLanguage } from '../../src/i18n/t';

describe('t() helper', () => {
  it('returns the English string for a known key with langOverride="en"', () => {
    expect(t('menu.file', undefined, 'en')).toBe('File');
  });

  it('returns the Korean string for a known key with langOverride="ko"', () => {
    expect(t('menu.file', undefined, 'ko')).toBe('파일');
  });

  it('falls back to the raw key for an unknown key', () => {
    expect(t('totally.made.up.key', undefined, 'ko')).toBe('totally.made.up.key');
  });

  it('substitutes {name}-style placeholders', () => {
    expect(t('discard.message', { name: 'foo.md' }, 'ko')).toBe(
      '"foo.md"의 변경사항을 저장할까요?',
    );
  });

  it('uses the module-level current language when no override is given', () => {
    setLanguageGlobal('ko');
    expect(getLanguage()).toBe('ko');
    expect(t('sidebar.files')).toBe('파일');
    setLanguageGlobal('en');
    expect(t('sidebar.files')).toBe('Files');
  });
});

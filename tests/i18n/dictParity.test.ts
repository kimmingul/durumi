import { describe, it, expect } from 'vitest';
import { dictionaries } from '../../src/i18n/dict';

/**
 * en/ko 사전이 어긋나는 것을 기계적으로 막는다.
 *
 * 이전에는 한쪽 언어에만 키를 추가해도 아무 테스트도 실패하지 않았다.
 * 누락된 언어에서 `t()`는 en 폴백을 거쳐 최종적으로 키 문자열 자체를
 * 노출하므로, 사용자에게 'app.error.title' 같은 원시 키가 보인다.
 *
 * 플레이스홀더까지 검사하는 이유: `t(key, vars)`는 `{name}` 형태를 치환하는데,
 * 한쪽 번역에서 플레이스홀더가 빠지면 그 값이 조용히 사라진다(에러 없음).
 */

const LANGS = Object.keys(dictionaries) as (keyof typeof dictionaries)[];

function placeholdersOf(value: string): string[] {
  return (value.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort();
}

describe('dictionary parity', () => {
  it('지원 언어가 최소 en/ko 두 종류다', () => {
    expect(LANGS).toEqual(expect.arrayContaining(['en', 'ko']));
  });

  it('모든 언어가 동일한 키 집합을 갖는다', () => {
    const reference = Object.keys(dictionaries.en).sort();
    for (const lang of LANGS) {
      const keys = Object.keys(dictionaries[lang]).sort();
      const missing = reference.filter((k) => !keys.includes(k));
      const extra = keys.filter((k) => !reference.includes(k));
      // 어긋난 키를 그대로 노출해야 어디를 고칠지 바로 보인다.
      expect({ lang, missing, extra }).toEqual({ lang, missing: [], extra: [] });
    }
  });

  it('빈 문자열 값이 없다', () => {
    for (const lang of LANGS) {
      const blank = Object.entries(dictionaries[lang])
        .filter(([, v]) => typeof v !== 'string' || v.trim().length === 0)
        .map(([k]) => k);
      expect({ lang, blank }).toEqual({ lang, blank: [] });
    }
  });

  it('플레이스홀더 집합이 언어 간 일치한다', () => {
    const mismatched: { key: string; en: string[]; other: string[]; lang: string }[] = [];
    for (const [key, enValue] of Object.entries(dictionaries.en)) {
      const expected = placeholdersOf(enValue);
      for (const lang of LANGS) {
        if (lang === 'en') continue;
        const other = dictionaries[lang][key];
        if (typeof other !== 'string') continue; // 키 누락은 위 테스트가 잡는다
        const actual = placeholdersOf(other);
        if (JSON.stringify(expected) !== JSON.stringify(actual)) {
          mismatched.push({ key, en: expected, other: actual, lang });
        }
      }
    }
    expect(mismatched).toEqual([]);
  });
});

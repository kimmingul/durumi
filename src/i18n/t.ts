import {
  createContext,
  useContext,
  useState,
  createElement,
  type ReactNode,
} from 'react';
import { dictionaries, type Lang } from './dict';

/**
 * Module-level "current language" used by static `t(key)` calls (i.e.
 * outside React components). The LanguageProvider keeps this in sync with
 * its React state so static and React callers always agree.
 */
let currentLang: Lang = 'en';

export function setLanguageGlobal(lang: Lang): void {
  currentLang = lang;
}

export function getLanguage(): Lang {
  return currentLang;
}

/**
 * Look up `key` in the active dictionary. Falls back to the English entry,
 * then to the key itself, so missing translations are obvious in the UI but
 * never crash. Placeholders are written as `{name}` and substituted from
 * the optional `vars` map.
 *
 * `langOverride` lets unit tests assert against a specific language without
 * mutating module state.
 */
export function t(
  key: string,
  vars?: Record<string, string>,
  langOverride?: Lang,
): string {
  const lang = langOverride ?? currentLang;
  let s = dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      s = s.split(`{${k}}`).join(vars[k]!);
    }
  }
  return s;
}

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
});

interface LanguageProviderProps {
  children: ReactNode;
  initial?: Lang;
}

export function LanguageProvider({ children, initial = 'en' }: LanguageProviderProps) {
  const [lang, setLangState] = useState<Lang>(initial);
  // Sync the module-level current language during render so static `t(key)`
  // calls in descendants see the new value on the same render that swaps
  // language. A useEffect-only sync would leave one stale paint behind.
  if (currentLang !== lang) setLanguageGlobal(lang);
  const setLang = (next: Lang): void => {
    setLanguageGlobal(next);
    setLangState(next);
  };
  return createElement(LanguageContext.Provider, { value: { lang, setLang } }, children);
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}

/**
 * Resolve `'system' | 'en' | 'ko'` (as stored in prefs) to an actual
 * language using the renderer's `navigator.language`. Mirrors
 * `electron/i18n.ts#resolveLang`.
 */
export function resolveRendererLang(pref: 'system' | 'en' | 'ko' | undefined): Lang {
  if (pref === 'en' || pref === 'ko') return pref;
  const sys = (navigator?.language ?? '').toLowerCase();
  return sys.startsWith('ko') ? 'ko' : 'en';
}

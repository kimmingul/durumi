import { LanguageDescription } from '@codemirror/language';
import type { Language } from '@codemirror/language';
import { languages as lezerLangs } from '@codemirror/language-data';
import { highlightTree } from '@lezer/highlight';
import { tokenStyle } from './tokenStyle';
import { escapeHtml } from './escapeHtml';

const langCache = new Map<string, Language>();

export function getLangCacheForTest(): Map<string, Language> {
  return langCache;
}

export async function prefetchLang(lang: string): Promise<void> {
  const key = lang.toLowerCase();
  if (langCache.has(key)) return;
  const desc = LanguageDescription.matchLanguageName(lezerLangs, lang, true);
  if (!desc) return;
  const support = await desc.load();
  langCache.set(desc.name.toLowerCase(), support.language);
  for (const a of desc.alias) langCache.set(a.toLowerCase(), support.language);
}

export function highlightCodeSync(code: string, lang: string): string {
  if (!lang) return escapeHtml(code);
  const desc = LanguageDescription.matchLanguageName(lezerLangs, lang, true);
  const language = desc ? langCache.get(desc.name.toLowerCase()) : undefined;
  if (!language) return escapeHtml(code);
  const tree = language.parser.parse(code);
  let out = '';
  let pos = 0;
  highlightTree(tree, tokenStyle, (from, to, classes) => {
    if (from > pos) out += escapeHtml(code.slice(pos, from));
    out += `<span class="${classes}">${escapeHtml(code.slice(from, to))}</span>`;
    pos = to;
  });
  if (pos < code.length) out += escapeHtml(code.slice(pos));
  return out;
}

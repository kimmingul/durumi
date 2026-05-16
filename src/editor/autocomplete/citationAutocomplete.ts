import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import type { BibEntry } from '@shared/bibtex';
import { useBibliographyStore } from '../../store/bibliographyStore';

// Completes [@... citation keys from the live references.bib cache.
// User types [@, picks a key from the dropdown, ends up with [@key].
// Trigger window: [@ followed by zero+ key chars; closing ] ends the window.
const KEY_CHARS_RE = /[A-Za-z0-9_:.\-+/]/;
const TRIGGER_RE = /\[@([A-Za-z0-9_:.\-+/]*)$/;
const MAX_OPTIONS = 50;

export function citationAutocomplete(): Extension {
  return autocompletion({
    override: [citationSource],
  });
}

// Pure function so tests can drive the source without a full EditorView.
// Reads entries from the bibliography store at call time.
export function citationSource(context: CompletionContext): CompletionResult | null {
  const beforeCaret = context.state.sliceDoc(
    Math.max(0, context.pos - 256),
    context.pos,
  );
  const m = TRIGGER_RE.exec(beforeCaret);
  if (!m || m[1] === undefined) return null;
  const entries = useBibliographyStore.getState().entries;
  if (entries.length === 0) return null;

  const queryStart = context.pos - m[1].length;
  const options = rankAndMap(entries, m[1]).slice(0, MAX_OPTIONS);
  if (options.length === 0 && !context.explicit) return null;

  return {
    from: queryStart,
    to: context.pos,
    options,
    validFor: KEY_CHARS_RE,
  };
}

// Each option closes with ] so accepting completes [@key] in one step.
function rankAndMap(entries: readonly BibEntry[], query: string): Completion[] {
  const lowered = query.toLowerCase();
  const scored: Array<{ entry: BibEntry; score: number }> = [];
  for (const e of entries) {
    if (lowered.length === 0) {
      scored.push({ entry: e, score: 0 });
      continue;
    }
    const s = scoreEntry(e, lowered);
    if (s > 0) scored.push({ entry: e, score: s });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.entry.key.localeCompare(b.entry.key);
  });
  return scored.map(({ entry }) => ({
    label: entry.key,
    detail: detailLine(entry),
    type: 'reference',
    apply: `${entry.key}]`,
    boost: 0,
  }));
}

function scoreEntry(e: BibEntry, q: string): number {
  const key = e.key.toLowerCase();
  if (key === q) return 1000;
  if (key.startsWith(q)) return 600;
  if (key.includes(q)) return 200;
  const title = (e.fields.title ?? '').toLowerCase();
  const author = (e.fields.author ?? '').toLowerCase();
  if (title.startsWith(q) || author.startsWith(q)) return 80;
  if (title.includes(q) || author.includes(q)) return 30;
  return 0;
}

function detailLine(e: BibEntry): string {
  const f = e.fields;
  const author = (f.author ?? '').split(/\s+and\s+/)[0]?.replace(/,.*$/, '').trim() ?? '';
  const year = f.year ?? '';
  const title = f.title ?? '';
  const venue = f.journal ?? f.booktitle ?? '';
  const head = [author, year].filter(Boolean).join(' ');
  const tail = [title, venue].filter(Boolean).join(' · ');
  const combined = [head, tail].filter(Boolean).join(' · ');
  return combined.length > 90 ? combined.slice(0, 87) + '…' : combined;
}

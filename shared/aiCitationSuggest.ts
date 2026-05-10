import type { BibEntry } from './bibtex';
import type { AiMessageDto } from './ipc-contract';

// Citation-suggestion prompt builder for v0.1.8 Track C. The strategy is
// retrieval-augmented: we hand the model the user's current paragraph
// PLUS a compact list of local references.bib entries (key + title +
// authors + year + abstract excerpt), and ask which keys the paragraph
// could cite, with rationale.
//
// Why not let the model freely cite from training data? Because every
// citation must round-trip to a real entry the user already has. The
// system prompt is explicit: only suggest keys from the supplied list.
// If nothing fits, return an empty array — never invent.

export interface CitationCandidate {
  /** The cite key from references.bib. */
  key: string;
  /** Short rationale for *why* this key fits at the suggested location. */
  rationale: string;
  /**
   * Optional excerpt of the paragraph the suggestion attaches to. Helps
   * the user see what the model "saw" when proposing the citation.
   */
  anchor?: string;
}

export interface CitationSuggestion {
  candidates: CitationCandidate[];
  /** Free-form notes from the model — surfaced to the user as-is. */
  notes?: string;
}

const MAX_ENTRIES_IN_PROMPT = 60;
const ABSTRACT_TRUNCATE = 320;
const PDF_TEXT_TRUNCATE = 600;

const SYSTEM_PROMPT = [
  'You are a medical-research citation assistant.',
  'Read the user\'s paragraph and the supplied list of bibliography entries.',
  'Identify which entries (if any) could appropriately be cited within the paragraph.',
  'STRICT RULES:',
  '- Only suggest keys that appear EXACTLY in the supplied list. Never invent or paraphrase keys.',
  '- If no entry fits, return an empty candidates array. Never reach for tangential matches.',
  '- Return STRICT JSON. No prose outside the JSON object.',
  '- Match this shape: {"candidates":[{"key":"<exact key>","rationale":"<one sentence>","anchor":"<phrase from paragraph>"}], "notes":"<optional>"}',
].join(' ');

/**
 * Build the messages for the citation-suggestion call. Truncates entries
 * to keep the prompt within sensible token budgets for ~10K-token models.
 *
 * v0.1.8.2 — entries can carry an optional `localText` excerpt extracted
 * from a local PDF / markdown file in `<bib-dir>/reference/`. When
 * present, the model gets per-entry body content instead of relying on
 * the Crossref abstract alone, which improves match quality for papers
 * where the abstract doesn't surface the methodology / results that the
 * paragraph would actually want to cite.
 */
export interface EnrichedEntry {
  entry: BibEntry;
  /** PDF / markdown excerpt — typically the first ~3 pages of body text. */
  localText?: string;
}

export function buildCitationSuggestPrompt(
  paragraph: string,
  entries: ReadonlyArray<BibEntry | EnrichedEntry>,
): AiMessageDto[] {
  const enriched: EnrichedEntry[] = entries.slice(0, MAX_ENTRIES_IN_PROMPT).map(
    (e) => ('entry' in e ? e : { entry: e }),
  );
  const slim = enriched.map(slimEnriched).join('\n');
  const userMsg = [
    'PARAGRAPH:',
    '---',
    paragraph,
    '---',
    '',
    'AVAILABLE BIBLIOGRAPHY ENTRIES (only suggest keys from this list):',
    '---',
    slim,
    '---',
    '',
    'Return STRICT JSON only.',
  ].join('\n');
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMsg },
  ];
}

function slimEnriched(en: EnrichedEntry): string {
  const e = en.entry;
  const f = e.fields;
  const author = (f.author ?? '').split(/\s+and\s+/)[0]?.trim() ?? '';
  const year = f.year ?? '';
  const venue = f.journal ?? f.booktitle ?? '';
  const title = f.title ?? '';
  let line = `[${e.key}] ${author} ${year} — ${title}`;
  if (venue) line += ` (${venue})`;
  if (f.abstract) {
    const trimmed = f.abstract.replace(/\s+/g, ' ').trim();
    line += `\n  abstract: ${trimmed.slice(0, ABSTRACT_TRUNCATE)}`;
    if (trimmed.length > ABSTRACT_TRUNCATE) line += '…';
  }
  if (en.localText) {
    const trimmed = en.localText.replace(/\s+/g, ' ').trim();
    line += `\n  excerpt: ${trimmed.slice(0, PDF_TEXT_TRUNCATE)}`;
    if (trimmed.length > PDF_TEXT_TRUNCATE) line += '…';
  }
  return line;
}

/**
 * Parse the model's JSON response into a typed suggestion. Tolerates
 * surrounding ```json fences and a missing notes field. Drops any
 * candidate whose key isn't in `validKeys` so a hallucinated key never
 * makes it to the UI.
 */
export function parseCitationSuggestion(
  raw: string,
  validKeys: ReadonlySet<string>,
): CitationSuggestion {
  const json = stripJsonFence(raw).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { candidates: [] };
  }
  if (!parsed || typeof parsed !== 'object') return { candidates: [] };
  const obj = parsed as { candidates?: unknown; notes?: unknown };
  const out: CitationCandidate[] = [];
  if (Array.isArray(obj.candidates)) {
    for (const c of obj.candidates) {
      if (!c || typeof c !== 'object') continue;
      const cc = c as { key?: unknown; rationale?: unknown; anchor?: unknown };
      if (typeof cc.key !== 'string') continue;
      if (!validKeys.has(cc.key)) continue; // drop hallucinated keys
      out.push({
        key: cc.key,
        rationale: typeof cc.rationale === 'string' ? cc.rationale : '',
        anchor: typeof cc.anchor === 'string' ? cc.anchor : undefined,
      });
    }
  }
  return {
    candidates: out,
    notes: typeof obj.notes === 'string' ? obj.notes : undefined,
  };
}

function stripJsonFence(s: string): string {
  // Some models wrap output in ```json ... ``` — peel it off.
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return m ? m[1]! : s;
}

import { describe, it, expect } from 'vitest';
import {
  buildCitationSuggestPrompt,
  parseCitationSuggestion,
} from '../../shared/aiCitationSuggest';
import type { BibEntry } from '../../shared/bibtex';

const e1: BibEntry = {
  key: 'smith2024deep',
  type: 'article',
  fields: {
    author: 'Smith, John',
    title: 'Deep learning in radiology',
    journal: 'Nature',
    year: '2024',
    abstract: 'A breakthrough study using deep neural networks for chest X-ray diagnosis.',
  },
};
const e2: BibEntry = {
  key: 'kim2023ai',
  type: 'article',
  fields: { author: 'Kim, Min-Gul', title: 'AI in medicine', year: '2023' },
};

describe('buildCitationSuggestPrompt', () => {
  it('lists every entry by key + author + year + title', () => {
    const messages = buildCitationSuggestPrompt('Some paragraph.', [e1, e2]);
    const userMsg = messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMsg).toContain('[smith2024deep]');
    expect(userMsg).toContain('Smith');
    expect(userMsg).toContain('Deep learning in radiology');
    expect(userMsg).toContain('[kim2023ai]');
  });

  it('truncates long abstracts to keep prompt size sane', () => {
    const longAbstract: BibEntry = {
      ...e1,
      fields: { ...e1.fields, abstract: 'x'.repeat(2000) },
    };
    const messages = buildCitationSuggestPrompt('p', [longAbstract]);
    const userMsg = messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMsg.length).toBeLessThan(2000);
    expect(userMsg).toContain('…');
  });

  it('system prompt enforces strict JSON output and no inventions', () => {
    const messages = buildCitationSuggestPrompt('p', [e1]);
    const sys = messages.find((m) => m.role === 'system')?.content ?? '';
    expect(sys).toMatch(/STRICT JSON/i);
    expect(sys).toMatch(/never invent/i);
    expect(sys).toMatch(/exactly/i);
  });
});

describe('parseCitationSuggestion', () => {
  const validKeys = new Set(['smith2024deep', 'kim2023ai']);

  it('parses well-formed JSON output', () => {
    const raw = JSON.stringify({
      candidates: [
        { key: 'smith2024deep', rationale: 'Direct evidence for the claim.', anchor: 'deep learning' },
      ],
      notes: 'High confidence',
    });
    const r = parseCitationSuggestion(raw, validKeys);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]?.key).toBe('smith2024deep');
    expect(r.candidates[0]?.rationale).toContain('evidence');
    expect(r.notes).toBe('High confidence');
  });

  it('peels ```json fences if present', () => {
    const raw = '```json\n{"candidates":[{"key":"kim2023ai","rationale":"r"}]}\n```';
    const r = parseCitationSuggestion(raw, validKeys);
    expect(r.candidates).toHaveLength(1);
  });

  it('drops candidates whose key is not in validKeys (hallucination guard)', () => {
    const raw = JSON.stringify({
      candidates: [
        { key: 'smith2024deep', rationale: 'real' },
        { key: 'fake2099hallucination', rationale: 'invented' },
      ],
    });
    const r = parseCitationSuggestion(raw, validKeys);
    expect(r.candidates.map((c) => c.key)).toEqual(['smith2024deep']);
  });

  it('returns empty list when JSON is malformed', () => {
    expect(parseCitationSuggestion('not json', validKeys).candidates).toEqual([]);
    expect(parseCitationSuggestion('{"broken', validKeys).candidates).toEqual([]);
  });

  it('returns empty list when candidates is missing or wrong type', () => {
    expect(parseCitationSuggestion('{}', validKeys).candidates).toEqual([]);
    expect(parseCitationSuggestion('{"candidates":"nope"}', validKeys).candidates).toEqual([]);
  });

  it('skips candidates without a string key', () => {
    const raw = JSON.stringify({
      candidates: [
        { rationale: 'no key here' },
        { key: 123, rationale: 'wrong type' },
        { key: 'smith2024deep', rationale: 'good' },
      ],
    });
    const r = parseCitationSuggestion(raw, validKeys);
    expect(r.candidates).toHaveLength(1);
  });

  it('preserves anchor when supplied', () => {
    const raw = JSON.stringify({
      candidates: [{ key: 'kim2023ai', rationale: 'r', anchor: 'AI in medicine' }],
    });
    const r = parseCitationSuggestion(raw, validKeys);
    expect(r.candidates[0]?.anchor).toBe('AI in medicine');
  });
});

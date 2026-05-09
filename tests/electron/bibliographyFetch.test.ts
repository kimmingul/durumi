import { describe, it, expect } from 'vitest';
import {
  crossrefMessageToEntry,
  normalizeDoi,
  resolveDOI,
} from '../../electron/bibliographyFetch';
import type { CrossrefMessage } from '../../electron/bibliographyFetch';

describe('normalizeDoi', () => {
  it('returns a bare DOI unchanged', () => {
    expect(normalizeDoi('10.1056/NEJMoa1234567')).toBe('10.1056/NEJMoa1234567');
  });

  it('strips https://doi.org prefix', () => {
    expect(normalizeDoi('https://doi.org/10.1056/NEJMoa1234567')).toBe('10.1056/NEJMoa1234567');
  });

  it('strips https://dx.doi.org prefix', () => {
    expect(normalizeDoi('https://dx.doi.org/10.1056/NEJMoa1234567')).toBe('10.1056/NEJMoa1234567');
  });

  it('strips "doi:" prefix', () => {
    expect(normalizeDoi('doi:10.1056/NEJMoa1234567')).toBe('10.1056/NEJMoa1234567');
    expect(normalizeDoi('DOI 10.1056/NEJMoa1234567')).toBe('10.1056/NEJMoa1234567');
  });

  it('returns null for non-DOI input', () => {
    expect(normalizeDoi('')).toBeNull();
    expect(normalizeDoi('not a doi')).toBeNull();
    expect(normalizeDoi('https://example.com/foo')).toBeNull();
  });
});

describe('crossrefMessageToEntry', () => {
  const baseMsg: CrossrefMessage = {
    DOI: '10.1056/NEJMoa1234567',
    type: 'journal-article',
    title: ['Deep learning in radiology'],
    author: [
      { family: 'Smith', given: 'John' },
      { family: 'Doe', given: 'Jane' },
    ],
    'container-title': ['Nature'],
    volume: '612',
    issue: '7938',
    page: '234-241',
    issued: { 'date-parts': [[2024, 3, 15]] },
    URL: 'https://www.nature.com/articles/...',
  };

  it('maps a journal-article to BibTeX article', () => {
    const e = crossrefMessageToEntry(baseMsg);
    expect(e.type).toBe('article');
    expect(e.fields.author).toBe('Smith, John and Doe, Jane');
    expect(e.fields.title).toBe('Deep learning in radiology');
    expect(e.fields.journal).toBe('Nature');
    expect(e.fields.year).toBe('2024');
    expect(e.fields.volume).toBe('612');
    expect(e.fields.number).toBe('7938');
    expect(e.fields.pages).toBe('234-241');
    expect(e.fields.doi).toBe('10.1056/NEJMoa1234567');
  });

  it('returns an empty key — caller assigns via makeCitationKey', () => {
    expect(crossrefMessageToEntry(baseMsg).key).toBe('');
  });

  it('routes book-chapter to incollection with booktitle', () => {
    const e = crossrefMessageToEntry({
      ...baseMsg,
      type: 'book-chapter',
      'container-title': ['Handbook of Radiology'],
    });
    expect(e.type).toBe('incollection');
    expect(e.fields.booktitle).toBe('Handbook of Radiology');
    expect(e.fields.journal).toBeUndefined();
  });

  it('falls back to misc on unknown type', () => {
    const e = crossrefMessageToEntry({ ...baseMsg, type: 'something-weird' });
    expect(e.type).toBe('misc');
  });

  it('strips JATS XML tags from abstract', () => {
    const e = crossrefMessageToEntry({
      ...baseMsg,
      abstract: '<jats:p>Some <jats:i>study</jats:i> text.</jats:p>',
    });
    expect(e.fields.abstract).toBe('Some study text.');
  });

  it('handles organizational author via "name" field', () => {
    const e = crossrefMessageToEntry({
      ...baseMsg,
      author: [{ name: 'World Health Organization' }],
    });
    expect(e.fields.author).toBe('{World Health Organization}');
  });

  it('falls back to editor when author is missing', () => {
    const e = crossrefMessageToEntry({
      ...baseMsg,
      author: [],
      editor: [{ family: 'Jones', given: 'A' }],
    });
    expect(e.fields.author).toBeUndefined();
    expect(e.fields.editor).toBe('Jones, A');
  });

  it('uses published-print year when issued is missing', () => {
    const e = crossrefMessageToEntry({
      ...baseMsg,
      issued: undefined,
      'published-print': { 'date-parts': [[2023]] },
    });
    expect(e.fields.year).toBe('2023');
  });
});

describe('resolveDOI', () => {
  function fakeFetch(spec: {
    status?: number;
    json?: unknown;
    throwError?: Error;
  }): typeof fetch {
    return (async () => {
      if (spec.throwError) throw spec.throwError;
      return new Response(JSON.stringify(spec.json ?? {}), {
        status: spec.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
  }

  it('returns ok+entry on a 200 with valid Crossref message', async () => {
    const fetchImpl = fakeFetch({
      json: {
        message: {
          DOI: '10.1056/NEJMoa1234567',
          type: 'journal-article',
          title: ['T'],
          author: [{ family: 'Smith', given: 'John' }],
          'container-title': ['NEJM'],
          issued: { 'date-parts': [[2024]] },
        },
      },
    });
    const r = await resolveDOI('10.1056/NEJMoa1234567', { fetchImpl });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.fields.title).toBe('T');
      expect(r.data.fields.year).toBe('2024');
    }
  });

  it('returns code:not-found on 404', async () => {
    const fetchImpl = fakeFetch({ status: 404 });
    const r = await resolveDOI('10.1056/NEJMoa1234567', { fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not-found');
  });

  it('returns code:rate-limit on 429', async () => {
    const fetchImpl = fakeFetch({ status: 429 });
    const r = await resolveDOI('10.1056/NEJMoa1234567', { fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('rate-limit');
  });

  it('returns code:parse for an invalid DOI', async () => {
    // No fetch should occur — bail early.
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    const r = await resolveDOI('not a doi', { fetchImpl });
    expect(calls).toBe(0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('parse');
  });

  it('returns code:network on fetch throwing', async () => {
    const fetchImpl = fakeFetch({ throwError: new Error('ECONNRESET') });
    const r = await resolveDOI('10.1056/NEJMoa1234567', { fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('network');
  });
});

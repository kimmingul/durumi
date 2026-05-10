import { describe, it, expect, vi } from 'vitest';
import {
  crossrefMessageToEntry,
  extractOrcidProfile,
  normalizeDoi,
  normalizeKoreaMedAuthors,
  normalizeOrcidId,
  parseJournalInfo,
  parseKoreaMedHtml,
  pubmedSummaryToEntry,
  resolveDOI,
  resolveORCID,
  searchCrossref,
  searchKoreaMed,
  searchPubMed,
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

describe('searchCrossref', () => {
  it('returns ok+empty for empty query without making a request', async () => {
    const fetchImpl = vi.fn();
    const r = await searchCrossref('', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps Crossref items to SearchHits with crossref source', async () => {
    const fetchImpl = (async () => new Response(
      JSON.stringify({
        message: {
          items: [
            {
              DOI: '10.1/x',
              type: 'journal-article',
              title: ['Hit one'],
              author: [{ family: 'Smith', given: 'J' }],
              'container-title': ['NEJM'],
              issued: { 'date-parts': [[2024]] },
            },
            {
              DOI: '10.2/y',
              type: 'journal-article',
              title: ['Hit two'],
              author: [{ family: 'Doe', given: 'J' }],
              'container-title': ['Lancet'],
              issued: { 'date-parts': [[2023]] },
            },
          ],
        },
      }),
      { status: 200 },
    )) as unknown as typeof fetch;
    const r = await searchCrossref('cancer', { fetchImpl });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toHaveLength(2);
      expect(r.data[0]?.source).toBe('crossref');
      expect(r.data[0]?.externalId).toBe('10.1/x');
      expect(r.data[0]?.entry.fields.title).toBe('Hit one');
    }
  });

  it('caps the limit at 50 and applies the default of 25', async () => {
    let capturedUrl = '';
    const fetchImpl = (async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ message: { items: [] } }), { status: 200 });
    }) as unknown as typeof fetch;
    await searchCrossref('q', { limit: 999, fetchImpl });
    expect(capturedUrl).toContain('rows=50');
  });

  it('propagates rate-limit and timeout codes from httpJson', async () => {
    const fetchImpl = (async () => new Response('', { status: 429 })) as unknown as typeof fetch;
    const r = await searchCrossref('q', { fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('rate-limit');
  });
});

describe('searchPubMed', () => {
  it('makes ESearch then ESummary', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (url.includes('esearch.fcgi')) {
        return new Response(
          JSON.stringify({ esearchresult: { idlist: ['12345', '67890'] } }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          result: {
            uids: ['12345', '67890'],
            '12345': {
              title: 'Pubmed hit one.',
              authors: [{ name: 'Smith JJ', authtype: 'Author' }],
              fulljournalname: 'NEJM',
              pubdate: '2024 Mar 15',
              volume: '388',
              issue: '12',
              pages: '101-110',
              articleids: [{ idtype: 'doi', value: '10.x/y' }],
              pubtype: ['Journal Article'],
            },
            '67890': {
              title: 'Pubmed hit two.',
              authors: [{ name: 'Doe AA', authtype: 'Author' }],
              fulljournalname: 'Lancet',
              pubdate: '2023',
              articleids: [],
              pubtype: ['Review'],
            },
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const r = await searchPubMed('cancer', { fetchImpl });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toHaveLength(2);
      expect(r.data[0]?.source).toBe('pubmed');
      expect(r.data[0]?.externalId).toBe('12345');
      expect(r.data[0]?.entry.fields.pmid).toBe('12345');
      expect(r.data[0]?.entry.fields.doi).toBe('10.x/y');
    }
    expect(calls).toHaveLength(2);
    expect(calls[0]!).toContain('esearch.fcgi');
    expect(calls[1]!).toContain('esummary.fcgi');
  });

  it('returns empty hits when ESearch yields no IDs (no ESummary call)', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response(
        JSON.stringify({ esearchresult: { idlist: [] } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const r = await searchPubMed('nothing', { fetchImpl });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual([]);
    expect(calls).toBe(1);
  });

  it('appends api_key when ncbiApiKey is provided', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string) => {
      seen.push(url);
      return new Response(
        JSON.stringify({ esearchresult: { idlist: [] } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    await searchPubMed('q', { fetchImpl, ncbiApiKey: 'abc-xyz' });
    expect(seen[0]!).toContain('api_key=abc-xyz');
  });
});

describe('parseJournalInfo', () => {
  it('extracts year + volume + number + pages from a Vancouver-style line', () => {
    const r = parseJournalInfo('Korean J Med. 2024 Mar;99(2):101-110.');
    expect(r.journal).toBe('Korean J Med');
    expect(r.year).toBe('2024');
    expect(r.volume).toBe('99');
    expect(r.number).toBe('2');
    expect(r.pages).toBe('101-110');
  });

  it('tolerates missing volume + issue', () => {
    const r = parseJournalInfo('JKMS. 2023.');
    expect(r.year).toBe('2023');
    expect(r.volume).toBeUndefined();
  });

  it('returns empty object for empty input', () => {
    expect(parseJournalInfo('')).toEqual({});
  });
});

describe('normalizeKoreaMedAuthors', () => {
  it('converts "Last F, Last F" to BibTeX style', () => {
    expect(normalizeKoreaMedAuthors('Doe J, Kim MG, Lee S.')).toBe(
      'Doe, J and Kim, MG and Lee, S',
    );
  });

  it('preserves Hangul author names verbatim', () => {
    expect(normalizeKoreaMedAuthors('김민걸, 이순신')).toBe('김민걸 and 이순신');
  });

  it('handles a single author', () => {
    expect(normalizeKoreaMedAuthors('Smith J.')).toBe('Smith, J');
  });

  it('returns empty for empty input', () => {
    expect(normalizeKoreaMedAuthors('')).toBe('');
    expect(normalizeKoreaMedAuthors('   ')).toBe('');
  });
});

describe('parseKoreaMedHtml', () => {
  const html = `
    <html><body>
      <ul>
        <li class="searchListItem">
          <a class="title" href="/article/1">Deep learning in radiology.</a>
          <div class="authors">Smith J, Doe A.</div>
          <div class="journalInfo">Korean J Med. 2024 Mar;99(2):101-110.</div>
          <a class="doiLink" href="https://doi.org/10.1234/abc">DOI</a>
        </li>
        <li class="searchListItem">
          <a class="title" href="/article/2">한국어 의학 연구.</a>
          <div class="authors">김민걸.</div>
          <div class="journalInfo">JKMS. 2023.</div>
        </li>
        <li class="other">unrelated</li>
      </ul>
    </body></html>`;

  it('returns one BibEntry per searchListItem', () => {
    const entries = parseKoreaMedHtml(html, 25);
    expect(entries).toHaveLength(2);
  });

  it('extracts title, authors, journal, year, volume, pages, doi from the first row', () => {
    const e = parseKoreaMedHtml(html, 25)[0]!;
    expect(e.fields.title).toBe('Deep learning in radiology.');
    expect(e.fields.author).toBe('Smith, J and Doe, A');
    expect(e.fields.journal).toBe('Korean J Med');
    expect(e.fields.year).toBe('2024');
    expect(e.fields.volume).toBe('99');
    expect(e.fields.number).toBe('2');
    expect(e.fields.pages).toBe('101-110');
    expect(e.fields.doi).toBe('10.1234/abc');
  });

  it('handles a Hangul author row without DOI gracefully', () => {
    const e = parseKoreaMedHtml(html, 25)[1]!;
    expect(e.fields.author).toBe('김민걸');
    expect(e.fields.year).toBe('2023');
    expect(e.fields.doi).toBeUndefined();
  });

  it('respects the limit parameter', () => {
    expect(parseKoreaMedHtml(html, 1)).toHaveLength(1);
  });

  it('returns empty array when there are no searchListItem rows', () => {
    expect(parseKoreaMedHtml('<html></html>', 25)).toEqual([]);
  });
});

describe('searchKoreaMed (integration via fetchImpl)', () => {
  it('parses scraped HTML into SearchHits with koreamed source', async () => {
    const fetchImpl = (async () => new Response(
      `<li class="searchListItem">
        <a class="title">Sample.</a>
        <div class="authors">Lee S.</div>
        <div class="journalInfo">JKMS. 2024;5:1-10.</div>
       </li>`,
      { status: 200, headers: { 'Content-Type': 'text/html' } },
    )) as unknown as typeof fetch;
    const r = await searchKoreaMed('cancer', { fetchImpl });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toHaveLength(1);
      expect(r.data[0]?.source).toBe('koreamed');
      expect(r.data[0]?.entry.fields.journal).toBe('JKMS');
    }
  });

  it('returns an empty result for an empty query without a fetch', async () => {
    const fetchImpl = vi.fn();
    const r = await searchKoreaMed('', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('propagates HTTP errors as parse-friendly codes', async () => {
    const fetchImpl = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    const r = await searchKoreaMed('q', { fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('http');
  });
});

describe('normalizeOrcidId', () => {
  it('accepts the bare 19-char form', () => {
    expect(normalizeOrcidId('0000-0002-1825-0097')).toBe('0000-0002-1825-0097');
  });

  it('strips orcid.org URL prefix', () => {
    expect(normalizeOrcidId('https://orcid.org/0000-0002-1825-0097')).toBe(
      '0000-0002-1825-0097',
    );
  });

  it('accepts X check digit', () => {
    expect(normalizeOrcidId('0000-0001-2345-678X')).toBe('0000-0001-2345-678X');
  });

  it('rejects malformed input', () => {
    expect(normalizeOrcidId('1234')).toBeNull();
    expect(normalizeOrcidId('0000-00-0000-0000')).toBeNull();
    expect(normalizeOrcidId('')).toBeNull();
  });
});

describe('extractOrcidProfile', () => {
  it('prefers credit-name over given+family', () => {
    const r = extractOrcidProfile('0000-0002-1825-0097', {
      person: {
        name: {
          'given-names': { value: 'Min-Gul' },
          'family-name': { value: 'Kim' },
          'credit-name': { value: 'M.G. Kim, MD' },
        },
      },
    });
    expect(r.name).toBe('M.G. Kim, MD');
  });

  it('falls back to "given family" when credit-name is absent', () => {
    const r = extractOrcidProfile('x', {
      person: {
        name: {
          'given-names': { value: 'Jane' },
          'family-name': { value: 'Doe' },
        },
      },
    });
    expect(r.name).toBe('Jane Doe');
  });

  it('extracts the first employment organization', () => {
    const r = extractOrcidProfile('x', {
      'activities-summary': {
        employments: {
          'affiliation-group': [
            {
              summaries: [
                { 'employment-summary': { organization: { name: 'Seoul Nat. Univ.' } } },
              ],
            },
          ],
        },
      },
    });
    expect(r.affiliation).toBe('Seoul Nat. Univ.');
  });

  it('counts works groups', () => {
    const r = extractOrcidProfile('x', {
      'activities-summary': { works: { group: [{}, {}, {}] } },
    });
    expect(r.worksCount).toBe(3);
  });
});

describe('resolveORCID', () => {
  it('returns code:parse for malformed iD without making a request', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const r = await resolveORCID('not-an-orcid', { fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('parse');
    expect(calls).toBe(0);
  });

  it('returns ok+profile on a successful 200', async () => {
    const fetchImpl = (async () => new Response(
      JSON.stringify({
        person: {
          name: { 'given-names': { value: 'Min' }, 'family-name': { value: 'Kim' } },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )) as unknown as typeof fetch;
    const r = await resolveORCID('0000-0002-1825-0097', { fetchImpl });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.iD).toBe('0000-0002-1825-0097');
      expect(r.data.name).toBe('Min Kim');
    }
  });

  it('returns code:not-found on 404', async () => {
    const fetchImpl = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    const r = await resolveORCID('0000-0002-1825-0097', { fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not-found');
  });
});

describe('pubmedSummaryToEntry', () => {
  it('builds a complete article entry', () => {
    const e = pubmedSummaryToEntry(
      {
        title: 'A study.',
        authors: [
          { name: 'Smith JJ', authtype: 'Author' },
          { name: 'Doe AA', authtype: 'Author' },
        ],
        fulljournalname: 'NEJM',
        pubdate: '2024 Mar 15',
        volume: '388',
        issue: '12',
        pages: '101-110',
        articleids: [{ idtype: 'doi', value: '10.x/y' }],
        pubtype: ['Journal Article'],
      },
      '12345',
    );
    expect(e.type).toBe('article');
    expect(e.fields.title).toBe('A study');
    expect(e.fields.author).toBe('Smith, JJ and Doe, AA');
    expect(e.fields.journal).toBe('NEJM');
    expect(e.fields.year).toBe('2024');
    expect(e.fields.pmid).toBe('12345');
    expect(e.fields.doi).toBe('10.x/y');
  });

  it('skips non-Author authtype (collaborators, etc.)', () => {
    const e = pubmedSummaryToEntry(
      {
        title: 't',
        authors: [
          { name: 'Smith J', authtype: 'Author' },
          { name: 'WHO', authtype: 'CollectiveName' },
        ],
        articleids: [],
      },
      '1',
    );
    expect(e.fields.author).toBe('Smith, J');
  });
});

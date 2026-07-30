import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pkg from '../../package.json';
import { APP_VERSION, durumiUserAgent } from '../../electron/userAgent';
import { httpText, resolveORCID, searchCrossref } from '../../electron/bibliographyFetch';
import { aiChat } from '../../electron/aiClient';

/**
 * 세 곳의 아웃바운드 User-Agent(bibliographyFetch / aiClient / referenceDownload)가
 * 서로 다른 버전 리터럴을 하드코딩해 Crossref·PubMed·ORCID에 잘못된 버전을
 * 보내던 결함의 회귀 테스트. `package.json`이 단일 진실 원천이다.
 */

const REPO_ROOT = join(__dirname, '..', '..');

/**
 * 헤더 이름은 대소문자를 가리지 않는다 — bibliographyFetch/referenceDownload는
 * 'User-Agent', aiClient는 'user-agent'를 쓴다.
 */
function uaOf(captured: { init: RequestInit } | null): string {
  const headers = (captured?.init.headers ?? {}) as Record<string, string>;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === 'user-agent');
  return key ? headers[key]! : '';
}

describe('APP_VERSION', () => {
  it('package.json version과 일치한다', () => {
    expect(APP_VERSION).toBe(pkg.version);
  });
});

describe('durumiUserAgent', () => {
  it('저장소 URL을 포함한 기본 형태를 만든다', () => {
    expect(durumiUserAgent()).toBe(
      `Durumi/${pkg.version} (https://github.com/kimmingul/durumi)`,
    );
  });

  it('email이 주어지면 mailto를 덧붙인다 (Crossref polite pool)', () => {
    expect(durumiUserAgent('a@b.org')).toBe(
      `Durumi/${pkg.version} (https://github.com/kimmingul/durumi) mailto:a@b.org`,
    );
  });

  it('email이 null/undefined/빈문자열이면 mailto를 붙이지 않는다', () => {
    const bare = `Durumi/${pkg.version} (https://github.com/kimmingul/durumi)`;
    expect(durumiUserAgent(null)).toBe(bare);
    expect(durumiUserAgent(undefined)).toBe(bare);
    expect(durumiUserAgent('')).toBe(bare);
  });
});

describe('아웃바운드 User-Agent — 실제 송출 헤더', () => {
  it('httpText가 현재 버전을 보낸다', async () => {
    let captured: { init: RequestInit } | null = null;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      captured = { init: init ?? {} };
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    await httpText('https://example.org/x', { fetchImpl });
    expect(uaOf(captured)).toContain(`Durumi/${pkg.version}`);
  });

  it('httpText가 email을 mailto로 실어 보낸다', async () => {
    let captured: { init: RequestInit } | null = null;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      captured = { init: init ?? {} };
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    await httpText('https://example.org/x', { fetchImpl, email: 'r@lab.org' });
    const ua = uaOf(captured);
    expect(ua).toContain(`Durumi/${pkg.version}`);
    expect(ua).toContain('mailto:r@lab.org');
  });

  it('resolveORCID가 현재 버전을 보낸다', async () => {
    let captured: { init: RequestInit } | null = null;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      captured = { init: init ?? {} };
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    await resolveORCID('0000-0002-1825-0097', { fetchImpl });
    expect(uaOf(captured)).toContain(`Durumi/${pkg.version}`);
  });

  it('searchCrossref가 현재 버전을 보낸다', async () => {
    let captured: { init: RequestInit } | null = null;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      captured = { init: init ?? {} };
      return new Response(JSON.stringify({ message: { items: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    await searchCrossref('statin', { fetchImpl });
    expect(uaOf(captured)).toContain(`Durumi/${pkg.version}`);
  });

  it('aiChat이 현재 버전을 보낸다', async () => {
    let captured: { init: RequestInit } | null = null;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      captured = { init: init ?? {} };
      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    await aiChat([{ role: 'user', content: 'hi' }], {
      provider: 'anthropic',
      apiKey: 'sk-test',
      model: 'claude-sonnet-4-6',
      fetchImpl,
    });
    expect(uaOf(captured)).toContain(`Durumi/${pkg.version}`);
  });
});

describe('버전 리터럴 하드코딩 금지', () => {
  // referenceDownload의 UA는 private downloadPdf 안에 있어 fs 없이는 도달할 수 없다.
  // 소스 수준 가드로 세 파일 전체를 한 번에 덮는다 — 새 하드코딩 유입도 막는다.
  const FILES = [
    'electron/bibliographyFetch.ts',
    'electron/aiClient.ts',
    'electron/referenceDownload.ts',
  ];

  it.each(FILES)('%s 에 Durumi/<숫자> 리터럴이 없다', (rel) => {
    const src = readFileSync(join(REPO_ROOT, rel), 'utf8');
    const matches = src.match(/Durumi\/\d+\.\d+/g) ?? [];
    expect(matches).toEqual([]);
  });

  it.each(FILES)('%s 에 자체 버전 상수 선언이 없다', (rel) => {
    const src = readFileSync(join(REPO_ROOT, rel), 'utf8');
    expect(src).not.toMatch(/DURUMI_VERSION\s*=\s*['"]/);
  });
});

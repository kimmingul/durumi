import { describe, it, expect } from 'vitest';
import { aiChat, aiVerify } from '../../electron/aiClient';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorBody(status: number, message: string): Response {
  return new Response(message, { status });
}

describe('aiChat — Anthropic', () => {
  it('formats the request and parses content + usage', async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      captured = { url: String(url), init: init ?? {} };
      return jsonResponse({
        content: [{ type: 'text', text: 'Hello' }],
        usage: { input_tokens: 12, output_tokens: 3 },
      });
    }) as unknown as typeof fetch;
    const r = await aiChat(
      [
        { role: 'system', content: 'be helpful' },
        { role: 'user', content: 'hi' },
      ],
      {
        provider: 'anthropic',
        apiKey: 'sk-ant-key',
        model: 'claude-sonnet-4-6',
        fetchImpl,
      },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.text).toBe('Hello');
      expect(r.data.inputTokens).toBe(12);
      expect(r.data.outputTokens).toBe(3);
    }
    expect(captured).not.toBeNull();
    expect(captured!.url).toBe('https://api.anthropic.com/v1/messages');
    const body = JSON.parse(String(captured!.init.body));
    expect(body.system).toBe('be helpful');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    const headers = captured!.init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('returns code:auth without key', async () => {
    const fetchImpl = (async () => jsonResponse({})) as unknown as typeof fetch;
    const r = await aiChat([{ role: 'user', content: 'x' }], {
      provider: 'anthropic',
      apiKey: '',
      model: 'claude-sonnet-4-6',
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('auth');
  });

  it('returns code:auth on 401', async () => {
    const fetchImpl = (async () => errorBody(401, 'unauthorized')) as unknown as typeof fetch;
    const r = await aiChat([{ role: 'user', content: 'x' }], {
      provider: 'anthropic',
      apiKey: 'bad',
      model: 'claude-sonnet-4-6',
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('auth');
  });

  it('returns code:rate-limit on 429', async () => {
    const fetchImpl = (async () => errorBody(429, 'slow down')) as unknown as typeof fetch;
    const r = await aiChat([{ role: 'user', content: 'x' }], {
      provider: 'anthropic',
      apiKey: 'k',
      model: 'claude-sonnet-4-6',
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('rate-limit');
  });

  it('returns code:invalid-response when content is empty', async () => {
    const fetchImpl = (async () => jsonResponse({ content: [] })) as unknown as typeof fetch;
    const r = await aiChat([{ role: 'user', content: 'x' }], {
      provider: 'anthropic',
      apiKey: 'k',
      model: 'claude-sonnet-4-6',
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('invalid-response');
  });
});

describe('aiChat — OpenAI-compatible', () => {
  it('uses the configured base URL and Bearer auth', async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      captured = { url: String(url), init: init ?? {} };
      return jsonResponse({
        choices: [{ message: { content: 'Hi back' } }],
        usage: { prompt_tokens: 5, completion_tokens: 4 },
      });
    }) as unknown as typeof fetch;
    const r = await aiChat([{ role: 'user', content: 'hi' }], {
      provider: 'openai-compatible',
      apiKey: 'sk-openai',
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.openai.com',
      fetchImpl,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.text).toBe('Hi back');
    expect(captured!.url).toBe('https://api.openai.com/v1/chat/completions');
    expect((captured!.init.headers as Record<string, string>)['authorization']).toBe('Bearer sk-openai');
  });

  it('omits Authorization header when key is empty (Ollama / LM Studio)', async () => {
    let captured: RequestInit | null = null;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      captured = init ?? {};
      return jsonResponse({
        choices: [{ message: { content: 'Hi' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
    }) as unknown as typeof fetch;
    const r = await aiChat([{ role: 'user', content: 'hi' }], {
      provider: 'openai-compatible',
      apiKey: '',
      model: 'llama3',
      baseUrl: 'http://localhost:11434',
      fetchImpl,
    });
    expect(r.ok).toBe(true);
    expect((captured!.headers as Record<string, string>)['authorization']).toBeUndefined();
  });

  it('strips trailing slash from baseUrl', async () => {
    let url = '';
    const fetchImpl = (async (u: string) => {
      url = String(u);
      return jsonResponse({
        choices: [{ message: { content: 'X' } }],
        usage: {},
      });
    }) as unknown as typeof fetch;
    await aiChat([{ role: 'user', content: 'x' }], {
      provider: 'openai-compatible',
      apiKey: 'k',
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.openai.com/',
      fetchImpl,
    });
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
  });
});

describe('aiVerify', () => {
  it('makes a tiny request and surfaces success', async () => {
    let body = '';
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      body = String(init?.body);
      return jsonResponse({
        content: [{ type: 'text', text: 'OK' }],
        usage: { input_tokens: 5, output_tokens: 1 },
      });
    }) as unknown as typeof fetch;
    const r = await aiVerify({
      provider: 'anthropic',
      apiKey: 'sk',
      model: 'claude-sonnet-4-6',
      fetchImpl,
    });
    expect(r.ok).toBe(true);
    expect(body).toContain('"max_tokens":8');
  });
});

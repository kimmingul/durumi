// LLM client for v0.1.8. Two providers, one shape:
//   • Anthropic Messages API (api.anthropic.com/v1/messages)
//   • OpenAI-compatible chat completions (covers OpenAI itself, Ollama with
//     OpenAI-compat mode, LM Studio, and any other compatible self-hosted
//     endpoint via a custom base URL)
//
// All calls live in main per the v0.1.6 architecture invariant: the
// renderer is network-isolated, the main process owns the API keys and
// the rate-limit / timeout / User-Agent posture.
//
// Token counts come from the provider's response when available so the UI
// can show "이번 호출 1,234 tokens" without estimating.

export type AiProvider = 'anthropic' | 'openai-compatible';

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiCallOptions {
  provider: AiProvider;
  apiKey: string;
  model: string;
  /** OpenAI-compatible only: custom base URL (covers Ollama, LM Studio). */
  baseUrl?: string;
  /** Hard cap on output. Defaults to 1024. */
  maxTokens?: number;
  temperature?: number;
  /** Test seam. */
  fetchImpl?: typeof fetch;
  /** Timeout in milliseconds; default 60s for slow first-token streaming. */
  timeoutMs?: number;
}

export interface AiCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AiCallError {
  ok: false;
  code: 'auth' | 'rate-limit' | 'timeout' | 'network' | 'invalid-response' | 'http';
  message: string;
}

export type AiCallResponse =
  | { ok: true; data: AiCallResult }
  | AiCallError;

const DEFAULT_TIMEOUT_MS = 60_000;
const DURUMI_VERSION = '0.1.8';

export async function aiChat(messages: AiMessage[], opts: AiCallOptions): Promise<AiCallResponse> {
  if (!opts.apiKey && opts.provider === 'anthropic') {
    return { ok: false, code: 'auth', message: 'no API key configured' };
  }
  if (opts.provider === 'anthropic') return callAnthropic(messages, opts);
  return callOpenAi(messages, opts);
}

// ---------------- Anthropic ----------------

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
}

async function callAnthropic(messages: AiMessage[], opts: AiCallOptions): Promise<AiCallResponse> {
  // Anthropic separates the system prompt from the message array; pull the
  // first system message out and feed the rest as user / assistant turns.
  const system = messages.find((m) => m.role === 'system')?.content;
  const turns = messages.filter((m) => m.role !== 'system');
  const body = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature,
    system,
    messages: turns,
  };
  return doFetch(
    'https://api.anthropic.com/v1/messages',
    {
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    JSON.stringify(body),
    opts,
    (json: unknown): AiCallResult | null => {
      const r = json as AnthropicResponse;
      if (r.error) throw new Error(r.error.message ?? r.error.type ?? 'anthropic error');
      const text = (r.content ?? [])
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('');
      if (!text) return null;
      return {
        text,
        inputTokens: r.usage?.input_tokens ?? 0,
        outputTokens: r.usage?.output_tokens ?? 0,
      };
    },
  );
}

// ---------------- OpenAI-compatible ----------------

interface OpenAiResponse {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; type?: string };
}

async function callOpenAi(messages: AiMessage[], opts: AiCallOptions): Promise<AiCallResponse> {
  const base = (opts.baseUrl ?? 'https://api.openai.com').replace(/\/+$/, '');
  const body = {
    model: opts.model,
    messages,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature,
  };
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  // Some compat servers (Ollama default) don't require auth; only send the
  // header when we actually have a key.
  if (opts.apiKey) headers['authorization'] = `Bearer ${opts.apiKey}`;
  return doFetch(
    `${base}/v1/chat/completions`,
    headers,
    JSON.stringify(body),
    opts,
    (json: unknown): AiCallResult | null => {
      const r = json as OpenAiResponse;
      if (r.error) throw new Error(r.error.message ?? r.error.type ?? 'openai error');
      const text = r.choices?.[0]?.message?.content ?? '';
      if (!text) return null;
      return {
        text,
        inputTokens: r.usage?.prompt_tokens ?? 0,
        outputTokens: r.usage?.completion_tokens ?? 0,
      };
    },
  );
}

// ---------------- Shared ----------------

async function doFetch(
  url: string,
  headers: Record<string, string>,
  body: string,
  opts: AiCallOptions,
  parse: (json: unknown) => AiCallResult | null,
): Promise<AiCallResponse> {
  const fetcher = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetcher !== 'function') {
    return { ok: false, code: 'network', message: 'fetch unavailable' };
  }
  const ua = `Durumi/${DURUMI_VERSION} (https://github.com/kimmingul/durumi)`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const r = await fetcher(url, {
      method: 'POST',
      headers: { ...headers, 'user-agent': ua },
      body,
      signal: controller.signal,
    });
    if (r.status === 401 || r.status === 403) {
      return { ok: false, code: 'auth', message: `HTTP ${r.status}` };
    }
    if (r.status === 429) {
      return { ok: false, code: 'rate-limit', message: 'rate limited' };
    }
    if (!r.ok) {
      const errText = await safeText(r);
      return {
        ok: false,
        code: 'http',
        message: `HTTP ${r.status} ${errText}`.trim().slice(0, 500),
      };
    }
    let json: unknown;
    try {
      json = await r.json();
    } catch (err) {
      return {
        ok: false,
        code: 'invalid-response',
        message: err instanceof Error ? err.message : 'json parse failed',
      };
    }
    try {
      const result = parse(json);
      if (!result) {
        return { ok: false, code: 'invalid-response', message: 'empty response text' };
      }
      return { ok: true, data: result };
    } catch (err) {
      return {
        ok: false,
        code: 'invalid-response',
        message: err instanceof Error ? err.message : 'parse failed',
      };
    }
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      return { ok: false, code: 'timeout', message: 'request timed out' };
    }
    return {
      ok: false,
      code: 'network',
      message: err instanceof Error ? err.message : 'network error',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function safeText(r: Response): Promise<string> {
  try { return await r.text(); }
  catch { return ''; }
}

/** Quick connectivity / auth check used by the Settings "verify" button. */
export async function aiVerify(opts: AiCallOptions): Promise<AiCallResponse> {
  const probe: AiMessage[] = [
    { role: 'user', content: 'Reply with the single word OK.' },
  ];
  return aiChat(probe, { ...opts, maxTokens: 8 });
}

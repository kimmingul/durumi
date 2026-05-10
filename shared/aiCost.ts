// Cost estimation table for the AI dashboard. Prices are USD per 1M tokens
// snapshotted at the time of v0.1.8.1 release; the user can override via
// Settings if a model isn't matched here. Local / self-hosted endpoints
// (Ollama / LM Studio) get a zero entry — no cloud cost — but token counts
// still surface in the dashboard so the user can monitor model usage.
//
// Matching is by case-insensitive substring of the configured model id;
// the FIRST match wins, so order entries from most-specific to least.

export interface ModelCost {
  /** Display label for the dashboard. */
  label: string;
  /** Substring matched against the configured model id (case-insensitive). */
  match: string;
  /** USD per million input tokens. */
  inputUsdPerM: number;
  /** USD per million output tokens. */
  outputUsdPerM: number;
}

export const MODEL_COSTS: ReadonlyArray<ModelCost> = [
  // Anthropic — Claude 4.x family.
  { label: 'Claude Opus 4.7',   match: 'opus-4-7',     inputUsdPerM: 15, outputUsdPerM: 75 },
  { label: 'Claude Opus 4',     match: 'opus-4',       inputUsdPerM: 15, outputUsdPerM: 75 },
  { label: 'Claude Sonnet 4.6', match: 'sonnet-4-6',   inputUsdPerM: 3,  outputUsdPerM: 15 },
  { label: 'Claude Sonnet 4',   match: 'sonnet-4',     inputUsdPerM: 3,  outputUsdPerM: 15 },
  { label: 'Claude Haiku 4.5',  match: 'haiku-4-5',    inputUsdPerM: 1,  outputUsdPerM: 5 },
  { label: 'Claude Haiku 4',    match: 'haiku-4',      inputUsdPerM: 1,  outputUsdPerM: 5 },
  { label: 'Claude (other)',    match: 'claude',       inputUsdPerM: 3,  outputUsdPerM: 15 },
  // OpenAI — common chat models.
  { label: 'GPT-4o-mini',       match: 'gpt-4o-mini',  inputUsdPerM: 0.15, outputUsdPerM: 0.6 },
  { label: 'GPT-4o',            match: 'gpt-4o',       inputUsdPerM: 2.5,  outputUsdPerM: 10 },
  { label: 'GPT-4-turbo',       match: 'gpt-4-turbo',  inputUsdPerM: 10,   outputUsdPerM: 30 },
  { label: 'GPT-4.1-mini',      match: 'gpt-4.1-mini', inputUsdPerM: 0.4,  outputUsdPerM: 1.6 },
  { label: 'GPT-4.1',           match: 'gpt-4.1',      inputUsdPerM: 2,    outputUsdPerM: 8 },
  { label: 'GPT-3.5-turbo',     match: 'gpt-3.5',      inputUsdPerM: 0.5,  outputUsdPerM: 1.5 },
  // Local / self-hosted catch-alls — zero cost, surface usage anyway.
  { label: 'Local (Ollama)',    match: 'llama',        inputUsdPerM: 0, outputUsdPerM: 0 },
  { label: 'Local (Mistral)',   match: 'mistral',      inputUsdPerM: 0, outputUsdPerM: 0 },
  { label: 'Local (Qwen)',      match: 'qwen',         inputUsdPerM: 0, outputUsdPerM: 0 },
];

/**
 * Estimate the USD cost of a single call. Matches the model id against
 * MODEL_COSTS from most specific to least. Returns 0 when nothing matches
 * — better to under-report than to scare the user with a guess.
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): { usd: number; matched: ModelCost | null } {
  const matched = matchModel(model);
  if (!matched) return { usd: 0, matched: null };
  const usd =
    (inputTokens / 1_000_000) * matched.inputUsdPerM +
    (outputTokens / 1_000_000) * matched.outputUsdPerM;
  return { usd, matched };
}

export function matchModel(model: string): ModelCost | null {
  const lower = (model ?? '').toLowerCase();
  for (const c of MODEL_COSTS) {
    if (lower.includes(c.match)) return c;
  }
  return null;
}

/** Format a USD amount with the right precision for cents-fraction values. */
export function formatUsd(usd: number): string {
  if (usd === 0) return '$0';
  if (usd < 0.001) return '<$0.001';
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

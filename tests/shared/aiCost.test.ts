import { describe, it, expect } from 'vitest';
import {
  estimateCost,
  formatTokens,
  formatUsd,
  matchModel,
} from '../../shared/aiCost';

describe('matchModel', () => {
  it('matches Claude Opus 4.7', () => {
    expect(matchModel('claude-opus-4-7')?.label).toBe('Claude Opus 4.7');
  });

  it('matches Claude Sonnet 4.6', () => {
    expect(matchModel('claude-sonnet-4-6')?.label).toBe('Claude Sonnet 4.6');
  });

  it('matches Claude Haiku 4.5 with date suffix', () => {
    expect(matchModel('claude-haiku-4-5-20251001')?.label).toBe('Claude Haiku 4.5');
  });

  it('falls back to "Claude (other)" for unknown Claude models', () => {
    expect(matchModel('claude-some-future-model')?.label).toBe('Claude (other)');
  });

  it('matches gpt-4o-mini specifically over gpt-4o', () => {
    expect(matchModel('gpt-4o-mini')?.label).toBe('GPT-4o-mini');
  });

  it('matches gpt-4o', () => {
    expect(matchModel('gpt-4o')?.label).toBe('GPT-4o');
  });

  it('returns null for entirely unknown model id', () => {
    expect(matchModel('totally-unknown-2099')).toBeNull();
  });

  it('matches local llama with zero cost', () => {
    const m = matchModel('llama3:latest');
    expect(m?.label).toBe('Local (Ollama)');
    expect(m?.inputUsdPerM).toBe(0);
  });
});

describe('estimateCost', () => {
  it('computes USD per million tokens for Claude Sonnet', () => {
    const r = estimateCost('claude-sonnet-4-6', 1_000_000, 0);
    expect(r.usd).toBe(3);
  });

  it('combines input and output costs', () => {
    const r = estimateCost('gpt-4o', 1_000_000, 1_000_000);
    expect(r.usd).toBe(2.5 + 10);
  });

  it('returns 0 for zero tokens regardless of model', () => {
    expect(estimateCost('claude-opus-4-7', 0, 0).usd).toBe(0);
  });

  it('returns 0 for unknown model (under-report rather than guess)', () => {
    expect(estimateCost('mystery-model', 1_000_000, 1_000_000).usd).toBe(0);
  });

  it('returns 0 for local Ollama models', () => {
    expect(estimateCost('llama3', 999_999, 999_999).usd).toBe(0);
  });
});

describe('formatUsd', () => {
  it('formats zero specially', () => {
    expect(formatUsd(0)).toBe('$0');
  });

  it('clamps tiny amounts', () => {
    expect(formatUsd(0.0001)).toBe('<$0.001');
  });

  it('shows 4 decimals under $1', () => {
    expect(formatUsd(0.1234567)).toBe('$0.1235');
  });

  it('shows 2 decimals over $1', () => {
    expect(formatUsd(12.3456)).toBe('$12.35');
  });
});

describe('formatTokens', () => {
  it('passes small numbers through', () => {
    expect(formatTokens(42)).toBe('42');
    expect(formatTokens(999)).toBe('999');
  });

  it('shows K for thousands', () => {
    expect(formatTokens(1500)).toBe('1.5K');
    expect(formatTokens(999_999)).toBe('1000.0K');
  });

  it('shows M for millions', () => {
    expect(formatTokens(1_500_000)).toBe('1.50M');
  });
});

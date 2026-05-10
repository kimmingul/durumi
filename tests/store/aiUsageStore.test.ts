import { describe, it, expect, beforeEach } from 'vitest';
import { useAiUsageStore } from '../../src/store/aiUsageStore';

beforeEach(() => {
  localStorage.clear();
  // Reset state to a known baseline that mirrors a fresh load.
  useAiUsageStore.setState({
    recent: [],
    byModel: {},
    bySource: {
      palette: { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 },
      citeSuggest: { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 },
      ghostText: { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 },
      verify: { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 },
      other: { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 },
    },
    total: { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 },
    sessionCalls: 0,
  });
});

describe('aiUsageStore', () => {
  it('records a usage entry and updates per-model totals', () => {
    useAiUsageStore.getState().recordUsage({
      model: 'claude-sonnet-4-6',
      inputTokens: 1000,
      outputTokens: 500,
      source: 'palette',
    });
    const s = useAiUsageStore.getState();
    expect(s.recent).toHaveLength(1);
    expect(s.recent[0]?.model).toBe('claude-sonnet-4-6');
    expect(s.byModel['claude-sonnet-4-6']?.calls).toBe(1);
    expect(s.byModel['claude-sonnet-4-6']?.inputTokens).toBe(1000);
    // 1000 input * $3/M + 500 output * $15/M = $0.003 + $0.0075 = $0.0105
    expect(s.byModel['claude-sonnet-4-6']?.costUsd).toBeCloseTo(0.0105, 6);
  });

  it('aggregates totals across multiple calls', () => {
    const r = useAiUsageStore.getState().recordUsage;
    r({ model: 'claude-sonnet-4-6', inputTokens: 100, outputTokens: 50, source: 'palette' });
    r({ model: 'claude-sonnet-4-6', inputTokens: 200, outputTokens: 100, source: 'palette' });
    r({ model: 'gpt-4o-mini', inputTokens: 1000, outputTokens: 500, source: 'citeSuggest' });
    const s = useAiUsageStore.getState();
    expect(s.total.calls).toBe(3);
    expect(s.byModel['claude-sonnet-4-6']?.calls).toBe(2);
    expect(s.byModel['gpt-4o-mini']?.calls).toBe(1);
    expect(s.bySource.palette.calls).toBe(2);
    expect(s.bySource.citeSuggest.calls).toBe(1);
  });

  it('increments sessionCalls per recordUsage', () => {
    expect(useAiUsageStore.getState().sessionCalls).toBe(0);
    useAiUsageStore.getState().recordUsage({
      model: 'gpt-4o',
      inputTokens: 10,
      outputTokens: 5,
      source: 'palette',
    });
    expect(useAiUsageStore.getState().sessionCalls).toBe(1);
  });

  it('persists to localStorage so the next load picks up totals', () => {
    useAiUsageStore.getState().recordUsage({
      model: 'claude-haiku-4-5',
      inputTokens: 500,
      outputTokens: 100,
      source: 'palette',
    });
    const stored = JSON.parse(localStorage.getItem('durumi.ai.usage.v1') ?? '{}');
    expect(stored.total?.calls).toBe(1);
    expect(stored.byModel?.['claude-haiku-4-5']?.inputTokens).toBe(500);
  });

  it('reset wipes recent + totals + persists the empty state', () => {
    useAiUsageStore.getState().recordUsage({
      model: 'gpt-4o',
      inputTokens: 100,
      outputTokens: 50,
      source: 'palette',
    });
    useAiUsageStore.getState().reset();
    const s = useAiUsageStore.getState();
    expect(s.recent).toEqual([]);
    expect(s.total.calls).toBe(0);
    expect(s.sessionCalls).toBe(0);
    expect(JSON.parse(localStorage.getItem('durumi.ai.usage.v1') ?? '{}').total?.calls).toBe(0);
  });

  it('caps the recent log at 200 entries', () => {
    const r = useAiUsageStore.getState().recordUsage;
    for (let i = 0; i < 205; i++) {
      r({ model: 'gpt-4o-mini', inputTokens: 1, outputTokens: 1, source: 'palette' });
    }
    expect(useAiUsageStore.getState().recent.length).toBe(200);
  });

  it('honours an explicit costUsd override (skips estimateCost)', () => {
    useAiUsageStore.getState().recordUsage({
      model: 'whatever',
      inputTokens: 1000,
      outputTokens: 1000,
      source: 'palette',
      costUsd: 1.23,
    });
    expect(useAiUsageStore.getState().total.costUsd).toBe(1.23);
  });
});

import { create } from 'zustand';
import { estimateCost } from '@shared/aiCost';

// Session + lifetime AI usage, persisted to localStorage so cross-session
// totals survive an app restart. Per-call entries are kept in a rolling
// log (latest 200) so the Settings dashboard can show recent activity
// without bloating storage.
//
// The store is the single recording site: AiCommandPalette,
// CitationSuggestPanel, and (Track C) the ghost-text extension all call
// `recordUsage` after every successful aiChat. window.api.aiChat itself
// stays untouched — we record at the call site so the same shape works
// for tests / future tools.

const LOCAL_KEY = 'durumi.ai.usage.v1';
const RECENT_LIMIT = 200;

export interface UsageEntry {
  /** ISO timestamp of the call. */
  ts: string;
  /** Free-form model id (e.g. `claude-sonnet-4-6`, `gpt-4o-mini`). */
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Estimated USD cost at the time of the call. May be 0 for local. */
  costUsd: number;
  /** Where the call came from — useful for the dashboard breakdown. */
  source: 'palette' | 'citeSuggest' | 'ghostText' | 'verify' | 'other';
}

export interface ModelTotals {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  calls: number;
}

interface AiUsageState {
  /** Last 200 calls (most recent first). */
  recent: UsageEntry[];
  /** Per-model lifetime totals. */
  byModel: Record<string, ModelTotals>;
  /** Per-source lifetime totals. */
  bySource: Record<UsageEntry['source'], ModelTotals>;
  /** Lifetime grand totals. */
  total: ModelTotals;
  /** Calls made since the current process started. */
  sessionCalls: number;

  recordUsage: (
    args: Omit<UsageEntry, 'ts' | 'costUsd'> & { costUsd?: number },
  ) => void;
  reset: () => void;
}

function emptyTotals(): ModelTotals {
  return { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 };
}

function emptyBySource(): Record<UsageEntry['source'], ModelTotals> {
  return {
    palette: emptyTotals(),
    citeSuggest: emptyTotals(),
    ghostText: emptyTotals(),
    verify: emptyTotals(),
    other: emptyTotals(),
  };
}

interface PersistedShape {
  recent: UsageEntry[];
  byModel: Record<string, ModelTotals>;
  bySource: Record<UsageEntry['source'], ModelTotals>;
  total: ModelTotals;
}

function loadPersisted(): PersistedShape {
  if (typeof localStorage === 'undefined') {
    return { recent: [], byModel: {}, bySource: emptyBySource(), total: emptyTotals() };
  }
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return { recent: [], byModel: {}, bySource: emptyBySource(), total: emptyTotals() };
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;
    return {
      recent: parsed.recent ?? [],
      byModel: parsed.byModel ?? {},
      bySource: { ...emptyBySource(), ...(parsed.bySource ?? {}) },
      total: parsed.total ?? emptyTotals(),
    };
  } catch {
    return { recent: [], byModel: {}, bySource: emptyBySource(), total: emptyTotals() };
  }
}

function persist(state: PersistedShape): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or storage disabled — drop silently rather than
    // breaking the AI flow over a usage log.
  }
}

const initial = loadPersisted();

export const useAiUsageStore = create<AiUsageState>((set, get) => ({
  recent: initial.recent,
  byModel: initial.byModel,
  bySource: initial.bySource,
  total: initial.total,
  sessionCalls: 0,

  recordUsage: ({ model, inputTokens, outputTokens, source, costUsd }) => {
    const cost = costUsd ?? estimateCost(model, inputTokens, outputTokens).usd;
    const entry: UsageEntry = {
      ts: new Date().toISOString(),
      model,
      inputTokens,
      outputTokens,
      costUsd: cost,
      source,
    };
    const next: PersistedShape = {
      recent: [entry, ...get().recent].slice(0, RECENT_LIMIT),
      byModel: addToModel(get().byModel, model, entry),
      bySource: addToSource(get().bySource, source, entry),
      total: addToTotal(get().total, entry),
    };
    set({
      ...next,
      sessionCalls: get().sessionCalls + 1,
    });
    persist(next);
  },

  reset: () => {
    const blank: PersistedShape = {
      recent: [],
      byModel: {},
      bySource: emptyBySource(),
      total: emptyTotals(),
    };
    set({ ...blank, sessionCalls: 0 });
    persist(blank);
  },
}));

function addToModel(
  prev: Record<string, ModelTotals>,
  model: string,
  e: UsageEntry,
): Record<string, ModelTotals> {
  const cur = prev[model] ?? emptyTotals();
  return {
    ...prev,
    [model]: {
      inputTokens: cur.inputTokens + e.inputTokens,
      outputTokens: cur.outputTokens + e.outputTokens,
      costUsd: cur.costUsd + e.costUsd,
      calls: cur.calls + 1,
    },
  };
}

function addToSource(
  prev: Record<UsageEntry['source'], ModelTotals>,
  source: UsageEntry['source'],
  e: UsageEntry,
): Record<UsageEntry['source'], ModelTotals> {
  const cur = prev[source] ?? emptyTotals();
  return {
    ...prev,
    [source]: {
      inputTokens: cur.inputTokens + e.inputTokens,
      outputTokens: cur.outputTokens + e.outputTokens,
      costUsd: cur.costUsd + e.costUsd,
      calls: cur.calls + 1,
    },
  };
}

function addToTotal(prev: ModelTotals, e: UsageEntry): ModelTotals {
  return {
    inputTokens: prev.inputTokens + e.inputTokens,
    outputTokens: prev.outputTokens + e.outputTokens,
    costUsd: prev.costUsd + e.costUsd,
    calls: prev.calls + 1,
  };
}

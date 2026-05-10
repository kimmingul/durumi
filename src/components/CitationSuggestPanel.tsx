import { useEffect, useState } from 'react';
import { t } from '../i18n/t';
import { useBibliographyStore } from '../store/bibliographyStore';
import { useAiUsageStore } from '../store/aiUsageStore';
import {
  buildCitationSuggestPrompt,
  parseCitationSuggestion,
  type CitationSuggestion,
  type EnrichedEntry,
} from '@shared/aiCitationSuggest';

// Citation suggestion modal: shows the current paragraph + AI-suggested
// `[@key]` insertions with one-sentence rationales. The user accepts a
// suggestion → it's appended to the paragraph (via the parent's onInsert).
//
// We never auto-edit the paragraph. The user always sees what's about
// to change; rejection is the silent default.

export interface CitationSuggestPanelProps {
  open: boolean;
  paragraph: string;
  /** True when at least one provider has a key. UI gates on this. */
  hasKey: boolean;
  onClose: () => void;
  /** Called with the cite-key the user accepted (caller inserts `[@key]`). */
  onAccept: (key: string) => void;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'enriching' }
  | { kind: 'running' }
  | { kind: 'result'; suggestion: CitationSuggestion; tokens: { input: number; output: number }; enriched: number }
  | { kind: 'error'; message: string };

export function CitationSuggestPanel(props: CitationSuggestPanelProps) {
  const { open, paragraph, hasKey, onClose, onAccept } = props;
  const entries = useBibliographyStore((s) => s.entries);
  const filePath = useBibliographyStore((s) => s.filePath);
  const fileStatus = useBibliographyStore((s) => s.fileStatus);
  const recordUsage = useAiUsageStore((s) => s.recordUsage);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  useEffect(() => {
    if (!open) return;
    setPhase({ kind: 'idle' });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function run() {
    setPhase({ kind: 'enriching' });
    // v0.1.8.2: enrich entries with the first few pages of any local
    // PDF or markdown file the user has saved. This is a best-effort
    // step — if extraction fails or the entry has no local file, we
    // fall back to the abstract-only path that v0.1.8 used.
    const enrichedEntries = await enrichEntriesWithLocalText(entries, filePath, fileStatus);
    setPhase({ kind: 'running' });
    const messages = buildCitationSuggestPrompt(paragraph, enrichedEntries);
    const r = await window.api.aiChat(messages);
    if (!r.ok) {
      setPhase({ kind: 'error', message: r.message });
      return;
    }
    const prefs = await window.api.prefsGet();
    const model =
      prefs.ai?.provider === 'anthropic'
        ? prefs.ai.anthropicModel
        : prefs.ai?.openaiModel ?? 'unknown';
    recordUsage({
      model,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      source: 'citeSuggest',
    });
    const validKeys = new Set(entries.map((e) => e.key));
    const suggestion = parseCitationSuggestion(r.text, validKeys);
    const enrichedCount = enrichedEntries.filter((e) => e.localText && e.localText.length > 0).length;
    setPhase({
      kind: 'result',
      suggestion,
      tokens: { input: r.inputTokens, output: r.outputTokens },
      enriched: enrichedCount,
    });
  }

  return (
    <div
      style={backdropStyle}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="cite-suggest-backdrop"
    >
      <div
        style={cardStyle}
        role="dialog"
        aria-label={t('ai.citeSuggest.title')}
        data-testid="cite-suggest"
        onClick={(e) => e.stopPropagation()}
      >
        <header style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
            {t('ai.citeSuggest.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('settings.close')}
            style={closeBtnStyle}
          >×</button>
        </header>
        <div style={bodyStyle}>
          {!hasKey ? (
            <div style={emptyStyle} data-testid="cite-suggest-no-key">
              {t('ai.palette.noKey')}
            </div>
          ) : entries.length === 0 ? (
            <div style={emptyStyle} data-testid="cite-suggest-no-entries">
              {t('ai.citeSuggest.noEntries')}
            </div>
          ) : !paragraph.trim() ? (
            <div style={emptyStyle} data-testid="cite-suggest-no-paragraph">
              {t('ai.citeSuggest.noParagraph')}
            </div>
          ) : (
            <>
              <div>
                <div style={labelStyle}>{t('ai.citeSuggest.paragraph')}</div>
                <pre style={paragraphStyle} data-testid="cite-suggest-paragraph">{paragraph}</pre>
              </div>
              {phase.kind === 'idle' && (
                <button
                  type="button"
                  onClick={() => { void run(); }}
                  style={primaryBtnStyle}
                  data-testid="cite-suggest-run"
                >
                  {t('ai.citeSuggest.run', { count: String(entries.length) })}
                </button>
              )}
              {phase.kind === 'enriching' && (
                <div style={emptyStyle} data-testid="cite-suggest-enriching">
                  {t('ai.citeSuggest.enriching')}
                </div>
              )}
              {phase.kind === 'running' && (
                <div style={emptyStyle}>{t('ai.citeSuggest.running')}</div>
              )}
              {phase.kind === 'error' && (
                <div style={errorStyle} data-testid="cite-suggest-error">{phase.message}</div>
              )}
              {phase.kind === 'result' && (
                <ResultView
                  suggestion={phase.suggestion}
                  tokens={phase.tokens}
                  enriched={phase.enriched}
                  onAccept={onAccept}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Walk the entries list and request a text excerpt for any entry whose
 * `file` field resolves to a local file Track B (download) or Track C
 * (registration) wrote into `<bib-dir>/reference/`. Failures and
 * missing files are silently skipped — the model just falls back to
 * the abstract-only path for those entries.
 *
 * Hard cap: at most 30 entries get enriched per call to keep the
 * extraction phase predictable. Anything beyond that goes in
 * abstract-only.
 */
async function enrichEntriesWithLocalText(
  entries: ReadonlyArray<import('@shared/bibtex').BibEntry>,
  bibFilePath: string | null,
  fileStatus: Record<string, { exists: boolean; relPath: string | null; type: 'pdf' | 'md' | null }>,
): Promise<EnrichedEntry[]> {
  if (!bibFilePath) return entries.map((entry) => ({ entry }));
  const out: EnrichedEntry[] = [];
  let enriched = 0;
  const ENRICH_CAP = 30;
  for (const entry of entries) {
    const status = fileStatus[entry.key];
    if (!status?.exists || !status.relPath || enriched >= ENRICH_CAP) {
      out.push({ entry });
      continue;
    }
    try {
      const r = await window.api.referenceExtractText(bibFilePath, status.relPath, {
        maxPages: 3,
        maxChars: 1500,
      });
      if (r.ok && r.text.length > 0) {
        out.push({ entry, localText: r.text });
        enriched++;
      } else {
        out.push({ entry });
      }
    } catch {
      out.push({ entry });
    }
  }
  return out;
}

function ResultView({
  suggestion,
  tokens,
  enriched,
  onAccept,
}: {
  suggestion: CitationSuggestion;
  tokens: { input: number; output: number };
  enriched: number;
  onAccept: (key: string) => void;
}) {
  if (suggestion.candidates.length === 0) {
    return (
      <div data-testid="cite-suggest-empty">
        <div style={emptyStyle}>{t('ai.citeSuggest.empty')}</div>
        {suggestion.notes && (
          <p style={{ ...emptyStyle, fontStyle: 'italic' }}>{suggestion.notes}</p>
        )}
        <div style={{ fontSize: 11, textAlign: 'right', color: 'var(--muted-fg, #6a6a6a)' }}>
          {tokens.input}+{tokens.output} tokens
          {enriched > 0 && ` · ${t('ai.citeSuggest.enrichedCount', { n: String(enriched) })}`}
        </div>
      </div>
    );
  }
  return (
    <div data-testid="cite-suggest-result">
      <div style={labelStyle}>
        {t('ai.citeSuggest.candidates')} ({suggestion.candidates.length})
        {enriched > 0 && (
          <span style={{ fontWeight: 400, fontSize: 10, marginLeft: 8 }}>
            · {t('ai.citeSuggest.enrichedCount', { n: String(enriched) })}
          </span>
        )}
      </div>
      <ul style={listStyle}>
        {suggestion.candidates.map((c) => (
          <li key={c.key} style={candidateStyle} data-testid="cite-suggest-candidate">
            <div style={{ fontWeight: 600, fontFamily: 'var(--mono, ui-monospace, monospace)', fontSize: 12 }}>
              [@{c.key}]
            </div>
            <div style={{ fontSize: 12, marginTop: 2 }}>{c.rationale}</div>
            {c.anchor && (
              <div style={{ fontSize: 11, marginTop: 2, color: 'var(--muted-fg, #6a6a6a)' }}>
                {t('ai.citeSuggest.anchor')}: <em>{c.anchor}</em>
              </div>
            )}
            <button
              type="button"
              onClick={() => onAccept(c.key)}
              style={{ ...primaryBtnStyle, marginTop: 6, padding: '4px 10px' }}
              data-testid="cite-suggest-accept"
            >
              {t('ai.citeSuggest.accept')}
            </button>
          </li>
        ))}
      </ul>
      {suggestion.notes && (
        <p style={{ fontSize: 12, marginTop: 8, fontStyle: 'italic', color: 'var(--muted-fg, #6a6a6a)' }}>
          {suggestion.notes}
        </p>
      )}
      <div style={{ fontSize: 11, textAlign: 'right', color: 'var(--muted-fg, #6a6a6a)' }}>
        {tokens.input}+{tokens.output} tokens
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.45)',
  zIndex: 9100,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: '10vh',
};
const cardStyle: React.CSSProperties = {
  background: 'var(--bg, #fff)',
  color: 'var(--fg, #111)',
  borderRadius: 8,
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.35)',
  width: 'min(680px, 92vw)',
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  fontSize: 14,
};
const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 14px',
  borderBottom: '1px solid var(--border, #e2e2e2)',
};
const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  fontSize: 18,
  lineHeight: 1,
  cursor: 'pointer',
  color: 'inherit',
  padding: '0 4px',
};
const bodyStyle: React.CSSProperties = {
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  overflowY: 'auto',
};
const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  color: 'var(--muted-fg, #6a6a6a)',
  marginBottom: 4,
};
const paragraphStyle: React.CSSProperties = {
  margin: 0,
  padding: '8px 10px',
  background: 'var(--code-bg, #f5f5f5)',
  borderRadius: 4,
  whiteSpace: 'pre-wrap',
  fontSize: 13,
  fontFamily: 'inherit',
  maxHeight: 140,
  overflowY: 'auto',
};
const emptyStyle: React.CSSProperties = {
  padding: '14px',
  textAlign: 'center',
  fontSize: 13,
  color: 'var(--muted-fg, #6a6a6a)',
};
const errorStyle: React.CSSProperties = {
  padding: '10px',
  fontSize: 13,
  color: 'var(--cm-error-fg, #8a1f17)',
  background: 'var(--cm-error-bg, #fff0ee)',
  borderRadius: 4,
};
const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const candidateStyle: React.CSSProperties = {
  border: '1px solid var(--border, #e2e2e2)',
  borderRadius: 4,
  padding: '8px 10px',
  background: 'var(--bg)',
};
const primaryBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 4,
  border: '1px solid var(--accent, #4a90e2)',
  background: 'var(--accent, #4a90e2)',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 13,
};

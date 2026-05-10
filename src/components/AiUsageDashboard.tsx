import { t } from '../i18n/t';
import { formatTokens, formatUsd, matchModel } from '@shared/aiCost';
import { useAiUsageStore } from '../store/aiUsageStore';

// Compact dashboard that lives inside the Settings dialog. Shows lifetime
// totals, per-model breakdown, per-source breakdown, and a Reset button.
// All numbers come from useAiUsageStore (localStorage-backed). The user
// is the only writer; this view never makes an LLM call itself.

export function AiUsageDashboard() {
  const total = useAiUsageStore((s) => s.total);
  const byModel = useAiUsageStore((s) => s.byModel);
  const bySource = useAiUsageStore((s) => s.bySource);
  const sessionCalls = useAiUsageStore((s) => s.sessionCalls);
  const recent = useAiUsageStore((s) => s.recent);
  const reset = useAiUsageStore((s) => s.reset);

  const modelRows = Object.entries(byModel).sort(
    ([, a], [, b]) => b.costUsd - a.costUsd,
  );
  const sourceRows = (Object.keys(bySource) as Array<keyof typeof bySource>)
    .map((src) => [src, bySource[src]] as const)
    .filter(([, totals]) => totals.calls > 0)
    .sort(([, a], [, b]) => b.calls - a.calls);

  return (
    <div style={wrap} data-testid="ai-usage-dashboard">
      <div style={summaryRow}>
        <Pill
          label={t('ai.usage.calls')}
          value={`${total.calls} (${sessionCalls} ${t('ai.usage.thisSession')})`}
        />
        <Pill
          label={t('ai.usage.tokens')}
          value={`${formatTokens(total.inputTokens)} in · ${formatTokens(total.outputTokens)} out`}
        />
        <Pill
          label={t('ai.usage.cost')}
          value={formatUsd(total.costUsd)}
          accent={total.costUsd > 1 ? 'warn' : 'normal'}
        />
      </div>

      {modelRows.length > 0 && (
        <section>
          <h4 style={sectionHead}>{t('ai.usage.byModel')}</h4>
          <table style={tableStyle}>
            <thead>
              <tr style={thRow}>
                <th style={thLeft}>{t('ai.usage.model')}</th>
                <th style={thRight}>{t('ai.usage.calls')}</th>
                <th style={thRight}>in/out tokens</th>
                <th style={thRight}>{t('ai.usage.cost')}</th>
              </tr>
            </thead>
            <tbody>
              {modelRows.map(([model, totals]) => {
                const cost = matchModel(model);
                return (
                  <tr key={model} data-testid="ai-usage-model-row">
                    <td style={tdLeft}>
                      <code style={modelLabel}>{model}</code>
                      {cost && (
                        <span style={modelHint}>{cost.label}</span>
                      )}
                    </td>
                    <td style={tdRight}>{totals.calls}</td>
                    <td style={tdRight}>
                      {formatTokens(totals.inputTokens)} / {formatTokens(totals.outputTokens)}
                    </td>
                    <td style={tdRight}>{formatUsd(totals.costUsd)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {sourceRows.length > 0 && (
        <section>
          <h4 style={sectionHead}>{t('ai.usage.bySource')}</h4>
          <table style={tableStyle}>
            <thead>
              <tr style={thRow}>
                <th style={thLeft}>{t('ai.usage.source')}</th>
                <th style={thRight}>{t('ai.usage.calls')}</th>
                <th style={thRight}>tokens</th>
                <th style={thRight}>{t('ai.usage.cost')}</th>
              </tr>
            </thead>
            <tbody>
              {sourceRows.map(([source, totals]) => (
                <tr key={source} data-testid="ai-usage-source-row">
                  <td style={tdLeft}>{t(`ai.usage.source.${source}`)}</td>
                  <td style={tdRight}>{totals.calls}</td>
                  <td style={tdRight}>
                    {formatTokens(totals.inputTokens + totals.outputTokens)}
                  </td>
                  <td style={tdRight}>{formatUsd(totals.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {recent.length === 0 ? (
        <p style={emptyStyle}>{t('ai.usage.empty')}</p>
      ) : (
        <details>
          <summary style={summaryStyle}>
            {t('ai.usage.recent')} ({recent.length})
          </summary>
          <ul style={recentList}>
            {recent.slice(0, 20).map((r, i) => (
              <li key={`${r.ts}:${i}`} style={recentItem}>
                <span style={recentTs}>{r.ts.slice(0, 19).replace('T', ' ')}</span>
                <code style={modelLabel}>{r.model}</code>
                <span style={recentCounts}>
                  {r.inputTokens}+{r.outputTokens}
                </span>
                <span style={recentCost}>{formatUsd(r.costUsd)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div style={footerRow}>
        <button
          type="button"
          onClick={() => {
            // eslint-disable-next-line no-alert
            if (window.confirm(t('ai.usage.reset.confirm'))) reset();
          }}
          style={resetBtn}
          data-testid="ai-usage-reset"
        >{t('ai.usage.reset')}</button>
      </div>
    </div>
  );
}

function Pill({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'warn' | 'normal';
}) {
  const bg = accent === 'warn' ? 'var(--cm-warn-bg, #fff8e6)' : 'var(--code-bg, #f4f4f4)';
  const color = accent === 'warn' ? 'var(--cm-warn-fg, #8a5a17)' : 'inherit';
  return (
    <span style={{ ...pillStyle, background: bg, color }}>
      <span style={pillLabel}>{label}</span>
      <span style={pillValue}>{value}</span>
    </span>
  );
}

const wrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};
const summaryRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};
const pillStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  padding: '6px 10px',
  borderRadius: 6,
  fontSize: 12,
};
const pillLabel: React.CSSProperties = {
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  fontSize: 10,
  color: 'var(--muted-fg, #6a6a6a)',
};
const pillValue: React.CSSProperties = {
  fontWeight: 600,
  marginTop: 2,
};
const sectionHead: React.CSSProperties = {
  margin: '4px 0 6px',
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--muted-fg, #6a6a6a)',
};
const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
};
const thRow: React.CSSProperties = {
  borderBottom: '1px solid var(--border, #e2e2e2)',
};
const thLeft: React.CSSProperties = {
  textAlign: 'left',
  padding: '4px 6px',
  fontWeight: 600,
  color: 'var(--muted-fg, #6a6a6a)',
};
const thRight: React.CSSProperties = {
  textAlign: 'right',
  padding: '4px 6px',
  fontWeight: 600,
  color: 'var(--muted-fg, #6a6a6a)',
};
const tdLeft: React.CSSProperties = {
  textAlign: 'left',
  padding: '4px 6px',
};
const tdRight: React.CSSProperties = {
  textAlign: 'right',
  padding: '4px 6px',
  fontVariantNumeric: 'tabular-nums',
};
const modelLabel: React.CSSProperties = {
  fontFamily: 'var(--mono, ui-monospace, monospace)',
  fontSize: 11,
};
const modelHint: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--muted-fg, #6a6a6a)',
  marginLeft: 6,
};
const emptyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: 'var(--muted-fg, #6a6a6a)',
  fontStyle: 'italic',
};
const summaryStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};
const recentList: React.CSSProperties = {
  listStyle: 'none',
  margin: '6px 0 0',
  padding: 0,
  fontSize: 11,
  fontFamily: 'var(--mono, ui-monospace, monospace)',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};
const recentItem: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '120px auto 1fr 60px',
  gap: 6,
  alignItems: 'center',
};
const recentTs: React.CSSProperties = { color: 'var(--muted-fg, #6a6a6a)' };
const recentCounts: React.CSSProperties = { color: 'var(--muted-fg, #6a6a6a)' };
const recentCost: React.CSSProperties = { textAlign: 'right' };
const footerRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
};
const resetBtn: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 4,
  border: '1px solid var(--border, #c8c8c8)',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 12,
};

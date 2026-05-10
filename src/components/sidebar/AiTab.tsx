import { useEffect, useState } from 'react';
import { useLanguage, t } from '../../i18n/t';
import { useAiUsageStore } from '../../store/aiUsageStore';
import { formatTokens, formatUsd } from '@shared/aiCost';
import { AI_COMMANDS } from '@shared/aiPrompts';

// Single-pane AI surface that consolidates v0.1.8 / v0.1.8.1 entry points
// the user previously had to hunt through the 검토 menu for:
//   • Quick selection commands (Polish English, Tighten, …)
//   • Suggest citations for the current paragraph
//   • Insert citation from DOI
//   • Session usage / cost summary (lifetime in Settings)
//   • Provider status with one-click Settings shortcut
//
// All actions dispatch through the existing window events / menu
// commands the App-level listener already handles, so no new wiring is
// needed beyond rendering the panel.

export interface AiTabProps {
  /** Currently selected text in the editor (may be empty). */
  selectionText: string;
  /** Open the existing AI command palette pre-targeted at the selection. */
  onOpenPalette: () => void;
  /** Open the citation-suggest panel. */
  onSuggestCitations: () => void;
  /** Open the DOI-insert modal. */
  onInsertCitationFromDoi: () => void;
  /** Open the Settings dialog directly. */
  onOpenSettings: () => void;
}

export function AiTab(props: AiTabProps) {
  useLanguage();
  const total = useAiUsageStore((s) => s.total);
  const sessionCalls = useAiUsageStore((s) => s.sessionCalls);
  const recent = useAiUsageStore((s) => s.recent);
  const [provider, setProvider] = useState<{
    provider: 'anthropic' | 'openai-compatible';
    model: string;
    hasKey: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadProvider() {
      const prefs = await window.api.prefsGet();
      const p = prefs.ai?.provider ?? 'anthropic';
      const model = p === 'anthropic'
        ? prefs.ai?.anthropicModel ?? '—'
        : prefs.ai?.openaiModel ?? '—';
      const hasKey = await window.api.aiHasKey(p);
      if (!cancelled) setProvider({ provider: p, model, hasKey });
    }
    void loadProvider();
    return () => { cancelled = true; };
  }, [total.calls]); // refresh after each call

  const hasSelection = selectionPreview(props.selectionText).length > 0;

  return (
    <div style={wrap} data-testid="ai-tab">
      <ProviderRow provider={provider} onOpenSettings={props.onOpenSettings} />

      <Section title={t('ai.tab.commands')}>
        <p style={hint}>
          {hasSelection
            ? t('ai.tab.commands.hasSelection', { len: String(selectionPreview(props.selectionText).length) })
            : t('ai.tab.commands.noSelection')}
        </p>
        <div style={cmdGrid}>
          {AI_COMMANDS.map((cmd) => (
            <button
              key={cmd.id}
              type="button"
              onClick={props.onOpenPalette}
              disabled={!hasSelection || !provider?.hasKey}
              style={cmdBtn(hasSelection && !!provider?.hasKey)}
              data-testid={`ai-tab-cmd-${cmd.id}`}
              title={t(cmd.descriptionKey)}
            >
              {t(cmd.labelKey)}
            </button>
          ))}
        </div>
      </Section>

      <Section title={t('ai.tab.citations')}>
        <button
          type="button"
          onClick={props.onSuggestCitations}
          disabled={!provider?.hasKey}
          style={primaryBtn(!!provider?.hasKey)}
          data-testid="ai-tab-suggest-citations"
        >
          {t('ai.tab.suggestCitations')}
        </button>
        <button
          type="button"
          onClick={props.onInsertCitationFromDoi}
          style={baseBtn}
          data-testid="ai-tab-insert-doi"
        >
          {t('ai.tab.insertFromDoi')}
        </button>
      </Section>

      <Section title={t('ai.tab.session')}>
        <div style={statRow}>
          <Stat label={t('ai.usage.calls')} value={`${sessionCalls} / ${total.calls}`} />
          <Stat
            label={t('ai.usage.tokens')}
            value={`${formatTokens(total.inputTokens + total.outputTokens)}`}
          />
          <Stat
            label={t('ai.usage.cost')}
            value={formatUsd(total.costUsd)}
          />
        </div>
        <button
          type="button"
          onClick={props.onOpenSettings}
          style={linkBtn}
          data-testid="ai-tab-open-dashboard"
        >
          {t('ai.tab.openDashboard')}
        </button>
      </Section>

      {recent.length > 0 && (
        <Section title={t('ai.tab.recent')}>
          <ul style={recentList}>
            {recent.slice(0, 5).map((r, i) => (
              <li key={`${r.ts}:${i}`} style={recentItem}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                  <span style={recentSource}>{t(`ai.usage.source.${r.source}`)}</span>
                  <span style={recentMeta}>
                    {r.inputTokens + r.outputTokens}t · {formatUsd(r.costUsd)}
                  </span>
                </div>
                <div style={recentTs}>{r.ts.slice(11, 19)}</div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function selectionPreview(text: string): string {
  return text.trim();
}

function ProviderRow({
  provider,
  onOpenSettings,
}: {
  provider: { provider: string; model: string; hasKey: boolean } | null;
  onOpenSettings: () => void;
}) {
  if (!provider) {
    return <div style={providerLoading}>{t('ai.tab.loading')}</div>;
  }
  if (!provider.hasKey) {
    return (
      <div style={providerWarn} data-testid="ai-tab-no-key">
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('ai.tab.noKey')}</div>
        <button type="button" onClick={onOpenSettings} style={baseBtn}>
          {t('ai.tab.openSettings')}
        </button>
      </div>
    );
  }
  return (
    <div style={providerOk} data-testid="ai-tab-provider">
      <span style={providerDot} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 12 }}>
          {provider.provider === 'anthropic' ? 'Anthropic' : 'OpenAI / Compatible'}
        </div>
        <div style={providerModel}>{provider.model}</div>
      </div>
      <button
        type="button"
        onClick={onOpenSettings}
        style={linkBtnSmall}
        title={t('ai.tab.openSettings')}
      >⚙</button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={sectionStyle}>
      <h4 style={sectionTitle}>{title}</h4>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={statBox}>
      <div style={statLabel}>{label}</div>
      <div style={statValue}>{value}</div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: '8px 10px',
};
const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: 'uppercase',
  color: 'var(--muted-fg, #6a6a6a)',
};
const providerOk: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 10px',
  borderRadius: 6,
  background: 'var(--code-bg, #f4f4f4)',
};
const providerWarn: React.CSSProperties = {
  padding: '10px',
  borderRadius: 6,
  background: 'var(--cm-warn-bg, #fff8e6)',
  color: 'var(--cm-warn-fg, #8a5a17)',
  fontSize: 12,
};
const providerLoading: React.CSSProperties = {
  padding: '10px',
  borderRadius: 6,
  background: 'var(--code-bg, #f4f4f4)',
  fontSize: 12,
  color: 'var(--muted-fg, #6a6a6a)',
};
const providerDot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: 'var(--cm-success-fg, #1d6f3a)',
  flexShrink: 0,
};
const providerModel: React.CSSProperties = {
  fontFamily: 'var(--mono, ui-monospace, monospace)',
  fontSize: 11,
  color: 'var(--muted-fg, #6a6a6a)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const hint: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  color: 'var(--muted-fg, #6a6a6a)',
};
const cmdGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 4,
};
function cmdBtn(enabled: boolean): React.CSSProperties {
  return {
    padding: '5px 8px',
    fontSize: 11,
    borderRadius: 4,
    border: '1px solid var(--border, #c8c8c8)',
    background: enabled ? 'var(--bg, #fff)' : 'var(--code-bg, #f4f4f4)',
    color: enabled ? 'inherit' : 'var(--muted-fg, #6a6a6a)',
    cursor: enabled ? 'pointer' : 'not-allowed',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
}
const baseBtn: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 12,
  borderRadius: 4,
  border: '1px solid var(--border, #c8c8c8)',
  background: 'var(--bg, #fff)',
  cursor: 'pointer',
};
function primaryBtn(enabled: boolean): React.CSSProperties {
  return {
    ...baseBtn,
    background: enabled ? 'var(--accent, #4a90e2)' : 'var(--code-bg, #ddd)',
    borderColor: enabled ? 'var(--accent, #4a90e2)' : 'var(--border, #c8c8c8)',
    color: enabled ? '#fff' : 'var(--muted-fg, #6a6a6a)',
    cursor: enabled ? 'pointer' : 'not-allowed',
  };
}
const linkBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  fontSize: 11,
  cursor: 'pointer',
  color: 'var(--accent, #4a90e2)',
  textDecoration: 'underline',
  textAlign: 'left',
};
const linkBtnSmall: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 2,
  fontSize: 12,
  cursor: 'pointer',
  color: 'inherit',
};
const statRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr',
  gap: 4,
};
const statBox: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: 4,
  background: 'var(--code-bg, #f4f4f4)',
};
const statLabel: React.CSSProperties = {
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--muted-fg, #6a6a6a)',
};
const statValue: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 12,
  marginTop: 2,
};
const recentList: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};
const recentItem: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 4,
  background: 'var(--code-bg, #fafafa)',
  fontSize: 11,
};
const recentSource: React.CSSProperties = {
  fontWeight: 600,
};
const recentMeta: React.CSSProperties = {
  color: 'var(--muted-fg, #6a6a6a)',
  fontVariantNumeric: 'tabular-nums',
};
const recentTs: React.CSSProperties = {
  fontFamily: 'var(--mono, ui-monospace, monospace)',
  fontSize: 10,
  color: 'var(--muted-fg, #6a6a6a)',
};

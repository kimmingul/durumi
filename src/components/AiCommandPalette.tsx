import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/t';
import { AI_COMMANDS, type AiCommandId, type AiCommandSpec } from '@shared/aiPrompts';
import { useAiUsageStore } from '../store/aiUsageStore';

// Cmd/Ctrl+Shift+/ palette: pick a command, run the LLM, preview the
// before/after diff, accept (replace selection) or reject (close).
//
// Rendering follows the QuickOpen / CitePalette pattern so the keyboard
// model is consistent: Up/Down to move, Enter to confirm, Esc to cancel.

export interface AiCommandPaletteProps {
  open: boolean;
  /** The selected text the user wants to act on. Empty = no selection. */
  selection: string;
  /** Paragraph context, derived from currentParagraph(state). */
  paragraph: string;
  /** True when at least one provider has a key. UI gates on this. */
  hasKey: boolean;
  onClose: () => void;
  /** Called with the AI's rewritten text; caller substitutes into the editor. */
  onAccept: (rewritten: string) => void;
}

type Phase =
  | { kind: 'pick' }
  | { kind: 'running'; cmd: AiCommandSpec }
  | { kind: 'preview'; cmd: AiCommandSpec; result: string; tokens: { input: number; output: number } }
  | { kind: 'error'; cmd: AiCommandSpec; message: string };

export function AiCommandPalette(props: AiCommandPaletteProps) {
  const { open, selection, paragraph, hasKey, onClose, onAccept } = props;
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' });
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLDivElement>(null);
  const recordUsage = useAiUsageStore((s) => s.recordUsage);

  useEffect(() => {
    if (!open) return;
    setPhase({ kind: 'pick' });
    setActiveIdx(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (phase.kind !== 'pick') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, AI_COMMANDS.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = AI_COMMANDS[activeIdx];
        if (cmd) void runCommand(cmd);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // onClose / runCommand are stable for the lifetime of an open palette
    // session — re-binding them every keystroke would constantly recreate
    // the listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phase.kind, activeIdx, selection]);

  if (!open) return null;

  async function runCommand(cmd: AiCommandSpec) {
    if (!selection.trim()) return;
    setPhase({ kind: 'running', cmd });
    const messages = cmd.build({ selection, paragraph });
    const r = await window.api.aiChat(messages);
    if (r.ok) {
      const prefs = await window.api.prefsGet();
      const model = activeModelFromPrefs(prefs);
      recordUsage({
        model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        source: 'palette',
      });
      setPhase({
        kind: 'preview',
        cmd,
        result: r.text.trim(),
        tokens: { input: r.inputTokens, output: r.outputTokens },
      });
    } else {
      setPhase({ kind: 'error', cmd, message: r.message });
    }
  }

  function activeModelFromPrefs(
    prefs: import('@shared/ipc-contract').Preferences,
  ): string {
    if (!prefs.ai) return 'unknown';
    return prefs.ai.provider === 'anthropic'
      ? prefs.ai.anthropicModel
      : prefs.ai.openaiModel;
  }

  return (
    <div
      style={backdropStyle}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="ai-palette-backdrop"
    >
      <div
        ref={inputRef}
        tabIndex={-1}
        style={cardStyle}
        role="dialog"
        aria-label="AI command palette"
        data-testid="ai-palette"
        onClick={(e) => e.stopPropagation()}
      >
        <header style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
            {t('ai.palette.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('settings.close')}
            style={closeBtnStyle}
          >×</button>
        </header>
        {!hasKey ? (
          <div style={emptyStyle} data-testid="ai-palette-no-key">
            {t('ai.palette.noKey')}
          </div>
        ) : !selection.trim() ? (
          <div style={emptyStyle} data-testid="ai-palette-no-selection">
            {t('ai.palette.noSelection')}
          </div>
        ) : phase.kind === 'pick' ? (
          <ul style={listStyle} role="listbox" data-testid="ai-palette-list">
            {AI_COMMANDS.map((cmd, i) => (
              <li
                key={cmd.id}
                role="option"
                aria-selected={i === activeIdx}
                style={{
                  ...itemStyle,
                  background: i === activeIdx ? 'var(--accent, rgba(74,144,226,0.15))' : 'transparent',
                }}
                onMouseMove={() => setActiveIdx(i)}
                onMouseDown={(e) => { e.preventDefault(); void runCommand(cmd); }}
                data-testid={`ai-palette-item-${cmd.id}`}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>{t(cmd.labelKey)}</div>
                <div style={{ fontSize: 11, color: 'var(--muted-fg, #6a6a6a)' }}>
                  {t(cmd.descriptionKey)}
                </div>
              </li>
            ))}
          </ul>
        ) : phase.kind === 'running' ? (
          <div style={emptyStyle} data-testid="ai-palette-running">
            {t('ai.palette.running', { cmd: t(phase.cmd.labelKey) })}
          </div>
        ) : phase.kind === 'error' ? (
          <div style={errorStyle} data-testid="ai-palette-error">
            <div>{phase.message}</div>
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setPhase({ kind: 'pick' })}
                style={baseBtnStyle}
              >{t('ai.palette.back')}</button>
            </div>
          </div>
        ) : (
          <PreviewView
            phase={phase}
            selection={selection}
            onBack={() => setPhase({ kind: 'pick' })}
            onAccept={() => {
              onAccept(phase.result);
              onClose();
            }}
          />
        )}
      </div>
    </div>
  );
}

function PreviewView({
  phase,
  selection,
  onBack,
  onAccept,
}: {
  phase: { kind: 'preview'; cmd: AiCommandSpec; result: string; tokens: { input: number; output: number } };
  selection: string;
  onBack: () => void;
  onAccept: () => void;
}) {
  return (
    <div style={previewStyle}>
      <div style={previewMetaStyle}>
        <span><strong>{t(phase.cmd.labelKey)}</strong></span>
        <span style={{ fontSize: 11, color: 'var(--muted-fg, #6a6a6a)' }}>
          {phase.tokens.input}+{phase.tokens.output} tokens
        </span>
      </div>
      <div style={previewLabelStyle}>{t('ai.palette.before')}</div>
      <pre style={beforeStyle} data-testid="ai-palette-before">{selection}</pre>
      <div style={previewLabelStyle}>{t('ai.palette.after')}</div>
      <pre style={afterStyle} data-testid="ai-palette-after">{phase.result}</pre>
      <footer style={previewFooterStyle}>
        <button type="button" onClick={onBack} style={baseBtnStyle} data-testid="ai-palette-back">
          {t('ai.palette.back')}
        </button>
        <button
          type="button"
          onClick={onAccept}
          style={primaryBtnStyle}
          data-testid="ai-palette-accept"
        >{t('ai.palette.accept')}</button>
      </footer>
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
  paddingTop: '15vh',
};
const cardStyle: React.CSSProperties = {
  background: 'var(--bg, #fff)',
  color: 'var(--fg, #111)',
  borderRadius: 8,
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.35)',
  width: 'min(640px, 92vw)',
  maxHeight: '70vh',
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
const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  overflowY: 'auto',
};
const itemStyle: React.CSSProperties = {
  padding: '8px 14px',
  cursor: 'pointer',
  borderBottom: '1px solid var(--border, #f0f0f0)',
};
const emptyStyle: React.CSSProperties = {
  padding: '24px',
  textAlign: 'center',
  fontSize: 13,
  color: 'var(--muted-fg, #6a6a6a)',
};
const errorStyle: React.CSSProperties = {
  padding: '14px',
  fontSize: 13,
  color: 'var(--cm-error-fg, #8a1f17)',
};
const previewStyle: React.CSSProperties = {
  padding: '14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  overflowY: 'auto',
};
const previewMetaStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
};
const previewLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  color: 'var(--muted-fg, #6a6a6a)',
  marginTop: 4,
};
const beforeStyle: React.CSSProperties = {
  margin: 0,
  padding: '8px 10px',
  background: 'var(--code-bg, #f5f5f5)',
  borderRadius: 4,
  whiteSpace: 'pre-wrap',
  fontSize: 13,
  fontFamily: 'inherit',
  maxHeight: 120,
  overflowY: 'auto',
};
const afterStyle: React.CSSProperties = {
  margin: 0,
  padding: '8px 10px',
  background: 'var(--cm-success-bg, #ecf7f0)',
  borderRadius: 4,
  whiteSpace: 'pre-wrap',
  fontSize: 13,
  fontFamily: 'inherit',
  maxHeight: 200,
  overflowY: 'auto',
};
const previewFooterStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  marginTop: 4,
};
const baseBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 4,
  border: '1px solid var(--border, #c8c8c8)',
  background: 'var(--code-bg, #f5f5f5)',
  cursor: 'pointer',
  fontSize: 13,
};
const primaryBtnStyle: React.CSSProperties = {
  ...baseBtnStyle,
  background: 'var(--accent, #4a90e2)',
  borderColor: 'var(--accent, #4a90e2)',
  color: '#fff',
};

// Use AiCommandId so the import is referenced (tree-shake hint).
export type { AiCommandId };

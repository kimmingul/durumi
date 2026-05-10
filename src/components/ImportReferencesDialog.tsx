import { useEffect, useState } from 'react';
import { t } from '../i18n/t';
import { useBibliographyStore } from '../store/bibliographyStore';
import type { BibEntry } from '@shared/bibtex';

// Modal that previews entries from a .bib or .ris file before merging
// into references.bib. Distinguishes new vs colliding keys, lets the
// user pick a collision mode (skip / replace / rename), then drives
// the bibliographyStore.mergeImportedEntries action.

export interface ImportReferencesDialogProps {
  open: boolean;
  /** Already-parsed entries from `bibliographyImportFile`. */
  entries: BibEntry[];
  warnings: string[];
  format: 'bibtex' | 'ris' | null;
  /** Display path of the source file (shown in the header). */
  sourcePath: string | null;
  onClose: () => void;
  onComplete?: (summary: { added: number; replaced: number; skipped: number }) => void;
}

type CollisionMode = 'skip' | 'replace' | 'rename';

export function ImportReferencesDialog({
  open,
  entries,
  warnings,
  format,
  sourcePath,
  onClose,
  onComplete,
}: ImportReferencesDialogProps) {
  const [mode, setMode] = useState<CollisionMode>('rename');
  const [busy, setBusy] = useState(false);
  const existingEntries = useBibliographyStore((s) => s.entries);
  const merge = useBibliographyStore((s) => s.mergeImportedEntries);

  useEffect(() => {
    if (!open) return;
    setMode('rename');
    setBusy(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, busy]);

  if (!open) return null;

  const existingKeys = new Set(existingEntries.map((e) => e.key));
  const collisions = entries.filter((e) => e.key && existingKeys.has(e.key));
  const fresh = entries.filter((e) => !e.key || !existingKeys.has(e.key));

  async function handleConfirm() {
    setBusy(true);
    const r = await merge(entries, mode);
    setBusy(false);
    if (r.ok) {
      onComplete?.({ added: r.added, replaced: r.replaced, skipped: r.skipped });
      onClose();
    } else {
      // eslint-disable-next-line no-alert
      window.alert(`${t('import.failed')}\n\n${r.error}`);
    }
  }

  return (
    <div
      style={backdropStyle}
      data-testid="import-refs-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-refs-title"
        data-testid="import-refs-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <header style={headerStyle}>
          <h2 id="import-refs-title" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {t('import.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t('settings.close')}
            style={closeBtnStyle}
          >×</button>
        </header>
        <div style={bodyStyle}>
          {sourcePath && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-fg, #6a6a6a)' }}>
              {t('import.source')}: <code>{sourcePath}</code>
              {format && <span> ({format.toUpperCase()})</span>}
            </p>
          )}
          <div style={summaryStyle}>
            <SummaryPill label={t('import.summary.fresh')} value={fresh.length} accent="ok" />
            <SummaryPill label={t('import.summary.collisions')} value={collisions.length} accent={collisions.length > 0 ? 'warn' : 'ok'} />
            <SummaryPill label={t('import.summary.warnings')} value={warnings.length} accent={warnings.length > 0 ? 'warn' : 'ok'} />
          </div>

          {collisions.length > 0 && (
            <fieldset style={fieldsetStyle} data-testid="import-collision-mode">
              <legend style={{ fontSize: 12, fontWeight: 600 }}>
                {t('import.collisions.title')} ({collisions.length})
              </legend>
              <RadioRow
                checked={mode === 'rename'}
                onSelect={() => setMode('rename')}
                label={t('import.collision.rename')}
                hint={t('import.collision.rename.hint')}
              />
              <RadioRow
                checked={mode === 'skip'}
                onSelect={() => setMode('skip')}
                label={t('import.collision.skip')}
                hint={t('import.collision.skip.hint')}
              />
              <RadioRow
                checked={mode === 'replace'}
                onSelect={() => setMode('replace')}
                label={t('import.collision.replace')}
                hint={t('import.collision.replace.hint')}
              />
            </fieldset>
          )}

          <div style={previewStyle} data-testid="import-preview">
            {entries.slice(0, 50).map((e, i) => {
              const collides = !!(e.key && existingKeys.has(e.key));
              return (
                <div
                  key={`${e.key || 'noKey'}:${i}`}
                  style={{
                    ...previewRowStyle,
                    background: collides ? 'var(--cm-warn-bg, #fff8e6)' : 'transparent',
                  }}
                >
                  <span style={previewKeyStyle}>{e.key || `(${t('import.keyless')})`}</span>
                  <span style={previewTitleStyle}>{e.fields.title ?? '—'}</span>
                  {collides && <span style={collideBadgeStyle}>{t('import.collide')}</span>}
                </div>
              );
            })}
            {entries.length > 50 && (
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted-fg, #6a6a6a)' }}>
                {t('import.more', { count: String(entries.length - 50) })}
              </p>
            )}
          </div>

          {warnings.length > 0 && (
            <details style={warningsStyle}>
              <summary style={{ fontSize: 12, fontWeight: 600 }}>
                {t('import.warnings')} ({warnings.length})
              </summary>
              <ul style={{ margin: '6px 0 0 16px', padding: 0, fontSize: 11, fontFamily: 'var(--mono, ui-monospace, monospace)' }}>
                {warnings.slice(0, 20).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <footer style={footerStyle}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={baseBtnStyle}
            data-testid="import-cancel"
          >{t('insertCitation.cancel')}</button>
          <button
            type="button"
            onClick={() => { void handleConfirm(); }}
            disabled={busy || entries.length === 0}
            style={primaryBtnStyle}
            data-testid="import-confirm"
          >
            {busy ? t('import.importing') : `${t('import.confirm')} (${entries.length})`}
          </button>
        </footer>
      </div>
    </div>
  );
}

function RadioRow({
  checked,
  onSelect,
  label,
  hint,
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  hint: string;
}) {
  return (
    <label style={radioRowStyle}>
      <input
        type="radio"
        checked={checked}
        onChange={onSelect}
      />
      <span style={{ flex: 1 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--muted-fg, #6a6a6a)' }}>
          {hint}
        </span>
      </span>
    </label>
  );
}

function SummaryPill({ label, value, accent }: { label: string; value: number; accent: 'ok' | 'warn' }) {
  const color = accent === 'warn' ? 'var(--cm-warn-fg, #8a5a17)' : 'var(--fg)';
  const bg = accent === 'warn' ? 'var(--cm-warn-bg, #fff8e6)' : 'var(--code-bg, #f4f4f4)';
  return (
    <span style={{ ...summaryPillStyle, color, background: bg }}>
      <strong style={{ marginRight: 6 }}>{value}</strong>
      {label}
    </span>
  );
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.45)',
  zIndex: 9100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
const cardStyle: React.CSSProperties = {
  background: 'var(--bg, #fff)',
  color: 'var(--fg, #111)',
  borderRadius: 8,
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.35)',
  width: 'min(640px, 92vw)',
  maxHeight: '88vh',
  display: 'flex',
  flexDirection: 'column',
  fontSize: 14,
};
const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 18px',
  borderBottom: '1px solid var(--border, #e2e2e2)',
};
const bodyStyle: React.CSSProperties = {
  padding: '14px 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  overflowY: 'auto',
};
const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  padding: '10px 18px 14px',
  borderTop: '1px solid var(--border, #e2e2e2)',
};
const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  fontSize: 22,
  lineHeight: 1,
  cursor: 'pointer',
  color: 'inherit',
  padding: '0 4px',
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
const summaryStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
};
const summaryPillStyle: React.CSSProperties = {
  fontSize: 12,
  padding: '4px 10px',
  borderRadius: 12,
};
const fieldsetStyle: React.CSSProperties = {
  border: '1px solid var(--border, #d8d8d8)',
  borderRadius: 4,
  padding: '8px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const radioRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  fontSize: 13,
  cursor: 'pointer',
};
const previewStyle: React.CSSProperties = {
  border: '1px solid var(--border, #e2e2e2)',
  borderRadius: 4,
  maxHeight: 240,
  overflowY: 'auto',
  fontSize: 12,
};
const previewRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderBottom: '1px solid var(--border, #f0f0f0)',
};
const previewKeyStyle: React.CSSProperties = {
  fontFamily: 'var(--mono, ui-monospace, monospace)',
  fontWeight: 600,
  flexShrink: 0,
  minWidth: 120,
};
const previewTitleStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
const collideBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  padding: '1px 6px',
  borderRadius: 8,
  background: 'var(--cm-warn-fg, #8a5a17)',
  color: '#fff',
};
const warningsStyle: React.CSSProperties = {
  border: '1px solid var(--border, #e2e2e2)',
  borderRadius: 4,
  padding: '8px 10px',
  background: 'var(--code-bg, #fafafa)',
};

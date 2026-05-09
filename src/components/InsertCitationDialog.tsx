import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/t';
import { useBibliographyStore } from '../store/bibliographyStore';
import type { BibEntry } from '@shared/bibtex';

export interface InsertCitationDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the freshly-minted `[@key]` text once the user confirms. */
  onInsert: (citation: string) => void;
}

type Phase =
  | { kind: 'input' }
  | { kind: 'fetching' }
  | { kind: 'preview'; entry: BibEntry }
  | { kind: 'error'; message: string }
  | { kind: 'inserting' };

/**
 * Cmd/Ctrl + Shift + B — DOI → BibTeX → citation.
 *
 * Flow: paste DOI → "조회" / "Resolve" fetches via Crossref → preview the
 * mapped BibEntry → "삽입" / "Insert" appends to references.bib and
 * returns `[@key]` to the caller for caret-position insertion.
 */
export function InsertCitationDialog(props: InsertCitationDialogProps) {
  const { open, onClose, onInsert } = props;
  const [doi, setDoi] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'input' });
  const inputRef = useRef<HTMLInputElement>(null);
  const filePath = useBibliographyStore((s) => s.filePath);
  const addFromDoi = useBibliographyStore((s) => s.addFromDoi);

  // Reset when reopened.
  useEffect(() => {
    if (open) {
      setDoi('');
      setPhase({ kind: 'input' });
      // Defer focus so the dialog mounts first.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Esc to close (when not actively writing).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && phase.kind !== 'inserting') {
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, phase.kind]);

  if (!open) return null;

  async function handleResolve() {
    const trimmed = doi.trim();
    if (!trimmed) return;
    setPhase({ kind: 'fetching' });
    try {
      const r = await window.api.bibliographyResolveDoi(trimmed);
      if (r.ok) {
        setPhase({ kind: 'preview', entry: r.entry });
      } else {
        setPhase({ kind: 'error', message: errorMessage(r.code, r.message) });
      }
    } catch (err) {
      setPhase({
        kind: 'error',
        message: err instanceof Error ? err.message : 'unknown error',
      });
    }
  }

  async function handleInsert() {
    if (phase.kind !== 'preview') return;
    setPhase({ kind: 'inserting' });
    const r = await addFromDoi(doi.trim());
    if (r.ok) {
      onInsert(`[@${r.key}]`);
      onClose();
    } else {
      setPhase({ kind: 'error', message: r.message });
    }
  }

  return (
    <div
      style={backdropStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget && phase.kind !== 'inserting') onClose();
      }}
      data-testid="insert-citation-backdrop"
    >
      <div
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="insert-citation-title"
        data-testid="insert-citation-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <header style={headerStyle}>
          <h2 id="insert-citation-title" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {t('insertCitation.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={phase.kind === 'inserting'}
            data-testid="insert-citation-close"
            aria-label={t('settings.close')}
            style={closeButtonStyle}
          >
            ×
          </button>
        </header>
        <div style={bodyStyle}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>
            {t('insertCitation.doiLabel')}
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              ref={inputRef}
              type="text"
              value={doi}
              onChange={(e) => {
                setDoi(e.target.value);
                if (phase.kind === 'error' || phase.kind === 'preview') {
                  setPhase({ kind: 'input' });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && phase.kind === 'input') {
                  e.preventDefault();
                  void handleResolve();
                }
              }}
              placeholder="10.1056/NEJMoa1234567"
              style={inputStyle}
              data-testid="insert-citation-doi-input"
              disabled={phase.kind === 'fetching' || phase.kind === 'inserting'}
            />
            <button
              type="button"
              onClick={() => { void handleResolve(); }}
              disabled={
                doi.trim().length === 0
                || phase.kind === 'fetching'
                || phase.kind === 'inserting'
              }
              data-testid="insert-citation-resolve"
              style={primaryButton}
            >
              {phase.kind === 'fetching'
                ? t('insertCitation.fetching')
                : t('insertCitation.resolve')}
            </button>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted-fg, #6a6a6a)' }}>
            {filePath
              ? t('insertCitation.targetFile', { path: filePath })
              : t('insertCitation.noTargetFile')}
          </p>

          {phase.kind === 'error' && (
            <div style={errorStyle} data-testid="insert-citation-error">
              {phase.message}
            </div>
          )}

          {phase.kind === 'preview' && (
            <div style={previewWrap} data-testid="insert-citation-preview">
              <h3 style={previewHeading}>{t('insertCitation.preview')}</h3>
              <EntryPreview entry={phase.entry} />
            </div>
          )}
        </div>
        <footer style={footerStyle}>
          <button
            type="button"
            onClick={onClose}
            disabled={phase.kind === 'inserting'}
            style={baseButton}
            data-testid="insert-citation-cancel"
          >
            {t('insertCitation.cancel')}
          </button>
          <button
            type="button"
            onClick={() => { void handleInsert(); }}
            disabled={phase.kind !== 'preview'}
            style={primaryButton}
            data-testid="insert-citation-insert"
          >
            {phase.kind === 'inserting'
              ? t('insertCitation.inserting')
              : t('insertCitation.insert')}
          </button>
        </footer>
      </div>
    </div>
  );
}

function EntryPreview({ entry }: { entry: BibEntry }) {
  const f = entry.fields;
  return (
    <dl style={previewListStyle}>
      <Row label={t('insertCitation.field.type')} value={entry.type} />
      <Row label={t('insertCitation.field.author')} value={f.author ?? f.editor ?? '—'} />
      <Row label={t('insertCitation.field.title')} value={f.title ?? '—'} />
      {f.journal && <Row label={t('insertCitation.field.journal')} value={f.journal} />}
      {f.booktitle && <Row label={t('insertCitation.field.booktitle')} value={f.booktitle} />}
      <Row
        label={t('insertCitation.field.year')}
        value={[f.year, f.volume && `vol. ${f.volume}`, f.number && `no. ${f.number}`, f.pages && `pp. ${f.pages}`]
          .filter(Boolean)
          .join(' · ') || '—'}
      />
      {f.doi && <Row label="DOI" value={f.doi} />}
    </dl>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt style={dtStyle}>{label}</dt>
      <dd style={ddStyle}>{value}</dd>
    </>
  );
}

function errorMessage(code: string, fallback: string): string {
  switch (code) {
    case 'not-found': return t('insertCitation.error.notFound');
    case 'parse': return t('insertCitation.error.parse');
    case 'timeout': return t('insertCitation.error.timeout');
    case 'rate-limit': return t('insertCitation.error.rateLimit');
    case 'network': return t('insertCitation.error.network');
    default: return fallback;
  }
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
  width: 'min(560px, 92vw)',
  maxHeight: '88vh',
  display: 'flex',
  flexDirection: 'column',
  fontSize: 14,
  lineHeight: 1.5,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 18px',
  borderBottom: '1px solid var(--border, #e2e2e2)',
};

const closeButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  fontSize: 22,
  lineHeight: 1,
  cursor: 'pointer',
  color: 'inherit',
  padding: '0 4px',
};

const bodyStyle: React.CSSProperties = {
  padding: '14px 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  overflowY: 'auto',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '6px 8px',
  borderRadius: 4,
  border: '1px solid var(--border, #c8c8c8)',
  background: 'var(--bg, #fff)',
  color: 'inherit',
  fontSize: 13,
  fontFamily: 'inherit',
};

const baseButton: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 4,
  border: '1px solid var(--border, #c8c8c8)',
  background: 'var(--code-bg, #f5f5f5)',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 13,
  whiteSpace: 'nowrap',
};

const primaryButton: React.CSSProperties = {
  ...baseButton,
  background: 'var(--accent, #4a90e2)',
  borderColor: 'var(--accent, #4a90e2)',
  color: '#fff',
};

const errorStyle: React.CSSProperties = {
  background: 'var(--cm-error-bg, #fff0ee)',
  color: 'var(--cm-error-fg, #8a1f17)',
  border: '1px solid var(--cm-error-fg, #8a1f17)',
  borderRadius: 4,
  padding: '8px 10px',
  fontSize: 13,
};

const previewWrap: React.CSSProperties = {
  marginTop: 6,
  border: '1px solid var(--border, #e2e2e2)',
  borderRadius: 6,
  padding: '10px 12px',
  background: 'var(--code-bg, #f8f8f8)',
};

const previewHeading: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--muted-fg, #6a6a6a)',
};

const previewListStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: '4px 12px',
  margin: 0,
  fontSize: 13,
};

const dtStyle: React.CSSProperties = {
  fontWeight: 600,
  color: 'var(--muted-fg, #6a6a6a)',
};

const ddStyle: React.CSSProperties = {
  margin: 0,
  wordBreak: 'break-word',
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  padding: '10px 18px 14px',
  borderTop: '1px solid var(--border, #e2e2e2)',
};

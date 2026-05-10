import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/t';
import type { BibEntry } from '@shared/bibtex';
import type { OrphanFile } from '../store/bibliographyStore';

// Manual-metadata modal for orphan files where DOI extraction failed.
// The user fills the minimum bib fields (title required, others optional)
// and we hand back a BibEntry with `file` already set to the orphan's
// relative path. The store's registerOrphan() is then called with this
// manual entry, skipping the DOI-extract step.
export interface OrphanRegisterDialogProps {
  open: boolean;
  orphan: OrphanFile | null;
  /** Initial DOI guess from `referenceExtractDoi` (may be null). */
  initialDoi?: string | null;
  onClose: () => void;
  onConfirm: (entry: BibEntry) => Promise<void>;
}

export function OrphanRegisterDialog({
  open,
  orphan,
  initialDoi,
  onClose,
  onConfirm,
}: OrphanRegisterDialogProps) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [year, setYear] = useState('');
  const [journal, setJournal] = useState('');
  const [doi, setDoi] = useState('');
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(orphan?.fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') ?? '');
    setAuthor('');
    setYear('');
    setJournal('');
    setDoi(initialDoi ?? '');
    setBusy(false);
    setTimeout(() => titleRef.current?.focus(), 0);
  }, [open, orphan, initialDoi]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, busy]);

  if (!open || !orphan) return null;

  async function submit() {
    if (!title.trim() || !orphan) return;
    setBusy(true);
    const fields: Record<string, string> = { title: title.trim(), file: orphan.relPath };
    if (author.trim()) fields.author = author.trim();
    if (year.trim()) fields.year = year.trim();
    if (journal.trim()) fields.journal = journal.trim();
    if (doi.trim()) fields.doi = doi.trim();
    const entry: BibEntry = { key: '', type: 'misc', fields };
    try {
      await onConfirm(entry);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={backdropStyle}
      data-testid="orphan-register-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="orphan-register-title"
        data-testid="orphan-register-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <header style={headerStyle}>
          <h2 id="orphan-register-title" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {t('orphan.title')}
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
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-fg, #6a6a6a)' }}>
            {t('orphan.fileName')}: <code>{orphan.fileName}</code>
          </p>
          <Field label={t('orphan.title.label')} required>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="orphan-title"
              style={inputStyle}
            />
          </Field>
          <Field label={t('orphan.author.label')}>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Smith, John and Doe, Jane"
              data-testid="orphan-author"
              style={inputStyle}
            />
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <Field label={t('orphan.year.label')}>
              <input
                type="text"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="2024"
                style={inputStyle}
                data-testid="orphan-year"
              />
            </Field>
            <Field label={t('orphan.journal.label')}>
              <input
                type="text"
                value={journal}
                onChange={(e) => setJournal(e.target.value)}
                style={inputStyle}
                data-testid="orphan-journal"
              />
            </Field>
          </div>
          <Field label={t('orphan.doi.label')}>
            <input
              type="text"
              value={doi}
              onChange={(e) => setDoi(e.target.value)}
              placeholder="10.xxxx/yyyy"
              data-testid="orphan-doi"
              style={inputStyle}
            />
          </Field>
        </div>
        <footer style={footerStyle}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={baseBtnStyle}
          >{t('insertCitation.cancel')}</button>
          <button
            type="button"
            onClick={() => { void submit(); }}
            disabled={busy || !title.trim()}
            style={primaryBtnStyle}
            data-testid="orphan-register-submit"
          >{busy ? t('orphan.registering') : t('orphan.register')}</button>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
      <span style={{ fontSize: 12, fontWeight: 600 }}>
        {label}
        {required && <span style={{ color: 'var(--cm-error-fg, #8a1f17)' }}> *</span>}
      </span>
      {children}
    </label>
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
  width: 'min(520px, 92vw)',
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
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: 4,
  border: '1px solid var(--border, #c8c8c8)',
  background: 'var(--bg, #fff)',
  color: 'inherit',
  fontSize: 13,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

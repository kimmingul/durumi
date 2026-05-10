import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/t';
import type { BibEntry } from '@shared/bibtex';

// Modal for editing an existing bib entry's fields. Key is shown read-only —
// changing the key is a separate action because all `[@oldKey]` references
// in the active document have to migrate atomically. v0.1.7.1 ships the
// field-edit case; key-rename is a future polish item.

export interface EditEntryDialogProps {
  open: boolean;
  entry: BibEntry | null;
  onClose: () => void;
  onSave: (fields: Record<string, string>, typeOverride: string) => Promise<void>;
}

export function EditEntryDialog({ open, entry, onClose, onSave }: EditEntryDialogProps) {
  const [type, setType] = useState('article');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !entry) return;
    setType(entry.type);
    setFields({ ...entry.fields });
    setBusy(false);
    setTimeout(() => titleRef.current?.focus(), 0);
  }, [open, entry]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, busy]);

  if (!open || !entry) return null;

  function set(field: string, value: string) {
    setFields((s) => ({ ...s, [field]: value }));
  }

  async function submit() {
    setBusy(true);
    try {
      await onSave(fields, type);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={backdropStyle}
      data-testid="edit-entry-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-entry-title"
        data-testid="edit-entry-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <header style={headerStyle}>
          <h2 id="edit-entry-title" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {t('editEntry.title')}
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
          <Field label={t('editEntry.key')}>
            <input
              type="text"
              value={entry.key}
              readOnly
              style={{ ...inputStyle, color: 'var(--muted-fg, #6a6a6a)' }}
              data-testid="edit-entry-key"
            />
          </Field>
          <Field label={t('editEntry.type')}>
            <input
              type="text"
              value={type}
              onChange={(e) => setType(e.target.value)}
              style={inputStyle}
              data-testid="edit-entry-type"
              placeholder="article / book / incollection / misc"
            />
          </Field>
          <Field label={t('editEntry.title.label')}>
            <input
              ref={titleRef}
              type="text"
              value={fields.title ?? ''}
              onChange={(e) => set('title', e.target.value)}
              style={inputStyle}
              data-testid="edit-entry-title-input"
            />
          </Field>
          <Field label={t('editEntry.author.label')}>
            <input
              type="text"
              value={fields.author ?? ''}
              onChange={(e) => set('author', e.target.value)}
              style={inputStyle}
              data-testid="edit-entry-author"
              placeholder="Smith, John and Doe, Jane"
            />
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <Field label={t('editEntry.year.label')}>
              <input
                type="text"
                value={fields.year ?? ''}
                onChange={(e) => set('year', e.target.value)}
                style={inputStyle}
                data-testid="edit-entry-year"
              />
            </Field>
            <Field label={t('editEntry.journal.label')}>
              <input
                type="text"
                value={fields.journal ?? ''}
                onChange={(e) => set('journal', e.target.value)}
                style={inputStyle}
                data-testid="edit-entry-journal"
              />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Field label={t('editEntry.volume.label')}>
              <input
                type="text"
                value={fields.volume ?? ''}
                onChange={(e) => set('volume', e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label={t('editEntry.number.label')}>
              <input
                type="text"
                value={fields.number ?? ''}
                onChange={(e) => set('number', e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label={t('editEntry.pages.label')}>
              <input
                type="text"
                value={fields.pages ?? ''}
                onChange={(e) => set('pages', e.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>
          <Field label={t('editEntry.doi.label')}>
            <input
              type="text"
              value={fields.doi ?? ''}
              onChange={(e) => set('doi', e.target.value)}
              style={inputStyle}
              data-testid="edit-entry-doi"
              placeholder="10.xxxx/yyyy"
            />
          </Field>
          <Field label={t('editEntry.url.label')}>
            <input
              type="text"
              value={fields.url ?? ''}
              onChange={(e) => set('url', e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label={t('editEntry.file.label')}>
            <input
              type="text"
              value={fields.file ?? ''}
              onChange={(e) => set('file', e.target.value)}
              style={inputStyle}
              data-testid="edit-entry-file"
              placeholder="reference/<key>.pdf"
            />
          </Field>
          <Field label={t('editEntry.abstract.label')}>
            <textarea
              value={fields.abstract ?? ''}
              onChange={(e) => set('abstract', e.target.value)}
              style={{ ...inputStyle, minHeight: 60, fontFamily: 'inherit', resize: 'vertical' }}
              data-testid="edit-entry-abstract"
            />
          </Field>
        </div>
        <footer style={footerStyle}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={baseBtnStyle}
            data-testid="edit-entry-cancel"
          >{t('insertCitation.cancel')}</button>
          <button
            type="button"
            onClick={() => { void submit(); }}
            disabled={busy}
            style={primaryBtnStyle}
            data-testid="edit-entry-save"
          >{busy ? t('editEntry.saving') : t('editEntry.save')}</button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
      <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
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
  width: 'min(560px, 92vw)',
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

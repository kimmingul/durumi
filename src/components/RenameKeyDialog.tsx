import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../i18n/t';
import { countCitationKeyReferences } from '@shared/citationKey';
import { useBibliographyStore } from '../store/bibliographyStore';

// Atomic rename of a citation key. Validates against the live entry list
// AND counts how many `[@oldKey]` references will move in the active
// document so the user understands the blast radius before confirming.
//
// The actual editor migration happens in the parent (App.tsx) via a single
// CodeMirror dispatch built from `renameCitationKeyChanges` — this dialog
// only owns the form + validation + bib write; the parent owns the doc.

export interface RenameKeyDialogProps {
  open: boolean;
  oldKey: string;
  /** Source of the active editor document for the live reference count. */
  documentText: string;
  onClose: () => void;
  /** Called after both bib + doc updates have committed successfully. */
  onComplete: (oldKey: string, newKey: string) => void;
}

const KEY_RE = /^[A-Za-z0-9_:.\-+/]+$/;

export function RenameKeyDialog({
  open,
  oldKey,
  documentText,
  onClose,
  onComplete,
}: RenameKeyDialogProps) {
  const [newKey, setNewKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const entries = useBibliographyStore((s) => s.entries);
  const renameEntryKey = useBibliographyStore((s) => s.renameEntryKey);

  useEffect(() => {
    if (!open) return;
    setNewKey(oldKey);
    setBusy(false);
    setErrorCode(null);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [open, oldKey]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, busy]);

  const validation = useMemo(() => {
    return validate(newKey, oldKey, entries.map((e) => e.key));
  }, [newKey, oldKey, entries]);

  const docCount = useMemo(
    () => countCitationKeyReferences(documentText, oldKey),
    [documentText, oldKey],
  );

  if (!open) return null;

  async function submit() {
    if (!validation.ok) return;
    setBusy(true);
    setErrorCode(null);
    const r = await renameEntryKey(oldKey, newKey);
    setBusy(false);
    if (!r.ok) {
      setErrorCode(r.error);
      return;
    }
    onComplete(oldKey, newKey);
  }

  return (
    <div
      style={backdropStyle}
      data-testid="rename-key-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-key-title"
        data-testid="rename-key-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <header style={headerStyle}>
          <h2 id="rename-key-title" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {t('renameKey.title')}
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
          <div>
            <div style={labelStyle}>{t('renameKey.from')}</div>
            <div style={oldKeyStyle}>{oldKey}</div>
          </div>
          <div>
            <label style={labelStyle} htmlFor="rename-key-new">{t('renameKey.to')}</label>
            <input
              id="rename-key-new"
              ref={inputRef}
              type="text"
              value={newKey}
              onChange={(e) => {
                setNewKey(e.target.value);
                setErrorCode(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && validation.ok && !busy) {
                  e.preventDefault();
                  void submit();
                }
              }}
              data-testid="rename-key-input"
              style={inputStyle}
              placeholder="newkey2024radiology"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {!validation.ok && newKey !== oldKey && (
            <p style={errorTextStyle} data-testid="rename-key-validation">
              {validationMessage(validation.code)}
            </p>
          )}
          <div style={summaryStyle} data-testid="rename-key-summary">
            <div>
              <strong>{docCount}</strong> {t('renameKey.refs.found')}
            </div>
            {docCount > 0 && (
              <div style={{ fontSize: 11, color: 'var(--muted-fg, #6a6a6a)' }}>
                {t('renameKey.refs.willMove')}
              </div>
            )}
          </div>
          {errorCode && (
            <p style={errorTextStyle} data-testid="rename-key-write-error">
              {writeErrorMessage(errorCode)}
            </p>
          )}
        </div>
        <footer style={footerStyle}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={baseBtnStyle}
            data-testid="rename-key-cancel"
          >{t('insertCitation.cancel')}</button>
          <button
            type="button"
            onClick={() => { void submit(); }}
            disabled={busy || !validation.ok}
            style={primaryBtnStyle}
            data-testid="rename-key-submit"
          >{busy ? t('renameKey.renaming') : t('renameKey.confirm')}</button>
        </footer>
      </div>
    </div>
  );
}

interface ValidationOk { ok: true }
interface ValidationErr { ok: false; code: 'empty' | 'shape' | 'taken' | 'same' }

function validate(newKey: string, oldKey: string, existing: string[]): ValidationOk | ValidationErr {
  const trimmed = newKey.trim();
  if (!trimmed) return { ok: false, code: 'empty' };
  if (!KEY_RE.test(trimmed)) return { ok: false, code: 'shape' };
  if (trimmed === oldKey) return { ok: false, code: 'same' };
  if (existing.includes(trimmed)) return { ok: false, code: 'taken' };
  return { ok: true };
}

function validationMessage(code: ValidationErr['code']): string {
  switch (code) {
    case 'empty': return t('renameKey.error.empty');
    case 'shape': return t('renameKey.error.shape');
    case 'taken': return t('renameKey.error.taken');
    case 'same': return t('renameKey.error.same');
  }
}

function writeErrorMessage(code: string): string {
  if (code === 'key-taken') return t('renameKey.error.taken');
  if (code === 'not-found') return t('renameKey.error.notFound');
  return code;
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
  width: 'min(480px, 92vw)',
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
  gap: 12,
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
const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  color: 'var(--muted-fg, #6a6a6a)',
  marginBottom: 4,
  display: 'block',
};
const oldKeyStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 4,
  background: 'var(--code-bg, #f4f4f4)',
  fontFamily: 'var(--mono, ui-monospace, monospace)',
  fontSize: 13,
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: 4,
  border: '1px solid var(--border, #c8c8c8)',
  background: 'var(--bg, #fff)',
  color: 'inherit',
  fontFamily: 'var(--mono, ui-monospace, monospace)',
  fontSize: 13,
  boxSizing: 'border-box',
};
const summaryStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 4,
  background: 'var(--code-bg, #f4f4f4)',
  fontSize: 13,
};
const errorTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: 'var(--cm-error-fg, #8a1f17)',
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

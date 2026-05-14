import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/t';

export interface InsertLinkDialogProps {
  open: boolean;
  /** Pre-filled display text (e.g. the editor selection). */
  initialText?: string;
  onClose: () => void;
  /**
   * Confirm callback. The toolbar inserts `[text](url)` (or
   * `[text](url "title")` when a title is provided). Implementation is in
   * the caller so this dialog stays generic enough for future image-link reuse.
   */
  onConfirm: (params: { text: string; url: string; title: string }) => void;
}

/**
 * Generic "insert link" modal opened from the Document-mode toolbar.
 *
 * Lazy-loaded (matches the v0.2.3 dialog pattern) so the editor's first paint
 * stays small. Designed to be a thin, reusable form — caller owns the actual
 * insertion logic against the EditorView so this dialog has no CodeMirror
 * coupling.
 *
 * Keyboard: Enter on the URL field (or anywhere when URL is non-empty) confirms;
 * Esc closes.
 */
export function InsertLinkDialog(props: InsertLinkDialogProps) {
  const { open, initialText = '', onClose, onConfirm } = props;
  const [text, setText] = useState(initialText);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const urlInputRef = useRef<HTMLInputElement>(null);

  // Reset state every time the dialog opens. Pre-fill the display text with
  // whatever the editor passed in (typically the current selection).
  useEffect(() => {
    if (!open) return;
    setText(initialText);
    setUrl('');
    setTitle('');
    // Defer focus to the URL field — that's the only required input, and the
    // user can tab back to display text if they want to change it.
    setTimeout(() => urlInputRef.current?.focus(), 0);
  }, [open, initialText]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const canConfirm = url.trim().length > 0;

  function handleConfirm() {
    if (!canConfirm) return;
    // Default the display text to the URL if the user left it blank — many
    // users paste a URL and confirm without thinking about anchor text.
    const finalText = text.trim() === '' ? url.trim() : text;
    onConfirm({ text: finalText, url: url.trim(), title: title.trim() });
    onClose();
  }

  return (
    <div
      style={backdropStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="insert-link-backdrop"
    >
      <div
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="insert-link-title"
        data-testid="insert-link-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <header style={headerStyle}>
          <h2 id="insert-link-title" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {t('insertLink.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('settings.close')}
            data-testid="insert-link-close"
            style={closeButtonStyle}
          >
            ×
          </button>
        </header>
        <div style={bodyStyle}>
          <label style={labelStyle}>
            <span>{t('insertLink.url')}</span>
            <input
              ref={urlInputRef}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
              placeholder="https://example.com"
              data-testid="insert-link-url"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            <span>{t('insertLink.text')}</span>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
              placeholder={t('insertLink.text.placeholder')}
              data-testid="insert-link-text"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            <span>{t('insertLink.linkTitle')}</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
              placeholder={t('insertLink.linkTitle.placeholder')}
              data-testid="insert-link-title-input"
              style={inputStyle}
            />
          </label>
        </div>
        <footer style={footerStyle}>
          <button
            type="button"
            onClick={onClose}
            style={baseButton}
            data-testid="insert-link-cancel"
          >
            {t('insertLink.cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={primaryButton}
            data-testid="insert-link-confirm"
          >
            {t('insertLink.confirm')}
          </button>
        </footer>
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
  gap: 10,
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 13,
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: 4,
  border: '1px solid var(--border, #c8c8c8)',
  background: 'var(--bg, #fff)',
  color: 'inherit',
  fontSize: 13,
  fontFamily: 'inherit',
  fontWeight: 400,
};

const baseButton: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 4,
  border: '1px solid var(--border, #c8c8c8)',
  background: 'var(--code-bg, #f5f5f5)',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 13,
};

const primaryButton: React.CSSProperties = {
  ...baseButton,
  background: 'var(--accent, #4a90e2)',
  borderColor: 'var(--accent, #4a90e2)',
  color: '#fff',
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  padding: '10px 18px 14px',
  borderTop: '1px solid var(--border, #e2e2e2)',
};

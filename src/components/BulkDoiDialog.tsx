import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/t';
import { useBibliographyStore } from '../store/bibliographyStore';

// Bulk DOI add: paste a list (newline / comma / semicolon separated),
// resolve each through Crossref + append to references.bib in sequence.
// Each row shows running status: pending then resolving then ok / error.
//
// Sequential rather than concurrent: Crossref's polite pool tolerates a
// small steady stream but penalises bursts; running 50 in parallel would
// land in the rate-limit category. The user can still see incremental
// progress, which is what bulk imports actually need.

export interface BulkDoiDialogProps {
  open: boolean;
  onClose: () => void;
  onResolved?: (key: string) => void;
}

type RowStatus = 'pending' | 'resolving' | 'ok' | 'error';

interface Row {
  raw: string;
  doi: string;
  status: RowStatus;
  key?: string;
  message?: string;
}

const DOI_RE = /\b10\.\d{4,9}\/\S+/;

export function BulkDoiDialog({ open, onClose, onResolved }: BulkDoiDialogProps) {
  const [rawInput, setRawInput] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cancelRef = useRef(false);
  const addFromDoi = useBibliographyStore((s) => s.addFromDoi);

  useEffect(() => {
    if (!open) return;
    setRawInput('');
    setRows([]);
    setRunning(false);
    cancelRef.current = false;
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !running) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, running]);

  if (!open) return null;

  function parsed(): Row[] {
    const out: Row[] = [];
    const seen = new Set<string>();
    for (const raw of rawInput.split(/[\n,;]+/)) {
      const m = DOI_RE.exec(raw);
      if (!m) continue;
      const cleaned = m[0].replace(/[>\]).,;]+$/, '');
      if (seen.has(cleaned)) continue;
      seen.add(cleaned);
      out.push({ raw: raw.trim(), doi: cleaned, status: 'pending' });
    }
    return out;
  }

  async function start() {
    const initial = parsed();
    if (initial.length === 0) return;
    setRows(initial);
    setRunning(true);
    cancelRef.current = false;
    for (let i = 0; i < initial.length; i++) {
      if (cancelRef.current) break;
      setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: 'resolving' } : r)));
      const result = await addFromDoi(initial[i]!.doi);
      setRows((prev) =>
        prev.map((r, idx) => {
          if (idx !== i) return r;
          if (result.ok) return { ...r, status: 'ok', key: result.key };
          return { ...r, status: 'error', message: result.message };
        }),
      );
      if (result.ok && onResolved) onResolved(result.key);
    }
    setRunning(false);
  }

  function handleCancel() {
    if (running) {
      cancelRef.current = true;
    } else {
      onClose();
    }
  }

  const previewRows = rows.length > 0 ? rows : parsed();

  return (
    <div
      style={backdropStyle}
      data-testid="bulk-doi-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget && !running) onClose(); }}
    >
      <div
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-doi-title"
        data-testid="bulk-doi-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <header style={headerStyle}>
          <h2 id="bulk-doi-title" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {t('bulkDoi.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            aria-label={t('settings.close')}
            style={closeBtnStyle}
          >×</button>
        </header>
        <div style={bodyStyle}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-fg, #6a6a6a)' }}>
            {t('bulkDoi.help')}
          </p>
          <textarea
            ref={inputRef}
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            disabled={running}
            placeholder={'10.1056/NEJMoa1234567\n10.1038/s41586-024-XXXXX\n10.1016/j.cell.2024.01.001'}
            data-testid="bulk-doi-input"
            style={textareaStyle}
          />
          {previewRows.length > 0 && (
            <div style={listStyle} data-testid="bulk-doi-rows">
              {previewRows.map((row, i) => (
                <RowView key={`${row.doi}:${i}`} row={row} />
              ))}
            </div>
          )}
        </div>
        <footer style={footerStyle}>
          <span style={{ fontSize: 12, color: 'var(--muted-fg, #6a6a6a)', flex: 1 }}>
            {previewRows.length > 0 && (
              <span>
                {countByStatus(rows, 'ok')}/{rows.length} {t('bulkDoi.added')}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={handleCancel}
            style={baseBtnStyle}
            data-testid="bulk-doi-cancel"
          >{running ? t('bulkDoi.stop') : t('insertCitation.cancel')}</button>
          <button
            type="button"
            onClick={() => { void start(); }}
            disabled={running || parsed().length === 0}
            style={primaryBtnStyle}
            data-testid="bulk-doi-start"
          >
            {running
              ? t('bulkDoi.processing')
              : `${t('bulkDoi.add')} (${parsed().length})`}
          </button>
        </footer>
      </div>
    </div>
  );
}

function RowView({ row }: { row: Row }) {
  const dot = statusDot(row.status);
  return (
    <div style={rowStyle} data-testid={`bulk-doi-row-${row.status}`}>
      <span style={{ ...dotStyle, background: dot.bg }} title={row.status}>{dot.glyph}</span>
      <span style={doiStyle}>{row.doi}</span>
      {row.key && <span style={keyStyle}>{`-> [@${row.key}]`}</span>}
      {row.message && <span style={msgStyle}>{row.message}</span>}
    </div>
  );
}

function statusDot(s: RowStatus): { bg: string; glyph: string } {
  switch (s) {
    case 'pending': return { bg: '#bbb', glyph: '·' };
    case 'resolving': return { bg: 'var(--accent, #4a90e2)', glyph: '⌛' };
    case 'ok': return { bg: 'var(--cm-success-fg, #1d6f3a)', glyph: '✓' };
    case 'error': return { bg: 'var(--cm-error-fg, #8a1f17)', glyph: '✗' };
  }
}

function countByStatus(rows: Row[], status: RowStatus): number {
  return rows.filter((r) => r.status === status).length;
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
  alignItems: 'center',
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
const textareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 100,
  padding: '6px 8px',
  borderRadius: 4,
  border: '1px solid var(--border, #c8c8c8)',
  background: 'var(--bg, #fff)',
  color: 'inherit',
  fontFamily: 'var(--mono, ui-monospace, monospace)',
  fontSize: 12,
  boxSizing: 'border-box',
  resize: 'vertical',
};
const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  fontFamily: 'var(--mono, ui-monospace, monospace)',
  fontSize: 12,
  maxHeight: 240,
  overflowY: 'auto',
};
const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '2px 6px',
};
const dotStyle: React.CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: '50%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 9,
  color: '#fff',
  flexShrink: 0,
};
const doiStyle: React.CSSProperties = { wordBreak: 'break-all' };
const keyStyle: React.CSSProperties = { color: 'var(--accent, #4a90e2)' };
const msgStyle: React.CSSProperties = { color: 'var(--cm-error-fg, #8a1f17)' };

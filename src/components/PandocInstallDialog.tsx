import { useEffect, useRef, useState } from 'react';

export type PandocInstallStatus =
  | { kind: 'idle' }
  | { kind: 'installing' }
  | { kind: 'installed' }
  | { kind: 'install-failed'; reason: string };

export interface PandocInstallDialogProps {
  /** When true, renders the dialog. When false, returns null. */
  open: boolean;
  /** Called when the user dismisses without resolving (Cancel / Esc / backdrop). */
  onClose: () => void;
  /** Called after the user takes a successful path (custom-path set OR brew install OK). */
  onResolved: () => void;
  /**
   * Override platform detection in tests. In production, the component reads
   * `navigator.platform`; pass 'mac' / 'other' here to make tests deterministic.
   */
  platformOverride?: 'mac' | 'other';
}

function detectMacPlatform(override: 'mac' | 'other' | undefined): boolean {
  if (override) return override === 'mac';
  if (typeof navigator === 'undefined') return false;
  const p = navigator.platform ?? '';
  return /mac/i.test(p);
}

const ALLOWED_DOWNLOAD_URL = 'https://pandoc.org/installing.html';

/**
 * Renders the "Pandoc required" dialog. Self-contained: owns its own
 * brew-availability probe, install-progress log, and toast state. The parent
 * decides when to open/close it and what the "retry" semantic means via
 * `onResolved`.
 */
export function PandocInstallDialog(props: PandocInstallDialogProps) {
  const { open, onClose, onResolved, platformOverride } = props;
  const isMac = detectMacPlatform(platformOverride);
  const [brewAvailable, setBrewAvailable] = useState<boolean | null>(null);
  const [status, setStatus] = useState<PandocInstallStatus>({ kind: 'idle' });
  const [progress, setProgress] = useState<string>('');
  const dialogRef = useRef<HTMLDivElement>(null);

  // Probe brew once when the dialog opens on macOS.
  useEffect(() => {
    if (!open || !isMac) return;
    let cancelled = false;
    void window.api.pandocDetectHomebrew().then((r) => {
      if (cancelled) return;
      setBrewAvailable(r.available);
    }).catch(() => {
      if (!cancelled) setBrewAvailable(false);
    });
    return () => { cancelled = true; };
  }, [open, isMac]);

  // Stream install progress lines. Subscribed only while the dialog is open.
  useEffect(() => {
    if (!open) return;
    return window.api.onPandocInstallProgress((chunk) => {
      setProgress((prev) => (prev + chunk).slice(-4000));
    });
  }, [open]);

  // Reset transient state every time the dialog re-opens.
  useEffect(() => {
    if (open) {
      setStatus({ kind: 'idle' });
      setProgress('');
    }
  }, [open]);

  // Esc to close (only when not mid-install).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && status.kind !== 'installing') {
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); };
  }, [open, status.kind, onClose]);

  if (!open) return null;

  const isInstalling = status.kind === 'installing';
  const installed = status.kind === 'installed';

  async function handleHomebrew() {
    setStatus({ kind: 'installing' });
    setProgress('');
    try {
      const r = await window.api.pandocInstallViaHomebrew();
      if (r.ok) {
        setStatus({ kind: 'installed' });
      } else {
        setStatus({ kind: 'install-failed', reason: r.error ?? 'install failed' });
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'install failed';
      setStatus({ kind: 'install-failed', reason });
    }
  }

  async function handleOpenDownload() {
    await window.api.shellOpenExternal(ALLOWED_DOWNLOAD_URL);
  }

  async function handleSetCustomPath() {
    const picked = await window.api.pandocPickCustomPath();
    if (!picked) return;
    const info = await window.api.pandocSetCustomPath(picked);
    if (info) {
      onResolved();
    } else {
      setStatus({
        kind: 'install-failed',
        reason: `Selected file does not appear to be a working pandoc binary: ${picked}`,
      });
    }
  }

  function handleRetry() {
    onResolved();
  }

  function handleCancel() {
    if (isInstalling) return;
    onClose();
  }

  const backdropStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.45)',
    zIndex: 9000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--cm-bg, #fff)',
    color: 'var(--cm-fg, #111)',
    borderRadius: 8,
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.35)',
    width: 'min(560px, 92vw)',
    maxHeight: '88vh',
    padding: '20px 24px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    fontSize: 14,
    lineHeight: 1.5,
  };

  const buttonRowStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 8,
  };

  const baseButton: React.CSSProperties = {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid var(--cm-border, #c8c8c8)',
    background: 'var(--cm-button-bg, #f5f5f5)',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: 13,
  };

  const primaryButton: React.CSSProperties = {
    ...baseButton,
    background: 'var(--cm-accent, #2d6cdf)',
    borderColor: 'var(--cm-accent, #2d6cdf)',
    color: '#fff',
  };

  return (
    <div
      style={backdropStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCancel();
      }}
      data-testid="pandoc-install-backdrop"
    >
      <div
        ref={dialogRef}
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pandoc-install-title"
        data-testid="pandoc-install-dialog"
      >
        <h2 id="pandoc-install-title" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          Pandoc required
        </h2>
        <p style={{ margin: 0 }}>
          Exporting to .docx, .tex, or importing .docx files needs Pandoc installed on
          your system. Pick one of the options below to continue.
        </p>

        {installed && (
          <div
            data-testid="pandoc-install-success"
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              background: 'var(--cm-success-bg, #e7f6ec)',
              color: 'var(--cm-success-fg, #1d6f3a)',
              border: '1px solid var(--cm-success-border, #a9d8b6)',
            }}
          >
            Pandoc installed successfully. You can retry your export or import now.
          </div>
        )}

        {status.kind === 'install-failed' && (
          <div
            data-testid="pandoc-install-error"
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              background: 'var(--cm-error-bg, #fdecea)',
              color: 'var(--cm-error-fg, #8a1f17)',
              border: '1px solid var(--cm-error-border, #f5b8b3)',
            }}
          >
            {status.reason}
          </div>
        )}

        {(isInstalling || progress.length > 0) && (
          <pre
            data-testid="pandoc-install-progress"
            style={{
              margin: 0,
              padding: 8,
              background: 'var(--cm-code-bg, #1e1e1e)',
              color: 'var(--cm-code-fg, #d4d4d4)',
              borderRadius: 6,
              fontSize: 12,
              maxHeight: 180,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {progress || (isInstalling ? 'Starting brew install pandoc…' : '')}
          </pre>
        )}

        <div style={buttonRowStyle}>
          {isMac && brewAvailable && !installed && (
            <button
              type="button"
              data-testid="pandoc-install-brew"
              onClick={() => { void handleHomebrew(); }}
              disabled={isInstalling}
              style={primaryButton}
            >
              {isInstalling ? 'Installing…' : 'Install via Homebrew'}
            </button>
          )}
          <button
            type="button"
            data-testid="pandoc-open-download"
            onClick={() => { void handleOpenDownload(); }}
            disabled={isInstalling}
            style={baseButton}
          >
            Open download page
          </button>
          <button
            type="button"
            data-testid="pandoc-set-custom-path"
            onClick={() => { void handleSetCustomPath(); }}
            disabled={isInstalling}
            style={baseButton}
          >
            Set custom path…
          </button>
          {installed ? (
            <button
              type="button"
              data-testid="pandoc-retry"
              onClick={handleRetry}
              style={primaryButton}
            >
              Retry
            </button>
          ) : (
            <button
              type="button"
              data-testid="pandoc-cancel"
              onClick={handleCancel}
              disabled={isInstalling}
              style={baseButton}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

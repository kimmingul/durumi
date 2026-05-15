import { useEffect, useRef } from 'react';
import { useToastStore, type ToastEntry } from '../store/toastStore';
import { t } from '../i18n/t';

function ToastCard({ entry }: { entry: ToastEntry }): JSX.Element {
  const dismiss = useToastStore((s) => s.dismiss);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const totalToasts = useToastStore((s) => s.toasts.length);
  useEffect(() => {
    if (entry.ttlMs == null) return;
    const id = window.setTimeout(() => dismiss(entry.id), entry.ttlMs);
    return () => window.clearTimeout(id);
  }, [entry.id, entry.ttlMs, dismiss]);

  // Esc-to-dismiss. Active when (a) the toast itself owns focus or (b) it is
  // the only toast on screen — in the second case the user has no other toast
  // they could be targeting, so a global Esc is unambiguous.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      const card = cardRef.current;
      if (!card) return;
      const focusedInside = card.contains(document.activeElement);
      const onlyToast = totalToasts === 1;
      if (!focusedInside && !onlyToast) return;
      dismiss(entry.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [entry.id, dismiss, totalToasts]);

  const onAction = (): void => {
    if (!entry.action) return;
    const result = entry.action.run();
    Promise.resolve(result)
      .then(() => dismiss(entry.id))
      .catch(() => {
        // Keep the toast visible so the caller can surface a follow-up error.
      });
  };

  // Toasts that carry an action button must announce promptly so screen-
  // reader users hear the action label before auto-dismiss; fire-and-forget
  // toasts stay polite to avoid interrupting other speech.
  const hasAction = entry.action != null;
  const toastRole = hasAction ? 'alert' : 'status';
  const liveMode = hasAction ? 'assertive' : 'polite';

  return (
    <div
      ref={cardRef}
      role={toastRole}
      aria-live={liveMode}
      data-testid="cm-toast"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        background: 'var(--toast-bg, rgba(28, 28, 30, 0.95))',
        color: 'var(--toast-fg, #fff)',
        borderRadius: 8,
        boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
        fontSize: 13,
        maxWidth: 420,
        pointerEvents: 'auto',
      }}
    >
      <span style={{ flex: 1 }}>{entry.message}</span>
      {entry.action && (
        <button
          type="button"
          data-testid="cm-toast-action"
          onClick={onAction}
          style={{
            background: 'transparent',
            border: '1px solid currentColor',
            color: 'inherit',
            borderRadius: 4,
            padding: '4px 10px',
            cursor: 'pointer',
            font: 'inherit',
          }}
        >
          {entry.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label={t('image.toastDismiss')}
        data-testid="cm-toast-dismiss"
        onClick={() => dismiss(entry.id)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: 16,
          lineHeight: 1,
          padding: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

export function ToastHost(): JSX.Element | null {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div
      data-testid="cm-toast-host"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 1000,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((entry) => (
        <ToastCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { ToastHost } from '../../src/components/Toast';
import { useToastStore, showToast } from '../../src/store/toastStore';

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<ToastHost />);
  });
  return {
    host,
    cleanup: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

beforeEach(() => {
  useToastStore.getState().clear();
});

afterEach(() => {
  useToastStore.getState().clear();
});

describe('Toast — a11y + dismissal', () => {
  it('uses role=alert + aria-live=assertive when the toast carries an action', () => {
    const ui = mount();
    try {
      act(() => {
        showToast({
          message: 'queued',
          action: { label: 'Save as…', run: () => {} },
          ttlMs: null,
        });
      });
      const card = document.querySelector('[data-testid="cm-toast"]');
      expect(card).not.toBeNull();
      expect(card!.getAttribute('role')).toBe('alert');
      expect(card!.getAttribute('aria-live')).toBe('assertive');
    } finally {
      ui.cleanup();
    }
  });

  it('uses role=status + aria-live=polite for fire-and-forget toasts', () => {
    const ui = mount();
    try {
      act(() => {
        showToast({ message: 'plain', ttlMs: null });
      });
      const card = document.querySelector('[data-testid="cm-toast"]');
      expect(card).not.toBeNull();
      expect(card!.getAttribute('role')).toBe('status');
      expect(card!.getAttribute('aria-live')).toBe('polite');
    } finally {
      ui.cleanup();
    }
  });

  it('localizes the dismiss button aria-label (no hard-coded English)', () => {
    const ui = mount();
    try {
      act(() => {
        showToast({ message: 'x', ttlMs: null });
      });
      const dismiss = document.querySelector('[data-testid="cm-toast-dismiss"]');
      expect(dismiss).not.toBeNull();
      // English is the default — but the value comes from the dictionary,
      // not a string literal in the JSX, so a missing key would surface
      // as the raw key name.
      const label = dismiss!.getAttribute('aria-label');
      expect(label).toBe('Dismiss');
      expect(label).not.toBe('image.toastDismiss');
    } finally {
      ui.cleanup();
    }
  });

  it('Esc dismisses the toast when it is the only one on screen', () => {
    const ui = mount();
    try {
      let id = 0;
      act(() => {
        id = showToast({ message: 'lonely', ttlMs: null });
      });
      expect(useToastStore.getState().toasts).toHaveLength(1);
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });
      expect(useToastStore.getState().toasts).toHaveLength(0);
      // Make sure dismissed id matches what we showed.
      expect(useToastStore.getState().toasts.find((t) => t.id === id)).toBeUndefined();
    } finally {
      ui.cleanup();
    }
  });
});

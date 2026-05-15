import { describe, it, expect, beforeEach } from 'vitest';
import { useToastStore, showToast, dismissToast } from '../../src/store/toastStore';

describe('toastStore', () => {
  beforeEach(() => {
    useToastStore.getState().clear();
  });

  it('starts empty', () => {
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it('appends a toast and returns its id', () => {
    const id = showToast({ message: 'hello' });
    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]!.id).toBe(id);
    expect(toasts[0]!.message).toBe('hello');
    expect(toasts[0]!.action).toBeNull();
    expect(toasts[0]!.ttlMs).toBe(6000);
  });

  it('respects an explicit null TTL (manual-dismiss only)', () => {
    showToast({ message: 'sticky', ttlMs: null });
    expect(useToastStore.getState().toasts[0]!.ttlMs).toBeNull();
  });

  it('keeps an action when one is provided', () => {
    showToast({ message: 'with-action', action: { label: 'Run', run: () => {} } });
    const { toasts } = useToastStore.getState();
    expect(toasts[0]!.action?.label).toBe('Run');
  });

  it('dismisses by id', () => {
    const idA = showToast({ message: 'a' });
    const idB = showToast({ message: 'b' });
    dismissToast(idA);
    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]!.id).toBe(idB);
  });

  it('clear() removes everything', () => {
    showToast({ message: 'a' });
    showToast({ message: 'b' });
    useToastStore.getState().clear();
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it('issues monotonically increasing ids', () => {
    const a = showToast({ message: 'a' });
    const b = showToast({ message: 'b' });
    expect(b).toBeGreaterThan(a);
  });
});

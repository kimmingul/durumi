import { describe, it, expect, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { ChangesTab } from '../../src/components/sidebar/ChangesTab';

function mount(content: string, onJump: (line: number) => void = () => {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<ChangesTab content={content} onJump={onJump} />);
  });
  return {
    host,
    cleanup: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe('ChangesTab', () => {
  it('renders an empty-state message when there are no tracked changes', async () => {
    const { host, cleanup } = mount('plain text without operators');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(host.querySelector('.cm-comments-empty')).not.toBeNull();
    cleanup();
  });

  it('groups annotations by kind, with a count per group', async () => {
    const doc = '{++ ins ++}\n{++ ins2 ++}\n{-- del --}\n{== mark ==}';
    const { host, cleanup } = mount(doc);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(host.querySelectorAll('.cm-changes-group-insert').length).toBe(1);
    expect(host.querySelectorAll('.cm-changes-group-delete').length).toBe(1);
    expect(host.querySelectorAll('.cm-changes-group-highlight').length).toBe(1);
    // 2 insert rows, 1 delete row, 1 highlight row.
    expect(host.querySelectorAll('[data-testid="cm-row-insert"]').length).toBe(2);
    expect(host.querySelectorAll('[data-testid="cm-row-delete"]').length).toBe(1);
    expect(host.querySelectorAll('[data-testid="cm-row-highlight"]').length).toBe(1);
    cleanup();
  });

  it('invokes onJump with the source line when a row is clicked', async () => {
    const onJump = vi.fn();
    const doc = 'first line\nsecond {++ inserted ++} line';
    const { host, cleanup } = mount(doc, onJump);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    const row = host.querySelector('[data-testid="cm-row-insert"]') as HTMLButtonElement;
    expect(row).not.toBeNull();
    act(() => row.click());
    expect(onJump).toHaveBeenCalledWith(2);
    cleanup();
  });

  it('exposes the help-toggle button regardless of whether changes exist', async () => {
    {
      const { host, cleanup } = mount('no changes');
      await act(async () => {
        await new Promise((r) => setTimeout(r, 150));
      });
      expect(host.querySelector('[data-testid="cm-help-toggle"]')).not.toBeNull();
      cleanup();
    }
    {
      const { host, cleanup } = mount('a {++ x ++} b');
      await act(async () => {
        await new Promise((r) => setTimeout(r, 150));
      });
      expect(host.querySelector('[data-testid="cm-help-toggle"]')).not.toBeNull();
      cleanup();
    }
  });

  it('renders all five kinds when present', async () => {
    const doc =
      '{++ a ++} {-- b --} {~~ x ~> y ~~} {== c ==} {>> d <<}';
    const { host, cleanup } = mount(doc);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(host.querySelectorAll('[data-testid="cm-row-insert"]').length).toBe(1);
    expect(host.querySelectorAll('[data-testid="cm-row-delete"]').length).toBe(1);
    expect(host.querySelectorAll('[data-testid="cm-row-substitution"]').length).toBe(1);
    expect(host.querySelectorAll('[data-testid="cm-row-highlight"]').length).toBe(1);
    expect(host.querySelectorAll('[data-testid="cm-row-comment"]').length).toBe(1);
    cleanup();
  });
});

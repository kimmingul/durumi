import { describe, it, expect, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { CommentsTab } from '../../src/components/sidebar/CommentsTab';

function mount(content: string, onJump: (line: number) => void = () => {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<CommentsTab content={content} onJump={onJump} />);
  });
  return {
    host,
    cleanup: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe('CommentsTab', () => {
  it('renders an empty-state message when there are no memos', async () => {
    const { host, cleanup } = mount('plain text\nno memos');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(host.querySelector('.cm-comments-empty')).not.toBeNull();
    cleanup();
  });

  it('renders one row per memo with the correct chip and line number', async () => {
    const doc = '%% @ai stats verify %%\nnext line %% @todo tweak %%';
    const { host, cleanup } = mount(doc);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    const rows = host.querySelectorAll('.cm-comments-row');
    expect(rows.length).toBe(2);
    expect(host.querySelectorAll('.cm-comments-chip-ai').length).toBe(1);
    expect(host.querySelectorAll('.cm-comments-chip-todo').length).toBe(1);
    expect(host.textContent).toContain('L1');
    expect(host.textContent).toContain('L2');
    cleanup();
  });

  it('falls back to a neutral chip for untagged memos', async () => {
    const { host, cleanup } = mount('a %% bare note %% b');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(host.querySelector('.cm-comments-chip-untagged')).not.toBeNull();
    cleanup();
  });

  it('invokes onJump with the memo line on click', async () => {
    const onJump = vi.fn();
    const doc = 'one\ntwo %% @ai later %%';
    const { host, cleanup } = mount(doc, onJump);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    const row = host.querySelector('.cm-comments-row') as HTMLButtonElement;
    expect(row).not.toBeNull();
    act(() => row.click());
    expect(onJump).toHaveBeenCalledWith(2);
    cleanup();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { BulkDoiDialog } from '../../src/components/BulkDoiDialog';
import { useBibliographyStore } from '../../src/store/bibliographyStore';

function setInputValue(el: HTMLTextAreaElement | HTMLInputElement, v: string) {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  setter.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const onClose = vi.fn();
  act(() => {
    root.render(<BulkDoiDialog open={true} onClose={onClose} />);
  });
  return {
    host,
    onClose,
    cleanup: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

beforeEach(() => {
  useBibliographyStore.setState({
    filePath: '/p/references.bib',
    exists: true,
    entries: [],
    loading: false,
    fileStatus: {},
    downloading: {},
    orphanFiles: [],
  });
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).api;
  useBibliographyStore.setState({
    filePath: null,
    exists: false,
    entries: [],
    loading: false,
    fileStatus: {},
    downloading: {},
    orphanFiles: [],
  });
});

describe('BulkDoiDialog', () => {
  it('parses newline-separated DOIs', async () => {
    const { host, cleanup } = mount();
    const ta = host.querySelector('[data-testid="bulk-doi-input"]') as HTMLTextAreaElement;
    await act(async () => {
      setInputValue(ta, '10.1056/NEJMoa1234567\n10.1038/nature01\n10.1016/j.cell.01');
    });
    const start = host.querySelector('[data-testid="bulk-doi-start"]') as HTMLButtonElement;
    expect(start.textContent).toContain('(3)');
    cleanup();
  });

  it('parses comma- and semicolon-separated DOIs', async () => {
    const { host, cleanup } = mount();
    const ta = host.querySelector('[data-testid="bulk-doi-input"]') as HTMLTextAreaElement;
    await act(async () => {
      setInputValue(ta, '10.1056/a, 10.1038/b; 10.1016/c');
    });
    const start = host.querySelector('[data-testid="bulk-doi-start"]') as HTMLButtonElement;
    expect(start.textContent).toContain('(3)');
    cleanup();
  });

  it('deduplicates the same DOI appearing twice', async () => {
    const { host, cleanup } = mount();
    const ta = host.querySelector('[data-testid="bulk-doi-input"]') as HTMLTextAreaElement;
    await act(async () => {
      setInputValue(ta, '10.1056/x\n10.1056/x\n10.1038/y');
    });
    const start = host.querySelector('[data-testid="bulk-doi-start"]') as HTMLButtonElement;
    expect(start.textContent).toContain('(2)');
    cleanup();
  });

  it('disables start when no DOI parses out', async () => {
    const { host, cleanup } = mount();
    const ta = host.querySelector('[data-testid="bulk-doi-input"]') as HTMLTextAreaElement;
    await act(async () => {
      setInputValue(ta, 'just plain text');
    });
    const start = host.querySelector('[data-testid="bulk-doi-start"]') as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    cleanup();
  });

  it('processes rows sequentially and reports per-row status', async () => {
    const addFromDoi = vi.fn(async (doi: string) => {
      if (doi === '10.9999/bad') {
        return { ok: false as const, code: 'not-found', message: '404' };
      }
      return { ok: true as const, key: `key-${doi.split('/')[1]}` };
    });
    useBibliographyStore.setState({ addFromDoi } as never);
    const { host, cleanup } = mount();
    const ta = host.querySelector('[data-testid="bulk-doi-input"]') as HTMLTextAreaElement;
    await act(async () => {
      setInputValue(ta, '10.1056/a\n10.9999/bad\n10.1038/b');
    });
    const start = host.querySelector('[data-testid="bulk-doi-start"]') as HTMLButtonElement;
    await act(async () => {
      start.click();
      // Yield enough microtasks for the sequential processing to complete.
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(addFromDoi).toHaveBeenCalledTimes(3);
    expect(host.querySelectorAll('[data-testid="bulk-doi-row-ok"]').length).toBe(2);
    expect(host.querySelectorAll('[data-testid="bulk-doi-row-error"]').length).toBe(1);
    cleanup();
  });
});

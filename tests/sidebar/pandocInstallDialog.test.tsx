import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PandocInstallDialog } from '../../src/components/PandocInstallDialog';

interface ApiMock {
  pandocDetectHomebrew: ReturnType<typeof vi.fn>;
  pandocInstallViaHomebrew: ReturnType<typeof vi.fn>;
  pandocSetCustomPath: ReturnType<typeof vi.fn>;
  pandocPickCustomPath: ReturnType<typeof vi.fn>;
  shellOpenExternal: ReturnType<typeof vi.fn>;
  onPandocInstallProgress: ReturnType<typeof vi.fn>;
}

function installApiMock(): ApiMock {
  const api: ApiMock = {
    pandocDetectHomebrew: vi.fn().mockResolvedValue({ available: true, path: '/opt/homebrew/bin/brew' }),
    pandocInstallViaHomebrew: vi.fn().mockResolvedValue({ ok: true }),
    pandocSetCustomPath: vi.fn().mockResolvedValue({ binary: '/usr/bin/pandoc', version: '3.5' }),
    pandocPickCustomPath: vi.fn().mockResolvedValue('/usr/bin/pandoc'),
    shellOpenExternal: vi.fn().mockResolvedValue({ ok: true }),
    onPandocInstallProgress: vi.fn().mockReturnValue(() => {}),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = api;
  return api;
}

interface Mounted {
  root: Root;
  container: HTMLDivElement;
  unmount: () => void;
}

interface RenderOpts {
  open?: boolean;
  platform?: 'mac' | 'other';
  onClose?: () => void;
  onResolved?: () => void;
}

function mount(opts: RenderOpts = {}): Mounted {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <PandocInstallDialog
        open={opts.open ?? true}
        onClose={opts.onClose ?? (() => {})}
        onResolved={opts.onResolved ?? (() => {})}
        platformOverride={opts.platform ?? 'mac'}
      />,
    );
  });
  return {
    root,
    container,
    unmount: () => {
      act(() => { root.unmount(); });
      container.remove();
    },
  };
}

async function flush() {
  // Resolve a microtask + a macrotask so vi.fn promises settle and effects run.
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

beforeEach(() => {
  installApiMock();
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).api;
});

describe('PandocInstallDialog', () => {
  it('does not render when closed', () => {
    const m = mount({ open: false });
    expect(document.querySelector('[data-testid="pandoc-install-dialog"]')).toBeNull();
    m.unmount();
  });

  it('renders title and three buttons on macOS when brew is available', async () => {
    const m = mount({ platform: 'mac' });
    await flush();
    const dialog = document.querySelector('[data-testid="pandoc-install-dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain('Pandoc required');
    expect(document.querySelector('[data-testid="pandoc-install-brew"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="pandoc-open-download"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="pandoc-set-custom-path"]')).not.toBeNull();
    m.unmount();
  });

  it('hides the Homebrew button on non-mac platforms', async () => {
    const m = mount({ platform: 'other' });
    await flush();
    expect(document.querySelector('[data-testid="pandoc-install-brew"]')).toBeNull();
    expect(document.querySelector('[data-testid="pandoc-open-download"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="pandoc-set-custom-path"]')).not.toBeNull();
    m.unmount();
  });

  it('hides the Homebrew button on macOS when brew is not installed', async () => {
    const api = installApiMock();
    api.pandocDetectHomebrew.mockResolvedValue({ available: false, path: null });
    const m = mount({ platform: 'mac' });
    await flush();
    expect(document.querySelector('[data-testid="pandoc-install-brew"]')).toBeNull();
    m.unmount();
  });

  it('invokes shellOpenExternal when Open download page is clicked', async () => {
    const api = installApiMock();
    const m = mount({ platform: 'other' });
    await flush();
    const btn = document.querySelector('[data-testid="pandoc-open-download"]') as HTMLButtonElement;
    await act(async () => { btn.click(); });
    expect(api.shellOpenExternal).toHaveBeenCalledWith('https://pandoc.org/installing.html');
    m.unmount();
  });

  it('runs Homebrew install and shows the success toast on ok', async () => {
    const api = installApiMock();
    const m = mount({ platform: 'mac' });
    await flush();
    const btn = document.querySelector('[data-testid="pandoc-install-brew"]') as HTMLButtonElement;
    await act(async () => { btn.click(); });
    await flush();
    expect(api.pandocInstallViaHomebrew).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-testid="pandoc-install-success"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="pandoc-retry"]')).not.toBeNull();
    m.unmount();
  });

  it('shows the error toast when Homebrew install fails', async () => {
    const api = installApiMock();
    api.pandocInstallViaHomebrew.mockResolvedValue({
      ok: false,
      code: 'install-failed',
      error: 'brew install pandoc exited with code 1',
    });
    const m = mount({ platform: 'mac' });
    await flush();
    const btn = document.querySelector('[data-testid="pandoc-install-brew"]') as HTMLButtonElement;
    await act(async () => { btn.click(); });
    await flush();
    const err = document.querySelector('[data-testid="pandoc-install-error"]');
    expect(err).not.toBeNull();
    expect(err!.textContent).toContain('exited with code 1');
    m.unmount();
  });

  it('Set custom path picks a file, persists it, and calls onResolved', async () => {
    const api = installApiMock();
    const onResolved = vi.fn();
    const m = mount({ platform: 'other', onResolved });
    await flush();
    const btn = document.querySelector('[data-testid="pandoc-set-custom-path"]') as HTMLButtonElement;
    await act(async () => { btn.click(); });
    await flush();
    expect(api.pandocPickCustomPath).toHaveBeenCalled();
    expect(api.pandocSetCustomPath).toHaveBeenCalledWith('/usr/bin/pandoc');
    expect(onResolved).toHaveBeenCalledTimes(1);
    m.unmount();
  });

  it('does NOT call onResolved when the file picker is cancelled', async () => {
    const api = installApiMock();
    api.pandocPickCustomPath.mockResolvedValue(null);
    const onResolved = vi.fn();
    const m = mount({ platform: 'other', onResolved });
    await flush();
    const btn = document.querySelector('[data-testid="pandoc-set-custom-path"]') as HTMLButtonElement;
    await act(async () => { btn.click(); });
    await flush();
    expect(api.pandocSetCustomPath).not.toHaveBeenCalled();
    expect(onResolved).not.toHaveBeenCalled();
    m.unmount();
  });

  it('Cancel button closes the dialog', async () => {
    const onClose = vi.fn();
    const m = mount({ platform: 'other', onClose });
    await flush();
    const btn = document.querySelector('[data-testid="pandoc-cancel"]') as HTMLButtonElement;
    await act(async () => { btn.click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
    m.unmount();
  });

  it('Esc key closes the dialog when not installing', async () => {
    const onClose = vi.fn();
    const m = mount({ platform: 'other', onClose });
    await flush();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    m.unmount();
  });

  it('Retry button (post-success) calls onResolved', async () => {
    const onResolved = vi.fn();
    const m = mount({ platform: 'mac', onResolved });
    await flush();
    const installBtn = document.querySelector('[data-testid="pandoc-install-brew"]') as HTMLButtonElement;
    await act(async () => { installBtn.click(); });
    await flush();
    const retry = document.querySelector('[data-testid="pandoc-retry"]') as HTMLButtonElement;
    expect(retry).not.toBeNull();
    await act(async () => { retry.click(); });
    expect(onResolved).toHaveBeenCalledTimes(1);
    m.unmount();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SettingsDialog } from '../../src/components/SettingsDialog';
import type { Preferences } from '@shared/ipc-contract';

const styleSpec = (size: number, weight = 400) => ({
  fontFamily: 'sans-serif',
  fontSizePx: size,
  fontWeight: weight,
  color: null,
  lineHeight: 1.5,
});

const DEFAULT_PREFS: Preferences = {
  theme: 'system',
  language: 'system',
  lastWindow: { width: 980, height: 720 },
  recentFiles: [],
  sidebar: { visible: true, activeTab: 'files', width: 240 },
  rightSidebar: { visible: false, activeTab: 'references', width: 320 },
  memoPanel: { width: 320, hideResolvedDefault: false, groupBy: 'line' },
  author: { name: 'tester' },
  workspaceFolders: [],
  recentFolders: [],
  pandocPath: null,
  docxStyleReference: null,
  latexTemplate: null,
  spellCheckLanguages: ['en-US'],
  spellCheckCustomWords: [],
  exportPreserveAnnotations: false,
  exportIncludeComments: false,
  exportInlineImages: false,
  editor: {
    defaultMode: 'wysiwyg',
    activePreset: null,
    styles: {
      body: styleSpec(16),
      h1: styleSpec(28, 700),
      h2: styleSpec(24, 700),
      h3: styleSpec(20, 700),
      h4: styleSpec(18, 600),
      h5: styleSpec(16, 600),
      h6: styleSpec(15, 600),
      blockquote: styleSpec(16),
      code: { ...styleSpec(14), fontFamily: 'monospace' },
      tableHeader: styleSpec(16, 600),
    },
    tableStyleFormat: 'pandoc',
  },
  bibliography: {
    email: null,
    ncbiApiKey: null,
    orcidId: null,
    insertCitationOnAdd: false,
    autoSaveAbstract: false,
    sortBy: 'addedDesc',
  },
  ai: {
    provider: 'anthropic',
    anthropicKey: '',
    anthropicModel: 'claude-3-5-sonnet-20241022',
    openaiKey: '',
    openaiBaseUrl: '',
    openaiModel: '',
    ghostTextEnabled: false,
    ghostTextIdleMs: 1000,
    ghostTextSessionCap: 50,
  },
};

interface ApiMock {
  prefsGet: ReturnType<typeof vi.fn>;
  prefsSet: ReturnType<typeof vi.fn>;
  pandocDetect: ReturnType<typeof vi.fn>;
  pandocPickCustomPath: ReturnType<typeof vi.fn>;
  pandocSetCustomPath: ReturnType<typeof vi.fn>;
  dialogPickFile: ReturnType<typeof vi.fn>;
  shellOpenExternal: ReturnType<typeof vi.fn>;
}

function installApiMock(prefs: Preferences = DEFAULT_PREFS): ApiMock {
  const api: ApiMock = {
    prefsGet: vi.fn().mockResolvedValue(prefs),
    prefsSet: vi.fn().mockResolvedValue(undefined),
    pandocDetect: vi.fn().mockResolvedValue({ binary: '/usr/bin/pandoc', version: '3.5' }),
    pandocPickCustomPath: vi.fn().mockResolvedValue('/usr/local/bin/pandoc'),
    pandocSetCustomPath: vi.fn().mockResolvedValue({ binary: '/usr/local/bin/pandoc', version: '3.5' }),
    dialogPickFile: vi.fn().mockResolvedValue('/tmp/picked-file'),
    shellOpenExternal: vi.fn().mockResolvedValue({ ok: true }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = api;
  return api;
}

interface Mounted { container: HTMLDivElement; root: Root; unmount: () => void }
function mount(opts: { open?: boolean; onClose?: () => void; onRequestPandocInstall?: () => void } = {}): Mounted {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <SettingsDialog
        open={opts.open ?? true}
        onClose={opts.onClose ?? (() => {})}
        onRequestPandocInstall={opts.onRequestPandocInstall}
      />,
    );
  });
  return {
    container,
    root,
    unmount: () => {
      act(() => { root.unmount(); });
      container.remove();
    },
  };
}

async function flush() {
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

describe('SettingsDialog', () => {
  it('does not render when closed', () => {
    const m = mount({ open: false });
    expect(document.querySelector('[data-testid="settings-dialog"]')).toBeNull();
    m.unmount();
  });

  it('renders the dialog and reflects loaded prefs on mount', async () => {
    const api = installApiMock({
      ...DEFAULT_PREFS,
      theme: 'dark',
      pandocPath: '/usr/local/bin/pandoc',
      docxStyleReference: '/refs/style.docx',
      spellCheckLanguages: ['en-US', 'fr-FR'],
      spellCheckCustomWords: ['Durumi', 'Pandoc'],
    });
    const m = mount();
    await flush();
    expect(api.prefsGet).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-testid="settings-dialog"]')).not.toBeNull();
    const themeDark = document.querySelector('[data-testid="settings-theme-dark"]') as HTMLInputElement;
    expect(themeDark.checked).toBe(true);
    const themeSystem = document.querySelector('[data-testid="settings-theme-system"]') as HTMLInputElement;
    expect(themeSystem.checked).toBe(false);
    const path = document.querySelector('[data-testid="settings-pandoc-path"]') as HTMLInputElement;
    expect(path.value).toBe('/usr/local/bin/pandoc');
    const docx = document.querySelector('[data-testid="settings-docx-style-input"]') as HTMLInputElement;
    expect(docx.value).toBe('/refs/style.docx');
    const en = document.querySelector('[data-testid="settings-spell-en-US"]') as HTMLInputElement;
    const fr = document.querySelector('[data-testid="settings-spell-fr-FR"]') as HTMLInputElement;
    const de = document.querySelector('[data-testid="settings-spell-de-DE"]') as HTMLInputElement;
    expect(en.checked).toBe(true);
    expect(fr.checked).toBe(true);
    expect(de.checked).toBe(false);
    const wordList = document.querySelector('[data-testid="settings-spell-words"]');
    expect(wordList?.textContent).toContain('Durumi');
    expect(wordList?.textContent).toContain('Pandoc');
    m.unmount();
  });

  it('changing the theme radio calls prefsSet({ theme: "dark" })', async () => {
    const api = installApiMock();
    const m = mount();
    await flush();
    const dark = document.querySelector('[data-testid="settings-theme-dark"]') as HTMLInputElement;
    await act(async () => { dark.click(); });
    expect(api.prefsSet).toHaveBeenCalledWith({ theme: 'dark' });
    m.unmount();
  });

  it('changing the language radio calls prefsSet({ language: "ko" })', async () => {
    const api = installApiMock();
    const m = mount();
    await flush();
    const ko = document.querySelector('[data-testid="settings-language-ko"]') as HTMLInputElement;
    await act(async () => { ko.click(); });
    expect(api.prefsSet).toHaveBeenCalledWith({ language: 'ko' });
    m.unmount();
  });

  it('Browse for docx style invokes dialogPickFile and persists the result', async () => {
    const api = installApiMock();
    api.dialogPickFile.mockResolvedValue('/tmp/style.docx');
    const m = mount();
    await flush();
    const browse = document.querySelector('[data-testid="settings-docx-style-browse"]') as HTMLButtonElement;
    await act(async () => { browse.click(); });
    await flush();
    expect(api.dialogPickFile).toHaveBeenCalledTimes(1);
    const [opts] = api.dialogPickFile.mock.calls[0] as [{ filters?: Array<{ extensions: string[] }> }];
    expect(opts.filters?.[0]?.extensions).toContain('docx');
    expect(api.prefsSet).toHaveBeenCalledWith({ docxStyleReference: '/tmp/style.docx' });
    m.unmount();
  });

  it('Browse for LaTeX template invokes dialogPickFile with .tex filter', async () => {
    const api = installApiMock();
    api.dialogPickFile.mockResolvedValue('/tmp/article.tex');
    const m = mount();
    await flush();
    const browse = document.querySelector('[data-testid="settings-latex-template-browse"]') as HTMLButtonElement;
    await act(async () => { browse.click(); });
    await flush();
    const [opts] = api.dialogPickFile.mock.calls[0] as [{ filters?: Array<{ extensions: string[] }> }];
    expect(opts.filters?.[0]?.extensions).toContain('tex');
    expect(api.prefsSet).toHaveBeenCalledWith({ latexTemplate: '/tmp/article.tex' });
    m.unmount();
  });

  it('Browse for pandoc binary calls pandocPickCustomPath + pandocSetCustomPath', async () => {
    const api = installApiMock();
    const m = mount();
    await flush();
    const browse = document.querySelector('[data-testid="settings-pandoc-browse"]') as HTMLButtonElement;
    await act(async () => { browse.click(); });
    await flush();
    expect(api.pandocPickCustomPath).toHaveBeenCalledTimes(1);
    expect(api.pandocSetCustomPath).toHaveBeenCalledWith('/usr/local/bin/pandoc');
    expect(api.prefsSet).toHaveBeenCalledWith({ pandocPath: '/usr/local/bin/pandoc' });
    m.unmount();
  });

  it('shows the green ok status when pandoc is detected', async () => {
    const api = installApiMock();
    api.pandocDetect.mockResolvedValue({ binary: '/usr/bin/pandoc', version: '3.5' });
    const m = mount();
    await flush();
    const ok = document.querySelector('[data-testid="settings-pandoc-status-ok"]');
    expect(ok).not.toBeNull();
    expect(ok!.textContent).toContain('3.5');
    m.unmount();
  });

  it('shows the missing status with an Install button when pandoc is absent', async () => {
    const api = installApiMock();
    api.pandocDetect.mockResolvedValue(null);
    const onRequestPandocInstall = vi.fn();
    const m = mount({ onRequestPandocInstall });
    await flush();
    const missing = document.querySelector('[data-testid="settings-pandoc-status-missing"]');
    expect(missing).not.toBeNull();
    const installBtn = document.querySelector('[data-testid="settings-pandoc-install"]') as HTMLButtonElement;
    expect(installBtn).not.toBeNull();
    await act(async () => { installBtn.click(); });
    expect(onRequestPandocInstall).toHaveBeenCalledTimes(1);
    m.unmount();
  });

  it('falls back to a "How to install" link when no parent install handler is supplied', async () => {
    const api = installApiMock();
    api.pandocDetect.mockResolvedValue(null);
    const m = mount();
    await flush();
    const help = document.querySelector('[data-testid="settings-pandoc-help"]') as HTMLButtonElement;
    expect(help).not.toBeNull();
    await act(async () => { help.click(); });
    expect(api.shellOpenExternal).toHaveBeenCalledWith('https://pandoc.org/installing.html');
    m.unmount();
  });

  it('toggles a spell-check language checkbox and persists the new array', async () => {
    const api = installApiMock();
    const m = mount();
    await flush();
    const fr = document.querySelector('[data-testid="settings-spell-fr-FR"]') as HTMLInputElement;
    await act(async () => { fr.click(); });
    expect(api.prefsSet).toHaveBeenCalledWith({
      spellCheckLanguages: ['en-US', 'fr-FR'],
    });
    m.unmount();
  });

  it('adds a custom dictionary word and removes it', async () => {
    const api = installApiMock();
    const m = mount();
    await flush();
    const input = document.querySelector('[data-testid="settings-spell-newword"]') as HTMLInputElement;
    // React tracks an internal "lastKnownValue"; setting .value directly bypasses
    // the synthetic onChange. Use the native setter so React picks up the change.
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!;
    await act(async () => {
      nativeSetter.call(input, 'Durumi');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const addBtn = document.querySelector('[data-testid="settings-spell-add"]') as HTMLButtonElement;
    await act(async () => { addBtn.click(); });
    await flush();
    expect(api.prefsSet).toHaveBeenCalledWith({ spellCheckCustomWords: ['Durumi'] });
    // Now remove it: button label "Remove Durumi"
    const removeBtn = document.querySelector('[aria-label="Remove Durumi"]') as HTMLButtonElement;
    expect(removeBtn).not.toBeNull();
    await act(async () => { removeBtn.click(); });
    await flush();
    expect(api.prefsSet).toHaveBeenCalledWith({ spellCheckCustomWords: [] });
    m.unmount();
  });

  it('Esc key closes the dialog', async () => {
    installApiMock();
    const onClose = vi.fn();
    const m = mount({ onClose });
    await flush();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    m.unmount();
  });

  it('clicking the backdrop closes the dialog', async () => {
    installApiMock();
    const onClose = vi.fn();
    const m = mount({ onClose });
    await flush();
    const backdrop = document.querySelector('[data-testid="settings-backdrop"]') as HTMLDivElement;
    await act(async () => { backdrop.click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
    m.unmount();
  });

  it('clicking inside the dialog does not close it', async () => {
    installApiMock();
    const onClose = vi.fn();
    const m = mount({ onClose });
    await flush();
    const dialog = document.querySelector('[data-testid="settings-dialog"]') as HTMLDivElement;
    await act(async () => { dialog.click(); });
    expect(onClose).not.toHaveBeenCalled();
    m.unmount();
  });

  it('the close button calls onClose', async () => {
    installApiMock();
    const onClose = vi.fn();
    const m = mount({ onClose });
    await flush();
    const close = document.querySelector('[data-testid="settings-close"]') as HTMLButtonElement;
    await act(async () => { close.click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
    m.unmount();
  });
});

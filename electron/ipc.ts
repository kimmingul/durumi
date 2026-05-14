import { BrowserWindow, nativeTheme } from 'electron';
import { makeKeyVault } from './aiKeys';
import { registerAiHandlers } from './ipc/ai';
import { registerBibliographyHandlers } from './ipc/bibliography';
import { registerBibliographyFetchHandlers } from './ipc/bibliographyFetch';
import { registerFilesHandlers } from './ipc/files';
import { registerPandocHandlers } from './ipc/pandoc';
import { registerPreferencesHandlers } from './ipc/preferences';
import { registerReferenceHandlers } from './ipc/reference';
import { registerSearchHandlers } from './ipc/search';
import { registerShellHandlers } from './ipc/shell';

// Re-exports kept for tests that import these helpers directly.
export {
  findOwningRoot,
  isExternalUrlAllowed,
  memoSidecarPathFor,
  readMemoSidecar,
  writeMemoSidecar,
} from './ipc/_shared';

export function registerIpcHandlers(): void {
  const vault = makeKeyVault();

  registerFilesHandlers();
  registerPreferencesHandlers();
  registerSearchHandlers();
  registerBibliographyHandlers();
  registerBibliographyFetchHandlers();
  registerReferenceHandlers();
  registerAiHandlers(vault);
  registerPandocHandlers();
  registerShellHandlers();

  nativeTheme.on('updated', () => {
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('theme:changed', theme));
  });
}

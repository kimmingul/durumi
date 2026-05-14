import { ipcMain } from 'electron';
import { searchInWorkspace, type SearchOptions } from '../search';
import { assertAllowedPath } from '../pathGuard';

export function registerSearchHandlers(): void {
  ipcMain.handle(
    'search:workspace',
    async (_e, rootPath: string, opts: SearchOptions) => {
      await assertAllowedPath(rootPath);
      return searchInWorkspace(rootPath, opts);
    },
  );
}

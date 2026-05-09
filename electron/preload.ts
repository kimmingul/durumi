import { contextBridge, ipcRenderer } from 'electron';
import type { IpcApi, Macro, MenuCommand } from '@shared/ipc-contract';

const api: IpcApi = {
  ping: () => ipcRenderer.invoke('ping'),
  fileOpen: () => ipcRenderer.invoke('file:open'),
  fileOpenPath: (path) => ipcRenderer.invoke('file:openPath', path),
  fileSave: (path, content) => ipcRenderer.invoke('file:save', path, content),
  fileSaveAs: (content, suggestedName) => ipcRenderer.invoke('file:saveAs', content, suggestedName),
  exportFile: (html, format, suggestedName) =>
    ipcRenderer.invoke('export:file', html, format, suggestedName),
  confirmDiscard: (filename) => ipcRenderer.invoke('dialog:confirmDiscard', filename),
  prefsGet: () => ipcRenderer.invoke('prefs:get'),
  prefsSet: (patch) => ipcRenderer.invoke('prefs:set', patch),
  windowSetTitle: (title) => ipcRenderer.invoke('window:setTitle', title),
  onMenuCommand: (cb) => {
    const listener = (_: unknown, cmd: MenuCommand) => cb(cmd);
    ipcRenderer.on('menu:command', listener);
    return () => { ipcRenderer.removeListener('menu:command', listener); };
  },
  onThemeChanged: (cb) => {
    const listener = (_: unknown, t: 'light' | 'dark') => cb(t);
    ipcRenderer.on('theme:changed', listener);
    return () => { ipcRenderer.removeListener('theme:changed', listener); };
  },
  dialogOpenFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  fsListDirectory: (p) => ipcRenderer.invoke('fs:listDirectory', p),
  fsWatchRoot: (p) => ipcRenderer.invoke('fs:watchRoot', p),
  fsUnwatchRoot: (p) => ipcRenderer.invoke('fs:unwatchRoot', p),
  fsUnwatchAllRoots: () => ipcRenderer.invoke('fs:unwatchAllRoots'),
  onFsChange: (cb) => {
    const handler = (_: unknown, p: string) => cb(p);
    ipcRenderer.on('fs:change', handler);
    return () => { ipcRenderer.removeListener('fs:change', handler); };
  },
  customCssGet: () => ipcRenderer.invoke('customCss:get'),
  onCustomCssChanged: (cb) => {
    const handler = (_: unknown, css: string) => cb(css);
    ipcRenderer.on('customCss:changed', handler);
    return () => { ipcRenderer.removeListener('customCss:changed', handler); };
  },
  saveImage: (buffer, mimeType, contextFilePath) =>
    ipcRenderer.invoke('image:save', buffer, mimeType, contextFilePath),
  macrosGet: () => ipcRenderer.invoke('macros:get'),
  onMacrosChanged: (cb) => {
    const handler = (_: unknown, m: Macro[]) => cb(m);
    ipcRenderer.on('macros:changed', handler);
    return () => { ipcRenderer.removeListener('macros:changed', handler); };
  },
  gitGetStatus: (rootPath) => ipcRenderer.invoke('git:getStatus', rootPath),
  onGitStatusChanged: (cb) => {
    const handler = (_: unknown, root: string) => cb(root);
    ipcRenderer.on('git:status:invalidated', handler);
    return () => { ipcRenderer.removeListener('git:status:invalidated', handler); };
  },
  pandocDetect: () => ipcRenderer.invoke('pandoc:detect'),
  pandocExport: (markdown, format, suggestedName, sourceFilePath) =>
    ipcRenderer.invoke('pandoc:export', markdown, format, suggestedName, sourceFilePath),
  pandocImport: (format) => ipcRenderer.invoke('pandoc:import', format),
  pandocDetectHomebrew: () => ipcRenderer.invoke('pandoc:detectHomebrew'),
  pandocInstallViaHomebrew: () => ipcRenderer.invoke('pandoc:installViaHomebrew'),
  pandocSetCustomPath: (path) => ipcRenderer.invoke('pandoc:setCustomPath', path),
  pandocPickCustomPath: () => ipcRenderer.invoke('pandoc:pickCustomPath'),
  dialogPickFile: (opts) => ipcRenderer.invoke('dialog:pickFile', opts),
  onPandocInstallProgress: (cb) => {
    const handler = (_: unknown, chunk: string) => cb(chunk);
    ipcRenderer.on('pandoc:install:progress', handler);
    return () => { ipcRenderer.removeListener('pandoc:install:progress', handler); };
  },
  shellOpenExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  searchWorkspace: (rootPath, opts) =>
    ipcRenderer.invoke('search:workspace', rootPath, opts),
  filesIndex: (roots) => ipcRenderer.invoke('files:index', roots),
  bibliographyFind: (filePath, roots) =>
    ipcRenderer.invoke('bibliography:find', filePath, roots),
  filesCreate: (path) => ipcRenderer.invoke('files:create', path),
  filesCreateFolder: (path) => ipcRenderer.invoke('files:createFolder', path),
  filesRename: (oldPath, newPath) => ipcRenderer.invoke('files:rename', oldPath, newPath),
  filesDuplicate: (path) => ipcRenderer.invoke('files:duplicate', path),
  filesTrash: (path) => ipcRenderer.invoke('files:trash', path),
  filesReveal: (path) => ipcRenderer.invoke('files:reveal', path),
  memoSidecarRead: (docPath) => ipcRenderer.invoke('memoSidecar:read', docPath),
  memoSidecarWrite: (docPath, sidecar) =>
    ipcRenderer.invoke('memoSidecar:write', docPath, sidecar),
  bibliographyResolveDoi: (doi) => ipcRenderer.invoke('bibliography:resolveDoi', doi),
  bibliographyEnsureFile: (docPath) =>
    ipcRenderer.invoke('bibliography:ensureFile', docPath),
  bibliographyAppendEntry: (filePath, entry) =>
    ipcRenderer.invoke('bibliography:appendEntry', filePath, entry),
  bibliographyReadEntries: (filePath) =>
    ipcRenderer.invoke('bibliography:readEntries', filePath),
  onAppRequestClose: (decide) => {
    const handler = async (_: unknown, reqId: number) => {
      let allow = false;
      try {
        allow = await decide();
      } catch {
        allow = false;
      }
      ipcRenderer.send(`app:closeResponse:${reqId}`, allow);
    };
    ipcRenderer.on('app:requestClose', handler);
    return () => { ipcRenderer.removeListener('app:requestClose', handler); };
  },
};

contextBridge.exposeInMainWorld('api', api);

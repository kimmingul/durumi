import { app, BrowserWindow, dialog, Menu, MenuItemConstructorOptions, shell } from 'electron';
import { basename } from 'node:path';
import type { MenuCommand, Preferences } from '@shared/ipc-contract';
import { checkForUpdatesManually } from './autoUpdater';
import { openCustomCss } from './customCss';
import { openMacrosConfig, resetMacrosToDefaults } from './macros';
import { setPreferences } from './preferences';
import { unwatchRoot } from './fs';
import { resolveLang, t, type Lang } from './i18n';
import { MANUSCRIPT_TEMPLATES } from '../shared/manuscriptTemplates';

function send(cmd: MenuCommand) {
  // Native macOS menu items can fire while no window holds focus (e.g.
  // Open Recent from the menu bar after the last window was closed). Fall
  // back to any open window so commands aren't silently dropped.
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  win?.webContents.send('menu:command', cmd);
}

export function buildMenu(prefs: Preferences, onNewWindow: () => void): void {
  const isMac = process.platform === 'darwin';
  const lang: Lang = resolveLang(prefs.language);
  const tr = (key: string, vars?: Record<string, string>) => t(key, lang, vars);

  const recent = prefs.recentFiles.slice(0, 10).map<MenuItemConstructorOptions>((p) => ({
    label: p,
    click: () => send({ type: 'openRecent', path: p }),
  }));

  const closeFolderItems: MenuItemConstructorOptions[] = prefs.workspaceFolders.map((p) => ({
    label: `${basename(p) || p}  —  ${p}`,
    click: () => {
      // Update prefs (drop this folder), stop watching, and notify renderer.
      void (async () => {
        const next = prefs.workspaceFolders.filter((x) => x !== p);
        await setPreferences({ workspaceFolders: next });
        await unwatchRoot(p);
        send({ type: 'closeFolder', path: p });
      })();
    },
  }));

  const languageItems: MenuItemConstructorOptions[] = (
    [
      { id: 'system', key: 'menu.view.language.system' },
      { id: 'en', key: 'menu.view.language.en' },
      { id: 'ko', key: 'menu.view.language.ko' },
    ] as const
  ).map(({ id, key }) => ({
    label: tr(key),
    type: 'radio' as const,
    checked: prefs.language === id,
    click: () => {
      void (async () => {
        await setPreferences({ language: id });
        // onPreferencesChanged in main.ts rebuilds the menu; also tell the
        // renderer so the React tree re-renders with the new language.
        send('languageChanged');
      })();
    },
  }));

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' as const },
            { type: 'separator' as const },
            { role: 'hide' as const },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
            { type: 'separator' as const },
            { role: 'quit' as const },
          ],
        }]
      : []),
    {
      label: tr('menu.file'),
      submenu: [
        { label: tr('menu.file.new'), accelerator: 'CmdOrCtrl+N', click: () => send('new') },
        { label: tr('menu.file.newWindow'), accelerator: 'CmdOrCtrl+Shift+N', click: () => onNewWindow() },
        { label: tr('menu.file.open'), accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { label: tr('menu.file.openFolder'), click: () => send('openFolder') },
        {
          label: tr('menu.file.closeFolder'),
          submenu: closeFolderItems.length
            ? closeFolderItems
            : [{ label: tr('menu.file.noFoldersOpen'), enabled: false }],
        },
        {
          label: tr('menu.file.openRecent'),
          submenu: recent.length
            ? recent
            : [{ label: tr('menu.file.noRecent'), enabled: false }],
        },
        { type: 'separator' },
        { label: tr('menu.file.save'), accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: tr('menu.file.saveAs'), accelerator: 'CmdOrCtrl+Shift+S', click: () => send('saveAs') },
        {
          label: tr('menu.file.newFromTemplate'),
          submenu: MANUSCRIPT_TEMPLATES.map((tpl) => ({
            label: tpl.label,
            sublabel: tpl.description,
            click: () => send({ type: 'newFromTemplate', templateId: tpl.id }),
          })),
        },
        {
          label: tr('menu.file.import'),
          submenu: [{ label: tr('menu.file.importDocx'), click: () => send('importDocx') }],
        },
        {
          label: tr('menu.file.export'),
          submenu: [
            { label: tr('menu.file.exportHtml'), click: () => send('exportHtml') },
            { label: tr('menu.file.exportPdf'), click: () => send('exportPdf') },
            { label: tr('menu.file.exportDocx'), click: () => send('exportDocx') },
            { label: tr('menu.file.exportLatex'), click: () => send('exportLatex') },
          ],
        },
        { type: 'separator' },
        { label: tr('menu.file.closeWindow'), accelerator: 'CmdOrCtrl+W', role: 'close' },
        ...(isMac ? [] : [{ role: 'quit' as const }]),
      ],
    },
    {
      label: tr('menu.edit'),
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: tr('menu.edit.find'), accelerator: 'CmdOrCtrl+F', click: () => send('find') },
        {
          label: tr('menu.edit.findAndReplace'),
          accelerator: 'CommandOrControl+Alt+F',
          click: () => send('findAndReplace'),
        },
        {
          label: tr('menu.edit.findNext'),
          accelerator: 'CommandOrControl+G',
          click: () => send('findNext'),
        },
        {
          label: tr('menu.edit.findPrev'),
          accelerator: 'CommandOrControl+Shift+G',
          click: () => send('findPrev'),
        },
        { type: 'separator' },
        { label: tr('menu.edit.bold'), accelerator: 'CmdOrCtrl+B', click: () => send('bold') },
        { label: tr('menu.edit.italic'), accelerator: 'CmdOrCtrl+I', click: () => send('italic') },
        { label: tr('menu.edit.inlineCode'), accelerator: 'CmdOrCtrl+Shift+K', click: () => send('code') },
        { label: tr('menu.edit.insertLink'), accelerator: 'CmdOrCtrl+K', click: () => send('link') },
        {
          label: tr('menu.edit.heading'),
          submenu: ([1, 2, 3, 4, 5, 6] as const).map((lvl) => ({
            label: `H${lvl}`,
            accelerator: `CmdOrCtrl+${lvl}`,
            click: () => send({ type: 'heading', level: lvl }),
          })),
        },
        { type: 'separator' },
        { label: tr('menu.edit.strikethrough'), accelerator: 'CmdOrCtrl+Shift+X', click: () => send('strikethrough') },
        { label: tr('menu.edit.insertTable'), accelerator: 'CmdOrCtrl+Shift+T', click: () => send('insertTable') },
        { label: tr('menu.edit.toggleTask'), accelerator: 'CmdOrCtrl+Return', click: () => send('toggleTask') },
        { label: tr('menu.edit.codeBlock'), accelerator: 'CmdOrCtrl+Shift+C', click: () => send('codeBlock') },
        { type: 'separator' },
        { label: tr('menu.edit.openMacrosConfig'), click: () => { void openMacrosConfig(); } },
        {
          label: tr('menu.edit.resetMacrosDefaults'),
          click: () => { void resetMacrosToDefaults(); },
        },
      ],
    },
    {
      label: tr('menu.view'),
      submenu: [
        { label: tr('menu.view.toggleTheme'), accelerator: 'CmdOrCtrl+Shift+L', click: () => send('toggleTheme') },
        { label: tr('menu.view.toggleSourceMode'), accelerator: 'CmdOrCtrl+/', click: () => send('toggleSourceMode') },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        ...(process.env.NODE_ENV === 'development'
          ? [{ type: 'separator' as const }, { role: 'toggleDevTools' as const }]
          : []),
        { type: 'separator' },
        { label: tr('menu.view.toggleSidebar'), accelerator: 'CommandOrControl+\\', click: () => send('toggleSidebar') },
        { label: tr('menu.view.showFiles'), accelerator: 'CommandOrControl+Shift+E', click: () => send('showFiles') },
        { label: tr('menu.view.showOutline'), accelerator: 'CommandOrControl+Shift+O', click: () => send('showOutline') },
        { label: tr('menu.view.showSearch'), accelerator: 'CommandOrControl+Shift+F', click: () => send('showSearch') },
        { label: tr('menu.file.quickOpen'), accelerator: 'CommandOrControl+P', click: () => send('quickOpen') },
        { type: 'separator' },
        { label: tr('menu.view.focusMode'), accelerator: 'F8', click: () => send('toggleFocusMode') },
        { label: tr('menu.view.typewriterMode'), accelerator: 'F9', click: () => send('toggleTypewriterMode') },
        { type: 'separator' },
        { label: tr('menu.view.openCustomCss'), click: () => { void openCustomCss(); } },
        { type: 'separator' },
        { label: tr('menu.view.language'), submenu: languageItems },
      ],
    },
    {
      label: tr('menu.help'),
      submenu: [
        {
          label: tr('menu.help.about'),
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) {
              void dialog.showMessageBox(win, {
                type: 'info',
                title: tr('menu.help.about'),
                message: `Durumi ${app.getVersion()}`,
                detail: tr('menu.help.aboutDetail'),
              });
            }
          },
        },
        { type: 'separator' },
        {
          label: tr('menu.help.checkForUpdates'),
          click: () => {
            const w = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
            if (w) void checkForUpdatesManually(w);
          },
        },
        { type: 'separator' },
        { label: tr('menu.help.openGitHub'), click: () => { void shell.openExternal('https://github.com/'); } },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

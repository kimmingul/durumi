import { BrowserWindow, Menu, MenuItem } from 'electron';
import type { MenuCommand } from '@shared/ipc-contract';
import { getPreferences, setPreferences } from './preferences';
import { resolveLang, t } from './i18n';

/**
 * Wires Electron's built-in spellchecker AND the editor's right-click
 * context menu (memo + CriticMarkup entry points) to the window.
 *
 *   - Sets dictionary languages from preferences.
 *   - Re-injects the user's custom dictionary on startup.
 *   - On `context-menu`:
 *       • Cut/Copy/Paste (when applicable)
 *       • 메모 추가 + 변경 추적 ▶ submenu (only on editable surfaces)
 *       • 링크 삽입
 *       • Spell-check suggestions + Add to Dictionary (when applicable)
 *
 * The "editable surface" gate (`params.isEditable`) keeps the memo/CM items
 * off non-editor right-clicks (sidebar, settings inputs, etc.).
 *
 * Code blocks and inline code spans are not excluded yet — Electron's
 * spell-checker operates on the contenteditable surface as a whole. A
 * follow-up can add per-range exclusion via DOM markers.
 */
export async function attachContextMenu(win: BrowserWindow): Promise<void> {
  const prefs = await getPreferences();
  const session = win.webContents.session;
  if (prefs.spellCheckLanguages.length > 0) {
    try {
      session.setSpellCheckerLanguages(prefs.spellCheckLanguages);
    } catch {
      // Fallback to en-US if the requested locales aren't available.
      try {
        session.setSpellCheckerLanguages(['en-US']);
      } catch {
        // Spell check unsupported on this platform; bail out.
        return;
      }
    }
  }
  for (const w of prefs.spellCheckCustomWords) {
    try {
      session.addWordToSpellCheckerDictionary(w);
    } catch {
      // ignore unsupported entries
    }
  }

  const sendCommand = (cmd: MenuCommand) => {
    win.webContents.send('menu:command', cmd);
  };

  win.webContents.on('context-menu', (_event, params) => {
    void (async () => {
      const cur = await getPreferences();
      const lang = resolveLang(cur.language);
      const tr = (key: string) => t(key, lang);

      const items: MenuItem[] = [];

      // 1. Cut/Copy/Paste
      if (
        params.editFlags.canCut ||
        params.editFlags.canCopy ||
        params.editFlags.canPaste
      ) {
        if (params.editFlags.canCut)
          items.push(new MenuItem({ role: 'cut', label: tr('context.cut') }));
        if (params.editFlags.canCopy)
          items.push(new MenuItem({ role: 'copy', label: tr('context.copy') }));
        if (params.editFlags.canPaste)
          items.push(new MenuItem({ role: 'paste', label: tr('context.paste') }));
      }

      // 2. Memo + CriticMarkup — only on editable surfaces (the editor pane).
      if (params.isEditable) {
        if (items.length > 0) items.push(new MenuItem({ type: 'separator' }));
        items.push(
          new MenuItem({
            label: tr('context.addMemo'),
            accelerator: 'CommandOrControl+Alt+M',
            click: () => sendCommand('addMemo'),
          }),
        );
        items.push(
          new MenuItem({
            label: tr('context.changes'),
            submenu: [
              new MenuItem({ label: tr('context.cm.insert'), click: () => sendCommand('cmInsert') }),
              new MenuItem({ label: tr('context.cm.delete'), click: () => sendCommand('cmDelete') }),
              new MenuItem({ label: tr('context.cm.substitute'), click: () => sendCommand('cmSubstitute') }),
              new MenuItem({ label: tr('context.cm.highlight'), click: () => sendCommand('cmHighlight') }),
              new MenuItem({ label: tr('context.cm.comment'), click: () => sendCommand('cmComment') }),
            ],
          }),
        );
        items.push(new MenuItem({ type: 'separator' }));
        items.push(
          new MenuItem({
            label: tr('context.insertLink'),
            accelerator: 'CommandOrControl+K',
            click: () => sendCommand('link'),
          }),
        );
      }

      // 3. Spell-check suggestions + dictionary actions.
      if (params.misspelledWord && params.dictionarySuggestions.length > 0) {
        if (items.length > 0) items.push(new MenuItem({ type: 'separator' }));
        for (const suggestion of params.dictionarySuggestions) {
          items.push(
            new MenuItem({
              label: suggestion,
              click: () => win.webContents.replaceMisspelling(suggestion),
            }),
          );
        }
        items.push(new MenuItem({ type: 'separator' }));
        items.push(
          new MenuItem({
            label: tr('context.addToDictionary'),
            click: async () => {
              const word = params.misspelledWord;
              session.addWordToSpellCheckerDictionary(word);
              const latest = await getPreferences();
              if (!latest.spellCheckCustomWords.includes(word)) {
                await setPreferences({
                  spellCheckCustomWords: [...latest.spellCheckCustomWords, word],
                });
              }
            },
          }),
        );
      }

      if (items.length === 0) return;
      Menu.buildFromTemplate(items).popup({ window: win });
    })();
  });
}

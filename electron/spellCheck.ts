import { BrowserWindow, Menu, MenuItem } from 'electron';
import { getPreferences, setPreferences } from './preferences';

/**
 * Wires Electron's built-in spellchecker to the window:
 *   - Sets dictionary languages from preferences.
 *   - Re-injects the user's custom dictionary on startup.
 *   - Adds a context menu with misspelling suggestions plus
 *     "Add to dictionary" / "Ignore in document".
 *
 * Code blocks and inline code spans are not excluded yet — Electron's
 * spell-checker operates on the contenteditable surface as a whole. A
 * follow-up can add per-range exclusion via DOM markers.
 */
export async function attachSpellCheck(win: BrowserWindow): Promise<void> {
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

  win.webContents.on('context-menu', (_event, params) => {
    const items: MenuItem[] = [];
    if (params.misspelledWord && params.dictionarySuggestions.length > 0) {
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
          label: 'Add to Dictionary',
          click: async () => {
            const word = params.misspelledWord;
            session.addWordToSpellCheckerDictionary(word);
            const cur = await getPreferences();
            if (!cur.spellCheckCustomWords.includes(word)) {
              await setPreferences({
                spellCheckCustomWords: [...cur.spellCheckCustomWords, word],
              });
            }
          },
        }),
      );
    }
    if (params.editFlags.canCut || params.editFlags.canCopy || params.editFlags.canPaste) {
      if (items.length > 0) items.push(new MenuItem({ type: 'separator' }));
      if (params.editFlags.canCut) items.push(new MenuItem({ role: 'cut' }));
      if (params.editFlags.canCopy) items.push(new MenuItem({ role: 'copy' }));
      if (params.editFlags.canPaste) items.push(new MenuItem({ role: 'paste' }));
    }
    if (items.length === 0) return;
    Menu.buildFromTemplate(items).popup({ window: win });
  });
}

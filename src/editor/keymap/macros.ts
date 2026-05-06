import { keymap, type KeyBinding, type EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

export interface Macro {
  name: string;
  keybind: string;
  insertion: string;
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

// Use the U+E000 Private Use Area code point as the cursor placeholder. It is
// guaranteed not to appear in normal text and avoids any conflict with user
// content in templates.
const CURSOR_SENTINEL = '\u0001';

export interface ExpansionResult {
  text: string;
  cursorOffset: number | null;
}

/**
 * Expand a macro template against the current editor view, returning the final
 * insertion text and (if `${cursor}` was present) the offset within that text
 * where the caret should land after insertion.
 */
export function expandMacro(template: string, view: EditorView): ExpansionResult {
  const d = new Date();
  const sel = view.state.sliceDoc(
    view.state.selection.main.from,
    view.state.selection.main.to,
  );
  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    MM: pad(d.getMonth() + 1),
    DD: pad(d.getDate()),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    selection: sel,
  };
  // Use String.prototype.replace with a callback (no regex.exec).
  const resolved = template.replace(/\$\{([A-Za-z]+)\}/g, (full, key: string) => {
    if (key === 'cursor') return CURSOR_SENTINEL;
    if (Object.prototype.hasOwnProperty.call(map, key)) return map[key]!;
    return full;
  });
  const idx = resolved.indexOf(CURSOR_SENTINEL);
  if (idx >= 0) {
    return {
      text: resolved.slice(0, idx) + resolved.slice(idx + CURSOR_SENTINEL.length),
      cursorOffset: idx,
    };
  }
  return { text: resolved, cursorOffset: null };
}

export function buildMacroKeymap(macros: Macro[]): Extension {
  const bindings: KeyBinding[] = macros.map((m) => ({
    key: m.keybind,
    run: (view) => {
      const { text, cursorOffset } = expandMacro(m.insertion, view);
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: text },
        selection:
          cursorOffset != null
            ? { anchor: from + cursorOffset }
            : { anchor: from + text.length },
      });
      return true;
    },
    preventDefault: true,
  }));
  return keymap.of(bindings);
}

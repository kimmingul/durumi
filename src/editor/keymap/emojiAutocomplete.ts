import { EditorView, ViewPlugin, ViewUpdate, keymap } from '@codemirror/view';
import { EditorSelection, Extension } from '@codemirror/state';

const TRIGGER_RE = /:([a-z0-9_+-]{2,})$/i;
const MAX_SUGGESTIONS = 8;

// node-emoji ships the full emojilib JSON (~300 KB). The user only needs it
// when they type `:` followed by 2+ chars — so we dynamic-import on first
// trigger and cache the module's `search` / `get` exports for subsequent
// lookups. Until it loads, the autocomplete popup simply stays hidden.
type EmojiModule = typeof import('node-emoji');
let emojiModulePromise: Promise<EmojiModule> | null = null;
let emojiModule: EmojiModule | null = null;
function loadEmojiModule(): Promise<EmojiModule> {
  if (!emojiModulePromise) {
    emojiModulePromise = import('node-emoji').then((m) => {
      emojiModule = m;
      return m;
    });
  }
  return emojiModulePromise;
}

interface Suggestion {
  name: string;
  emoji: string;
}

interface ActiveState {
  /** Range in the document covered by `:query` (including the colon). */
  from: number;
  to: number;
  query: string;
  selectedIdx: number;
  suggestions: Suggestion[];
}

class EmojiPopup {
  el: HTMLDivElement;
  constructor(view: EditorView) {
    this.el = document.createElement('div');
    this.el.className = 'cm-emoji-popup';
    this.el.style.position = 'absolute';
    this.el.style.zIndex = '40';
    view.dom.appendChild(this.el);
  }
  render(view: EditorView, state: ActiveState) {
    if (state.suggestions.length === 0) {
      this.el.style.display = 'none';
      return;
    }
    this.el.style.display = 'block';
    while (this.el.firstChild) this.el.removeChild(this.el.firstChild);
    const list = document.createElement('ul');
    list.className = 'cm-emoji-list';
    state.suggestions.forEach((s, i) => {
      const li = document.createElement('li');
      li.className = 'cm-emoji-item' + (i === state.selectedIdx ? ' active' : '');
      li.dataset.idx = String(i);
      li.textContent = `${s.emoji}  :${s.name}:`;
      list.appendChild(li);
    });
    this.el.appendChild(list);
    const coords = view.coordsAtPos(state.from);
    if (coords) {
      const dom = view.dom.getBoundingClientRect();
      this.el.style.left = `${coords.left - dom.left}px`;
      this.el.style.top = `${coords.bottom - dom.top + 2}px`;
    }
  }
  hide() {
    this.el.style.display = 'none';
  }
  destroy() {
    this.el.remove();
  }
}

function findSuggestions(query: string): Suggestion[] {
  if (query.length === 0) return [];
  // node-emoji hasn't finished loading yet — show no suggestions for this
  // keystroke. The next keystroke after the load resolves will succeed.
  if (!emojiModule) return [];
  const exact = emojiModule.get(query);
  const out: Suggestion[] = [];
  if (exact) out.push({ name: query, emoji: exact });
  const fuzzy = emojiModule.search(query);
  for (const r of fuzzy) {
    if (out.length >= MAX_SUGGESTIONS) break;
    if (r.name === query) continue;
    out.push({ name: r.name, emoji: r.emoji });
  }
  return out.slice(0, MAX_SUGGESTIONS);
}

function detectActive(view: EditorView): ActiveState | null {
  const sel = view.state.selection.main;
  if (!sel.empty) return null;
  const head = sel.head;
  const line = view.state.doc.lineAt(head);
  const before = line.text.slice(0, head - line.from);
  const m = before.match(TRIGGER_RE);
  if (!m || m[1] === undefined) return null;
  const queryWithColon = m[0];
  const query = m[1];
  const from = head - queryWithColon.length;
  // Kick off the lazy module load on the first `:query` we see. The popup
  // will start producing suggestions on the next keystroke.
  if (!emojiModule) {
    void loadEmojiModule();
  }
  const suggestions = findSuggestions(query);
  if (suggestions.length === 0) return null;
  return { from, to: head, query, selectedIdx: 0, suggestions };
}

export function emojiAutocomplete(): Extension {
  let active: ActiveState | null = null;
  let popup: EmojiPopup | null = null;

  const plugin = ViewPlugin.fromClass(
    class {
      constructor(view: EditorView) {
        popup = new EmojiPopup(view);
      }
      update(u: ViewUpdate) {
        if (!u.docChanged && !u.selectionSet) return;
        active = detectActive(u.view);
        if (popup) {
          if (active) popup.render(u.view, active);
          else popup.hide();
        }
      }
      destroy() {
        popup?.destroy();
        popup = null;
        active = null;
      }
    },
  );

  function pick(view: EditorView): boolean {
    if (!active) return false;
    const choice = active.suggestions[active.selectedIdx];
    if (!choice) return false;
    view.dispatch({
      changes: { from: active.from, to: active.to, insert: choice.emoji },
      selection: EditorSelection.cursor(active.from + choice.emoji.length),
    });
    active = null;
    popup?.hide();
    return true;
  }

  function move(view: EditorView, delta: number): boolean {
    if (!active) return false;
    active.selectedIdx = Math.max(
      0,
      Math.min(active.selectedIdx + delta, active.suggestions.length - 1),
    );
    popup?.render(view, active);
    return true;
  }

  function dismiss(): boolean {
    if (!active) return false;
    active = null;
    popup?.hide();
    return true;
  }

  const keys = keymap.of([
    { key: 'Enter', run: (view) => pick(view) },
    { key: 'Tab', run: (view) => pick(view) },
    { key: 'ArrowDown', run: (view) => move(view, +1) },
    { key: 'ArrowUp', run: (view) => move(view, -1) },
    { key: 'Escape', run: () => dismiss() },
  ]);

  const theme = EditorView.theme({
    '.cm-emoji-popup': {
      background: 'var(--cm-popup-bg, #ffffff)',
      border: '1px solid var(--cm-popup-border, #d0d7de)',
      borderRadius: '6px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
      padding: '4px 0',
      maxWidth: '320px',
    },
    '.cm-emoji-list': { listStyle: 'none', margin: 0, padding: 0 },
    '.cm-emoji-item': {
      padding: '4px 10px',
      cursor: 'pointer',
      fontSize: '0.9em',
    },
    '.cm-emoji-item.active': {
      background: 'var(--cm-popup-active, #ddeaff)',
    },
  });

  return [plugin, keys, theme];
}

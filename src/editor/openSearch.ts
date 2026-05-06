import type { EditorView } from '@codemirror/view';
import { openSearchPanel, findNext, findPrevious } from '@codemirror/search';

export function openSearch(view: EditorView): boolean {
  return openSearchPanel(view);
}

export function openSearchAndReplace(view: EditorView): boolean {
  const opened = openSearchPanel(view);
  // After CM6 mounts the panel, focus the replace input if present so the user lands there.
  // We schedule on a microtask to let CM6 finish DOM mount.
  queueMicrotask(() => {
    const panel = view.dom.querySelector<HTMLElement>('.cm-panel.cm-search');
    if (!panel) return;
    const replace = panel.querySelector<HTMLInputElement>('input[name="replace"]');
    if (replace) {
      replace.focus();
      return;
    }
    // Some CM6 builds put replace inside a second row that is only rendered after a button click.
    // Fall back: focus the search input.
    const find = panel.querySelector<HTMLInputElement>('input[name="search"]');
    find?.focus();
  });
  return opened;
}

export function gotoNext(view: EditorView): boolean {
  return findNext(view);
}

export function gotoPrev(view: EditorView): boolean {
  return findPrevious(view);
}

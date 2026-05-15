// Vanilla-DOM bridge that the table widget calls when the gear icon is
// clicked. It lazy-loads the React popover module (so the editor's
// initial chunk doesn't pay for the picker UI) and hands it the EditorView
// + anchor rect. The popover renders into a portal-style root attached to
// document.body so its z-index sits above the CodeMirror content.

import type { EditorView } from '@codemirror/view';

let mountedRoot: HTMLDivElement | null = null;
let activeCleanup: (() => void) | null = null;

export function openTableStylePopover(
  view: EditorView,
  tableFrom: number,
  anchorRect: DOMRect,
): void {
  closeTableStylePopover();
  if (typeof document === 'undefined') return;
  const root = document.createElement('div');
  root.className = 'durumi-table-style-popover-root';
  root.setAttribute('data-testid', 'table-style-popover-root');
  document.body.appendChild(root);
  mountedRoot = root;

  // Lazy import so the renderer chunk stays light.
  void import('./TableStylePopover').then(({ mountTableStylePopover }) => {
    if (mountedRoot !== root) return; // user closed before chunk loaded
    activeCleanup = mountTableStylePopover(root, {
      view,
      tableFrom,
      anchorRect,
      onClose: closeTableStylePopover,
    });
  });
}

export function closeTableStylePopover(): void {
  if (activeCleanup) {
    try {
      activeCleanup();
    } catch {
      // swallow — host is best-effort.
    }
    activeCleanup = null;
  }
  if (mountedRoot && mountedRoot.parentNode) {
    mountedRoot.parentNode.removeChild(mountedRoot);
  }
  mountedRoot = null;
}

export function isTableStylePopoverOpen(): boolean {
  return mountedRoot !== null;
}

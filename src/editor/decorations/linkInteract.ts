import { EditorView, hoverTooltip, type Tooltip } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { Extension, EditorState } from '@codemirror/state';

/**
 * v0.2.19 - interactive overlay for inline markdown links.
 *
 * Three pieces, all driven off the lezer-markdown Link node so they stay
 * in sync with the v0.1.x bracket-finder in decorations/link.ts:
 *
 *   - hoverTooltip: shows the URL when the mouse pauses over a link span.
 *   - click handler: plain click on a rendered link calls
 *     window.api.shellOpenExternal(url). We chose "plain click follows
 *     the link" because Document mode is the WYSIWYG surface - that is
 *     where a click should behave like a browser. Live/Source mode users
 *     touch the raw syntax instead, and the handler self-gates on the
 *     presence of the cm-md-link class (only emitted when the link
 *     decoration ran, i.e. in Document/Live, not raw Markdown mode).
 *   - "Edit" affordance: the tooltip renders an "Edit" button alongside
 *     "Open". Clicking Edit fires durumi:edit-link with the range and
 *     current text/url/title; the toolbar listens and re-opens the
 *     InsertLinkDialog pre-filled, then dispatches the replacement.
 *
 * Security: every URL goes through shellOpenExternal which calls
 * isExternalUrlAllowed in main. As of v0.2.19 that allowlist is
 * http: | https: | mailto:. javascript: / file: / data: / vbscript: are
 * rejected up front.
 */

export interface LinkAtPos {
  /** Document offsets of the entire [text](url) span. */
  from: number;
  to: number;
  /** The visible label between the brackets. */
  text: string;
  /** The destination URL. */
  url: string;
  /** Optional title from [text](url "title"). */
  title: string;
}

/**
 * Find the inline Link node that covers pos. Returns null when no Link is
 * at the position OR when the link has no URL child (we skip tentative
 * shortcut links in this overlay - they already render as plain text per
 * the v0.1.12 strict-literal intent).
 */
export function findLinkAt(state: EditorState, pos: number): LinkAtPos | null {
  const tree = syntaxTree(state);
  let result: LinkAtPos | null = null;
  tree.iterate({
    from: Math.max(0, pos - 1),
    to: Math.min(state.doc.length, pos + 1),
    enter(node) {
      if (result) return false;
      if (node.name !== 'Link') return;
      if (pos < node.from || pos > node.to) return;
      const doc = state.doc.sliceString(node.from, node.to);
      let openBracket: number | null = null;
      let closeBracket: number | null = null;
      let urlFrom: number | null = null;
      let urlTo: number | null = null;
      let cur = node.node.firstChild;
      while (cur) {
        if (cur.name === 'LinkMark') {
          const rel = cur.from - node.from;
          const ch = doc[rel];
          if (openBracket === null && ch === '[') openBracket = cur.from;
          else if (closeBracket === null && ch === ']') closeBracket = cur.from;
        } else if (cur.name === 'URL') {
          urlFrom = cur.from;
          urlTo = cur.to;
        }
        cur = cur.nextSibling;
      }
      if (openBracket === null || closeBracket === null || urlFrom === null || urlTo === null) {
        return;
      }
      const text = state.doc.sliceString(openBracket + 1, closeBracket);
      const url = state.doc.sliceString(urlFrom, urlTo);
      let title = '';
      const tail = state.doc.sliceString(urlTo, node.to);
      const titleMatch = /^\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\))\s*\)$/.exec(tail);
      if (titleMatch) {
        title = titleMatch[1] ?? titleMatch[2] ?? titleMatch[3] ?? '';
      }
      result = { from: node.from, to: node.to, text, url, title };
      return false;
    },
  });
  return result;
}

/** Payload for the durumi:edit-link CustomEvent. */
export interface EditLinkDetail {
  from: number;
  to: number;
  text: string;
  url: string;
  title: string;
}

export function dispatchEditLink(detail: EditLinkDetail): void {
  window.dispatchEvent(new CustomEvent<EditLinkDetail>('durumi:edit-link', { detail }));
}

function openUrl(url: string): void {
  if (!url) return;
  void window.api.shellOpenExternal(url);
}

/**
 * Modifier-key label for the tooltip hint. macOS users see "⌘+Click",
 * everyone else sees "Ctrl+Click". navigator.platform is the simplest
 * available signal — `userAgentData.platform` is still partial in
 * Electron and not worth the polyfill.
 */
const OPEN_HINT_KEY =
  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
    ? '⌘+Click'
    : 'Ctrl+Click';

function buildTooltip(link: LinkAtPos): HTMLElement {
  // v0.2.23 — two lines: the existing browser-`title`-like primary
  // (title if present, else URL) plus a faint discoverability hint
  // describing the new modifier-gated open shortcut. Hint is critical
  // because plain click no longer opens — without it users would think
  // the link is broken.
  const dom = document.createElement('div');
  dom.className = 'cm-citation-tooltip cm-link-tooltip';
  const line = document.createElement('div');
  line.className = link.title ? 'cm-link-tooltip-title' : 'cm-link-tooltip-url';
  line.textContent = link.title || link.url || '(no URL)';
  dom.appendChild(line);
  const hint = document.createElement('div');
  hint.className = 'cm-link-tooltip-hint';
  hint.textContent = `${OPEN_HINT_KEY} to open`;
  dom.appendChild(hint);
  return dom;
}

export function linkHoverTooltip(): Extension {
  return hoverTooltip(
    (view, pos, side): Tooltip | null => {
      const link = findLinkAt(view.state, pos);
      if (!link || !link.url) return null;
      void side;
      // v0.2.21 — the tooltip MUST be anchored on a position that
      // `view.coordsAtPos()` can resolve, otherwise CodeMirror parks the
      // tooltip at `top: -10000px` and the user sees nothing. In Document
      // mode `linkDecoration` collapses the leading `[` (and the trailing
      // `](url)`) into a hidden replace-widget — so `coordsAtPos(link.from)`
      // returns `null` and the v0.2.19/v0.2.20 tooltip never reached the
      // viewport, even though the DOM node existed (innerText showed the
      // URL). Confirmed in real Electron: `coordsAtPos(linkFrom) === null`,
      // `dom.style.top === '-10000px'` after measure.
      //
      // Fix: anchor on the position the user is actually hovering (`pos`).
      // It always falls inside the rendered label range, so coordsAtPos
      // returns a real on-screen rect. End is clamped similarly so the
      // tooltip's hideOnLeave region matches what's visible.
      const anchor = Math.max(link.from + 1, Math.min(pos, link.to - 1));
      return {
        pos: anchor,
        end: anchor,
        above: false,
        create() {
          return { dom: buildTooltip(link) };
        },
      };
    },
    { hideOnChange: true, hoverTime: 200 },
  );
}

/**
 * Modifier-gated link follow: ⌘+Click (macOS) / Ctrl+Click (Win/Linux)
 * on a `.cm-md-link` span calls shell.openExternal. Plain left-click
 * positions the caret (the default CodeMirror behaviour), so users can
 * edit a link's label without being yanked into a browser tab. The
 * right-click context menu still has "Open link" as the discoverable
 * alternative.
 *
 * Why ⌘/Ctrl+Click and not plain click:
 *   - v0.2.19 shipped plain-click-follows, which matched Typora. After
 *     a v0.2.23 review users reported wanting to position the caret in
 *     a link to edit its label, which forced them onto keyboard arrows
 *     since every click navigated to the browser.
 *   - ⌘+Click is the de-facto standard in pro editors (VS Code, Word,
 *     Google Docs, Pandoc-flavoured Typora) and preserves the fast
 *     "open without going to a menu" path.
 *   - On macOS, Ctrl+Click is an OS-level right-click (event.button
 *     === 2), so the `button === 0` guard below excludes that path
 *     automatically — accepting `event.ctrlKey` here is harmless on
 *     macOS and exactly what Win/Linux users expect.
 *
 * The `.cm-md-link` class gate keeps the handler dormant on raw
 * Markdown / Live mode (where the linkDecoration doesn't emit the
 * class).
 */
export function linkClickHandler(): Extension {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 0) return false;
      // ⌘ on macOS / Ctrl on Win/Linux opens the link; anything else
      // (plain click, Shift, Alt) falls through to CodeMirror's normal
      // caret-placement behaviour.
      if (!(event.metaKey || event.ctrlKey)) return false;
      if (event.altKey || event.shiftKey) return false;
      const target = event.target as HTMLElement | null;
      if (!target) return false;
      const linkEl = target.closest('.cm-md-link');
      if (!linkEl) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;
      const link = findLinkAt(view.state, pos);
      if (!link || !link.url) return false;
      event.preventDefault();
      openUrl(link.url);
      return true;
    },
  });
}

/**
 * v0.2.20 — right-click on a `.cm-md-link` shows a small DOM popup with
 * "Open link", "Copy URL", and "Edit link…". The handler self-gates on
 * the same `.cm-md-link` target as the click handler so non-link
 * right-clicks fall through to the existing main-process context menu
 * (Cut/Copy/Paste + Add memo + Track changes ▶ + Insert link +
 * spell-check, in `electron/contextMenu.ts`).
 *
 * Why a DOM popup instead of extending the native Electron menu:
 *   - The native menu lives in `electron/contextMenu.ts` (main process)
 *     and would need an IPC round-trip to learn the URL/text/title at
 *     right-click time. The DOM popup keeps everything in the renderer
 *     and matches the sidebar `ContextMenu.tsx` pattern.
 *   - Menu items can fire `durumi:edit-link` directly with the cached
 *     payload — no IPC handler, no serialization, same dispatcher used
 *     by the tooltip's Edit button.
 *
 * The popup tears itself down on outside-click, scroll, blur, or Esc
 * (same dismissal rules as `sidebar/ContextMenu.tsx`).
 */
interface MenuItemSpec {
  testid: string;
  label: string;
  onSelect: () => void;
}

function showLinkContextMenu(x: number, y: number, items: MenuItemSpec[]): void {
  // Remove any previous popup before showing a new one.
  document.querySelectorAll('.cm-link-context-menu').forEach((n) => n.remove());

  const menu = document.createElement('div');
  menu.className = 'cm-link-context-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('data-testid', 'link-context-menu');
  menu.style.position = 'fixed';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.zIndex = '1000';
  menu.addEventListener('contextmenu', (e) => e.preventDefault());

  const close = () => {
    menu.remove();
    document.removeEventListener('mousedown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('blur', close);
    window.removeEventListener('scroll', close, true);
  };
  function onDown(e: MouseEvent) {
    if (e.target instanceof Node && menu.contains(e.target)) return;
    close();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'cm-link-context-menu-item';
    row.setAttribute('role', 'menuitem');
    row.setAttribute('data-testid', item.testid);
    row.textContent = item.label;
    row.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        item.onSelect();
      } finally {
        close();
      }
    });
    menu.appendChild(row);
  }

  document.body.appendChild(menu);

  // Clamp to viewport (same logic as sidebar ContextMenu).
  const rect = menu.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let nx = x;
  let ny = y;
  if (nx + rect.width > vw - 4) nx = Math.max(4, vw - rect.width - 4);
  if (ny + rect.height > vh - 4) ny = Math.max(4, vh - rect.height - 4);
  menu.style.left = `${nx}px`;
  menu.style.top = `${ny}px`;

  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('blur', close);
  window.addEventListener('scroll', close, true);
}

function copyToClipboard(text: string): void {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text);
  }
}

export function linkContextMenu(): Extension {
  return EditorView.domEventHandlers({
    contextmenu(event, view) {
      const target = event.target as HTMLElement | null;
      if (!target) return false;
      const linkEl = target.closest('.cm-md-link');
      if (!linkEl) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;
      const link = findLinkAt(view.state, pos);
      if (!link || !link.url) return false;
      event.preventDefault();
      // Stop the event so the main-process context-menu handler in
      // electron/contextMenu.ts doesn't ALSO pop its native menu on top
      // of ours. Electron's `webContents.on('context-menu')` fires
      // regardless of preventDefault — the main listener already checks
      // `params.isEditable`, but the menu would still show with
      // Cut/Copy/Paste. stopPropagation belt; the renderer popup wins.
      event.stopPropagation();
      showLinkContextMenu(event.clientX, event.clientY, [
        {
          testid: 'link-ctx-open',
          label: 'Open link',
          onSelect: () => openUrl(link.url),
        },
        {
          testid: 'link-ctx-copy',
          label: 'Copy URL',
          onSelect: () => copyToClipboard(link.url),
        },
        {
          testid: 'link-ctx-edit',
          label: 'Edit link…',
          onSelect: () =>
            dispatchEditLink({
              from: link.from,
              to: link.to,
              text: link.text,
              url: link.url,
              title: link.title,
            }),
        },
      ]);
      return true;
    },
  });
}

/** Bundle for decorations/index.ts. */
export function linkInteractivity(): Extension[] {
  return [linkHoverTooltip(), linkClickHandler(), linkContextMenu()];
}

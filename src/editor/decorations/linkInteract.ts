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

function buildTooltip(link: LinkAtPos): HTMLElement {
  const dom = document.createElement('div');
  dom.className = 'cm-citation-tooltip cm-link-tooltip';
  const urlLine = document.createElement('div');
  urlLine.className = 'cm-link-tooltip-url';
  urlLine.textContent = link.url || '(no URL)';
  dom.appendChild(urlLine);
  if (link.title) {
    const titleLine = document.createElement('div');
    titleLine.className = 'cm-link-tooltip-title';
    titleLine.textContent = link.title;
    dom.appendChild(titleLine);
  }
  const actions = document.createElement('div');
  actions.className = 'cm-link-tooltip-actions';
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'cm-link-tooltip-btn';
  open.textContent = 'Open';
  open.setAttribute('data-testid', 'link-tooltip-open');
  open.addEventListener('click', (e) => {
    e.preventDefault();
    openUrl(link.url);
  });
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'cm-link-tooltip-btn';
  edit.textContent = 'Edit';
  edit.setAttribute('data-testid', 'link-tooltip-edit');
  edit.addEventListener('click', (e) => {
    e.preventDefault();
    dispatchEditLink({
      from: link.from,
      to: link.to,
      text: link.text,
      url: link.url,
      title: link.title,
    });
  });
  actions.appendChild(open);
  actions.appendChild(edit);
  dom.appendChild(actions);
  return dom;
}

export function linkHoverTooltip(): Extension {
  return hoverTooltip(
    (view, pos, side): Tooltip | null => {
      const link = findLinkAt(view.state, pos);
      if (!link || !link.url) return null;
      void side;
      return {
        pos: link.from,
        end: link.to,
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
 * Plain click on a .cm-md-link span calls shell.openExternal. The handler
 * self-gates on the click target so editor clicks outside link spans
 * behave normally (placing the caret, starting a drag, etc.).
 *
 * The .cm-md-link class is ONLY emitted by the WYSIWYG-aware
 * linkDecoration, so this single check naturally gates "plain click
 * follows" to Document mode without needing the handler to know about
 * edit modes.
 */
export function linkClickHandler(): Extension {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
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

/** Bundle for decorations/index.ts. */
export function linkInteractivity(): Extension[] {
  return [linkHoverTooltip(), linkClickHandler()];
}

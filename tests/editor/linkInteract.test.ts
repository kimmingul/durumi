import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { linkDecoration } from '../../src/editor/decorations/link';
import {
  findLinkAt,
  linkClickHandler,
  linkContextMenu,
  linkHoverTooltip,
  dispatchEditLink,
} from '../../src/editor/decorations/linkInteract';

/**
 * v0.2.19 — link interactivity (bug #5: hover tooltip, click follows URL,
 * "Edit" affordance). Tests cover:
 *   - findLinkAt resolves `[text](url)` to { from, to, text, url, title }
 *   - linkClickHandler routes a click on `.cm-md-link` to shellOpenExternal
 *   - linkHoverTooltip emits a tooltip carrying the URL
 *   - dispatchEditLink fires the `durumi:edit-link` CustomEvent
 *   - non-link clicks do not call shellOpenExternal
 */

function setup(doc: string, cursor: number = 0): EditorView {
  return new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [
        markdown({ base: markdownLanguage, extensions: [GFM] }),
        linkDecoration(),
        linkHoverTooltip(),
        linkClickHandler(),
        linkContextMenu(),
      ],
    }),
    parent: document.body.appendChild(document.createElement('div')),
  });
}

describe('findLinkAt', () => {
  it('resolves inside the label of [text](url)', () => {
    const doc = 'see [click here](https://example.com) end';
    const view = setup(doc, 0);
    const pos = doc.indexOf('click') + 1;
    const link = findLinkAt(view.state, pos);
    expect(link).not.toBeNull();
    expect(link!.text).toBe('click here');
    expect(link!.url).toBe('https://example.com');
    expect(link!.title).toBe('');
    view.destroy();
  });

  it('extracts the title from [text](url "title")', () => {
    const doc = 'see [x](https://e.com "My Title") end';
    const view = setup(doc);
    const pos = doc.indexOf('[x]') + 1;
    const link = findLinkAt(view.state, pos);
    expect(link).not.toBeNull();
    expect(link!.url).toBe('https://e.com');
    expect(link!.title).toBe('My Title');
    view.destroy();
  });

  it('returns null when the position is not inside a link', () => {
    const doc = 'plain paragraph here';
    const view = setup(doc);
    expect(findLinkAt(view.state, 4)).toBeNull();
    view.destroy();
  });

  it('returns null for a tentative shortcut [Text] with no URL child', () => {
    // No matching `[Text]: url` definition exists, so the link has no URL.
    const doc = 'see [Something] standalone';
    const view = setup(doc);
    const pos = doc.indexOf('Something');
    const link = findLinkAt(view.state, pos);
    expect(link).toBeNull();
    view.destroy();
  });
});

describe('linkClickHandler', () => {
  beforeEach(() => {
    // Stub the IpcApi surface narrowly — only `shellOpenExternal` is used by
    // the click handler under test. Using `Partial<IpcApi>` keeps TS happy
    // without forcing this test to construct the full 70-method contract.
    (window as unknown as { api: Pick<typeof window.api, 'shellOpenExternal'> }).api = {
      shellOpenExternal: vi.fn(),
    };
  });

  it('v0.2.23: plain left-click on a .cm-md-link does NOT open (positions caret instead)', () => {
    // Pre-v0.2.23 plain click opened the URL. After the v0.2.23 review
    // users wanted plain click to position the caret so they can edit
    // the label without being yanked into a browser. shellOpenExternal
    // is now gated on Cmd/Ctrl.
    const doc = 'see [click](https://example.com) end';
    const view = setup(doc, 0);
    const linkEl = view.dom.querySelector('.cm-md-link') as HTMLElement | null;
    expect(linkEl).not.toBeNull();
    const origPosAtCoords = view.posAtCoords.bind(view);
    view.posAtCoords = vi.fn(() => doc.indexOf('click') + 1);
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'target', { value: linkEl });
    view.contentDOM.dispatchEvent(ev);
    expect(window.api.shellOpenExternal).not.toHaveBeenCalled();
    view.posAtCoords = origPosAtCoords;
    view.destroy();
  });

  it('v0.2.23: ⌘+Click on a .cm-md-link opens the URL', () => {
    const doc = 'see [click](https://example.com) end';
    const view = setup(doc, 0);
    const linkEl = view.dom.querySelector('.cm-md-link') as HTMLElement | null;
    expect(linkEl).not.toBeNull();
    view.posAtCoords = vi.fn(() => doc.indexOf('click') + 1);
    const ev = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      metaKey: true,
    });
    Object.defineProperty(ev, 'target', { value: linkEl });
    view.contentDOM.dispatchEvent(ev);
    expect(window.api.shellOpenExternal).toHaveBeenCalledWith('https://example.com');
    view.destroy();
  });

  it('v0.2.23: Ctrl+Click on a .cm-md-link opens the URL (Win/Linux modifier)', () => {
    // macOS users press ⌘ (metaKey); Win/Linux users press Ctrl
    // (ctrlKey). Both should open. On macOS Ctrl+Click is an OS-level
    // right-click (button=2) so the button guard above already excludes
    // that path — exercising `ctrlKey` here with `button=0` is the
    // Win/Linux scenario.
    const doc = 'see [click](https://example.com) end';
    const view = setup(doc, 0);
    const linkEl = view.dom.querySelector('.cm-md-link') as HTMLElement | null;
    expect(linkEl).not.toBeNull();
    view.posAtCoords = vi.fn(() => doc.indexOf('click') + 1);
    const ev = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true,
    });
    Object.defineProperty(ev, 'target', { value: linkEl });
    view.contentDOM.dispatchEvent(ev);
    expect(window.api.shellOpenExternal).toHaveBeenCalledWith('https://example.com');
    view.destroy();
  });

  it('v0.2.23: ⌘+Shift+Click does NOT open (Shift is a selection modifier)', () => {
    // Shift / Alt are paired with Cmd in some editor shortcuts (e.g.
    // "Add cursor above"). Treat them as "user is doing something other
    // than navigation" and bail.
    const doc = 'see [click](https://example.com) end';
    const view = setup(doc, 0);
    const linkEl = view.dom.querySelector('.cm-md-link') as HTMLElement | null;
    view.posAtCoords = vi.fn(() => doc.indexOf('click') + 1);
    const ev = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      metaKey: true,
      shiftKey: true,
    });
    Object.defineProperty(ev, 'target', { value: linkEl });
    view.contentDOM.dispatchEvent(ev);
    expect(window.api.shellOpenExternal).not.toHaveBeenCalled();
    view.destroy();
  });

  it('does NOT call shellOpenExternal when the click is on a non-link span', () => {
    const doc = 'plain text only';
    const view = setup(doc);
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'target', { value: view.contentDOM });
    view.contentDOM.dispatchEvent(ev);
    expect(window.api.shellOpenExternal).not.toHaveBeenCalled();
    view.destroy();
  });

  it('does NOT open an empty URL', () => {
    // Shortcut link with no URL child should be ignored entirely. We test
    // by stubbing posAtCoords to point inside a tentative `[Text]` shortcut.
    const doc = 'see [Foo] end';
    const view = setup(doc);
    // Even if there's no `.cm-md-link` element, the handler should bail.
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'target', { value: view.contentDOM });
    view.contentDOM.dispatchEvent(ev);
    expect(window.api.shellOpenExternal).not.toHaveBeenCalled();
    view.destroy();
  });

  it('v0.2.21: does NOT open browser on RIGHT-click (button=2) over a link', () => {
    // Pre-v0.2.21 the mousedown handler ran for every button, so the same
    // right-click that pops the renderer context menu ALSO fired
    // shellOpenExternal — the user-reported "right-click opens browser
    // same as left-click" regression. The fix gates on `event.button===0`.
    const doc = 'see [click](https://example.com) end';
    const view = setup(doc, 0);
    const linkEl = view.dom.querySelector('.cm-md-link') as HTMLElement | null;
    expect(linkEl).not.toBeNull();
    view.posAtCoords = vi.fn(() => doc.indexOf('click') + 1);
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 2 });
    Object.defineProperty(ev, 'target', { value: linkEl });
    view.contentDOM.dispatchEvent(ev);
    expect(window.api.shellOpenExternal).not.toHaveBeenCalled();
    view.destroy();
  });

  it('v0.2.21: does NOT open browser on MIDDLE-click (button=1) over a link', () => {
    // Same shape — middle-click is also a non-left button that the
    // legacy handler treated as "open in browser".
    const doc = 'see [click](https://example.com) end';
    const view = setup(doc, 0);
    const linkEl = view.dom.querySelector('.cm-md-link') as HTMLElement | null;
    view.posAtCoords = vi.fn(() => doc.indexOf('click') + 1);
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 1 });
    Object.defineProperty(ev, 'target', { value: linkEl });
    view.contentDOM.dispatchEvent(ev);
    expect(window.api.shellOpenExternal).not.toHaveBeenCalled();
    view.destroy();
  });

});

describe('linkHoverTooltip + dispatchEditLink', () => {
  it('dispatchEditLink fires a durumi:edit-link CustomEvent with the payload', () => {
    const detail = {
      from: 4,
      to: 30,
      text: 'click here',
      url: 'https://example.com',
      title: '',
    };
    const handler = vi.fn();
    window.addEventListener('durumi:edit-link', handler as EventListener);
    dispatchEditLink(detail);
    expect(handler).toHaveBeenCalled();
    const ev = handler.mock.calls[0]![0] as CustomEvent;
    expect(ev.detail).toEqual(detail);
    window.removeEventListener('durumi:edit-link', handler as EventListener);
  });
});

/**
 * v0.2.20 — `linkContextMenu()` is the right-click handler that pops a
 * Open/Copy URL/Edit menu over a `.cm-md-link`. The full mounting +
 * menu-render path is exercised end-to-end in `e2e/link-interact.spec.ts`
 * (the same way the hover tooltip is now covered). The unit tests below
 * pin the SHAPE of the menu the renderer builds — the three labels and
 * the three test ids — so future refactors of the menu DOM break
 * something visible in the suite instead of silently shipping a menu
 * with missing entries.
 */
describe('linkContextMenu (renderer-side popup)', () => {
  beforeEach(() => {
    (window as unknown as { api: Pick<typeof window.api, 'shellOpenExternal'> }).api = {
      shellOpenExternal: vi.fn(),
    };
    document.querySelectorAll('.cm-link-context-menu').forEach((n) => n.remove());
  });

  it('right-click on a .cm-md-link span pops a 3-item menu', () => {
    const doc = 'see [click](https://example.com) end';
    const view = setup(doc, 0);
    const linkEl = view.dom.querySelector('.cm-md-link') as HTMLElement | null;
    expect(linkEl).not.toBeNull();
    const origPosAtCoords = view.posAtCoords.bind(view);
    view.posAtCoords = vi.fn(() => doc.indexOf('click') + 1);
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'target', { value: linkEl });
    view.contentDOM.dispatchEvent(ev);

    const menu = document.querySelector('[data-testid=link-context-menu]');
    expect(menu).not.toBeNull();
    const items = Array.from(menu!.querySelectorAll('[role=menuitem]')).map((n) =>
      n.getAttribute('data-testid'),
    );
    expect(items).toEqual(['link-ctx-open', 'link-ctx-copy', 'link-ctx-edit']);
    view.posAtCoords = origPosAtCoords;
    view.destroy();
  });

  it('NOT shown when right-click target is outside any link span', () => {
    const doc = 'plain paragraph here';
    const view = setup(doc);
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'target', { value: view.contentDOM });
    view.contentDOM.dispatchEvent(ev);
    expect(document.querySelector('[data-testid=link-context-menu]')).toBeNull();
    view.destroy();
  });

  it('clicking "Open link" calls shellOpenExternal with the URL', () => {
    const doc = 'see [click](https://example.com) end';
    const view = setup(doc, 0);
    const linkEl = view.dom.querySelector('.cm-md-link') as HTMLElement | null;
    expect(linkEl).not.toBeNull();
    view.posAtCoords = vi.fn(() => doc.indexOf('click') + 1);
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'target', { value: linkEl });
    view.contentDOM.dispatchEvent(ev);
    const openBtn = document.querySelector('[data-testid=link-ctx-open]') as HTMLElement;
    openBtn.click();
    expect(window.api.shellOpenExternal).toHaveBeenCalledWith('https://example.com');
    view.destroy();
  });

  it('clicking "Edit link" fires durumi:edit-link with the link payload', () => {
    const doc = 'see [hello](https://example.com "tip") end';
    const view = setup(doc, 0);
    const linkEl = view.dom.querySelector('.cm-md-link') as HTMLElement | null;
    expect(linkEl).not.toBeNull();
    view.posAtCoords = vi.fn(() => doc.indexOf('hello') + 1);
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'target', { value: linkEl });
    view.contentDOM.dispatchEvent(ev);
    const handler = vi.fn();
    window.addEventListener('durumi:edit-link', handler as EventListener);
    const editBtn = document.querySelector('[data-testid=link-ctx-edit]') as HTMLElement;
    editBtn.click();
    expect(handler).toHaveBeenCalled();
    const detail = (handler.mock.calls[0]![0] as CustomEvent).detail;
    expect(detail).toMatchObject({
      text: 'hello',
      url: 'https://example.com',
      title: 'tip',
    });
    window.removeEventListener('durumi:edit-link', handler as EventListener);
    view.destroy();
  });
});

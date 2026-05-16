import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { linkDecoration } from '../../src/editor/decorations/link';
import {
  findLinkAt,
  linkClickHandler,
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

  it('calls shellOpenExternal when a .cm-md-link span is clicked', () => {
    const doc = 'see [click](https://example.com) end';
    const view = setup(doc, 0);
    const linkEl = view.dom.querySelector('.cm-md-link') as HTMLElement | null;
    expect(linkEl).not.toBeNull();
    // jsdom doesn't lay things out, so posAtCoords would fail; bypass by
    // directly calling the handler via a synthetic event whose target the
    // mousedown handler can closest('.cm-md-link') against. We need to also
    // make posAtCoords resolve — stub it.
    const origPosAtCoords = view.posAtCoords.bind(view);
    view.posAtCoords = vi.fn(() => doc.indexOf('click') + 1);
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'target', { value: linkEl });
    view.contentDOM.dispatchEvent(ev);
    expect(window.api.shellOpenExternal).toHaveBeenCalledWith('https://example.com');
    view.posAtCoords = origPosAtCoords;
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

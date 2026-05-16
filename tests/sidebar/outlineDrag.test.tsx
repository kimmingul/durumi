import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Outline } from '../../src/components/sidebar/Outline';
import { parseHeadings } from '../../src/editor/outline';

/** jsdom doesn't ship a working DataTransfer or DragEvent. We hand the
 *  React handler a stub good enough for our code path. */
function makeDataTransfer(): DataTransfer {
  const data = new Map<string, string>();
  return {
    effectAllowed: 'move',
    dropEffect: 'move',
    setData(type: string, value: string) { data.set(type, value); },
    getData(type: string) { return data.get(type) ?? ''; },
  } as unknown as DataTransfer;
}

/** React 18 stores event handlers on each DOM node via a `__reactProps$xxx`
 *  property keyed by the React internals' instance id. We read that prop
 *  directly so we can invoke the JSX handler in tests without needing a
 *  working synthetic DragEvent (jsdom doesn't have one). */
type ReactHandlers = Partial<{
  onDragStart: (e: unknown) => void;
  onDragOver: (e: unknown) => void;
  onDrop: (e: unknown) => void;
  onDragEnd: (e: unknown) => void;
}>;
function getReactProps(el: Element): ReactHandlers {
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  if (!key) throw new Error('react props not found on element');
  return (el as unknown as Record<string, ReactHandlers>)[key]!;
}

function fakeEvent(opts: { currentTarget: Element; clientY?: number }) {
  const dataTransfer = makeDataTransfer();
  return {
    currentTarget: opts.currentTarget,
    dataTransfer,
    clientY: opts.clientY ?? 0,
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
  };
}

describe('Outline drag-to-reorder UI', () => {
  it('rewrites the doc when a sibling row is dragged after another sibling', () => {
    const doc = '## A\nbody A\n\n## B\nbody B\n\n## C\nbody C';
    const onApply = vi.fn<(doc: string) => void>();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <Outline
          content={doc}
          onJump={() => undefined}
          onApplyOutlineMove={onApply}
        />,
      );
    });

    const rows = container.querySelectorAll('.cm-outline-row');
    expect(rows.length).toBe(3);
    const [rowA, rowB] = rows;
    if (!rowA || !rowB) throw new Error('expected 2+ outline rows');
    // Force the bounding rect so classifyDropZone picks 'after'.
    Object.defineProperty(rowB, 'getBoundingClientRect', {
      value: () => ({ top: 0, height: 20, left: 0, right: 100, bottom: 20, width: 100, x: 0, y: 0, toJSON: () => ({}) }),
      configurable: true,
    });

    act(() => {
      getReactProps(rowA).onDragStart!(fakeEvent({ currentTarget: rowA }));
    });
    act(() => {
      getReactProps(rowB).onDragOver!(fakeEvent({ currentTarget: rowB, clientY: 18 }));
    });
    act(() => {
      getReactProps(rowB).onDrop!(fakeEvent({ currentTarget: rowB, clientY: 18 }));
    });

    expect(onApply).toHaveBeenCalledTimes(1);
    const next = onApply.mock.calls[0]![0];
    const headings = parseHeadings(next);
    expect(headings.map((h) => h.text)).toEqual(['B', 'A', 'C']);

    act(() => { root.unmount(); });
    container.remove();
  });

  it('does not enable drag when the doc has setext headings', () => {
    const doc = 'Title\n=====\n\nbody\n\n## Sub';
    const onApply = vi.fn<(doc: string) => void>();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <Outline
          content={doc}
          onJump={() => undefined}
          onApplyOutlineMove={onApply}
        />,
      );
    });
    const rows = container.querySelectorAll('.cm-outline-row');
    // Only the ATX `## Sub` heading is shown.
    expect(rows.length).toBe(1);
    expect(rows[0]!.getAttribute('draggable')).toBe('false');
    act(() => { root.unmount(); });
    container.remove();
  });
});

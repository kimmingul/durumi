import { useEffect } from 'react';
import { EditorView } from '@codemirror/view';
import { useSidebarStore } from '../store/sidebarStore';
import { parseHeadings } from '../editor/outline';

const DEBOUNCE_MS = 50;

export function useActiveHeading(view: EditorView | null, content: string): void {
  const setActiveHeadingLine = useSidebarStore((s) => s.setActiveHeadingLine);

  useEffect(() => {
    if (!view) {
      setActiveHeadingLine(null);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const compute = () => {
      const top = view.viewport.from;
      const topLine = view.state.doc.lineAt(top).number;
      const headings = parseHeadings(content);
      let active: number | null = null;
      for (const h of headings) {
        if (h.line <= topLine) active = h.line;
        else break;
      }
      setActiveHeadingLine(active);
    };
    // Apply once on mount or content change.
    compute();
    const scroller = view.scrollDOM;
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(compute, DEBOUNCE_MS);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (timer) clearTimeout(timer);
    };
  }, [view, content, setActiveHeadingLine]);
}

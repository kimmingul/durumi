import { useEffect, useState } from 'react';
import { parseHeadings, buildOutlineTree, type OutlineNode } from '../editor/outline';

const DEBOUNCE_MS = 100;

export function useDocOutline(content: string): OutlineNode[] {
  const [tree, setTree] = useState<OutlineNode[]>(() => buildOutlineTree(parseHeadings(content)));
  useEffect(() => {
    const t = setTimeout(() => {
      setTree(buildOutlineTree(parseHeadings(content)));
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [content]);
  return tree;
}

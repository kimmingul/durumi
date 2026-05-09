import { useEffect, useMemo, useState } from 'react';
import { parseCmAnnotations, type CmAnnotation, type CmKind } from '@shared/criticMarkup';

const DEBOUNCE_MS = 100;

export interface CmCounts {
  insert: number;
  delete: number;
  substitution: number;
  highlight: number;
  comment: number;
  total: number;
}

export interface DocCmResult {
  list: CmAnnotation[];
  counts: CmCounts;
}

function computeCounts(list: CmAnnotation[]): CmCounts {
  const counts: CmCounts = {
    insert: 0,
    delete: 0,
    substitution: 0,
    highlight: 0,
    comment: 0,
    total: list.length,
  };
  for (const a of list) counts[a.kind as CmKind]++;
  return counts;
}

/**
 * Mirrors `useDocComments`: 100ms-debounced parse of the document into
 * a list of CriticMarkup annotations plus a per-kind count summary.
 */
export function useDocCriticMarkup(content: string): DocCmResult {
  const [list, setList] = useState<CmAnnotation[]>(() => parseCmAnnotations(content));
  useEffect(() => {
    const id = setTimeout(() => setList(parseCmAnnotations(content)), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [content]);
  const counts = useMemo(() => computeCounts(list), [list]);
  return { list, counts };
}

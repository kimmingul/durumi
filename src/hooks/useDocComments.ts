import { useEffect, useState } from 'react';
import { parseComments, type Comment } from '@shared/comments';

const DEBOUNCE_MS = 100;

export function useDocComments(content: string): Comment[] {
  const [list, setList] = useState<Comment[]>(() => parseComments(content));
  useEffect(() => {
    const id = setTimeout(() => setList(parseComments(content)), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [content]);
  return list;
}

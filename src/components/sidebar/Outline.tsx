import { useRef, useState } from 'react';
import { useDocOutline } from '../../hooks/useDocOutline';
import { useSidebarStore } from '../../store/sidebarStore';
import { useLanguage, t } from '../../i18n/t';
import { OutlineItem } from './OutlineItem';
import { applyMove, hasSetextHeading, type DropPosition } from '../../editor/outlineRewrite';

interface OutlineProps {
  content: string;
  onJump: (line: number) => void;
  /** When provided, drag-to-reorder is enabled and the rewritten doc is
   *  pushed back to the App store via this callback. */
  onApplyOutlineMove?: (newDoc: string) => void;
}

export function Outline({ content, onJump, onApplyOutlineMove }: OutlineProps) {
  const tree = useDocOutline(content);
  const activeLine = useSidebarStore((s) => s.activeHeadingLine);
  // We keep the live drag state in refs so the `drop` handler sees the
  // latest values even if React batched several state updates during a
  // single drag interaction. The mirrored useState is what drives the
  // visual indicator.
  const draggingRef = useRef<number | null>(null);
  const dropTargetRef = useRef<{ line: number; position: DropPosition } | null>(null);
  const [draggingLine, setDraggingLine] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ line: number; position: DropPosition } | null>(null);
  // Subscribe to language so empty-state label re-renders on switch.
  useLanguage();

  if (tree.length === 0) {
    return <div className="cm-outline-empty">{t('sidebar.empty.outline')}</div>;
  }

  // Drag is only safe when (a) the caller wired up a handler, and (b) the
  // doc uses ATX headings exclusively -- mixing in setext underlines would
  // mean the Outline UI is showing fewer headings than the doc actually
  // contains, so a "move" computed from line numbers could clobber them.
  const dragEnabled = onApplyOutlineMove !== undefined && !hasSetextHeading(content);

  function reset() {
    draggingRef.current = null;
    dropTargetRef.current = null;
    setDraggingLine(null);
    setDropTarget(null);
  }

  const drag = dragEnabled
    ? {
        draggingLine,
        dropTarget,
        onDragStart: (line: number) => {
          draggingRef.current = line;
          setDraggingLine(line);
        },
        onDragOver: (line: number, position: DropPosition) => {
          if (draggingRef.current == null || draggingRef.current === line) {
            dropTargetRef.current = null;
            setDropTarget(null);
            return;
          }
          const next = { line, position };
          dropTargetRef.current = next;
          setDropTarget(next);
        },
        onDragEnd: () => reset(),
        onDrop: () => {
          const dragging = draggingRef.current;
          const target = dropTargetRef.current;
          if (dragging != null && target && onApplyOutlineMove) {
            const next = applyMove(content, dragging, target.line, target.position);
            if (next !== null && next !== content) {
              onApplyOutlineMove(next);
            }
          }
          reset();
        },
      }
    : undefined;

  return (
    <div className="cm-outline" role="tree">
      {tree.map((n) => (
        <OutlineItem
          key={`${n.line}-${n.text}`}
          node={n}
          activeLine={activeLine}
          onJump={onJump}
          drag={drag}
        />
      ))}
    </div>
  );
}

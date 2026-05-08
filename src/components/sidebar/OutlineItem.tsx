import type { OutlineNode } from '../../editor/outline';
import type { DropPosition } from '../../editor/outlineRewrite';

interface OutlineItemProps {
  node: OutlineNode;
  activeLine: number | null;
  onJump: (line: number) => void;
  /**
   * When defined, the row participates in drag-to-reorder. The Outline tab
   * only passes these props when the doc is ATX-only and reordering is
   * safe; otherwise the row renders as a plain click target.
   */
  drag?: {
    draggingLine: number | null;
    dropTarget: { line: number; position: DropPosition } | null;
    onDragStart: (line: number) => void;
    onDragOver: (line: number, position: DropPosition) => void;
    onDragEnd: () => void;
    onDrop: () => void;
  };
}

const fontByLevel: Record<number, string> = {
  1: '14px',
  2: '13px',
  3: '12px',
  4: '12px',
  5: '12px',
  6: '12px',
};

const weightByLevel: Record<number, string> = {
  1: '600',
  2: '500',
  3: '400',
  4: '400',
  5: '400',
  6: '400',
};

/** Map the cursor's vertical position within a row to a drop slot. The
 *  top 25% means "before", the bottom 25% means "after", and the middle
 *  band means "inside" (drop as a child). */
function classifyDropZone(e: React.DragEvent<HTMLDivElement>): DropPosition {
  const rect = e.currentTarget.getBoundingClientRect();
  const y = e.clientY - rect.top;
  if (rect.height <= 0) return 'after';
  const ratio = y / rect.height;
  if (ratio < 0.25) return 'before';
  if (ratio > 0.75) return 'after';
  return 'inside';
}

export function OutlineItem({ node, activeLine, onJump, drag }: OutlineItemProps) {
  const isActive = activeLine === node.line;
  const indent = { paddingLeft: `${(node.level - 1) * 12 + 8}px` };
  const isDragging = drag?.draggingLine === node.line;
  const dropHere =
    drag?.dropTarget && drag.dropTarget.line === node.line
      ? drag.dropTarget.position
      : null;
  const cls =
    'cm-outline-row' +
    (isActive ? ' cm-outline-row-active' : '') +
    (isDragging ? ' cm-outline-row-dragging' : '') +
    (dropHere === 'before' ? ' cm-outline-row-drop-before' : '') +
    (dropHere === 'after' ? ' cm-outline-row-drop-after' : '') +
    (dropHere === 'inside' ? ' cm-outline-row-drop-inside' : '');

  return (
    <>
      <div
        className={cls}
        style={{
          ...indent,
          fontSize: fontByLevel[node.level] ?? '12px',
          fontWeight: weightByLevel[node.level] ?? '400',
        }}
        onClick={() => onJump(node.line)}
        title={node.text}
        draggable={drag !== undefined}
        onDragStart={
          drag
            ? (e) => {
                e.dataTransfer.effectAllowed = 'move';
                // setData is required in Firefox to actually start a drag.
                e.dataTransfer.setData('text/plain', String(node.line));
                drag.onDragStart(node.line);
              }
            : undefined
        }
        onDragOver={
          drag
            ? (e) => {
                if (drag.draggingLine == null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                drag.onDragOver(node.line, classifyDropZone(e));
              }
            : undefined
        }
        onDragEnd={drag ? () => drag.onDragEnd() : undefined}
        onDrop={
          drag
            ? (e) => {
                e.preventDefault();
                drag.onDrop();
              }
            : undefined
        }
      >
        {node.text}
      </div>
      {node.children.map((c) => (
        <OutlineItem
          key={`${c.line}-${c.text}`}
          node={c}
          activeLine={activeLine}
          onJump={onJump}
          drag={drag}
        />
      ))}
    </>
  );
}

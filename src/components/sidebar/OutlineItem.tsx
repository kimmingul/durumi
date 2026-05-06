import type { OutlineNode } from '../../editor/outline';

interface OutlineItemProps {
  node: OutlineNode;
  activeLine: number | null;
  onJump: (line: number) => void;
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

export function OutlineItem({ node, activeLine, onJump }: OutlineItemProps) {
  const isActive = activeLine === node.line;
  const indent = { paddingLeft: `${(node.level - 1) * 12 + 8}px` };
  const cls = 'cm-outline-row' + (isActive ? ' cm-outline-row-active' : '');
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
      >
        {node.text}
      </div>
      {node.children.map((c) => (
        <OutlineItem key={`${c.line}-${c.text}`} node={c} activeLine={activeLine} onJump={onJump} />
      ))}
    </>
  );
}

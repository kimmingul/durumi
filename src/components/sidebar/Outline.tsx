import { useDocOutline } from '../../hooks/useDocOutline';
import { useSidebarStore } from '../../store/sidebarStore';
import { useLanguage, t } from '../../i18n/t';
import { OutlineItem } from './OutlineItem';

interface OutlineProps {
  content: string;
  onJump: (line: number) => void;
}

export function Outline({ content, onJump }: OutlineProps) {
  const tree = useDocOutline(content);
  const activeLine = useSidebarStore((s) => s.activeHeadingLine);
  // Subscribe to language so empty-state label re-renders on switch.
  useLanguage();
  if (tree.length === 0) {
    return <div className="cm-outline-empty">{t('sidebar.empty.outline')}</div>;
  }
  return (
    <div className="cm-outline" role="tree">
      {tree.map((n) => (
        <OutlineItem key={`${n.line}-${n.text}`} node={n} activeLine={activeLine} onJump={onJump} />
      ))}
    </div>
  );
}

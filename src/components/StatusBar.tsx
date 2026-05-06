import { useAppStore } from '../store/appStore';
import { useLanguage, t } from '../i18n/t';
import { basenameOf } from '../utils/path';

export function StatusBar() {
  const filePath = useAppStore((s) => s.filePath);
  const content = useAppStore((s) => s.content);
  const isDirty = useAppStore((s) => s.isDirty);
  // Subscribe to language so labels re-render on switch.
  useLanguage();
  const name = filePath ? basenameOf(filePath) : t('status.untitled');
  return (
    <div className="status-bar">
      <span>{isDirty ? '●' : '◯'} {name}</span>
      <span>{t('status.charsLine', { count: String(content.length) })}</span>
    </div>
  );
}

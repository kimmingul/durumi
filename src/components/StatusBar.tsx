import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useDocComments } from '../hooks/useDocComments';
import { useLanguage, t } from '../i18n/t';
import { basenameOf } from '../utils/path';
import { computeWordStats, WordStats } from '../utils/wordCount';

const COUNT_DEBOUNCE_MS = 200;

function useWordStats(source: string): WordStats {
  const [stats, setStats] = useState<WordStats>(() => computeWordStats(source));
  useEffect(() => {
    const id = setTimeout(() => setStats(computeWordStats(source)), COUNT_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [source]);
  return stats;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function StatusBar() {
  const filePath = useAppStore((s) => s.filePath);
  const content = useAppStore((s) => s.content);
  const isDirty = useAppStore((s) => s.isDirty);
  // Subscribe to language so labels re-render on switch.
  useLanguage();
  const name = filePath ? basenameOf(filePath) : t('status.untitled');
  const stats = useWordStats(content);
  const comments = useDocComments(content);
  const counters = useMemo(
    () => ({
      words: t('status.words', { count: formatNumber(stats.words) }),
      chars: t('status.chars', { count: formatNumber(stats.chars) }),
      reading: t('status.reading', { count: String(stats.readingMinutes) }),
    }),
    [stats],
  );
  return (
    <div className="status-bar">
      <span>{isDirty ? '●' : '◯'} {name}</span>
      <span className="status-bar-counters" title={`${counters.words} · ${counters.chars}`}>
        {counters.words} · {counters.chars} · {counters.reading}
        {comments.length > 0 && (
          <> · <span className="status-bar-comments">{t('status.comments', { count: String(comments.length) })}</span></>
        )}
      </span>
    </div>
  );
}

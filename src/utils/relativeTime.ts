import { t } from '../i18n/t';

const MIN_S = 60;
const HOUR_S = 60 * 60;
const DAY_S = 24 * HOUR_S;
const WEEK_S = 7 * DAY_S;
const MONTH_S = 30 * DAY_S;
const YEAR_S = 365 * DAY_S;

/**
 * Renders a localized relative-time label like "3h ago" / "3시간 전" for any
 * ISO 8601 timestamp. Returns an empty string for missing or unparseable
 * timestamps so the caller can render nothing without an extra branch.
 *
 * `now` is injectable for unit testing — production callers omit it.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const deltaSec = Math.max(0, Math.floor((now.getTime() - ms) / 1000));
  if (deltaSec < 5) return t('memo.relativeTime.now');
  if (deltaSec < MIN_S) return t('memo.relativeTime.seconds', { count: String(deltaSec) });
  if (deltaSec < HOUR_S) {
    return t('memo.relativeTime.minutes', { count: String(Math.floor(deltaSec / MIN_S)) });
  }
  if (deltaSec < DAY_S) {
    return t('memo.relativeTime.hours', { count: String(Math.floor(deltaSec / HOUR_S)) });
  }
  if (deltaSec < WEEK_S) {
    return t('memo.relativeTime.days', { count: String(Math.floor(deltaSec / DAY_S)) });
  }
  if (deltaSec < MONTH_S) {
    return t('memo.relativeTime.weeks', { count: String(Math.floor(deltaSec / WEEK_S)) });
  }
  if (deltaSec < YEAR_S) {
    return t('memo.relativeTime.months', { count: String(Math.floor(deltaSec / MONTH_S)) });
  }
  return t('memo.relativeTime.years', { count: String(Math.floor(deltaSec / YEAR_S)) });
}

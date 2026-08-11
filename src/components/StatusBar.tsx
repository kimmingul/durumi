import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store/appStore';
import {
  availableModesOf,
  displayModeOf,
  isDirty as isDirty_,
  useActiveDocument,
  useWorkspaceStore,
} from '../store/workspaceStore';
import { useDocComments } from '../hooks/useDocComments';
import { useDocCriticMarkup } from '../hooks/useDocCriticMarkup';
import { useLanguage, t } from '../i18n/t';
import { basenameOf } from '../utils/path';
import { computeWordStats, WordStats } from '../utils/wordCount';
import type { EditMode } from '../editor/editMode';

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

const MODES: ReadonlyArray<{ mode: EditMode; labelKey: string; icon: string; titleKey: string }> = [
  { mode: 'wysiwyg', labelKey: 'status.editMode.wysiwyg', icon: 'D', titleKey: 'status.editMode.wysiwyg.title' },
  { mode: 'typora', labelKey: 'status.editMode.typora', icon: 'L', titleKey: 'status.editMode.typora.title' },
  { mode: 'markdown', labelKey: 'status.editMode.markdown', icon: 'S', titleKey: 'status.editMode.markdown.title' },
];

export function StatusBar() {
  const filePath = useActiveDocument((d) => d?.path ?? null);
  const content = useActiveDocument((d) => d?.content ?? '');
  const isDirty = useActiveDocument((d) => (d ? isDirty_(d) : false));
  // 모드 컨트롤은 **활성 패널**의 모드를 표시하고 그 패널에 작용한다
  // (REQ-PANEL-024). 활성 패널이 보조 패널이면 제시할 모드가 없으므로
  // (`availableModesOf`가 빈 집합) 컨트롤 전체가 비활성으로 제시된다 — 적용
  // 대상이 없는 컨트롤을 활성으로 보이게 하지 않는다.
  const editMode = useWorkspaceStore((s) =>
    s.activePanelId === null ? null : displayModeOf(s, s.activePanelId),
  );
  const modesEnabled = useWorkspaceStore((s) =>
    s.activePanelId !== null && availableModesOf(s, s.activePanelId).length > 0,
  );
  const setPanelDisplayMode = useWorkspaceStore((s) => s.setPanelDisplayMode);
  const headingHint = useAppStore((s) => s.headingHint);
  // Subscribe to language so labels re-render on switch.
  useLanguage();
  const name = filePath ? basenameOf(filePath) : t('status.untitled');
  const stats = useWordStats(content);
  const comments = useDocComments(content);
  const { counts: cmCounts } = useDocCriticMarkup(content);
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
        {cmCounts.total > 0 && (
          <> · <span className="status-bar-cm" data-testid="status-cm-badges">
            <span className="status-bar-cm-badge status-bar-cm-insert" title={t('status.cm.insert')}>+{cmCounts.insert}</span>
            {' '}<span className="status-bar-cm-badge status-bar-cm-delete" title={t('status.cm.delete')}>-{cmCounts.delete}</span>
            {' '}<span className="status-bar-cm-badge status-bar-cm-substitution" title={t('status.cm.substitution')}>~{cmCounts.substitution}</span>
            {' '}<span className="status-bar-cm-badge status-bar-cm-highlight" title={t('status.cm.highlight')}>▮{cmCounts.highlight}</span>
            {' '}<span className="status-bar-cm-badge status-bar-cm-comment" title={t('status.cm.comment')}>💬{cmCounts.comment}</span>
          </span></>
        )}
      </span>
      {headingHint && (
        <span
          className="status-bar-hint"
          role="status"
          aria-live="polite"
          data-testid="status-heading-hint"
        >
          {t('status.hint.headingSpace')}
        </span>
      )}
      <span
        className="status-bar-mode"
        role="radiogroup"
        aria-label={t('status.editMode.group')}
        aria-disabled={!modesEnabled}
        data-testid="status-edit-mode"
      >
        {MODES.map(({ mode, labelKey, icon, titleKey }) => (
          <button
            key={mode}
            type="button"
            role="radio"
            disabled={!modesEnabled}
            aria-checked={modesEnabled && editMode === mode}
            className={`status-bar-mode-btn${modesEnabled && editMode === mode ? ' status-bar-mode-btn-active' : ''}`}
            title={`${t(titleKey)} (${t(labelKey)})`}
            onClick={() => {
              // **`prefs`에 쓰지 않는다**(REQ-PANEL-023, AC-PANEL-023의 호출 횟수
              // 0 단언). 여기서 쓰면 마지막으로 모드를 바꾼 패널이 전역 기본값을
              // 결정해 다음 세션의 모든 패널을 규정한다 — 기각된 후보 2다.
              //
              // 활성 패널은 **누를 때** 다시 읽는다. 렌더 시점의 값을 닫으면
              // 렌더와 클릭 사이에 활성 패널이 바뀐 경우 남의 패널 모드를 바꾼다.
              const target = useWorkspaceStore.getState().activePanelId;
              if (target === null) return;
              setPanelDisplayMode(target, mode);
            }}
          >
            <span className="status-bar-mode-icon">{icon}</span>
            <span className="status-bar-mode-label">{t(labelKey)}</span>
          </button>
        ))}
      </span>
    </div>
  );
}

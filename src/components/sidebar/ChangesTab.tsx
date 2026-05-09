import { useState } from 'react';
import { useDocCriticMarkup } from '../../hooks/useDocCriticMarkup';
import { useLanguage, t } from '../../i18n/t';
import type { CmAnnotation, CmKind } from '@shared/criticMarkup';

interface ChangesTabProps {
  content: string;
  onJump: (line: number) => void;
}

const PREVIEW_MAX = 60;

const KINDS: CmKind[] = ['insert', 'delete', 'substitution', 'highlight', 'comment'];

function buildPreview(a: CmAnnotation): string {
  const text = a.text.replace(/\s+/g, ' ').trim();
  if (text.length <= PREVIEW_MAX) return text;
  return text.slice(0, PREVIEW_MAX - 1).trimEnd() + '…';
}

function kindBadge(kind: CmKind): string {
  switch (kind) {
    case 'insert': return '+';
    case 'delete': return '−';
    case 'substitution': return '~';
    case 'highlight': return '▮';
    case 'comment': return '💬';
  }
}

export function ChangesTab({ content, onJump }: ChangesTabProps) {
  const { list, counts } = useDocCriticMarkup(content);
  // Subscribe to language so labels re-render on switch.
  useLanguage();
  const [showHelp, setShowHelp] = useState(false);

  if (list.length === 0) {
    return (
      <div>
        <div style={helpRowStyle}>
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            style={helpToggleStyle}
            aria-expanded={showHelp}
            data-testid="cm-help-toggle"
          >
            {showHelp ? '▾' : '▸'} {t('cm.help.title')}
          </button>
          {showHelp && <p style={helpBodyStyle}>{t('cm.help.body')}</p>}
        </div>
        <div className="cm-comments-empty">{t('sidebar.empty.changes')}</div>
      </div>
    );
  }

  // Group by kind, preserving document order within each group.
  const groups: Record<CmKind, CmAnnotation[]> = {
    insert: [],
    delete: [],
    substitution: [],
    highlight: [],
    comment: [],
  };
  for (const a of list) {
    groups[a.kind as CmKind].push(a);
  }

  return (
    <div className="cm-changes" role="list">
      <div style={helpRowStyle}>
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          style={helpToggleStyle}
          aria-expanded={showHelp}
          data-testid="cm-help-toggle"
        >
          {showHelp ? '▾' : '▸'} {t('cm.help.title')}
        </button>
        {showHelp && <p style={helpBodyStyle}>{t('cm.help.body')}</p>}
      </div>
      {KINDS.map((kind) => {
        const items = groups[kind];
        if (items.length === 0) return null;
        return (
          <section key={kind} className={`cm-changes-group cm-changes-group-${kind}`}>
            <header className="cm-changes-group-header">
              <span className={`cm-changes-kind-chip cm-changes-kind-${kind}`}>
                {kindBadge(kind)}
              </span>
              <span className="cm-changes-group-label">
                {t(`cm.kind.${kind}`)}
              </span>
              <span className="cm-changes-group-count">{counts[kind]}</span>
            </header>
            {items.map((a, i) => (
              <button
                key={`${kind}-${a.line}-${i}`}
                className="cm-changes-row"
                role="listitem"
                onClick={() => onJump(a.line)}
                data-testid={`cm-row-${kind}`}
              >
                <span className="cm-changes-preview">{buildPreview(a)}</span>
                <span className="cm-changes-line">L{a.line}</span>
              </button>
            ))}
          </section>
        );
      })}
    </div>
  );
}

const helpRowStyle: React.CSSProperties = {
  padding: '6px 8px 4px',
  borderBottom: '1px solid var(--border, #e2e2e2)',
  marginBottom: 4,
};

const helpToggleStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  fontSize: 12,
  color: 'var(--muted-fg, #6a6a6a)',
};

const helpBodyStyle: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: 11,
  lineHeight: 1.45,
  color: 'var(--muted-fg, #6a6a6a)',
};

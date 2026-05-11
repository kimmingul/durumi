import { useEffect, useMemo, useState } from 'react';
import { t, useLanguage } from '../i18n/t';

// Searchable reference of every keyboard shortcut. Lives behind the
// Help menu and (optionally) a global shortcut. The shortcut list is
// hand-curated rather than auto-extracted from the keymap so we can
// group related actions (file ops, formatting, navigation, AI) and
// add the descriptive tooltips that map shortcuts to their purpose.

export interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

interface Shortcut {
  keys: string[];
  /** i18n key for the human-readable action label. */
  labelKey: string;
}

interface Group {
  /** i18n key for the section heading. */
  titleKey: string;
  items: Shortcut[];
}

const SHORTCUTS: Group[] = [
  {
    titleKey: 'shortcuts.group.file',
    items: [
      { keys: ['Cmd/Ctrl', 'N'], labelKey: 'menu.file.new' },
      { keys: ['Cmd/Ctrl', 'Shift', 'N'], labelKey: 'menu.file.newWindow' },
      { keys: ['Cmd/Ctrl', 'O'], labelKey: 'menu.file.open' },
      { keys: ['Cmd/Ctrl', 'S'], labelKey: 'menu.file.save' },
      { keys: ['Cmd/Ctrl', 'Shift', 'S'], labelKey: 'menu.file.saveAs' },
      { keys: ['Cmd/Ctrl', 'P'], labelKey: 'menu.file.quickOpen' },
    ],
  },
  {
    titleKey: 'shortcuts.group.edit',
    items: [
      { keys: ['Cmd/Ctrl', 'F'], labelKey: 'menu.edit.find' },
      { keys: ['Cmd/Ctrl', 'B'], labelKey: 'menu.edit.bold' },
      { keys: ['Cmd/Ctrl', 'I'], labelKey: 'menu.edit.italic' },
      { keys: ['Cmd/Ctrl', 'Shift', 'K'], labelKey: 'menu.edit.inlineCode' },
      { keys: ['Cmd/Ctrl', 'K'], labelKey: 'menu.edit.insertLink' },
      { keys: ['Cmd/Ctrl', 'Shift', 'X'], labelKey: 'menu.edit.strikethrough' },
      { keys: ['Cmd/Ctrl', 'Shift', 'T'], labelKey: 'menu.edit.insertTable' },
      { keys: ['Cmd/Ctrl', 'Return'], labelKey: 'menu.edit.toggleTask' },
      { keys: ['Cmd/Ctrl', 'Shift', 'C'], labelKey: 'menu.edit.codeBlock' },
    ],
  },
  {
    titleKey: 'shortcuts.group.view',
    items: [
      { keys: ['Cmd/Ctrl', '\\'], labelKey: 'menu.view.toggleSidebar' },
      { keys: ['Cmd/Ctrl', 'Shift', '\\'], labelKey: 'menu.view.toggleRightSidebar' },
      { keys: ['Cmd/Ctrl', 'Shift', 'L'], labelKey: 'menu.view.toggleTheme' },
      { keys: ['Cmd/Ctrl', '/'], labelKey: 'menu.view.toggleSourceMode' },
      { keys: ['Cmd/Ctrl', 'Shift', 'E'], labelKey: 'menu.view.showFiles' },
      { keys: ['Cmd/Ctrl', 'Shift', 'O'], labelKey: 'menu.view.showOutline' },
      { keys: ['Cmd/Ctrl', 'Shift', 'F'], labelKey: 'menu.view.showSearch' },
      { keys: ['F8'], labelKey: 'menu.view.focusMode' },
      { keys: ['F9'], labelKey: 'menu.view.typewriterMode' },
    ],
  },
  {
    titleKey: 'shortcuts.group.review',
    items: [
      { keys: ['Cmd/Ctrl', 'Alt', 'M'], labelKey: 'menu.review.addMemo' },
      { keys: ['Cmd/Ctrl', 'Shift', 'M'], labelKey: 'menu.review.toggleMemoPanel' },
      { keys: ['F3'], labelKey: 'menu.review.nextMemo' },
      { keys: ['Shift', 'F3'], labelKey: 'menu.review.prevMemo' },
    ],
  },
  {
    titleKey: 'shortcuts.group.references',
    items: [
      { keys: ['Cmd/Ctrl', 'Shift', 'I'], labelKey: 'menu.review.openCitePalette' },
      { keys: ['Cmd/Ctrl', 'Shift', 'B'], labelKey: 'menu.review.insertCitationFromDoi' },
    ],
  },
  {
    titleKey: 'shortcuts.group.ai',
    items: [
      { keys: ['Cmd/Ctrl', 'Shift', '/'], labelKey: 'menu.review.openAiPalette' },
      { keys: ['Tab'], labelKey: 'shortcuts.ai.acceptGhost' },
      { keys: ['Esc'], labelKey: 'shortcuts.ai.dismissGhost' },
    ],
  },
];

export function KeyboardShortcutsDialog(props: KeyboardShortcutsDialogProps) {
  const { open, onClose } = props;
  useLanguage();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    setQuery('');
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => filterGroups(SHORTCUTS, query), [query]);

  if (!open) return null;

  return (
    <div
      style={backdropStyle}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="shortcuts-backdrop"
    >
      <div
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        data-testid="shortcuts-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <header style={headerStyle}>
          <h2 id="shortcuts-title" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {t('shortcuts.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('settings.close')}
            style={closeBtnStyle}
          >×</button>
        </header>
        <div style={bodyStyle}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('shortcuts.searchPlaceholder')}
            style={searchStyle}
            data-testid="shortcuts-search"
            autoFocus
          />
          {filtered.length === 0 ? (
            <p style={emptyStyle}>{t('shortcuts.empty')}</p>
          ) : (
            filtered.map((group) => (
              <section key={group.titleKey} style={groupStyle}>
                <h3 style={groupTitle}>{t(group.titleKey)}</h3>
                <table style={tableStyle}>
                  <tbody>
                    {group.items.map((item) => (
                      <tr key={item.labelKey} data-testid="shortcuts-row">
                        <td style={labelCol}>{t(item.labelKey)}</td>
                        <td style={keysCol}>
                          {item.keys.map((k, i) => (
                            <span key={`${item.labelKey}-${i}`}>
                              <kbd style={kbdStyle}>{k}</kbd>
                              {i < item.keys.length - 1 && <span style={plus}>+</span>}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/** Test seam — lets unit tests assert filtering without mounting the DOM. */
export function filterGroups(groups: readonly Group[], query: string): Group[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [...groups];
  const out: Group[] = [];
  for (const g of groups) {
    const items = g.items.filter((item) => {
      const label = t(item.labelKey).toLowerCase();
      const keys = item.keys.join(' ').toLowerCase();
      return label.includes(q) || keys.includes(q);
    });
    if (items.length > 0) out.push({ titleKey: g.titleKey, items });
  }
  return out;
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.45)',
  zIndex: 9100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
const cardStyle: React.CSSProperties = {
  background: 'var(--bg, #fff)',
  color: 'var(--fg, #111)',
  borderRadius: 8,
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.35)',
  width: 'min(680px, 92vw)',
  maxHeight: '88vh',
  display: 'flex',
  flexDirection: 'column',
  fontSize: 14,
};
const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 18px',
  borderBottom: '1px solid var(--border, #e2e2e2)',
};
const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  fontSize: 22,
  lineHeight: 1,
  cursor: 'pointer',
  color: 'inherit',
  padding: '0 4px',
};
const bodyStyle: React.CSSProperties = {
  padding: '14px 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  overflowY: 'auto',
};
const searchStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  borderRadius: 4,
  border: '1px solid var(--border, #c8c8c8)',
  background: 'var(--bg, #fff)',
  color: 'inherit',
  fontSize: 13,
  boxSizing: 'border-box',
};
const groupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};
const groupTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  color: 'var(--muted-fg, #6a6a6a)',
};
const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
};
const labelCol: React.CSSProperties = {
  padding: '6px 4px',
  fontSize: 13,
};
const keysCol: React.CSSProperties = {
  padding: '6px 4px',
  textAlign: 'right',
  whiteSpace: 'nowrap',
};
const kbdStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 6px',
  borderRadius: 3,
  border: '1px solid var(--border, #c8c8c8)',
  background: 'var(--code-bg, #f4f4f4)',
  fontFamily: 'var(--mono, ui-monospace, monospace)',
  fontSize: 11,
};
const plus: React.CSSProperties = {
  margin: '0 4px',
  color: 'var(--muted-fg, #6a6a6a)',
  fontSize: 11,
};
const emptyStyle: React.CSSProperties = {
  margin: 0,
  padding: '14px',
  textAlign: 'center',
  fontSize: 13,
  color: 'var(--muted-fg, #6a6a6a)',
};

import { useEffect, useMemo, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { useBibliographyStore } from '../store/bibliographyStore';
import { fuzzyRank } from '../utils/fuzzy';
import { t, useLanguage } from '../i18n/t';
import type { BibEntry } from '@shared/bibtex';
import { insertCitationSmart } from '@shared/citationMerge';

/**
 * Cmd/Ctrl+Shift+I — fuzzy palette over the entries currently in
 * `references.bib`. Dropping `[@key]` at the editor caret on Enter.
 *
 * Mirrors the look of `QuickOpen` so the keyboard model is identical: type
 * to filter, ↑/↓ to move, Enter to confirm, Esc to close.
 *
 * v0.1.10 — when `editorView` is provided we dispatch the cite directly
 * through `insertCitationSmart` so two adjacent `[@a][@b]` insertions
 * collapse into `[@a; @b]`. Without `editorView` we fall back to the
 * legacy `onPick(key)` callback so App-level code can keep doing its
 * own dispatch (used for tests and for the App's existing wiring).
 */
export interface CitePaletteProps {
  open: boolean;
  onClose: () => void;
  onPick: (key: string) => void;
  /** Optional — when given, we dispatch the cite via smart-merge here. */
  editorView?: EditorView | null;
  /** Surfaces "already cited" rejections; defaults to `window.alert`. */
  onDuplicate?: (key: string) => void;
}

const MAX_RESULTS = 50;

export function CitePalette({ open, onClose, onPick, editorView, onDuplicate }: CitePaletteProps) {
  useLanguage();
  const entries = useBibliographyStore((s) => s.entries);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(key: string): void {
    // Smart-merge path: dispatch via the editor view when we have it.
    if (editorView) {
      const doc = editorView.state.doc.toString();
      const pos = editorView.state.selection.main.from;
      const outcome = insertCitationSmart(doc, pos, key);
      if (outcome.kind === 'duplicate') {
        if (onDuplicate) onDuplicate(key);
        else {
          // eslint-disable-next-line no-alert
          window.alert(t('toast.bibliography.citationDuplicate'));
        }
        return;
      }
      editorView.dispatch({
        changes: { from: outcome.from, to: outcome.to, insert: outcome.insert },
        selection: { anchor: outcome.caret },
      });
      editorView.focus();
      return;
    }
    // Fallback (App.tsx wiring): hand the key off and let the caller dispatch.
    onPick(key);
  }

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIdx(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const ranked = useMemo(() => {
    const r = fuzzyRank(query, entries, (e) => `${e.key} ${searchableSummary(e)}`);
    return r.slice(0, MAX_RESULTS);
  }, [query, entries]);

  useEffect(() => {
    if (activeIdx >= ranked.length) setActiveIdx(0);
  }, [ranked, activeIdx]);

  if (!open) return null;

  return (
    <div
      className="cm-quickopen-backdrop"
      onClick={onClose}
      data-testid="cite-palette-backdrop"
    >
      <div
        className="cm-quickopen"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Insert citation"
        data-testid="cite-palette"
      >
        <input
          ref={inputRef}
          type="text"
          className="cm-quickopen-input"
          placeholder={t('citePalette.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIdx((i) => Math.min(i + 1, ranked.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const choice = ranked[activeIdx];
              if (choice) {
                pick(choice.item.key);
                onClose();
              }
            }
          }}
        />
        <ul className="cm-quickopen-list">
          {ranked.map((r, i) => (
            <li
              key={r.item.key}
              className={'cm-quickopen-item' + (i === activeIdx ? ' active' : '')}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r.item.key);
                onClose();
              }}
              onMouseMove={() => setActiveIdx(i)}
              data-testid="cite-palette-item"
              title={`[@${r.item.key}]`}
            >
              <span className="cm-quickopen-name">{r.item.key}</span>
              <span className="cm-quickopen-path">{searchableSummary(r.item)}</span>
            </li>
          ))}
          {ranked.length === 0 && (
            <li className="cm-quickopen-empty">
              {entries.length === 0
                ? t('citePalette.empty.none')
                : t('citePalette.empty.noMatches')}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function searchableSummary(e: BibEntry): string {
  const f = e.fields;
  const author = (f.author ?? '').split(/\s+and\s+/)[0]?.replace(/,.*$/, '').trim() ?? '';
  return [author, f.year, f.title, f.journal ?? f.booktitle].filter(Boolean).join(' · ');
}

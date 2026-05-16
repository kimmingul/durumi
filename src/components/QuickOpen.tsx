import { useEffect, useMemo, useRef, useState } from 'react';
import { useSidebarStore } from '../store/sidebarStore';
import { fuzzyRank } from '../utils/fuzzy';

interface QuickOpenProps {
  open: boolean;
  onClose: () => void;
  onPick: (absPath: string) => void;
}

interface Entry {
  name: string;
  relPath: string;
  absPath: string;
}

const MAX_RESULTS = 50;

export function QuickOpen({ open, onClose, onPick }: QuickOpenProps) {
  const folders = useSidebarStore((s) => s.workspaceFolders);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Refresh the index every time the modal is opened.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIdx(0);
    let cancelled = false;
    void window.api.filesIndex(folders).then((list) => {
      if (!cancelled) setEntries(list);
    });
    return () => {
      cancelled = true;
    };
  }, [open, folders]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const ranked = useMemo(() => {
    const r = fuzzyRank(query, entries, (e) => e.relPath);
    return r.slice(0, MAX_RESULTS);
  }, [query, entries]);

  useEffect(() => {
    if (activeIdx >= ranked.length) setActiveIdx(0);
  }, [ranked, activeIdx]);

  if (!open) return null;

  return (
    <div className="cm-quickopen-backdrop" onClick={onClose}>
      <div
        className="cm-quickopen"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Quick Open"
      >
        <input
          ref={inputRef}
          type="text"
          className="cm-quickopen-input"
          placeholder="Type a filename… (Esc to close, ↑↓ to move, Enter to open)"
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
              const pick = ranked[activeIdx];
              if (pick) {
                onPick(pick.item.absPath);
                onClose();
              }
            }
          }}
        />
        <ul className="cm-quickopen-list">
          {ranked.map((r, i) => (
            <li
              key={r.item.absPath}
              className={'cm-quickopen-item' + (i === activeIdx ? ' active' : '')}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(r.item.absPath);
                onClose();
              }}
              onMouseMove={() => setActiveIdx(i)}
              title={r.item.absPath}
            >
              <span className="cm-quickopen-name">
                {highlight(r.item.name, baseIndices(r.item.relPath, r.indices))}
              </span>
              <span className="cm-quickopen-path">{r.item.relPath}</span>
            </li>
          ))}
          {ranked.length === 0 && (
            <li className="cm-quickopen-empty">
              {entries.length === 0 ? 'No files indexed.' : 'No matches.'}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function baseIndices(relPath: string, indices: number[]): number[] {
  const lastSlash = Math.max(relPath.lastIndexOf('/'), relPath.lastIndexOf('\\'));
  if (lastSlash < 0) return indices;
  const base = lastSlash + 1;
  return indices.filter((i) => i >= base).map((i) => i - base);
}

function highlight(text: string, indices: number[]) {
  if (indices.length === 0) return text;
  const set = new Set(indices);
  const out: Array<JSX.Element | string> = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? '';
    if (set.has(i)) {
      out.push(<mark key={i}>{ch}</mark>);
    } else {
      out.push(ch);
    }
  }
  return <>{out}</>;
}

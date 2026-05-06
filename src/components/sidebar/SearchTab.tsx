import { useEffect, useMemo, useRef, useState } from 'react';
import { useSidebarStore } from '../../store/sidebarStore';

interface SearchTabProps {
  onOpenHit: (absPath: string, line: number, column: number) => void;
}

interface Hit {
  relPath: string;
  absPath: string;
  line: number;
  column: number;
  preview: string;
  matchLength: number;
}

interface FileGroup {
  absPath: string;
  relPath: string;
  hits: Hit[];
}

const DEBOUNCE_MS = 250;

export function SearchTab({ onOpenHit }: SearchTabProps) {
  const folders = useSidebarStore((s) => s.workspaceFolders);
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const reqId = ++reqIdRef.current;
    if (query.length === 0) {
      setHits([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    const t = setTimeout(async () => {
      const all: Hit[] = [];
      for (const root of folders) {
        const r = await window.api.searchWorkspace(root, {
          query,
          caseSensitive,
          wholeWord,
          regex,
        });
        all.push(...r);
      }
      if (reqId === reqIdRef.current) {
        setHits(all);
        setBusy(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, caseSensitive, wholeWord, regex, folders]);

  const groups = useMemo<FileGroup[]>(() => {
    const map = new Map<string, FileGroup>();
    for (const h of hits) {
      const key = h.absPath;
      let g = map.get(key);
      if (!g) {
        g = { absPath: h.absPath, relPath: h.relPath, hits: [] };
        map.set(key, g);
      }
      g.hits.push(h);
    }
    return Array.from(map.values()).sort((a, b) => a.relPath.localeCompare(b.relPath));
  }, [hits]);

  return (
    <div className="cm-search-tab">
      <div className="cm-search-controls">
        <input
          autoFocus
          type="text"
          placeholder="Search in workspace…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="cm-search-input"
        />
        <div className="cm-search-flags">
          <label title="Case sensitive">
            <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} /> Aa
          </label>
          <label title="Whole word">
            <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} /> Wd
          </label>
          <label title="Regex">
            <input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} /> .*
          </label>
        </div>
      </div>
      <div className="cm-search-status">
        {busy
          ? 'Searching…'
          : query.length === 0
            ? 'Type to search'
            : hits.length === 0
              ? 'No matches'
              : `${hits.length} match${hits.length === 1 ? '' : 'es'} in ${groups.length} file${groups.length === 1 ? '' : 's'}`}
      </div>
      <div className="cm-search-results">
        {groups.map((g) => (
          <div key={g.absPath} className="cm-search-file">
            <div className="cm-search-file-header" title={g.absPath}>
              {g.relPath || g.absPath}
            </div>
            {g.hits.map((h, i) => (
              <button
                key={i}
                className="cm-search-hit"
                onClick={() => onOpenHit(h.absPath, h.line, h.column)}
                title={`Line ${h.line}, col ${h.column + 1}`}
              >
                <span className="cm-search-hit-line">{h.line}</span>
                <span className="cm-search-hit-preview">{renderPreview(h)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function renderPreview(h: Hit) {
  const before = h.preview.slice(0, h.column);
  const matched = h.preview.slice(h.column, h.column + h.matchLength);
  const after = h.preview.slice(h.column + h.matchLength);
  return (
    <>
      <span className="cm-search-hit-before">{trimLeft(before)}</span>
      <mark>{matched}</mark>
      <span className="cm-search-hit-after">{trimRight(after)}</span>
    </>
  );
}

function trimLeft(s: string): string {
  if (s.length <= 60) return s;
  return '…' + s.slice(s.length - 60);
}
function trimRight(s: string): string {
  if (s.length <= 60) return s;
  return s.slice(0, 60) + '…';
}

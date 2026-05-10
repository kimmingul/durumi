import { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage, t } from '../../i18n/t';
import { useBibliographyStore, type OrphanFile } from '../../store/bibliographyStore';
import { OrphanRegisterDialog } from '../OrphanRegisterDialog';
import { EditEntryDialog } from '../EditEntryDialog';
import { RenameKeyDialog } from '../RenameKeyDialog';
import type { BibEntry } from '@shared/bibtex';
import type { BibliographySearchHit } from '@shared/ipc-contract';

interface ReferencesTabProps {
  /** Insert `[@key]` at the editor caret. */
  onInsertCitation: (key: string) => void;
  /** Active document text — needed for the rename-key reference count. */
  documentText?: string;
  /** Migrate `[@oldKey]` → `[@newKey]` across the active document. */
  onCitationRenamed?: (oldKey: string, newKey: string) => void;
}

type Source = 'crossref' | 'pubmed' | 'koreamed';

interface SearchState {
  loading: boolean;
  query: string;
  source: Source;
  hits: BibliographySearchHit[];
  error: string | null;
}

const DEBOUNCE_MS = 300;
const SEARCH_LIMIT = 25;

export function ReferencesTab({
  onInsertCitation,
  documentText = '',
  onCitationRenamed,
}: ReferencesTabProps) {
  useLanguage();
  const filePath = useBibliographyStore((s) => s.filePath);
  const exists = useBibliographyStore((s) => s.exists);
  const entries = useBibliographyStore((s) => s.entries);
  const addEntry = useBibliographyStore((s) => s.addEntry);
  const fileStatus = useBibliographyStore((s) => s.fileStatus);
  const downloading = useBibliographyStore((s) => s.downloading);
  const downloadReference = useBibliographyStore((s) => s.downloadReference);
  const orphanFiles = useBibliographyStore((s) => s.orphanFiles);
  const registerOrphan = useBibliographyStore((s) => s.registerOrphan);
  const scanFileStatuses = useBibliographyStore((s) => s.scanFileStatuses);
  const updateEntry = useBibliographyStore((s) => s.updateEntry);
  const deleteEntry = useBibliographyStore((s) => s.deleteEntry);

  const [editingEntry, setEditingEntry] = useState<BibEntry | null>(null);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);

  const [manualEntryFor, setManualEntryFor] = useState<{
    orphan: OrphanFile;
    initialDoi: string | null;
  } | null>(null);

  // Re-scan whenever the tab mounts so orphan files dropped via Finder /
  // git pull / Zotero export show up without a manual refresh.
  useEffect(() => {
    void scanFileStatuses();
  }, [scanFileStatuses]);

  const [search, setSearch] = useState<SearchState>({
    loading: false,
    query: '',
    source: 'crossref',
    hits: [],
    error: null,
  });
  const [filter, setFilter] = useState('');
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  // Track navigator.onLine for the "offline" badge. The online listener also
  // gates remote search — when offline, only the local entries panel works.
  useEffect(() => {
    function update() { setOnline(navigator.onLine); }
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // Debounced search. Each new query cancels the prior pending request via
  // the `latest` token (results from a stale request are dropped).
  const latestToken = useRef(0);
  useEffect(() => {
    const q = search.query.trim();
    if (q.length === 0) {
      setSearch((s) => ({ ...s, loading: false, hits: [], error: null }));
      return;
    }
    if (!online) {
      setSearch((s) => ({ ...s, loading: false, error: t('references.offline') }));
      return;
    }
    const token = ++latestToken.current;
    setSearch((s) => ({ ...s, loading: true, error: null }));
    const timer = setTimeout(async () => {
      const r = await runSearch(search.source, q);
      if (token !== latestToken.current) return;
      if (r.ok) {
        setSearch((s) => ({ ...s, loading: false, hits: r.hits, error: null }));
      } else {
        setSearch((s) => ({
          ...s,
          loading: false,
          hits: [],
          error: errorLabel(r.code, r.message),
        }));
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search.query, search.source, online]);

  const filteredLocal = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return entries;
    return entries.filter((e) => entryMatchesFilter(e, term));
  }, [entries, filter]);

  async function handleAddHit(hit: BibliographySearchHit) {
    const r = await addEntry(hit.entry);
    if (r.ok) {
      onInsertCitation(r.key);
    }
  }

  async function handleDownload(key: string) {
    const r = await downloadReference(key);
    if (!r.ok) {
      // eslint-disable-next-line no-alert
      window.alert(`${t('references.download.failed')}\n\n${r.message}`);
    }
  }

  async function handleOpenFile(relPath: string) {
    if (!filePath) return;
    const r = await window.api.referenceOpen(filePath, relPath);
    if (!r.ok) {
      // eslint-disable-next-line no-alert
      window.alert(`${t('references.open.failed')}\n\n${r.error}`);
    }
  }

  async function handleRegisterOrphan(orphan: OrphanFile) {
    // Try the auto path: extract DOI → fetch Crossref → register.
    const r = await registerOrphan(orphan.absPath, orphan.relPath);
    if (r.ok) return;
    if (r.code === 'no-doi') {
      // Fall through to the manual modal — pre-seed the DOI field if we
      // got a hint from referenceExtractDoi (typically null in this branch).
      const hint = await window.api.referenceExtractDoi(orphan.absPath);
      setManualEntryFor({ orphan, initialDoi: hint.doi });
    } else {
      // eslint-disable-next-line no-alert
      window.alert(`${t('orphan.register.failed')}\n\n${r.message}`);
    }
  }

  async function handleManualConfirm(entry: BibEntry) {
    if (!manualEntryFor) return;
    const r = await registerOrphan(
      manualEntryFor.orphan.absPath,
      manualEntryFor.orphan.relPath,
      entry,
    );
    setManualEntryFor(null);
    if (!r.ok) {
      // eslint-disable-next-line no-alert
      window.alert(`${t('orphan.register.failed')}\n\n${r.message}`);
    }
  }

  async function handleEditSave(fields: Record<string, string>, typeOverride: string) {
    if (!editingEntry) return;
    const r = await updateEntry(editingEntry.key, fields, typeOverride);
    setEditingEntry(null);
    if (!r.ok) {
      // eslint-disable-next-line no-alert
      window.alert(`${t('editEntry.failed')}\n\n${r.error}`);
    }
  }

  async function handleDelete(entry: BibEntry) {
    // eslint-disable-next-line no-alert
    if (!window.confirm(t('editEntry.delete.confirm', { key: entry.key }))) return;
    const r = await deleteEntry(entry.key);
    if (!r.ok) {
      // eslint-disable-next-line no-alert
      window.alert(`${t('editEntry.delete.failed')}\n\n${r.error}`);
    }
  }

  return (
    <div className="cm-references" data-testid="references-tab">
      <div style={searchRowStyle}>
        <select
          value={search.source}
          onChange={(e) => setSearch((s) => ({ ...s, source: e.target.value as Source }))}
          style={selectStyle}
          data-testid="references-source"
          aria-label={t('references.source')}
        >
          <option value="crossref">Crossref</option>
          <option value="pubmed">PubMed</option>
          <option value="koreamed">KoreaMed</option>
        </select>
        <input
          type="search"
          value={search.query}
          onChange={(e) => setSearch((s) => ({ ...s, query: e.target.value }))}
          placeholder={t('references.searchPlaceholder')}
          style={searchInputStyle}
          data-testid="references-search-input"
          disabled={!online}
        />
        {!online && (
          <span style={offlineBadgeStyle} data-testid="references-offline-badge">
            {t('references.offline.badge')}
          </span>
        )}
      </div>

      {search.loading && (
        <p style={statusLineStyle} data-testid="references-loading">
          {t('references.searching')}
        </p>
      )}
      {search.error && (
        <p style={errorLineStyle} data-testid="references-error">
          {search.error}
        </p>
      )}

      {search.hits.length > 0 && (
        <section className="cm-references-section">
          <header style={sectionHeaderStyle}>
            <span>{t('references.results')}</span>
            <span style={mutedStyle}>{search.hits.length}</span>
          </header>
          <div role="list">
            {search.hits.map((hit) => (
              <ResultCard
                key={`${hit.source}:${hit.externalId}`}
                hit={hit}
                onAdd={() => { void handleAddHit(hit); }}
              />
            ))}
          </div>
        </section>
      )}

      {orphanFiles.length > 0 && (
        <section className="cm-references-section" data-testid="references-orphan-section">
          <header style={sectionHeaderStyle}>
            <span>📁 {t('references.orphan.title')}</span>
            <span style={mutedStyle}>{orphanFiles.length}</span>
          </header>
          <p style={pathLineStyle}>{t('references.orphan.help')}</p>
          <div role="list">
            {orphanFiles.map((file) => (
              <div
                key={file.relPath}
                style={orphanRowStyle}
                role="listitem"
                data-testid="references-orphan-row"
              >
                <div style={orphanInfoStyle}>
                  <div style={orphanNameStyle}>
                    {file.type === 'pdf' ? '📄 ' : file.type === 'md' ? '📝 ' : '📎 '}
                    {file.fileName}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { void handleRegisterOrphan(file); }}
                  style={registerBtnStyle}
                  data-testid="references-orphan-register"
                  title={t('references.orphan.registerHint')}
                >
                  ➕ {t('references.orphan.register')}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="cm-references-section">
        <header style={sectionHeaderStyle}>
          <span>{t('references.localEntries')}</span>
          <span style={mutedStyle}>{filteredLocal.length}</span>
        </header>
        {filePath ? (
          <p style={pathLineStyle} data-testid="references-target-path">
            {exists
              ? t('references.target.path', { path: filePath })
              : t('references.target.willCreate', { path: filePath })}
          </p>
        ) : (
          <p style={pathLineStyle}>{t('references.target.none')}</p>
        )}
        {entries.length > 0 && (
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('references.localFilterPlaceholder')}
            style={localFilterStyle}
            data-testid="references-local-filter"
          />
        )}
        {filteredLocal.length === 0 ? (
          <p style={emptyLineStyle} data-testid="references-local-empty">
            {entries.length === 0 ? t('references.empty') : t('references.localFilterEmpty')}
          </p>
        ) : (
          <div role="list">
            {filteredLocal.map((entry) => (
              <LocalRow
                key={entry.key}
                entry={entry}
                fileStatus={fileStatus[entry.key]}
                downloading={!!downloading[entry.key]}
                onInsert={() => onInsertCitation(entry.key)}
                onDownload={() => { void handleDownload(entry.key); }}
                onOpenFile={(rel) => { void handleOpenFile(rel); }}
                onEdit={() => setEditingEntry(entry)}
                onRename={() => setRenamingKey(entry.key)}
                onDelete={() => { void handleDelete(entry); }}
              />
            ))}
          </div>
        )}
      </section>

      <OrphanRegisterDialog
        open={manualEntryFor !== null}
        orphan={manualEntryFor?.orphan ?? null}
        initialDoi={manualEntryFor?.initialDoi ?? null}
        onClose={() => setManualEntryFor(null)}
        onConfirm={handleManualConfirm}
      />
      <EditEntryDialog
        open={editingEntry !== null}
        entry={editingEntry}
        onClose={() => setEditingEntry(null)}
        onSave={handleEditSave}
      />
      <RenameKeyDialog
        open={renamingKey !== null}
        oldKey={renamingKey ?? ''}
        documentText={documentText}
        onClose={() => setRenamingKey(null)}
        onComplete={(oldKey, newKey) => {
          setRenamingKey(null);
          onCitationRenamed?.(oldKey, newKey);
        }}
      />
    </div>
  );
}

function ResultCard({ hit, onAdd }: { hit: BibliographySearchHit; onAdd: () => void }) {
  const f = hit.entry.fields;
  const venue = f.journal ?? f.booktitle ?? f.publisher ?? '';
  const meta = [f.year, f.volume && `vol. ${f.volume}`, f.pages && `pp. ${f.pages}`]
    .filter(Boolean)
    .join(' · ');
  return (
    <div style={cardWrapperStyle} role="listitem" data-testid="references-result">
      <div style={cardBodyStyle}>
        <div style={titleStyle}>{f.title ?? '(untitled)'}</div>
        {f.author && <div style={authorStyle}>{f.author}</div>}
        <div style={mutedStyle}>
          {venue && <span>{venue} · </span>}
          {meta}
          {f.doi && <span> · DOI {f.doi}</span>}
        </div>
        <div style={sourceBadgeRowStyle}>
          <span style={sourceBadgeStyle(hit.source)}>{hit.source}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onAdd}
        style={addButtonStyle}
        data-testid="references-add"
        title={t('references.add')}
      >
        {t('references.add')}
      </button>
    </div>
  );
}

interface LocalRowProps {
  entry: BibEntry;
  fileStatus: { exists: boolean; relPath: string | null; type: 'pdf' | 'md' | null } | undefined;
  downloading: boolean;
  onInsert: () => void;
  onDownload: () => void;
  onOpenFile: (relPath: string) => void;
  onEdit: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function LocalRow({
  entry,
  fileStatus,
  downloading,
  onInsert,
  onDownload,
  onOpenFile,
  onEdit,
  onRename,
  onDelete,
}: LocalRowProps) {
  const f = entry.fields;
  const hasFile = fileStatus?.exists ?? false;
  return (
    <div style={localRowWrapperStyle} role="listitem" data-testid="references-local-row">
      <button
        type="button"
        className="cm-references-local-row"
        onClick={onInsert}
        style={localRowStyle}
        title={t('references.insertHint')}
      >
        <span style={localKeyStyle}>{entry.key}</span>
        <span style={localTitleStyle}>{summary(f)}</span>
      </button>
      <div style={localActionsStyle}>
        {hasFile && fileStatus?.relPath ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenFile(fileStatus.relPath!);
            }}
            style={fileBadgeStyle(fileStatus.type)}
            title={fileStatus.relPath}
            data-testid="references-open-file"
          >
            {fileStatus.type === 'pdf' ? '📄' : '📝'}
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            disabled={downloading}
            style={iconBtnStyle}
            data-testid="references-download"
            title={t('references.download.hint')}
          >
            {downloading ? '⌛' : '📥'}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          style={iconBtnStyle}
          data-testid="references-edit"
          title={t('editEntry.title')}
        >✎</button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRename(); }}
          style={iconBtnStyle}
          data-testid="references-rename"
          title={t('renameKey.title')}
        >🔑</button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={iconBtnStyle}
          data-testid="references-delete"
          title={t('editEntry.delete')}
        >✕</button>
      </div>
    </div>
  );
}

function summary(f: Record<string, string>): string {
  const author = (f.author ?? '').split(/\s+and\s+/)[0]?.trim() ?? '';
  const lead = author ? author.replace(/,.*$/, '') : '';
  const year = f.year ?? '';
  const title = f.title ?? '';
  return [lead, year, title].filter(Boolean).join(' · ');
}

function entryMatchesFilter(e: BibEntry, term: string): boolean {
  if (e.key.toLowerCase().includes(term)) return true;
  for (const v of Object.values(e.fields)) {
    if (v.toLowerCase().includes(term)) return true;
  }
  return false;
}

async function runSearch(
  source: Source,
  query: string,
): Promise<
  | { ok: true; hits: BibliographySearchHit[] }
  | { ok: false; code: string; message: string }
> {
  switch (source) {
    case 'pubmed':
      return window.api.bibliographySearchPubmed(query, SEARCH_LIMIT);
    case 'koreamed':
      return window.api.bibliographySearchKoreamed(query, SEARCH_LIMIT);
    case 'crossref':
    default:
      return window.api.bibliographySearchCrossref(query, SEARCH_LIMIT);
  }
}

function errorLabel(code: string, fallback: string): string {
  switch (code) {
    case 'rate-limit': return t('references.error.rateLimit');
    case 'timeout': return t('references.error.timeout');
    case 'network': return t('references.error.network');
    case 'parse': return t('references.error.parse');
    default: return fallback;
  }
}

const searchRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  padding: '8px',
  borderBottom: '1px solid var(--border, #e2e2e2)',
  alignItems: 'center',
};

const selectStyle: React.CSSProperties = {
  padding: '4px 6px',
  fontSize: 12,
  border: '1px solid var(--border, #c8c8c8)',
  borderRadius: 4,
  background: 'var(--bg, #fff)',
  color: 'inherit',
};

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  padding: '4px 8px',
  fontSize: 12,
  border: '1px solid var(--border, #c8c8c8)',
  borderRadius: 4,
  background: 'var(--bg, #fff)',
  color: 'inherit',
  minWidth: 0,
};

const offlineBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  padding: '2px 6px',
  borderRadius: 8,
  background: 'var(--cm-error-bg, #fff0ee)',
  color: 'var(--cm-error-fg, #8a1f17)',
  border: '1px solid var(--cm-error-fg, #8a1f17)',
};

const statusLineStyle: React.CSSProperties = {
  margin: 0,
  padding: '8px',
  fontSize: 12,
  color: 'var(--muted-fg, #6a6a6a)',
};

const errorLineStyle: React.CSSProperties = {
  margin: 0,
  padding: '8px',
  fontSize: 12,
  color: 'var(--cm-error-fg, #8a1f17)',
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  padding: '8px 8px 4px',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  color: 'var(--muted-fg, #6a6a6a)',
};

const mutedStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--muted-fg, #6a6a6a)',
};

const cardWrapperStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 6,
  padding: '8px 10px',
  borderBottom: '1px solid var(--border, #f0f0f0)',
};

function sourceBadgeStyle(source: 'crossref' | 'pubmed' | 'koreamed'): React.CSSProperties {
  const colorMap: Record<string, string> = {
    crossref: '#3a7bd5',
    pubmed: '#2e7d32',
    koreamed: '#a04600',
  };
  return {
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    padding: '1px 6px',
    borderRadius: 8,
    background: colorMap[source] ?? '#666',
    color: '#fff',
  };
}

const cardBodyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  fontSize: 12,
  lineHeight: 1.4,
  minWidth: 0,
};

const titleStyle: React.CSSProperties = {
  fontWeight: 600,
};

const authorStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--muted-fg, #6a6a6a)',
};

const sourceBadgeRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  marginTop: 2,
};

const addButtonStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  marginLeft: 6,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
  border: '1px solid var(--accent, #4a90e2)',
  background: 'var(--accent, #4a90e2)',
  color: '#fff',
  borderRadius: 4,
};

const pathLineStyle: React.CSSProperties = {
  margin: '0 8px',
  fontSize: 11,
  color: 'var(--muted-fg, #6a6a6a)',
  wordBreak: 'break-all',
};

const localFilterStyle: React.CSSProperties = {
  margin: '6px 8px 4px',
  padding: '4px 8px',
  fontSize: 12,
  border: '1px solid var(--border, #c8c8c8)',
  borderRadius: 4,
  background: 'var(--bg, #fff)',
  color: 'inherit',
  width: 'calc(100% - 16px)',
};

const localRowWrapperStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  borderBottom: '1px solid var(--border, #f0f0f0)',
};

const localRowStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 2,
  padding: '6px 10px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  color: 'inherit',
  minWidth: 0,
};

const localActionsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '0 8px',
  flexShrink: 0,
};

function fileBadgeStyle(type: 'pdf' | 'md' | null): React.CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 4,
    background: type === 'pdf' ? 'var(--accent, #4a90e2)' : 'var(--code-bg, #ddd)',
    color: type === 'pdf' ? '#fff' : 'inherit',
    border: 'none',
    cursor: 'pointer',
  };
}

const iconBtnStyle: React.CSSProperties = {
  fontSize: 12,
  padding: '2px 6px',
  border: '1px solid var(--border, #c8c8c8)',
  borderRadius: 4,
  background: 'transparent',
  cursor: 'pointer',
  color: 'inherit',
  minWidth: 22,
};

const orphanRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 10px',
  borderBottom: '1px solid var(--border, #f0f0f0)',
};

const orphanInfoStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const orphanNameStyle: React.CSSProperties = {
  fontSize: 12,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const registerBtnStyle: React.CSSProperties = {
  fontSize: 11,
  padding: '4px 8px',
  border: '1px solid var(--accent, #4a90e2)',
  background: 'var(--accent, #4a90e2)',
  color: '#fff',
  borderRadius: 4,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const localKeyStyle: React.CSSProperties = {
  fontFamily: 'var(--mono, ui-monospace, monospace)',
  fontSize: 12,
  fontWeight: 600,
};

const localTitleStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--muted-fg, #6a6a6a)',
};

const emptyLineStyle: React.CSSProperties = {
  margin: 0,
  padding: '8px',
  fontSize: 12,
  color: 'var(--muted-fg, #6a6a6a)',
  textAlign: 'center',
};

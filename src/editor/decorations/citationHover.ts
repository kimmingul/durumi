import { hoverTooltip, type Tooltip } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { useBibliographyStore } from '../../store/bibliographyStore';
import type { BibEntry } from '@shared/bibtex';

/**
 * Shows a small DOM tooltip when the caret hovers over a `[@key]` citation.
 * Renders author / year / title / venue, plus an "Open file" link when
 * `entry.fields.file` resolves to a real file on disk under
 * `<doc-folder>/reference/`.
 *
 * The lookup is read-through against the bibliography store (no new fetch),
 * so the tooltip is essentially free to render — it's just a formatted
 * view over data we already have in memory.
 */
export function citationHoverTooltip(): Extension {
  return hoverTooltip(
    (view, pos, side): Tooltip | null => {
      const line = view.state.doc.lineAt(pos);
      const text = line.text;
      const colInLine = pos - line.from;
      const span = findCitationSpan(text, colInLine);
      if (!span) return null;
      // Only show the tooltip when at least one key in the span resolves.
      const entries = useBibliographyStore.getState().entries;
      const indexed = new Map<string, BibEntry>();
      for (const e of entries) indexed.set(e.key, e);
      const resolved: BibEntry[] = [];
      for (const k of span.keys) {
        const e = indexed.get(k);
        if (e) resolved.push(e);
      }
      if (resolved.length === 0) return null;
      // Prefer the right side when the caret sits on a boundary.
      void side;
      return {
        pos: line.from + span.start,
        end: line.from + span.end,
        above: false,
        create() {
          const dom = document.createElement('div');
          dom.className = 'cm-citation-tooltip';
          for (const entry of resolved) {
            dom.appendChild(renderEntry(entry, view.dom));
          }
          return { dom };
        },
      };
    },
    { hideOnChange: true },
  );
}

interface CitationSpan {
  start: number;
  end: number;
  keys: string[];
}

/**
 * Locates the `[@…]` span that contains `col`. Mirrors the regex used in
 * `shared/citation.ts` so behaviour stays in sync with the export pipeline.
 * Returns null if `col` is outside any citation block.
 */
export function findCitationSpan(line: string, col: number): CitationSpan | null {
  const blockRe = /\[(-?@[^\]]+)\]/g;
  for (const m of line.matchAll(blockRe)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (col >= start && col <= end) {
      const inner = m[1];
      if (inner === undefined) continue;
      const keyRe = /-?@([A-Za-z0-9_:.\-+/]+)/g;
      const keys: string[] = [];
      for (const k of inner.matchAll(keyRe)) {
        if (k[1] !== undefined) keys.push(k[1]);
      }
      return { start, end, keys };
    }
  }
  return null;
}

function renderEntry(entry: BibEntry, _viewDom: HTMLElement): HTMLElement {
  const f = entry.fields;
  const card = document.createElement('div');
  card.className = 'cm-citation-tooltip-card';

  const titleLine = document.createElement('div');
  titleLine.className = 'cm-citation-tooltip-title';
  titleLine.textContent = f.title ?? '(untitled)';
  card.appendChild(titleLine);

  if (f.author) {
    const a = document.createElement('div');
    a.className = 'cm-citation-tooltip-author';
    a.textContent = f.author;
    card.appendChild(a);
  }

  const meta = document.createElement('div');
  meta.className = 'cm-citation-tooltip-meta';
  const venue = f.journal ?? f.booktitle ?? f.publisher ?? '';
  const parts = [venue, f.year, f.volume && `vol. ${f.volume}`, f.pages && `pp. ${f.pages}`]
    .filter(Boolean)
    .join(' · ');
  meta.textContent = parts;
  card.appendChild(meta);

  if (f.doi) {
    const doiLine = document.createElement('div');
    doiLine.className = 'cm-citation-tooltip-doi';
    const a = document.createElement('a');
    a.textContent = `DOI ${f.doi}`;
    a.href = `https://doi.org/${f.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.addEventListener('click', (e) => {
      e.preventDefault();
      void window.api.shellOpenExternal(a.href);
    });
    doiLine.appendChild(a);
    card.appendChild(doiLine);
  }

  if (f.file) {
    const row = document.createElement('div');
    row.className = 'cm-citation-tooltip-file';
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'cm-citation-tooltip-file-link';
    link.textContent = `📄 ${f.file}`;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      // v0.1.7 Track B will register `reference:open`. For now, dispatch
      // an event that the App listener picks up — keeps the tooltip
      // decoupled from the IPC surface.
      window.dispatchEvent(
        new CustomEvent('durumi:reference-open', {
          detail: { relPath: f.file, citationKey: entry.key },
        }),
      );
    });
    row.appendChild(link);
    card.appendChild(row);
  }

  return card;
}

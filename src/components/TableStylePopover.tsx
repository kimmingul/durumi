// Phase 3.3 (v0.2.6) — table style popover UI.
//
// The popover renders a borders-and-padding form for the table at
// `tableFrom`. Apply commits the change via a CodeMirror transaction:
//
//  1. Read the current wire format (Pandoc attrs / HTML wrapper / none).
//  2. Compute the new markdown source — either replace the existing
//     wrapper in-place, OR insert a new wrapper if there isn't one.
//  3. If the new style is the Durumi default, REMOVE the wrapper instead
//     (so plain markdown tables don't accumulate empty attribute blocks).
//  4. Dispatch a single transaction with `userEvent: 'input.tableStyle'`.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { EditorView } from '@codemirror/view';
import './TableStylePopover.css';
import {
  isDefaultStyle,
  presets as PRESETS,
  serializeHtmlWrapper,
  serializePandocAttrs,
  type BorderSpec,
  type BorderStyleName,
  type TableStyle,
} from '../../shared/tableStyle';
import {
  locateTableWrapperSpan,
  resolveTableStyle,
} from '../editor/markdownExt/tableStylePlugin';
import { t } from '../i18n/t';

interface MountOptions {
  view: EditorView;
  tableFrom: number;
  anchorRect: DOMRect;
  onClose: () => void;
}

/**
 * Vanilla-DOM entry point. Mounts a React tree inside `root` and returns
 * a teardown function. Called by `tableStylePopoverHost.openTableStylePopover`.
 */
export function mountTableStylePopover(
  root: HTMLDivElement,
  opts: MountOptions,
): () => void {
  const reactRoot: Root = createRoot(root);
  reactRoot.render(
    <TableStylePopoverUI
      view={opts.view}
      tableFrom={opts.tableFrom}
      anchorRect={opts.anchorRect}
      onClose={opts.onClose}
    />,
  );
  return () => {
    reactRoot.unmount();
  };
}

interface TableStylePopoverUIProps {
  view: EditorView;
  tableFrom: number;
  anchorRect: DOMRect;
  onClose: () => void;
}

function TableStylePopoverUI(props: TableStylePopoverUIProps): JSX.Element {
  const { view, tableFrom, anchorRect, onClose } = props;
  const initial = useMemo(
    () => resolveTableStyle(view.state, tableFrom),
    [view, tableFrom],
  );
  const initialFormat: 'pandoc' | 'html' = useMemo(() => {
    if (initial.source === 'pandoc' || initial.source === 'html') return initial.source;
    return readFormatPreference();
  }, [initial]);
  const [style, setStyle] = useState<TableStyle>(initial.style);
  const [format, setFormat] = useState<'pandoc' | 'html'>(initialFormat);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on Escape / outside-click.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onDocClick(e: MouseEvent) {
      const tgt = e.target as Node | null;
      if (!tgt) return;
      if (popoverRef.current && !popoverRef.current.contains(tgt)) {
        const gear = (tgt as Element).closest?.('.cm-table-style-gear');
        if (!gear) onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDocClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDocClick);
    };
  }, [onClose]);

  function updateBorder(field: keyof TableStyle, patch: Partial<BorderSpec>) {
    setStyle((s) => {
      const current = (s[field] as BorderSpec | undefined) ?? {};
      const next: BorderSpec = { ...current, ...patch };
      return { ...s, [field]: next };
    });
  }

  function onApply(): void {
    applyTableStyleChange(view, tableFrom, style, format);
    onClose();
  }

  function onCancel(): void {
    onClose();
  }

  function applyPreset(name: keyof typeof PRESETS): void {
    setStyle(PRESETS[name]());
  }

  const pos = computePosition(anchorRect);

  return (
    <div
      ref={popoverRef}
      className="durumi-table-style-popover"
      data-testid="table-style-popover"
      style={{ top: pos.top, left: pos.left }}
      role="dialog"
      aria-label={t('table.style.popover.title')}
    >
      <h3>{t('table.style.popover.title')}</h3>

      <h4>{t('table.style.presets.label')}</h4>
      <div className="durumi-table-style-presets">
        <button
          type="button"
          onClick={() => applyPreset('none')}
          data-testid="table-style-preset-none"
        >
          {t('table.style.preset.none')}
        </button>
        <button
          type="button"
          onClick={() => applyPreset('default')}
          data-testid="table-style-preset-default"
        >
          {t('table.style.preset.default')}
        </button>
        <button
          type="button"
          onClick={() => applyPreset('booktabs')}
          data-testid="table-style-preset-booktabs"
        >
          {t('table.style.preset.booktabs')}
        </button>
        <button
          type="button"
          onClick={() => applyPreset('grid')}
          data-testid="table-style-preset-grid"
        >
          {t('table.style.preset.grid')}
        </button>
      </div>

      <BorderRow
        label={t('table.style.topRule')}
        spec={style.topRule}
        onChange={(patch) => updateBorder('topRule', patch)}
        testIdPrefix="top-rule"
      />
      <BorderRow
        label={t('table.style.headerSeparator')}
        spec={style.headerSeparator}
        onChange={(patch) => updateBorder('headerSeparator', patch)}
        testIdPrefix="header-separator"
      />
      <BorderRow
        label={t('table.style.rowRules')}
        spec={style.rowRules}
        onChange={(patch) => updateBorder('rowRules', patch)}
        testIdPrefix="row-rules"
      />
      <BorderRow
        label={t('table.style.verticalRules')}
        spec={style.verticalRules}
        onChange={(patch) => updateBorder('verticalRules', patch)}
        testIdPrefix="vert-rules"
      />
      <BorderRow
        label={t('table.style.bottomRule')}
        spec={style.bottomRule}
        onChange={(patch) => updateBorder('bottomRule', patch)}
        testIdPrefix="bottom-rule"
      />

      <h4>{t('table.style.cellPadding')}</h4>
      <select
        data-testid="table-style-cell-pad"
        value={style.cellPadding ?? '8px'}
        onChange={(e) => setStyle((s) => ({ ...s, cellPadding: e.target.value }))}
      >
        {['4px', '6px', '8px', '12px', '16px'].map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>

      <h4>{t('table.style.format.label')}</h4>
      <div className="durumi-table-style-format">
        <label>
          <input
            type="radio"
            name="durumi-table-style-format"
            value="pandoc"
            data-testid="table-style-format-pandoc"
            checked={format === 'pandoc'}
            onChange={() => setFormat('pandoc')}
          />
          {t('table.style.format.pandoc')}
        </label>
        <label>
          <input
            type="radio"
            name="durumi-table-style-format"
            value="html"
            data-testid="table-style-format-html"
            checked={format === 'html'}
            onChange={() => setFormat('html')}
          />
          {t('table.style.format.html')}
        </label>
      </div>

      <div className="durumi-table-style-footer">
        <button type="button" data-testid="table-style-cancel" onClick={onCancel}>
          {t('table.style.cancel')}
        </button>
        <button
          type="button"
          className="primary"
          data-testid="table-style-apply"
          onClick={onApply}
        >
          {t('table.style.apply')}
        </button>
      </div>
    </div>
  );
}

interface BorderRowProps {
  label: string;
  spec: BorderSpec | undefined;
  onChange: (patch: Partial<BorderSpec>) => void;
  testIdPrefix: string;
}

function BorderRow(props: BorderRowProps): JSX.Element {
  const { label, spec, onChange, testIdPrefix } = props;
  const width = parseWidthPx(spec?.width);
  const style = spec?.style ?? 'solid';
  const color = normalizeColorForInput(spec?.color);
  return (
    <div className="durumi-table-style-row">
      <label>{label}</label>
      <select
        data-testid={`table-style-${testIdPrefix}-width`}
        value={String(width)}
        onChange={(e) => onChange({ width: e.target.value === '0' ? '0' : `${e.target.value}px` })}
      >
        {[0, 1, 2, 3].map((w) => (
          <option key={w} value={w}>
            {w}px
          </option>
        ))}
      </select>
      <select
        data-testid={`table-style-${testIdPrefix}-style`}
        value={style}
        onChange={(e) => onChange({ style: e.target.value as BorderStyleName })}
      >
        {(['solid', 'dashed', 'dotted', 'double', 'none'] as BorderStyleName[]).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <input
        type="color"
        data-testid={`table-style-${testIdPrefix}-color`}
        value={color}
        onChange={(e) => onChange({ color: e.target.value })}
      />
    </div>
  );
}

function parseWidthPx(width: string | undefined): number {
  if (!width) return 1;
  const m = /^([0-9]+(?:\.[0-9]+)?)px$/.exec(width.trim());
  if (m) return Math.round(parseFloat(m[1]));
  if (width === '0') return 0;
  return 1;
}

function normalizeColorForInput(color: string | undefined): string {
  if (!color) return '#000000';
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    const r = color[1];
    const g = color[2];
    const b = color[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return '#000000';
}

function computePosition(anchor: DOMRect): { top: number; left: number } {
  const POPOVER_W = 320;
  const margin = 8;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  let left = anchor.right - POPOVER_W;
  if (left < margin) left = margin;
  if (left + POPOVER_W > vw - margin) left = vw - POPOVER_W - margin;
  let top = anchor.bottom + margin;
  if (top + 480 > vh - margin) top = Math.max(margin, anchor.top - 480 - margin);
  return { top, left };
}

function readFormatPreference(): 'pandoc' | 'html' {
  try {
    const cached = (globalThis as { window?: { __durumiTableStyleFormat?: 'pandoc' | 'html' } })
      .window?.__durumiTableStyleFormat;
    if (cached === 'html') return 'html';
  } catch {
    // ignore
  }
  return 'pandoc';
}

/**
 * Apply a TableStyle change to the document, choosing wire format with
 * preserve-on-edit semantics.
 */
export function applyTableStyleChange(
  view: EditorView,
  tableFrom: number,
  style: TableStyle,
  desiredFormat: 'pandoc' | 'html',
): void {
  const tableInfo = lookupTable(view, tableFrom);
  if (!tableInfo) return;
  const span = locateTableWrapperSpan(view.state, tableInfo.from, tableInfo.to);

  const tableSrc = view.state.sliceDoc(tableInfo.from, tableInfo.to);
  const isDefault = isDefaultStyle(style);

  let replaceFrom: number;
  let replaceTo: number;
  if (span.source === 'pandoc') {
    replaceFrom = span.prefixFrom;
    replaceTo = tableInfo.to;
  } else if (span.source === 'html') {
    replaceFrom = span.prefixFrom;
    replaceTo = span.suffixTo ?? tableInfo.to;
  } else {
    replaceFrom = tableInfo.from;
    replaceTo = tableInfo.to;
  }

  let insert: string;
  if (isDefault) {
    insert = tableSrc;
  } else if (desiredFormat === 'pandoc') {
    insert = `${serializePandocAttrs(style)}\n\n${tableSrc}`;
  } else {
    const trailing = tableSrc.endsWith('\n') ? '\n' : '';
    const inner = trailing ? tableSrc.slice(0, -1) : tableSrc;
    insert = serializeHtmlWrapper(style, inner) + trailing;
  }

  view.dispatch({
    changes: { from: replaceFrom, to: replaceTo, insert },
    userEvent: 'input.tableStyle',
  });
}

interface TableBounds {
  from: number;
  to: number;
}

function lookupTable(view: EditorView, tableFrom: number): TableBounds | null {
  const startLine = view.state.doc.lineAt(tableFrom);
  if (!startLine.text.includes('|')) return null;
  let cursor = startLine.number;
  let end = startLine.to;
  while (cursor + 1 <= view.state.doc.lines) {
    const next = view.state.doc.line(cursor + 1);
    if (next.text.includes('|')) {
      end = next.to;
      cursor++;
    } else {
      break;
    }
  }
  return { from: startLine.from, to: end };
}

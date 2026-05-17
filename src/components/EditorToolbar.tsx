import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { indentMore, indentLess } from '@codemirror/commands';
import { toggleWrap, toggleSup, toggleSub } from '../editor/keymap/toggleWrap';
import { setHeading, clearHeading } from '../editor/keymap/setHeading';
import { insertTable } from '../editor/keymap/insertTable';
import { insertCodeBlock } from '../editor/keymap/insertCodeBlock';
import {
  toggleBulletList as toggleBulletListMulti,
  toggleNumberedList as toggleNumberedListMulti,
  toggleTaskList as toggleTaskListMulti,
} from '../editor/keymap/listToggle';
import { wrapComment } from '../editor/keymap/wrapComment';
import {
  wrapCmInsert,
  wrapCmDelete,
  wrapCmSubstitute,
  wrapCmHighlight,
  wrapCmComment,
} from '../editor/keymap/wrapCriticMarkup';
import { inlineMarksAt, type InlineMarkActiveSet } from '../editor/markdownExt/inlineMarkDetection';
import { useAppStore } from '../store/appStore';
import { t, useLanguage } from '../i18n/t';
import { TableSizePopover } from './TableSizePopover';
import {
  IconBold,
  IconBulletList,
  IconCitation,
  IconCmComment,
  IconCmDelete,
  IconCmInsert,
  IconCmSubstitute,
  IconCode,
  IconFootnote,
  IconHighlight,
  IconHorizontalRule,
  IconImage,
  IconIndent,
  IconItalic,
  IconLink,
  IconMath,
  IconMathInline,
  IconMemo,
  IconMermaid,
  IconNumberedList,
  IconOutdent,
  IconStrike,
  IconSubscript,
  IconSuperscript,
  IconTable,
  IconTaskList,
  IconToc,
} from './EditorToolbarIcons';
import './EditorToolbar.css';

// Lazy-load the link dialog: keeps the editor's initial chunk small (matches
// the v0.2.3 lazy-dialog pattern used in App.tsx).
const InsertLinkDialog = lazy(() =>
  import('./InsertLinkDialog').then((m) => ({ default: m.InsertLinkDialog })),
);

/**
 * Top-of-editor chrome shown only while Document mode is active.
 *
 * The buttons all dispatch transactions on the live EditorView. We never
 * mutate decorations from here (the active-line invariant in the editor must
 * stay intact). When the view is null (e.g. the very first render before the
 * editor mounts) every button renders disabled.
 */
export interface EditorToolbarProps {
  view: EditorView | null;
  visible: boolean;
  onOpenCitePalette?: () => void;
  onPickImage?: () => void;
}

type StyleValue =
  | 'body'
  | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  | 'blockquote'
  | 'codeBlock';

const EMPTY_MARKS: InlineMarkActiveSet = {
  bold: false,
  italic: false,
  strike: false,
  code: false,
  sup: false,
  sub: false,
};

/** Inspect the current line and pick the matching Style dropdown value. */
function detectStyle(view: EditorView | null): StyleValue {
  if (!view) return 'body';
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  const text = line.text;
  const h = /^(#{1,6}) /.exec(text);
  if (h) return (`h${h[1]!.length}` as StyleValue);
  if (/^>\s?/.test(text)) return 'blockquote';
  if (/^```/.test(text)) return 'codeBlock';
  return 'body';
}

/** Prepend `> ` to the current line (or strip if already a blockquote). */
function toggleBlockquote(view: EditorView): boolean {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  const text = line.text;
  const m = /^>\s?/.exec(text);
  if (m) {
    view.dispatch({
      changes: { from: line.from, to: line.from + m[0].length, insert: '' },
    });
  } else {
    view.dispatch({
      changes: { from: line.from, to: line.from, insert: '> ' },
    });
  }
  return true;
}

// v0.2.19 — bullet / numbered list toggles now live in `editor/keymap/listToggle.ts`
// and handle multi-line selections + numbered-list continuity. The toolbar
// uses `toggleBulletListMulti` / `toggleNumberedListMulti` aliases below so
// existing inline call sites keep their old names.
const toggleBulletList = toggleBulletListMulti;
const toggleNumberedList = toggleNumberedListMulti;

/** Insert a `$$ ... $$` math block at the caret with the caret on the middle line. */
function insertMathBlock(view: EditorView): boolean {
  const head = view.state.selection.main.head;
  const insert = '$$\n\n$$';
  view.dispatch({
    changes: { from: head, insert },
    selection: { anchor: head + 3 },
  });
  return true;
}

/** Wrap the selection (or just the caret) in inline math `$...$`. */
function insertInlineMath(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  if (from === to) {
    const insert = '$$';
    view.dispatch({
      changes: { from, insert },
      selection: { anchor: from + 1 },
    });
    return true;
  }
  const text = view.state.sliceDoc(from, to);
  const insert = `$${text}$`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + 1, head: from + 1 + text.length },
  });
  return true;
}

/**
 * Insert a horizontal rule as its own paragraph block. We prepend up to two
 * newlines so the `---` always sits on a blank line (avoids the Setext
 * heading collision where `text\n---` is parsed as an H2).
 */
function insertHorizontalRule(view: EditorView): boolean {
  const head = view.state.selection.main.head;
  const before = view.state.sliceDoc(Math.max(0, head - 2), head);
  const prefix = before.endsWith('\n\n') || head === 0 ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const insert = `${prefix}---\n\n`;
  view.dispatch({
    changes: { from: head, insert },
    selection: { anchor: head + insert.length },
  });
  return true;
}

/** Insert a Mermaid fenced block; caret parks on the empty middle line. */
function insertMermaidBlock(view: EditorView): boolean {
  const head = view.state.selection.main.head;
  const insert = '```mermaid\n\n```\n';
  view.dispatch({
    changes: { from: head, insert },
    selection: { anchor: head + '```mermaid\n'.length },
  });
  return true;
}

/** Insert a `[toc]` marker on its own line. */
function insertToc(view: EditorView): boolean {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  const atLineStart = head === line.from;
  const insert = atLineStart ? '[toc]\n' : '\n[toc]\n';
  view.dispatch({
    changes: { from: head, insert },
    selection: { anchor: head + insert.length },
  });
  return true;
}

/** Insert a footnote anchor at the caret + matching definition at EOF. */
function insertFootnote(view: EditorView): boolean {
  const doc = view.state.doc.toString();
  const used = new Set<number>();
  const re = /\[\^(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(doc)) !== null) used.add(parseInt(match[1]!, 10));
  let n = 1;
  while (used.has(n)) n += 1;
  const head = view.state.selection.main.head;
  const anchor = `[^${n}]`;
  const defPrefix = doc.endsWith('\n') || doc.length === 0 ? '' : '\n';
  const def = `${defPrefix}\n[^${n}]: `;
  view.dispatch({
    changes: [
      { from: head, insert: anchor },
      { from: doc.length, insert: def },
    ],
    selection: { anchor: head + anchor.length },
  });
  return true;
}

/** Cmd vs Ctrl picker for tooltip hints. */
function modKey(): string {
  if (typeof navigator === 'undefined') return 'Ctrl';
  const platform = (navigator.platform ?? '').toLowerCase();
  if (platform.includes('mac')) return '⌘';
  return 'Ctrl';
}

interface ToolButtonProps {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  active?: boolean;
  testId: string;
  tabIndex: number;
  buttonRef?: (el: HTMLButtonElement | null) => void;
}

function ToolButton({
  label,
  shortcut,
  disabled,
  onClick,
  children,
  active,
  testId,
  tabIndex,
  buttonRef,
}: ToolButtonProps) {
  const title = shortcut ? `${label} (${modKey()}${shortcut})` : label;
  return (
    <button
      type="button"
      className={`editor-toolbar-btn${active ? ' editor-toolbar-btn-active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active ? true : undefined}
      title={title}
      data-testid={testId}
      tabIndex={tabIndex}
      ref={buttonRef ?? undefined}
    >
      {children}
    </button>
  );
}

export function EditorToolbar({ view, visible, onOpenCitePalette, onPickImage }: EditorToolbarProps) {
  useLanguage();
  const content = useAppStore((s) => s.content);
  const [styleValue, setStyleValue] = useState<StyleValue>(() => detectStyle(view));
  const [marks, setMarks] = useState<InlineMarkActiveSet>(() => {
    if (!view) return EMPTY_MARKS;
    return inlineMarksAt(view.state, view.state.selection.main.head);
  });
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkInitialText, setLinkInitialText] = useState('');
  // v0.2.19 - when set, confirmLink replaces this range (an existing
  // `[text](url)`) instead of inserting at the current selection. Cleared
  // on dialog close. The init fields come from the durumi:edit-link
  // CustomEvent dispatched by the link tooltip.
  const [linkEditRange, setLinkEditRange] = useState<{ from: number; to: number } | null>(null);
  const [linkInitialUrl, setLinkInitialUrl] = useState('');
  const [linkInitialTitle, setLinkInitialTitle] = useState('');
  const [tablePopover, setTablePopover] = useState<DOMRect | null>(null);
  const tableButtonRef = useRef<HTMLButtonElement | null>(null);

  const lastViewRef = useRef<EditorView | null>(null);
  useEffect(() => {
    if (!view) {
      setStyleValue('body');
      setMarks(EMPTY_MARKS);
      lastViewRef.current = null;
      return;
    }
    const refresh = () => {
      setStyleValue(detectStyle(view));
      setMarks(inlineMarksAt(view.state, view.state.selection.main.head));
    };
    refresh();
    if (view === lastViewRef.current) return;
    lastViewRef.current = view;
    const dom = view.dom;
    dom.addEventListener('keyup', refresh);
    dom.addEventListener('mouseup', refresh);
    dom.addEventListener('focus', refresh, true);
    return () => {
      dom.removeEventListener('keyup', refresh);
      dom.removeEventListener('mouseup', refresh);
      dom.removeEventListener('focus', refresh, true);
    };
  }, [view, content]);

  // --- Roving tabindex for WAI-ARIA toolbar nav ----------------------------
  const buttonsRef = useRef<HTMLButtonElement[]>([]);
  const [focusIdx, setFocusIdx] = useState(0);
  const registerButton = useCallback((idx: number) => (el: HTMLButtonElement | null) => {
    buttonsRef.current[idx] = el as HTMLButtonElement;
  }, []);
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') {
        return;
      }
      const btns = buttonsRef.current.filter((b): b is HTMLButtonElement => Boolean(b) && !b.disabled);
      if (btns.length === 0) return;
      const target = e.target as HTMLElement | null;
      if (!target || !(target instanceof HTMLButtonElement) || !btns.includes(target)) return;
      e.preventDefault();
      const i = btns.indexOf(target);
      let next = i;
      if (e.key === 'ArrowRight') next = (i + 1) % btns.length;
      else if (e.key === 'ArrowLeft') next = (i - 1 + btns.length) % btns.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = btns.length - 1;
      btns[next]!.focus();
      const allIdx = buttonsRef.current.findIndex((b) => b === btns[next]);
      if (allIdx >= 0) setFocusIdx(allIdx);
    }
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, []);

  // v0.2.19 - listen for the link tooltip's "Edit" button. The decoration
  // overlay fires `durumi:edit-link` with the existing link's range +
  // current text/url/title; we pre-fill the dialog and remember the range
  // so confirmLink replaces it instead of inserting at the current caret.
  useEffect(() => {
    function onEdit(event: Event): void {
      const detail = (event as CustomEvent<{ from: number; to: number; text: string; url: string; title: string }>).detail;
      if (!detail) return;
      setLinkEditRange({ from: detail.from, to: detail.to });
      setLinkInitialText(detail.text ?? '');
      setLinkInitialUrl(detail.url ?? '');
      setLinkInitialTitle(detail.title ?? '');
      setLinkOpen(true);
    }
    window.addEventListener('durumi:edit-link', onEdit as EventListener);
    return () => window.removeEventListener('durumi:edit-link', onEdit as EventListener);
  }, []);

  // v0.2.21 — listen for the menu/right-click "Insert link" path. The
  // native context menu (`electron/contextMenu.ts → 'link'`), the Cmd+K
  // accelerator, and the View menu Insert link item all funnel through
  // `useMenuCommandRouter`'s `'link'` branch, which now dispatches
  // `durumi:open-link-dialog` instead of inserting raw `[]()` text. We
  // open the dialog with the current selection pre-filled — identical to
  // the toolbar Link button's `openLinkDialog`. We keep the handlers
  // separate (this one vs. edit-link) so the edit flow can carry the
  // existing range payload without conflating with insert.
  useEffect(() => {
    function onOpen(): void {
      const v = view;
      if (!v) return;
      const { from, to } = v.state.selection.main;
      const text = v.state.sliceDoc(from, to);
      setLinkEditRange(null);
      setLinkInitialText(text);
      setLinkInitialUrl('');
      setLinkInitialTitle('');
      setLinkOpen(true);
    }
    window.addEventListener('durumi:open-link-dialog', onOpen as EventListener);
    return () => window.removeEventListener('durumi:open-link-dialog', onOpen as EventListener);
  }, [view]);

  if (!visible) return null;

  const disabled = !view;

  function run(fn: (v: EditorView) => unknown): void {
    if (!view) return;
    fn(view);
    view.focus();
  }

  function onStyleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value as StyleValue;
    setStyleValue(value);
    if (!view) return;
    if (value === 'body') clearHeading(view);
    else if (value === 'h1') setHeading(view, 1);
    else if (value === 'h2') setHeading(view, 2);
    else if (value === 'h3') setHeading(view, 3);
    else if (value === 'h4') setHeading(view, 4);
    else if (value === 'h5') setHeading(view, 5);
    else if (value === 'h6') setHeading(view, 6);
    else if (value === 'blockquote') toggleBlockquote(view);
    else if (value === 'codeBlock') insertCodeBlock(view);
    view.focus();
  }

  function openLinkDialog() {
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const text = view.state.sliceDoc(from, to);
    setLinkEditRange(null);
    setLinkInitialText(text);
    setLinkInitialUrl('');
    setLinkInitialTitle('');
    setLinkOpen(true);
  }

  function closeLinkDialog() {
    setLinkOpen(false);
    setLinkEditRange(null);
  }

  function confirmLink({ text, url, title }: { text: string; url: string; title: string }) {
    if (!view) return;
    // When linkEditRange is set we are REPLACING an existing `[text](url)`
    // (the user clicked "Edit" in the tooltip). Otherwise we insert at the
    // current selection.
    const range = linkEditRange ?? view.state.selection.main;
    const safeTitle = title.replace(/"/g, '\\"');
    const insert = title
      ? `[${text}](${url} "${safeTitle}")`
      : `[${text}](${url})`;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert },
      selection: { anchor: range.from + insert.length },
    });
    setLinkEditRange(null);
    view.focus();
  }

  function openTablePopover() {
    const el = tableButtonRef.current;
    if (!el) return;
    setTablePopover(el.getBoundingClientRect());
  }

  function pickTableSize(rows: number, cols: number) {
    setTablePopover(null);
    if (!view) return;
    insertTable(view, rows, cols);
    view.focus();
  }

  // Counter assigns each button an index for roving tabindex. We bump it as
  // we render each ToolButton so the order matches DOM order.
  let buttonCounter = 0;
  const nextIdx = (): { tabIndex: number; refSetter: (el: HTMLButtonElement | null) => void } => {
    const idx = buttonCounter;
    buttonCounter += 1;
    return { tabIndex: idx === focusIdx ? 0 : -1, refSetter: registerButton(idx) };
  };

  return (
    <div
      className="editor-toolbar"
      role="toolbar"
      aria-label={t('toolbar.aria.label')}
      data-testid="editor-toolbar"
      ref={containerRef}
    >
      <div className="editor-toolbar-group">
        <label className="editor-toolbar-sr-only" htmlFor="editor-toolbar-style">
          {t('toolbar.style.label')}
        </label>
        <select
          id="editor-toolbar-style"
          className="editor-toolbar-select"
          value={styleValue}
          onChange={onStyleChange}
          disabled={disabled}
          title={t('toolbar.style.label')}
          data-testid="editor-toolbar-style"
        >
          <option value="body">{t('toolbar.style.body')}</option>
          <option value="h1">{t('toolbar.style.h1')}</option>
          <option value="h2">{t('toolbar.style.h2')}</option>
          <option value="h3">{t('toolbar.style.h3')}</option>
          <option value="h4">{t('toolbar.style.h4')}</option>
          <option value="h5">{t('toolbar.style.h5')}</option>
          <option value="h6">{t('toolbar.style.h6')}</option>
          <option value="blockquote">{t('toolbar.style.blockquote')}</option>
          <option value="codeBlock">{t('toolbar.style.codeBlock')}</option>
        </select>
      </div>

      <span className="editor-toolbar-sep" aria-hidden="true" />

      <div className="editor-toolbar-group">
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.bold')}
              shortcut="B"
              disabled={disabled}
              active={marks.bold}
              onClick={() => run((v) => toggleWrap(v, '**'))}
              testId="toolbar-bold"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconBold />
            </ToolButton>
          );
        })()}
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.italic')}
              shortcut="I"
              disabled={disabled}
              active={marks.italic}
              onClick={() => run((v) => toggleWrap(v, '*'))}
              testId="toolbar-italic"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconItalic />
            </ToolButton>
          );
        })()}
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.strike')}
              disabled={disabled}
              active={marks.strike}
              onClick={() => run((v) => toggleWrap(v, '~~'))}
              testId="toolbar-strike"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconStrike />
            </ToolButton>
          );
        })()}
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.code')}
              disabled={disabled}
              active={marks.code}
              onClick={() => run((v) => toggleWrap(v, '`'))}
              testId="toolbar-code"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconCode />
            </ToolButton>
          );
        })()}
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.sup')}
              disabled={disabled}
              active={marks.sup}
              onClick={() => run((v) => toggleSup(v))}
              testId="toolbar-sup"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconSuperscript />
            </ToolButton>
          );
        })()}
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.sub')}
              disabled={disabled}
              active={marks.sub}
              onClick={() => run((v) => toggleSub(v))}
              testId="toolbar-sub"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconSubscript />
            </ToolButton>
          );
        })()}
      </div>

      <span className="editor-toolbar-sep" aria-hidden="true" />

      <div className="editor-toolbar-group">
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.bullet')}
              disabled={disabled}
              onClick={() => run((v) => toggleBulletList(v))}
              testId="toolbar-bullet"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconBulletList />
            </ToolButton>
          );
        })()}
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.numbered')}
              disabled={disabled}
              onClick={() => run((v) => toggleNumberedList(v))}
              testId="toolbar-numbered"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconNumberedList />
            </ToolButton>
          );
        })()}
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.task')}
              disabled={disabled}
              onClick={() => run((v) => toggleTaskListMulti(v))}
              testId="toolbar-task"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconTaskList />
            </ToolButton>
          );
        })()}
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.outdent')}
              disabled={disabled}
              onClick={() => run((v) => indentLess(v))}
              testId="toolbar-outdent"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconOutdent />
            </ToolButton>
          );
        })()}
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.indent')}
              disabled={disabled}
              onClick={() => run((v) => indentMore(v))}
              testId="toolbar-indent"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconIndent />
            </ToolButton>
          );
        })()}
      </div>

      <span className="editor-toolbar-sep" aria-hidden="true" />

      <div className="editor-toolbar-group">
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.link')}
              shortcut="K"
              disabled={disabled}
              onClick={openLinkDialog}
              testId="toolbar-link"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconLink />
            </ToolButton>
          );
        })()}
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.image')}
              disabled={disabled || !onPickImage}
              onClick={() => { if (onPickImage) onPickImage(); }}
              testId="toolbar-image"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconImage />
            </ToolButton>
          );
        })()}
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.table')}
              disabled={disabled}
              onClick={openTablePopover}
              testId="toolbar-table"
              tabIndex={p.tabIndex}
              buttonRef={(el) => {
                p.refSetter(el);
                tableButtonRef.current = el;
              }}
            >
              <IconTable />
            </ToolButton>
          );
        })()}
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.mathInline')}
              disabled={disabled}
              onClick={() => run((v) => insertInlineMath(v))}
              testId="toolbar-math-inline"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconMathInline />
            </ToolButton>
          );
        })()}
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.math')}
              disabled={disabled}
              onClick={() => run((v) => insertMathBlock(v))}
              testId="toolbar-math"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconMath />
            </ToolButton>
          );
        })()}
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.footnote')}
              disabled={disabled}
              onClick={() => run((v) => insertFootnote(v))}
              testId="toolbar-footnote"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconFootnote />
            </ToolButton>
          );
        })()}
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.citation')}
              disabled={disabled || !onOpenCitePalette}
              onClick={() => { if (onOpenCitePalette) onOpenCitePalette(); }}
              testId="toolbar-citation"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconCitation />
            </ToolButton>
          );
        })()}
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.hr')}
              disabled={disabled}
              onClick={() => run((v) => insertHorizontalRule(v))}
              testId="toolbar-hr"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconHorizontalRule />
            </ToolButton>
          );
        })()}
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.mermaid')}
              disabled={disabled}
              onClick={() => run((v) => insertMermaidBlock(v))}
              testId="toolbar-mermaid"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconMermaid />
            </ToolButton>
          );
        })()}
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.toc')}
              disabled={disabled}
              onClick={() => run((v) => insertToc(v))}
              testId="toolbar-toc"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconToc />
            </ToolButton>
          );
        })()}
      </div>

      <span className="editor-toolbar-sep" aria-hidden="true" />

      <div className="editor-toolbar-group">
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.cm.insert')}
              disabled={disabled}
              onClick={() => run((v) => wrapCmInsert(v))}
              testId="toolbar-cm-insert"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconCmInsert />
            </ToolButton>
          );
        })()}
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.cm.delete')}
              disabled={disabled}
              onClick={() => run((v) => wrapCmDelete(v))}
              testId="toolbar-cm-delete"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconCmDelete />
            </ToolButton>
          );
        })()}
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.cm.substitute')}
              disabled={disabled}
              onClick={() => run((v) => wrapCmSubstitute(v))}
              testId="toolbar-cm-substitute"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconCmSubstitute />
            </ToolButton>
          );
        })()}
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.highlight')}
              disabled={disabled}
              onClick={() => run((v) => wrapCmHighlight(v))}
              testId="toolbar-cm-highlight"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconHighlight />
            </ToolButton>
          );
        })()}
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.cm.comment')}
              disabled={disabled}
              onClick={() => run((v) => wrapCmComment(v))}
              testId="toolbar-cm-comment"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconCmComment />
            </ToolButton>
          );
        })()}
      </div>

      <span className="editor-toolbar-sep" aria-hidden="true" />

      <div className="editor-toolbar-group">
        {(() => {
          const p = nextIdx();
          return (
            <ToolButton
              label={t('toolbar.memo.inline')}
              disabled={disabled}
              onClick={() => run((v) => wrapComment(v))}
              testId="toolbar-memo"
              tabIndex={p.tabIndex}
              buttonRef={p.refSetter}
            >
              <IconMemo />
            </ToolButton>
          );
        })()}
      </div>

      <Suspense fallback={null}>
        {linkOpen && (
          <InsertLinkDialog
            open={linkOpen}
            initialText={linkInitialText}
            initialUrl={linkInitialUrl}
            initialTitle={linkInitialTitle}
            onClose={closeLinkDialog}
            onConfirm={confirmLink}
          />
        )}
      </Suspense>
      {tablePopover && (
        <TableSizePopover
          anchorRect={tablePopover}
          onClose={() => setTablePopover(null)}
          onPick={pickTableSize}
        />
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { indentMore, indentLess } from '@codemirror/commands';
import { toggleWrap, toggleSup, toggleSub } from '../editor/keymap/toggleWrap';
import { setHeading, clearHeading } from '../editor/keymap/setHeading';
import { insertTable } from '../editor/keymap/insertTable';
import { insertCodeBlock } from '../editor/keymap/insertCodeBlock';
import { toggleTask } from '../editor/keymap/toggleTask';
import { wrapComment } from '../editor/keymap/wrapComment';
import { wrapCmInsert, wrapCmHighlight } from '../editor/keymap/wrapCriticMarkup';
import { useAppStore } from '../store/appStore';
import { t, useLanguage } from '../i18n/t';
import './EditorToolbar.css';

/**
 * Top-of-editor chrome shown only while the WYSIWYG edit mode is active.
 *
 * The buttons all dispatch transactions on the live EditorView. We never
 * mutate decorations from here (the active-line invariant in the editor must
 * stay intact). When the view is null (e.g. the very first render before the
 * editor mounts) every button renders disabled.
 */
export interface EditorToolbarProps {
  view: EditorView | null;
  visible: boolean;
  /**
   * Open the citation palette. We bubble this up through App.tsx instead of
   * dispatching the IPC menu command directly so the toolbar stays pure UI
   * with no awareness of the menu/IPC graph.
   */
  onOpenCitePalette?: () => void;
  /** Open the OS file picker for image insertion. Bubbled for the same reason. */
  onPickImage?: () => void;
}

type StyleValue =
  | 'body'
  | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  | 'blockquote'
  | 'codeBlock';

/**
 * Inspect the current line and pick the matching dropdown value so the Style
 * select stays in sync as the caret moves.
 */
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

/**
 * Prepend `> ` to the current line (or strip it if already a blockquote).
 * Keeps the caret on the same line so the user can keep typing.
 */
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

/**
 * Toggle a bullet (`- `) marker at the start of the current line.
 */
function toggleBulletList(view: EditorView): boolean {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  const text = line.text;
  if (/^[-*+] /.test(text)) {
    view.dispatch({
      changes: { from: line.from, to: line.from + 2, insert: '' },
    });
    return true;
  }
  const ordered = /^\d+\.\s/.exec(text);
  if (ordered) {
    view.dispatch({
      changes: { from: line.from, to: line.from + ordered[0].length, insert: '- ' },
    });
    return true;
  }
  view.dispatch({
    changes: { from: line.from, to: line.from, insert: '- ' },
  });
  return true;
}

/**
 * Toggle a numbered (`1. `) marker at the start of the current line.
 */
function toggleNumberedList(view: EditorView): boolean {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  const text = line.text;
  const numbered = /^\d+\.\s/.exec(text);
  if (numbered) {
    view.dispatch({
      changes: { from: line.from, to: line.from + numbered[0].length, insert: '' },
    });
    return true;
  }
  const bullet = /^[-*+] /.exec(text);
  if (bullet) {
    view.dispatch({
      changes: { from: line.from, to: line.from + bullet[0].length, insert: '1. ' },
    });
    return true;
  }
  view.dispatch({
    changes: { from: line.from, to: line.from, insert: '1. ' },
  });
  return true;
}

/**
 * Insert a `$$\n\n$$` math block at the caret and park the caret on the empty
 * middle line.
 */
function insertMathBlock(view: EditorView): boolean {
  const head = view.state.selection.main.head;
  const insert = '$$\n\n$$';
  view.dispatch({
    changes: { from: head, insert },
    selection: { anchor: head + 3 },
  });
  return true;
}

/**
 * Insert a footnote anchor `[^N]` at the caret + a matching definition
 * `[^N]: ` at the very end of the document. We auto-pick N so it doesn't
 * collide with any anchor already present.
 */
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
  // Two changes in a single transaction so undo treats this as one step.
  view.dispatch({
    changes: [
      { from: head, insert: anchor },
      { from: doc.length, insert: def },
    ],
    selection: { anchor: head + anchor.length },
  });
  return true;
}

interface ToolButtonProps {
  label: string;
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}

function ToolButton({ label, title, disabled, onClick, children, active }: ToolButtonProps) {
  return (
    <button
      type="button"
      className={`editor-toolbar-btn${active ? ' editor-toolbar-btn-active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title}
    >
      {children}
    </button>
  );
}

export function EditorToolbar({ view, visible, onOpenCitePalette, onPickImage }: EditorToolbarProps) {
  // Subscribe so labels re-render on language switch.
  useLanguage();
  // Re-detect the Style dropdown's current value whenever the doc or selection
  // changes — but cheaply, by listening to a low-noise re-render trigger.
  const content = useAppStore((s) => s.content);
  const [styleValue, setStyleValue] = useState<StyleValue>(() => detectStyle(view));

  // Wire a per-view listener so caret moves (no doc change) also update the
  // Style dropdown. We re-install when the view reference changes.
  const lastViewRef = useRef<EditorView | null>(null);
  useEffect(() => {
    if (view === lastViewRef.current) {
      setStyleValue(detectStyle(view));
      return;
    }
    lastViewRef.current = view;
    if (!view) return;
    const dom = view.dom;
    const handler = () => setStyleValue(detectStyle(view));
    dom.addEventListener('keyup', handler);
    dom.addEventListener('mouseup', handler);
    return () => {
      dom.removeEventListener('keyup', handler);
      dom.removeEventListener('mouseup', handler);
    };
  }, [view, content]);

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

  return (
    <div
      className="editor-toolbar"
      role="toolbar"
      aria-label={t('toolbar.aria.label')}
      data-testid="editor-toolbar"
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
        <ToolButton
          label={t('toolbar.bold')}
          title={t('toolbar.bold')}
          disabled={disabled}
          onClick={() => run((v) => toggleWrap(v, '**'))}
        >
          <strong>B</strong>
        </ToolButton>
        <ToolButton
          label={t('toolbar.italic')}
          title={t('toolbar.italic')}
          disabled={disabled}
          onClick={() => run((v) => toggleWrap(v, '*'))}
        >
          <em>I</em>
        </ToolButton>
        <ToolButton
          label={t('toolbar.strike')}
          title={t('toolbar.strike')}
          disabled={disabled}
          onClick={() => run((v) => toggleWrap(v, '~~'))}
        >
          <span style={{ textDecoration: 'line-through' }}>S</span>
        </ToolButton>
        <ToolButton
          label={t('toolbar.code')}
          title={t('toolbar.code')}
          disabled={disabled}
          onClick={() => run((v) => toggleWrap(v, '`'))}
        >
          <span className="editor-toolbar-mono">{'<>'}</span>
        </ToolButton>
        <ToolButton
          label={t('toolbar.sup')}
          title={t('toolbar.sup')}
          disabled={disabled}
          onClick={() => run((v) => toggleSup(v))}
        >
          x<sup>2</sup>
        </ToolButton>
        <ToolButton
          label={t('toolbar.sub')}
          title={t('toolbar.sub')}
          disabled={disabled}
          onClick={() => run((v) => toggleSub(v))}
        >
          x<sub>2</sub>
        </ToolButton>
      </div>

      <span className="editor-toolbar-sep" aria-hidden="true" />

      <div className="editor-toolbar-group">
        <ToolButton
          label={t('toolbar.bullet')}
          title={t('toolbar.bullet')}
          disabled={disabled}
          onClick={() => run((v) => toggleBulletList(v))}
        >
          {'•'}
        </ToolButton>
        <ToolButton
          label={t('toolbar.numbered')}
          title={t('toolbar.numbered')}
          disabled={disabled}
          onClick={() => run((v) => toggleNumberedList(v))}
        >
          1.
        </ToolButton>
        <ToolButton
          label={t('toolbar.task')}
          title={t('toolbar.task')}
          disabled={disabled}
          onClick={() => run((v) => toggleTask(v))}
        >
          {'☑'}
        </ToolButton>
        <ToolButton
          label={t('toolbar.outdent')}
          title={t('toolbar.outdent')}
          disabled={disabled}
          onClick={() => run((v) => indentLess(v))}
        >
          {'⇤'}
        </ToolButton>
        <ToolButton
          label={t('toolbar.indent')}
          title={t('toolbar.indent')}
          disabled={disabled}
          onClick={() => run((v) => indentMore(v))}
        >
          {'⇥'}
        </ToolButton>
      </div>

      <span className="editor-toolbar-sep" aria-hidden="true" />

      <div className="editor-toolbar-group">
        <ToolButton
          label={t('toolbar.link')}
          title={t('toolbar.link')}
          disabled={disabled}
          onClick={() =>
            run((v) => {
              const { from, to } = v.state.selection.main;
              const text = v.state.sliceDoc(from, to);
              const insert = `[${text}]()`;
              v.dispatch({
                changes: { from, to, insert },
                selection: { anchor: from + insert.length - 1 },
              });
            })
          }
        >
          {'\u{1F517}'}
        </ToolButton>
        <ToolButton
          label={t('toolbar.image')}
          title={t('toolbar.image')}
          disabled={disabled || !onPickImage}
          onClick={() => {
            if (onPickImage) onPickImage();
          }}
        >
          {'\u{1F5BC}'}
        </ToolButton>
        <ToolButton
          label={t('toolbar.table')}
          title={t('toolbar.table')}
          disabled={disabled}
          onClick={() => run((v) => insertTable(v))}
        >
          {'▦'}
        </ToolButton>
        <ToolButton
          label={t('toolbar.math')}
          title={t('toolbar.math')}
          disabled={disabled}
          onClick={() => run((v) => insertMathBlock(v))}
        >
          {'∑'}
        </ToolButton>
        <ToolButton
          label={t('toolbar.footnote')}
          title={t('toolbar.footnote')}
          disabled={disabled}
          onClick={() => run((v) => insertFootnote(v))}
        >
          {'⁂'}
        </ToolButton>
        <ToolButton
          label={t('toolbar.citation')}
          title={t('toolbar.citation')}
          disabled={disabled || !onOpenCitePalette}
          onClick={() => {
            if (onOpenCitePalette) onOpenCitePalette();
          }}
        >
          @
        </ToolButton>
      </div>

      <span className="editor-toolbar-sep" aria-hidden="true" />

      <div className="editor-toolbar-group">
        <ToolButton
          label={t('toolbar.highlight')}
          title={t('toolbar.highlight')}
          disabled={disabled}
          onClick={() => run((v) => wrapCmHighlight(v))}
        >
          {'▮'}
        </ToolButton>
        <ToolButton
          label={t('toolbar.memo')}
          title={t('toolbar.memo')}
          disabled={disabled}
          onClick={() => run((v) => wrapComment(v))}
        >
          {'\u{1F4AC}'}
        </ToolButton>
        <ToolButton
          label={t('toolbar.trackChange')}
          title={t('toolbar.trackChange')}
          disabled={disabled}
          onClick={() => run((v) => wrapCmInsert(v))}
        >
          {'✎'}
        </ToolButton>
      </div>
    </div>
  );
}

import 'katex/dist/katex.min.css';
import { useEffect, useRef } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages as lezerLangs } from '@codemirror/language-data';
import { GFM } from '@lezer/markdown';
import { FrontMatterExtension } from './markdownExt/frontMatter';
import { FootnoteExtension } from './markdownExt/footnote';
import { TocExtension } from './markdownExt/toc';
import { InlineExtrasExtension } from './markdownExt/inlineExtras';
import { CitationExtension } from './markdownExt/citation';
import { CommentsExtension } from './markdownExt/comments';
import { CriticMarkupExtension } from './markdownExt/criticMarkup';
import { liveDecorations } from './decorations';
import { spellcheckExclusion } from './spellcheckExclusion';
import { attachReconciliationCompositionGate } from './compositionGate';
import { registerReconciliationExecutor } from './applyExternalChange';
import { useReconciliationStore } from '../store/reconciliationStore';
import { markdownKeymap } from './keymap';
import { buildMacroKeymap } from './keymap/macros';
import { autoPair } from './keymap/autoPair';
import { enterListContinuation } from './keymap/listContinuation';
import { emojiAutocomplete } from './keymap/emojiAutocomplete';
import { viewModes } from './viewModes';
import { makeTheme } from './theme';
import { handlePaste, handleDrop } from './imagePaste';
import { atomicMediaExtension } from './atomicMedia';
import { atomicInlineMarksExtension } from './atomicInlineMarks';
import { citationAutocomplete } from './autocomplete/citationAutocomplete';
import { citationHoverTooltip } from './decorations/citationHover';
import { defaultGhostTextRefs, ghostTextExtension } from './ai/ghostText';
import type { Macro } from '@shared/ipc-contract';
import { EditMode, editModeStateExtension, setEditMode } from './editMode';
import { docPathStateExtension, setDocPath } from './docPath';
import { wysiwygEscapeFilter } from './wysiwygEscape';
import { headingHintPlugin } from './headingHint';
import { useAppStore } from '../store/appStore';

export interface MarkdownEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onReady?: (view: EditorView) => void;
  filePath?: string | null;
  macros?: Macro[];
  editMode?: EditMode;
}

function decorationsForMode(mode: EditMode) {
  // `markdown` strips the entire live-preview decoration set so the user
  // sees plain markdown source. `typora` and `wysiwyg` share the same
  // decoration bundle — the WYSIWYG-only active-line marker hider is
  // always loaded and self-gates on the current mode.
  return mode === 'markdown' ? [] : liveDecorations;
}

export function MarkdownEditor({
  value,
  onChange,
  onReady,
  filePath = null,
  macros = [],
  editMode = 'wysiwyg',
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const filePathRef = useRef<string | null>(filePath);
  const macroCompartmentRef = useRef<Compartment>(new Compartment());
  const editModeCompartmentRef = useRef<Compartment>(new Compartment());
  const initialEditModeRef = useRef<EditMode>(editMode);

  useEffect(() => {
    filePathRef.current = filePath;
    // Threads the doc path into the editor's StateField so widgets that
    // need to resolve workspace-relative paths (image src today, future
    // PDF embed) can read it at decoration-build time.
    const view = viewRef.current;
    if (view) view.dispatch({ effects: setDocPath.of(filePath) });
  }, [filePath]);

  useEffect(() => {
    if (!hostRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([enterListContinuation(), ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        autoPair(),
        emojiAutocomplete(),
        markdown({
          base: markdownLanguage,
          codeLanguages: lezerLangs,
          extensions: [
            GFM,
            FrontMatterExtension,
            FootnoteExtension,
            TocExtension,
            InlineExtrasExtension,
            CitationExtension,
            CommentsExtension,
            CriticMarkupExtension,
          ],
        }),
        editModeStateExtension(),
        docPathStateExtension(),
        editModeCompartmentRef.current.of(decorationsForMode(initialEditModeRef.current)),
        // v0.2.23 — image/link widgets must behave atomically: arrow keys
        // skip across them, clicks snap to edges, and a single Backspace
        // / Delete at a widget edge removes the entire `![](…)` /
        // `[label](url)` instead of nicking one source char (which would
        // break the markdown and reveal raw text). See atomicMedia.ts.
        atomicMediaExtension(),
        // v0.2.24 — atomic boundaries for inline marks. Same contract
        // as atomicMediaExtension above but for the uniform
        // open/label/close shape. Ships with Bold (`**` / `__`); later
        // PRs append Italic / Strike / Highlight / Code / Sub / Sup.
        atomicInlineMarksExtension(),
        wysiwygEscapeFilter(),
        citationAutocomplete(),
        citationHoverTooltip(),
        ghostTextExtension({ refs: defaultGhostTextRefs }),
        spellcheckExclusion(),
        // `#foo` 처럼 공백이 빠져 제목이 되지 않는 줄에 캐럿이 있으면
        // 상태바에 안내를 띄운다. 판정만 하고 문서·데코레이션은 건드리지
        // 않는다 (IME 조합 중 안전).
        headingHintPlugin((show) => useAppStore.getState().setHeadingHint(show)),
        viewModes(),
        markdownKeymap(),
        macroCompartmentRef.current.of(buildMacroKeymap(macros)),
        makeTheme(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        EditorView.domEventHandlers({
          paste: (event, view) => handlePaste(event, view, filePathRef),
          drop: (event, view) => handleDrop(event, view, filePathRef),
          dragover: (event) => {
            event.preventDefault();
            return false;
          },
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && onChange) onChange(u.state.doc.toString());
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    // SPEC-V03-WORKSPACE-001 REQ-WS-020: 조합이 열려 있는 동안 외부 변경
    // 조정이 문서를 건드리지 못하게 막는다. 게이트 자체의 계약은
    // `src/editor/compositionGate.ts`와 그 테스트가 고정한다.
    const compositionGate = attachReconciliationCompositionGate(view.contentDOM);
    // SPEC-V03-WORKSPACE-001 REQ-WS-025: M2가 방출해 온 apply-to-buffer effect의
    // 실행자를 붙인다. 여기까지가 렌더러 안쪽이며, 확정 이벤트를 main에서
    // 나르는 IPC 채널은 M8 소관이다.
    const detachExecutor = registerReconciliationExecutor(
      view,
      useReconciliationStore.getState().setEffectHandler,
    );
    // Seed the docPath field with the prop value so widgets created on
    // the first paint (e.g. an image already in the initial document)
    // resolve correctly. Subsequent changes go through the filePath effect.
    if (filePath !== null) view.dispatch({ effects: setDocPath.of(filePath) });
    onReady?.(view);
    return () => {
      detachExecutor();
      compositionGate.detach();
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: macroCompartmentRef.current.reconfigure(buildMacroKeymap(macros)),
    });
  }, [macros]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    // v0.2.11 — snapshot caret + scroll BEFORE the reconfigure so we can
    // restore them after widgets remount under the new mode. Block widgets
    // (image, math, mermaid, table) have different heights between modes,
    // and replacing the decoration set rebuilds the viewport from scratch,
    // which can otherwise jump the caret line off-screen or to line 1.
    const docLen = view.state.doc.length;
    const sel = view.state.selection.main;
    const snapshot = {
      anchor: Math.min(sel.anchor, docLen),
      head: Math.min(sel.head, docLen),
      scrollTop: view.scrollDOM.scrollTop,
    };
    view.dispatch({
      effects: [
        editModeCompartmentRef.current.reconfigure(decorationsForMode(editMode)),
        setEditMode.of(editMode),
      ],
    });
    const newDocLen = view.state.doc.length;
    const safeAnchor = Math.min(snapshot.anchor, newDocLen);
    const safeHead = Math.min(snapshot.head, newDocLen);
    if (safeAnchor !== view.state.selection.main.anchor || safeHead !== view.state.selection.main.head) {
      view.dispatch({ selection: { anchor: safeAnchor, head: safeHead } });
    }
    // Two-step scroll restore: set synchronously so the natural value sticks
    // when widget heights match, then re-apply inside `requestMeasure` once
    // the new mode's widgets have laid out (heights may differ slightly
    // between Document/Live/Source).
    view.scrollDOM.scrollTop = snapshot.scrollTop;
    view.requestMeasure({
      read: () => view.scrollDOM.scrollTop,
      write: (current) => {
        if (Math.abs(current - snapshot.scrollTop) > 1) {
          view.scrollDOM.scrollTop = snapshot.scrollTop;
        }
      },
    });
  }, [editMode]);

  return <div ref={hostRef} className="cm-host" style={{ height: '100%' }} />;
}

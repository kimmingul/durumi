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
import { liveDecorations } from './decorations';
import { markdownKeymap } from './keymap';
import { buildMacroKeymap } from './keymap/macros';
import { autoPair } from './keymap/autoPair';
import { enterListContinuation } from './keymap/listContinuation';
import { emojiAutocomplete } from './keymap/emojiAutocomplete';
import { viewModes } from './viewModes';
import { makeTheme } from './theme';
import { handlePaste, handleDrop } from './imagePaste';
import type { Macro } from '@shared/ipc-contract';

export interface MarkdownEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onReady?: (view: EditorView) => void;
  filePath?: string | null;
  macros?: Macro[];
}

export function MarkdownEditor({ value, onChange, onReady, filePath = null, macros = [] }: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const filePathRef = useRef<string | null>(filePath);
  const macroCompartmentRef = useRef<Compartment>(new Compartment());

  useEffect(() => {
    filePathRef.current = filePath;
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
          extensions: [GFM, FrontMatterExtension, FootnoteExtension, TocExtension, InlineExtrasExtension],
        }),
        ...liveDecorations,
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
    onReady?.(view);
    return () => {
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

  return <div ref={hostRef} className="cm-host" style={{ height: '100%' }} />;
}

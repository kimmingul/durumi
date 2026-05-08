import { syntaxTree } from '@codemirror/language';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { EditorState, Extension, RangeSetBuilder } from '@codemirror/state';
import type { SyntaxNodeRef } from '@lezer/common';
import { getActiveLineRange, hasActiveLine, userActiveField } from './activeLine';

export interface VisitArgs {
  view: EditorView;
  from: number;
  to: number;
  nodeName: string;
  lineActive: boolean;
  doc: string;
  node: SyntaxNodeRef;
}

export interface NodeVisitor {
  nodes: string[];
  visit: (builder: RangeSetBuilder<Decoration>, args: VisitArgs) => void;
}

function rangeTouchesActiveLine(state: EditorState, from: number, to: number): boolean {
  if (!hasActiveLine(state)) return false;
  const active = getActiveLineRange(state);
  return !(to < active.from || from > active.to);
}

export function decorationPlugin(visitor: NodeVisitor): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view, visitor);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = build(update.view, visitor);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
  // Bundle the user-active field so consumers don't have to register it
  // separately. Extensions are deduplicated by reference identity, so
  // including it from every decorationPlugin() call is harmless.
  return [userActiveField, plugin];
}

function build(view: EditorView, visitor: NodeVisitor): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc.toString();
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (!visitor.nodes.includes(node.name)) return;
        if (isInsideCodeBlock(node)) return;
        const lineActive = rangeTouchesActiveLine(view.state, node.from, node.to);
        visitor.visit(builder, {
          view,
          from: node.from,
          to: node.to,
          nodeName: node.name,
          lineActive,
          doc,
          node,
        });
      },
    });
  }
  return builder.finish();
}

function isInsideCodeBlock(node: { name: string; node: { parent: unknown } }): boolean {
  if (node.name === 'FencedCode' || node.name === 'CodeBlock') return false;
  let p = (node.node as { parent: { name: string; parent: unknown } | null }).parent;
  while (p) {
    if (p.name === 'FencedCode' || p.name === 'CodeBlock') return true;
    p = (p as { parent: { name: string; parent: unknown } | null }).parent as typeof p;
  }
  return false;
}

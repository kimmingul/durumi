import { footnoteDecoration, footnoteTheme } from './footnote';
import { frontMatterDecoration, frontMatterTheme } from './frontMatter';
import { headingDecoration } from './heading';
import { tocDecoration, tocTheme } from './toc';
import { emphasisDecoration } from './emphasis';
import { inlineCodeDecoration } from './inlineCode';
import { linkDecoration } from './link';
import { imageDecoration } from './image';
import { codeBlockDecoration } from './codeBlock';
import { codeHighlight } from './codeHighlight';
import { listDecoration } from './list';
import { blockquoteDecoration } from './blockquote';
import { horizontalRuleDecoration } from './horizontalRule';
import { strikethroughDecoration } from './strikethrough';
import { taskListDecoration } from './taskList';
import { tableDecoration } from './table';
import { mathDecorations } from './math';
import { mermaidDecorations } from './mermaid';

export const liveDecorations = [
  frontMatterDecoration(),
  frontMatterTheme,
  footnoteDecoration(),
  footnoteTheme,
  tocDecoration(),
  tocTheme,
  headingDecoration(),
  emphasisDecoration(),
  inlineCodeDecoration(),
  linkDecoration(),
  imageDecoration(),
  codeBlockDecoration(),
  codeHighlight(),
  taskListDecoration(),
  listDecoration(),
  blockquoteDecoration(),
  horizontalRuleDecoration(),
  strikethroughDecoration(),
  tableDecoration(),
  mathDecorations,
  mermaidDecorations(),
];

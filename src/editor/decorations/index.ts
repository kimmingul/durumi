import { userActiveExtension } from './activeLine';
import { autolinkDecoration, autolinkTheme } from './autolink';
import { citationDecoration, citationTheme } from './citation';
import { commentDecoration, commentTheme } from './comment';
import { criticMarkupDecoration, criticMarkupTheme } from './criticMarkup';
import { footnoteDecoration, footnoteTheme } from './footnote';
import { frontMatterDecoration, frontMatterTheme } from './frontMatter';
import { headingDecoration, setextHeadingTheme } from './heading';
import { highlightExtras } from './highlight';
import { tocDecoration, tocTheme } from './toc';
import { emphasisDecoration } from './emphasis';
import { escapeDecoration } from './escape';
import { htmlBlockDecoration, htmlBlockTheme } from './htmlBlock';
import { htmlInlineDecoration, htmlInlineTheme } from './htmlInline';
import { inlineCodeDecoration } from './inlineCode';
import { lineBreakDecoration, lineBreakTheme } from './lineBreak';
import { linkDecoration, linkReferenceDecoration } from './link';
import { linkInteractivity } from './linkInteract';
import { imageDecoration } from './image';
import { codeBlockDecoration } from './codeBlock';
import { codeHighlight } from './codeHighlight';
import { listDecoration } from './list';
import { blockquoteDecoration } from './blockquote';
import { alertsDecoration, alertsTheme } from './alerts';
import { horizontalRuleDecoration } from './horizontalRule';
import { strikethroughDecoration } from './strikethrough';
import { taskListDecoration } from './taskList';
import { tableDecoration } from './table';
import { mathDecorations } from './math';
import { mermaidDecorations } from './mermaid';

export const liveDecorations = [
  userActiveExtension(),
  frontMatterDecoration(),
  frontMatterTheme,
  footnoteDecoration(),
  footnoteTheme,
  citationDecoration(),
  citationTheme,
  commentDecoration(),
  commentTheme,
  criticMarkupDecoration(),
  criticMarkupTheme,
  tocDecoration(),
  tocTheme,
  headingDecoration(),
  setextHeadingTheme,
  emphasisDecoration(),
  escapeDecoration(),
  htmlInlineDecoration(),
  htmlInlineTheme,
  highlightExtras(),
  htmlBlockDecoration(),
  htmlBlockTheme,
  inlineCodeDecoration(),
  lineBreakDecoration(),
  lineBreakTheme,
  linkDecoration(),
  linkReferenceDecoration(),
  linkInteractivity(),
  autolinkDecoration(),
  autolinkTheme,
  imageDecoration(),
  codeBlockDecoration(),
  codeHighlight(),
  taskListDecoration(),
  listDecoration(),
  blockquoteDecoration(),
  alertsDecoration(),
  alertsTheme,
  horizontalRuleDecoration(),
  strikethroughDecoration(),
  tableDecoration(),
  mathDecorations,
  mermaidDecorations(),
];

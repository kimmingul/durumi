import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

export const tokenStyle = HighlightStyle.define([
  { tag: tags.keyword, class: 'cm-tok-keyword' },
  { tag: tags.string, class: 'cm-tok-string' },
  { tag: tags.comment, class: 'cm-tok-comment' },
  { tag: tags.number, class: 'cm-tok-number' },
  { tag: tags.function(tags.variableName), class: 'cm-tok-function' },
  { tag: tags.typeName, class: 'cm-tok-type' },
  { tag: tags.variableName, class: 'cm-tok-variable' },
  { tag: tags.operator, class: 'cm-tok-operator' },
  { tag: tags.punctuation, class: 'cm-tok-punct' },
  { tag: tags.atom, class: 'cm-tok-atom' },
]);

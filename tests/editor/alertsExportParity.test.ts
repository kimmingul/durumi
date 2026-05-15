import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { alertsDecoration, alertsTheme } from '../../src/editor/decorations/alerts';
import { editModeStateExtension, setEditMode } from '../../src/editor/editMode';
import { renderHtml } from '../../src/export/renderHtml';

const FIXTURE = [
  '> [!NOTE]',
  '> note body',
  '',
  '> [!TIP]',
  '> tip body',
  '',
  '> [!IMPORTANT]',
  '> important body',
  '',
  '> [!WARNING]',
  '> warning body',
  '',
  '> [!CAUTION]',
  '> caution body',
  '',
].join('\n');

const KINDS = ['note', 'tip', 'important', 'warning', 'caution'] as const;

function previewKindsInOrder(): string[] {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc: FIXTURE,
      extensions: [
        editModeStateExtension(),
        markdown({ base: markdownLanguage, extensions: [GFM] }),
        alertsDecoration(),
        alertsTheme,
      ],
    }),
    parent,
  });
  view.dispatch({ effects: setEditMode.of('wysiwyg') });
  const titles = Array.from(view.dom.querySelectorAll('[data-alert-kind]'));
  const order = titles.map((el) => el.getAttribute('data-alert-kind') ?? '');
  view.destroy();
  return order;
}

function exportKindsInOrder(html: string): string[] {
  const out: string[] = [];
  const re = /markdown-alert markdown-alert-(note|tip|important|warning|caution)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

describe('alerts editor preview vs HTML export parity', () => {
  it('renders the same alert kinds in the same order in both pipelines', async () => {
    const previewOrder = previewKindsInOrder();
    const html = await renderHtml(FIXTURE, 'fixture', '');
    const exportOrder = exportKindsInOrder(html);
    expect(previewOrder).toEqual([...KINDS]);
    expect(exportOrder).toEqual([...KINDS]);
    expect(previewOrder).toEqual(exportOrder);
  });
});

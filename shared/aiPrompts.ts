// Prompt library for v0.1.8 selection commands. Each entry is a recipe:
// command id, display label key (looked up via t()), and a builder that
// turns the user's selection + surrounding paragraph into a complete
// `messages` array for the LLM.
//
// The system prompts are tuned for medical-research writing:
//   - never invent citations the user hasn't supplied
//   - preserve `[@key]` references exactly
//   - keep markdown structure (headings, lists, links) intact
//   - default to academic register without sounding mechanical
//
// New commands belong here, not in the palette UI — adding to the array
// is the only step needed to surface a new option to the user.

export type AiCommandId =
  | 'polishEnglish'
  | 'tighten'
  | 'expand'
  | 'simplify'
  | 'translateKo'
  | 'translateEn'
  | 'academicTone';

export interface AiCommandSpec {
  id: AiCommandId;
  /** i18n key for the user-facing label. */
  labelKey: string;
  /** i18n key for the one-line description in the palette. */
  descriptionKey: string;
  /** Builds the messages payload. */
  build: (input: AiCommandInput) => Array<{ role: 'system' | 'user'; content: string }>;
}

export interface AiCommandInput {
  /** The selected text the user wants to act on. */
  selection: string;
  /**
   * Paragraph context when available — surrounding sentences help the
   * model preserve voice and tense. Falls back to the selection when
   * the caller has nothing more.
   */
  paragraph?: string;
}

const SYSTEM_PREAMBLE = [
  'You are a careful copy-editor for medical-research manuscripts.',
  'Reply with ONLY the rewritten text — no preamble, no explanation, no quotes.',
  'Preserve every `[@citationKey]` exactly as written. Never invent citations.',
  'Preserve markdown structure (headings, lists, code spans, links).',
  'Default to academic register; avoid filler and hedge words.',
].join(' ');

function buildEdit(input: AiCommandInput, instruction: string) {
  const ctx = input.paragraph && input.paragraph !== input.selection
    ? `Surrounding paragraph for context (do NOT rewrite this part):\n---\n${input.paragraph}\n---\n\n`
    : '';
  return [
    { role: 'system' as const, content: SYSTEM_PREAMBLE },
    {
      role: 'user' as const,
      content: `${ctx}${instruction}\n\n---\n${input.selection}\n---`,
    },
  ];
}

export const AI_COMMANDS: ReadonlyArray<AiCommandSpec> = [
  {
    id: 'polishEnglish',
    labelKey: 'ai.cmd.polishEnglish.label',
    descriptionKey: 'ai.cmd.polishEnglish.desc',
    build: (input) =>
      buildEdit(
        input,
        'Polish the following selection for grammar, fluency, and academic tone WITHOUT changing meaning. Preserve the original sentence count when possible. Output the rewritten selection only:',
      ),
  },
  {
    id: 'tighten',
    labelKey: 'ai.cmd.tighten.label',
    descriptionKey: 'ai.cmd.tighten.desc',
    build: (input) =>
      buildEdit(
        input,
        'Tighten the following selection — remove filler, redundant phrasing, and hedge words. Keep all factual content. Output the tightened selection only:',
      ),
  },
  {
    id: 'expand',
    labelKey: 'ai.cmd.expand.label',
    descriptionKey: 'ai.cmd.expand.desc',
    build: (input) =>
      buildEdit(
        input,
        'Expand the following selection with one or two additional sentences of relevant elaboration. Stay grounded in claims the original already makes; do NOT introduce new facts or citations. Output the expanded selection only:',
      ),
  },
  {
    id: 'simplify',
    labelKey: 'ai.cmd.simplify.label',
    descriptionKey: 'ai.cmd.simplify.desc',
    build: (input) =>
      buildEdit(
        input,
        'Simplify the following selection so a non-specialist clinical reader can follow it. Keep the technical terms that matter; replace jargon that does not add precision. Output the simplified selection only:',
      ),
  },
  {
    id: 'academicTone',
    labelKey: 'ai.cmd.academicTone.label',
    descriptionKey: 'ai.cmd.academicTone.desc',
    build: (input) =>
      buildEdit(
        input,
        'Rewrite the following selection in formal academic register suitable for a medical-research journal. Keep the meaning identical. Output the rewritten selection only:',
      ),
  },
  {
    id: 'translateEn',
    labelKey: 'ai.cmd.translateEn.label',
    descriptionKey: 'ai.cmd.translateEn.desc',
    build: (input) => [
      { role: 'system' as const, content: SYSTEM_PREAMBLE },
      {
        role: 'user' as const,
        content: `Translate the following selection to English in academic register. Preserve every \`[@citationKey]\` and markdown verbatim. Output only the translation:\n\n---\n${input.selection}\n---`,
      },
    ],
  },
  {
    id: 'translateKo',
    labelKey: 'ai.cmd.translateKo.label',
    descriptionKey: 'ai.cmd.translateKo.desc',
    build: (input) => [
      { role: 'system' as const, content: SYSTEM_PREAMBLE },
      {
        role: 'user' as const,
        content: `Translate the following selection to Korean in academic register suitable for a medical-research manuscript. Preserve every \`[@citationKey]\` and markdown verbatim. Output only the translation:\n\n---\n${input.selection}\n---`,
      },
    ],
  },
];

export function findAiCommand(id: AiCommandId): AiCommandSpec | undefined {
  return AI_COMMANDS.find((c) => c.id === id);
}

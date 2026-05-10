import {
  Decoration,
  EditorView,
  type DecorationSet,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  keymap,
} from '@codemirror/view';
import { StateEffect, StateField, Prec, type Extension } from '@codemirror/state';
import {
  buildGhostTextPrompt,
  GHOST_TEXT_NO_COMPLETION,
} from '@shared/aiPrompts';
import { currentParagraph } from '../paragraphContext';
import { useAiUsageStore } from '../../store/aiUsageStore';

// Inline ghost-text completion. Watches for idle moments at the end of a
// paragraph; when conditions are right and the user has enabled the
// feature, fires an LLM call and renders the result as gray italic text
// after the caret. Tab accepts; any other key or selection change clears.
//
// Cost guards:
//   • Off by default — Settings toggle to opt in.
//   • Session-wide cap (default 100) so a runaway typing session can't
//     drain the user's API budget.
//   • Min paragraph length before triggering (avoids triggering at the
//     start of a fresh empty doc).
//   • Single in-flight request — every doc/selection change cancels.
//   • End-of-line and end-of-paragraph only — never mid-sentence.

const MIN_PARAGRAPH_CHARS = 30;

interface GhostState {
  /** When set, render this string after `position`. */
  text: string | null;
  /** Document position (in current state) where the ghost text sits. */
  position: number;
}

interface ProviderRefs {
  prefs: () => Promise<import('@shared/ipc-contract').Preferences>;
  hasKey: (provider: 'anthropic' | 'openai-compatible') => Promise<boolean>;
  chat: typeof window.api.aiChat;
}

const setGhostEffect = StateEffect.define<GhostState>();
const clearGhostEffect = StateEffect.define<null>();

const ghostField = StateField.define<GhostState>({
  create: () => ({ text: null, position: 0 }),
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setGhostEffect)) return e.value;
      if (e.is(clearGhostEffect)) return { text: null, position: 0 };
    }
    // Selection change clears the ghost (we'll re-trigger when idle).
    if (tr.selection || tr.docChanged) {
      if (value.text !== null) return { text: null, position: 0 };
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f, ghostStateToDecorations),
});

class GhostWidget extends WidgetType {
  constructor(readonly text: string) { super(); }
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-ai-ghost-text';
    span.style.color = 'var(--muted-fg, #888)';
    span.style.fontStyle = 'italic';
    span.style.opacity = '0.7';
    span.textContent = this.text;
    return span;
  }
  ignoreEvent(): boolean { return true; }
}

function ghostStateToDecorations(state: GhostState): DecorationSet {
  if (!state.text) return Decoration.none;
  return Decoration.set([
    Decoration.widget({
      widget: new GhostWidget(state.text),
      side: 1,
    }).range(state.position),
  ]);
}

/**
 * The session-counter lives outside the extension so it survives editor
 * remounts — the cap is per app session, not per file. Resets on app
 * restart by virtue of being module-scope.
 */
let sessionTriggerCount = 0;

/** Test seam — vitest can clear / read the count. */
export function _resetGhostSessionCounter(): void {
  sessionTriggerCount = 0;
}
export function _peekGhostSessionCounter(): number {
  return sessionTriggerCount;
}

interface GhostTextConfig {
  refs: ProviderRefs;
  /**
   * Override the idle-debounce window. Production uses the default (800ms);
   * tests pass 0 / 10 to drive deterministic scheduling.
   */
  debounceMs?: number;
}

/**
 * Build the extension. The renderer wires `refs` to `window.api`; tests
 * inject fakes so we can drive the trigger logic deterministically.
 */
export function ghostTextExtension(cfg: GhostTextConfig): Extension {
  const debounceMs = cfg.debounceMs ?? 800;
  const plugin = ViewPlugin.fromClass(
    class {
      idleTimer: ReturnType<typeof setTimeout> | null = null;
      inflight: AbortController | null = null;
      lastTriggerAt = 0;

      update(u: ViewUpdate): void {
        if (!u.docChanged && !u.selectionSet) return;
        // Cancel anything running.
        if (this.idleTimer) {
          clearTimeout(this.idleTimer);
          this.idleTimer = null;
        }
        if (this.inflight) {
          this.inflight.abort();
          this.inflight = null;
        }
        // Idle-debounce — schedule a probe after the configured ms. Capture
        // the view ref locally because `u` is reused between updates.
        const view = u.view;
        this.idleTimer = setTimeout(() => {
          this.idleTimer = null;
          void this.maybeTrigger(view);
        }, debounceMs);
      }

      destroy(): void {
        if (this.idleTimer) clearTimeout(this.idleTimer);
        if (this.inflight) this.inflight.abort();
      }

      async maybeTrigger(view: EditorView): Promise<void> {
        const prefs = await cfg.refs.prefs();
        const aiCfg = prefs.ai;
        if (!aiCfg?.ghostTextEnabled) return;
        if (sessionTriggerCount >= (aiCfg.ghostTextSessionCap ?? 100)) return;

        const now = Date.now();
        if (now - this.lastTriggerAt < (aiCfg.ghostTextIdleMs ?? 800)) return;

        const sel = view.state.selection.main;
        if (sel.from !== sel.to) return;
        const line = view.state.doc.lineAt(sel.head);
        if (sel.head !== line.to) return;
        const para = currentParagraph(view.state);
        if (!para) return;
        if (para.text.trim().length < MIN_PARAGRAPH_CHARS) return;
        if (sel.head !== para.to) return;

        const hasA = await cfg.refs.hasKey('anthropic');
        const hasO = await cfg.refs.hasKey('openai-compatible');
        if (!hasA && !hasO) return;

        this.lastTriggerAt = now;
        sessionTriggerCount++;

        const ac = new AbortController();
        this.inflight = ac;
        const messages = buildGhostTextPrompt(para.text);
        const result = await cfg.refs.chat(messages, { maxTokens: 96 });
        if (ac.signal.aborted) return;
        this.inflight = null;
        if (!result.ok) return;
        const text = result.text.trim();
        if (!text || text === GHOST_TEXT_NO_COMPLETION) return;

        // Record token usage so the dashboard stays accurate.
        const model = activeModel(prefs);
        useAiUsageStore.getState().recordUsage({
          model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          source: 'ghostText',
        });

        // Only commit the ghost if the caret is still where we left it
        // (the user may have kept typing). Cancellation above already
        // handled doc changes; this guards against late results.
        if (view.state.selection.main.head !== sel.head) return;
        view.dispatch({
          effects: setGhostEffect.of({ text: prependSpace(text, view.state.doc.toString(), sel.head), position: sel.head }),
        });
      }
    },
  );

  // Tab accepts; nothing else does. We bind at high precedence so the
  // editor's other Tab handlers (list indent, etc.) only run when there's
  // no ghost text to consume.
  const acceptKeymap = keymap.of([
    {
      key: 'Tab',
      run(view): boolean {
        const ghost = view.state.field(ghostField, false);
        if (!ghost?.text) return false;
        view.dispatch({
          changes: { from: ghost.position, insert: ghost.text },
          selection: { anchor: ghost.position + ghost.text.length },
          effects: clearGhostEffect.of(null),
        });
        return true;
      },
    },
    {
      key: 'Escape',
      run(view): boolean {
        const ghost = view.state.field(ghostField, false);
        if (!ghost?.text) return false;
        view.dispatch({ effects: clearGhostEffect.of(null) });
        return true;
      },
    },
  ]);

  return [ghostField, plugin, Prec.high(acceptKeymap)];
}

function activeModel(prefs: import('@shared/ipc-contract').Preferences): string {
  if (!prefs.ai) return 'unknown';
  return prefs.ai.provider === 'anthropic'
    ? prefs.ai.anthropicModel
    : prefs.ai.openaiModel;
}

/**
 * Models often start their continuation with a leading space (or skip it).
 * Normalise: if the text immediately before the caret is alphanumeric AND
 * the model output starts with an alphanumeric, prepend a space so the
 * accepted ghost text doesn't fuse to the lead-in.
 */
function prependSpace(text: string, doc: string, pos: number): string {
  if (text.length === 0) return text;
  if (pos === 0) return text;
  const before = doc.charAt(pos - 1);
  const first = text.charAt(0);
  const isWordBefore = /\w/.test(before);
  const isWordFirst = /\w/.test(first);
  if (isWordBefore && isWordFirst) return ' ' + text;
  return text;
}

// Default refs for the renderer; tests build their own.
export const defaultGhostTextRefs: ProviderRefs = {
  prefs: () => window.api.prefsGet(),
  hasKey: (provider) => window.api.aiHasKey(provider),
  chat: (messages, options) => window.api.aiChat(messages, options),
};

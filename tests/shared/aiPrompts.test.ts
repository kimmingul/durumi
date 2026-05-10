import { describe, it, expect } from 'vitest';
import { AI_COMMANDS, findAiCommand } from '../../shared/aiPrompts';

describe('AI prompt library', () => {
  it('exports stable command IDs the UI can hardcode', () => {
    const ids = AI_COMMANDS.map((c) => c.id);
    expect(ids).toContain('polishEnglish');
    expect(ids).toContain('tighten');
    expect(ids).toContain('expand');
    expect(ids).toContain('simplify');
    expect(ids).toContain('academicTone');
    expect(ids).toContain('translateKo');
    expect(ids).toContain('translateEn');
  });

  it('every command builds a non-empty messages array', () => {
    for (const cmd of AI_COMMANDS) {
      const messages = cmd.build({ selection: 'Hello world.', paragraph: 'Hello world.' });
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0]?.role).toBe('system');
      expect(messages.some((m) => m.role === 'user')).toBe(true);
    }
  });

  it('system prompt forbids citation invention', () => {
    const messages = AI_COMMANDS[0]!.build({ selection: 'x', paragraph: 'x' });
    const sys = messages.find((m) => m.role === 'system');
    expect(sys?.content).toMatch(/citation/i);
    expect(sys?.content).toMatch(/never invent/i);
  });

  it('paragraph context is included only when distinct from selection', () => {
    const cmd = findAiCommand('polishEnglish')!;
    const same = cmd.build({ selection: 'Hello', paragraph: 'Hello' });
    const diff = cmd.build({
      selection: 'Hello',
      paragraph: 'Hello. This continues the thought.',
    });
    const sameUserContent = same.find((m) => m.role === 'user')?.content ?? '';
    const diffUserContent = diff.find((m) => m.role === 'user')?.content ?? '';
    expect(sameUserContent).not.toContain('Surrounding paragraph');
    expect(diffUserContent).toContain('Surrounding paragraph');
  });

  it('translation commands wrap the selection cleanly', () => {
    const cmd = findAiCommand('translateKo')!;
    const messages = cmd.build({ selection: 'The patient improved.' });
    const userMsg = messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMsg).toContain('Korean');
    expect(userMsg).toContain('The patient improved.');
  });

  it('findAiCommand returns undefined for unknown ids', () => {
    // @ts-expect-error - intentionally wrong id
    expect(findAiCommand('does-not-exist')).toBeUndefined();
  });
});

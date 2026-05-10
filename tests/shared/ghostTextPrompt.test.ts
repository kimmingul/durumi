import { describe, it, expect } from 'vitest';
import {
  buildGhostTextPrompt,
  GHOST_TEXT_NO_COMPLETION,
} from '../../shared/aiPrompts';

describe('buildGhostTextPrompt', () => {
  it('exposes a stable NO_COMPLETION sentinel', () => {
    expect(GHOST_TEXT_NO_COMPLETION).toBe('NO_COMPLETION');
  });

  it('builds a system prompt enforcing the 1-2 sentence rule', () => {
    const messages = buildGhostTextPrompt('Some lead-in text.');
    const sys = messages.find((m) => m.role === 'system')?.content ?? '';
    expect(sys).toMatch(/1-2 sentences/i);
    expect(sys).toMatch(/never invent/i);
    expect(sys).toMatch(/NO_COMPLETION/);
  });

  it('embeds the paragraph with the continue marker', () => {
    const messages = buildGhostTextPrompt('Patient improved over the trial.');
    const userMsg = messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMsg).toContain('Patient improved over the trial.');
    expect(userMsg).toContain('<continue from here>');
  });

  it('forbids markdown structure and citation invention', () => {
    const sys = buildGhostTextPrompt('x').find((m) => m.role === 'system')?.content ?? '';
    expect(sys).toMatch(/no markdown structure/i);
    expect(sys).toMatch(/citation/i);
  });
});

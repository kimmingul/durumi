import { describe, it, expect } from 'vitest';
import { relativeTime } from '../../src/utils/relativeTime';

const NOW = new Date('2026-05-09T12:00:00.000Z');

describe('relativeTime', () => {
  it('returns "just now" within a 5s window', () => {
    expect(relativeTime('2026-05-09T11:59:58.000Z', NOW)).toBe('just now');
  });

  it('rounds down to seconds < 60', () => {
    expect(relativeTime('2026-05-09T11:59:30.000Z', NOW)).toBe('30s ago');
  });

  it('rounds down to minutes < 60', () => {
    expect(relativeTime('2026-05-09T11:30:00.000Z', NOW)).toBe('30m ago');
  });

  it('rounds down to hours < 24', () => {
    expect(relativeTime('2026-05-09T09:00:00.000Z', NOW)).toBe('3h ago');
  });

  it('rounds down to days < 7', () => {
    expect(relativeTime('2026-05-06T12:00:00.000Z', NOW)).toBe('3d ago');
  });

  it('rounds down to weeks < 30 days', () => {
    expect(relativeTime('2026-04-25T12:00:00.000Z', NOW)).toBe('2w ago');
  });

  it('returns empty string on bad input', () => {
    expect(relativeTime('', NOW)).toBe('');
    expect(relativeTime('not a date', NOW)).toBe('');
  });
});

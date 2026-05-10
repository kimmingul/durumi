import { describe, it, expect } from 'vitest';
import { fakeKeyVault } from '../../electron/aiKeys';

describe('fakeKeyVault (test seam)', () => {
  it('round-trips encrypt then decrypt', () => {
    const v = fakeKeyVault();
    expect(v.decrypt(v.encrypt('sk-secret'))).toBe('sk-secret');
  });

  it('returns empty for empty input', () => {
    const v = fakeKeyVault();
    expect(v.encrypt('')).toBe('');
    expect(v.decrypt('')).toBe('');
  });

  it('treats unrecognised stored values as plaintext for migration', () => {
    const v = fakeKeyVault();
    expect(v.decrypt('legacy-string')).toBe('legacy-string');
  });
});

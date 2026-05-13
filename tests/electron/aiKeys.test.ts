import { describe, it, expect, vi } from 'vitest';

// `electron`'s safeStorage isn't available under vitest's node env. The
// keyStatusOf helper is pure (string-prefix inspection) so we only need
// to stub the safeStorage object to import the module.
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: () => Buffer.from(''),
    decryptString: () => '',
  },
}));

import { fakeKeyVault, keyStatusOf } from '../../electron/aiKeys';

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

describe('keyStatusOf', () => {
  it('reports none for empty / nullish values', () => {
    expect(keyStatusOf('')).toBe('none');
    expect(keyStatusOf(null)).toBe('none');
    expect(keyStatusOf(undefined)).toBe('none');
  });

  it('reports encrypted for the enc: prefix', () => {
    expect(keyStatusOf('enc:aGVsbG8=')).toBe('encrypted');
  });

  it('reports plaintext for the plain: prefix', () => {
    expect(keyStatusOf('plain:sk-ant-xxx')).toBe('plaintext');
  });

  it('reports plaintext for legacy unprefixed values', () => {
    // Pre-prefix migrations live here — UI should show the unlocked
    // indicator so the user knows to re-save.
    expect(keyStatusOf('sk-legacy-no-prefix')).toBe('plaintext');
  });
});

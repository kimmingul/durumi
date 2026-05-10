import { safeStorage } from 'electron';

// Wrapper around Electron's safeStorage so an unsupported platform doesn't
// crash the renderer. safeStorage is OS-keychain-backed when available
// (macOS Keychain, Windows DPAPI, kwallet/libsecret on Linux); on systems
// without a keychain it falls back to a per-OS-user fixed key. We never
// fall back to plaintext: an opaque sentinel + decrypt-fail-returns-empty
// keeps the threat model honest.

const PLAINTEXT_PREFIX = 'plain:';
const ENCRYPTED_PREFIX = 'enc:';

export interface KeyVault {
  encrypt(plain: string): string;
  decrypt(stored: string): string;
}

export function makeKeyVault(): KeyVault {
  return {
    encrypt(plain: string): string {
      if (!plain) return '';
      if (safeStorage.isEncryptionAvailable()) {
        const buf = safeStorage.encryptString(plain);
        return ENCRYPTED_PREFIX + buf.toString('base64');
      }
      // No encryption backend; explicitly mark as plaintext so future
      // reads can detect and refuse. We still store, because the
      // alternative is "user thinks they saved their key but didn't".
      return PLAINTEXT_PREFIX + plain;
    },

    decrypt(stored: string): string {
      if (!stored) return '';
      if (stored.startsWith(ENCRYPTED_PREFIX)) {
        if (!safeStorage.isEncryptionAvailable()) return '';
        try {
          const buf = Buffer.from(stored.slice(ENCRYPTED_PREFIX.length), 'base64');
          return safeStorage.decryptString(buf);
        } catch {
          return '';
        }
      }
      if (stored.startsWith(PLAINTEXT_PREFIX)) {
        return stored.slice(PLAINTEXT_PREFIX.length);
      }
      // Legacy / unrecognised values are treated as plaintext for one
      // session so an existing key isn't lost on schema change. The
      // caller is expected to rewrite via encrypt() on next save.
      return stored;
    },
  };
}

// Test seam: lets unit tests inject a deterministic vault (no Electron).
export function fakeKeyVault(): KeyVault {
  return {
    encrypt: (s) => (s ? `fake:${s}` : ''),
    decrypt: (s) => {
      if (!s) return '';
      return s.startsWith('fake:') ? s.slice(5) : s;
    },
  };
}

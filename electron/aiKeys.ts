import { safeStorage } from 'electron';
import type { AiKeyStatus } from '@shared/ipc-contract';

export type { AiKeyStatus };

// Wrapper around Electron's safeStorage. The OS-keychain backends —
// macOS Keychain, Windows DPAPI, kwallet/libsecret on Linux — are
// preferred whenever available. On systems where none of those work
// (notably Linux without a configured secret service), `safeStorage`
// reports `isEncryptionAvailable() === false`. We honor that signal
// honestly:
//
//   - encrypt() writes a `plain:` prefix so the value is recoverable.
//   - the renderer is told via `aiKeyStatus()` whether a stored key is
//     plaintext, so it can render a "not encrypted" indicator and ask
//     the user to confirm a plaintext save up front (`isEncryptionAvailable()`).
//
// The reason we don't refuse to store on missing-keychain systems: that
// would gut the AI features on Linux for users who never configured a
// keyring. Better to be loud about plaintext than silently broken.

const PLAINTEXT_PREFIX = 'plain:';
const ENCRYPTED_PREFIX = 'enc:';

export interface KeyVault {
  encrypt(plain: string): string;
  decrypt(stored: string): string;
}

/**
 * Classify a stored value without decrypting it. Empty values are 'none';
 * anything carrying our explicit prefixes is reported with that exact
 * provenance. Legacy / unprefixed values are reported as 'plaintext' so
 * the UI shows the unlocked indicator (they will be re-encrypted on the
 * next save if a keychain is available).
 */
export function keyStatusOf(stored: string | null | undefined): AiKeyStatus {
  if (!stored) return 'none';
  if (stored.startsWith(ENCRYPTED_PREFIX)) return 'encrypted';
  if (stored.startsWith(PLAINTEXT_PREFIX)) return 'plaintext';
  return 'plaintext';
}

/**
 * Whether the underlying OS has a keychain we can use. Renderer reads this
 * before showing the API-key input so it can warn the user up front when a
 * save would be plaintext.
 */
export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function makeKeyVault(): KeyVault {
  return {
    encrypt(plain: string): string {
      if (!plain) return '';
      if (safeStorage.isEncryptionAvailable()) {
        const buf = safeStorage.encryptString(plain);
        return ENCRYPTED_PREFIX + buf.toString('base64');
      }
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

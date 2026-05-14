import { ipcMain } from 'electron';
import type { Preferences } from '@shared/ipc-contract';
import { getPreferences, setPreferences } from '../preferences';
import { aiChat as aiChatCall, aiVerify as aiVerifyCall, type AiMessage } from '../aiClient';
import { isEncryptionAvailable, keyStatusOf, type makeKeyVault } from '../aiKeys';

type KeyVault = ReturnType<typeof makeKeyVault>;

/**
 * Materialise an `AiCallOptions` from the prefs blob. Returns null when the
 * active provider has no API key (Anthropic without a key has no fallback;
 * OpenAI-compat without a key works for keyless self-hosted endpoints, so
 * we still return options in that case).
 */
function aiOptionsFor(
  provider: 'anthropic' | 'openai-compatible',
  prefs: Preferences,
  vault: KeyVault,
): {
  provider: 'anthropic' | 'openai-compatible';
  apiKey: string;
  model: string;
  baseUrl?: string;
} | null {
  if (provider === 'anthropic') {
    const stored = prefs.ai?.anthropicKey ?? '';
    const apiKey = stored ? vault.decrypt(stored) : '';
    if (!apiKey) return null;
    return {
      provider,
      apiKey,
      model: prefs.ai?.anthropicModel || 'claude-sonnet-4-6',
    };
  }
  const stored = prefs.ai?.openaiKey ?? '';
  const apiKey = stored ? vault.decrypt(stored) : '';
  return {
    provider,
    apiKey,
    model: prefs.ai?.openaiModel || 'gpt-4o-mini',
    baseUrl: prefs.ai?.openaiBaseUrl || 'https://api.openai.com',
  };
}

export function registerAiHandlers(vault: KeyVault): void {
  ipcMain.handle(
    'ai:setApiKey',
    async (_e, provider: 'anthropic' | 'openai-compatible', plainKey: string) => {
      try {
        const encrypted = vault.encrypt(plainKey);
        const prefs = await getPreferences();
        if (provider === 'anthropic') {
          await setPreferences({ ai: { ...prefs.ai, anthropicKey: encrypted } });
        } else {
          await setPreferences({ ai: { ...prefs.ai, openaiKey: encrypted } });
        }
        return { ok: true as const, status: keyStatusOf(encrypted) };
      } catch (err) {
        return { ok: false as const, error: (err as Error).message };
      }
    },
  );

  ipcMain.handle(
    'ai:keyStatus',
    async (_e, provider: 'anthropic' | 'openai-compatible') => {
      const prefs = await getPreferences();
      const stored =
        provider === 'anthropic' ? prefs.ai?.anthropicKey : prefs.ai?.openaiKey;
      // Empty / decrypt-fail is reported as 'none'; otherwise the
      // storage-prefix tells us encrypted vs plaintext.
      if (!stored) return 'none' as const;
      if (vault.decrypt(stored).length === 0) return 'none' as const;
      return keyStatusOf(stored);
    },
  );

  ipcMain.handle('ai:encryptionAvailable', async () => isEncryptionAvailable());

  ipcMain.handle('ai:verify', async () => {
    const prefs = await getPreferences();
    const provider = prefs.ai?.provider ?? 'anthropic';
    const opts = aiOptionsFor(provider, prefs, vault);
    if (!opts) {
      return { ok: false as const, code: 'auth', message: 'no API key configured' };
    }
    const r = await aiVerifyCall(opts);
    if (!r.ok) return { ok: false as const, code: r.code, message: r.message };
    return { ok: true as const, provider, model: opts.model };
  });

  ipcMain.handle(
    'ai:chat',
    async (
      _e,
      messages: AiMessage[],
      options?: { maxTokens?: number; temperature?: number },
    ) => {
      const prefs = await getPreferences();
      const provider = prefs.ai?.provider ?? 'anthropic';
      const opts = aiOptionsFor(provider, prefs, vault);
      if (!opts) {
        return { ok: false as const, code: 'auth', message: 'no API key configured' };
      }
      const r = await aiChatCall(messages, {
        ...opts,
        maxTokens: options?.maxTokens,
        temperature: options?.temperature,
      });
      if (!r.ok) return { ok: false as const, code: r.code, message: r.message };
      return {
        ok: true as const,
        text: r.data.text,
        inputTokens: r.data.inputTokens,
        outputTokens: r.data.outputTokens,
      };
    },
  );
}

import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../src/store/appStore';

/**
 * Regression test for the theme-toggle E2E (e2e/golden.spec.ts).
 *
 * The original failure surfaced because the E2E test sent `menu:command`
 * via `BrowserWindow.getFocusedWindow()`, which returns null in headless
 * Playwright runs and silently no-op'd. While diagnosing, we verified the
 * actual store-level toggle path here so a future regression in the
 * resolved-theme logic (Phase A's system-aware behavior) is caught fast.
 *
 * Toggle path: read currentTheme -> setThemePreference(opposite) ->
 * resolveTheme(pref, systemTheme) drives data-theme.
 */
describe('theme toggle store flow', () => {
  beforeEach(() => {
    useAppStore.setState({
      theme: 'light',
      themePreference: 'system',
      systemTheme: 'light',
    });
  });

  it('flips dark -> light when system is dark and pref is system', () => {
    useAppStore.getState().setSystemTheme('dark');
    expect(useAppStore.getState().theme).toBe('dark');

    const current = useAppStore.getState().theme;
    const next = current === 'dark' ? 'light' : 'dark';
    useAppStore.getState().setThemePreference(next);

    expect(useAppStore.getState().themePreference).toBe('light');
    expect(useAppStore.getState().theme).toBe('light');
  });

  it('flips light -> dark when system is light and pref is system', () => {
    expect(useAppStore.getState().theme).toBe('light');

    const current = useAppStore.getState().theme;
    const next = current === 'dark' ? 'light' : 'dark';
    useAppStore.getState().setThemePreference(next);

    expect(useAppStore.getState().themePreference).toBe('dark');
    expect(useAppStore.getState().theme).toBe('dark');
  });

  it('preserves resolved-theme system-mode behavior: pref=system follows systemTheme', () => {
    useAppStore.getState().setThemePreference('system');
    useAppStore.getState().setSystemTheme('dark');
    expect(useAppStore.getState().theme).toBe('dark');
    useAppStore.getState().setSystemTheme('light');
    expect(useAppStore.getState().theme).toBe('light');
  });

  it('explicit pref overrides systemTheme changes', () => {
    useAppStore.getState().setThemePreference('dark');
    useAppStore.getState().setSystemTheme('light');
    expect(useAppStore.getState().theme).toBe('dark');
    useAppStore.getState().setSystemTheme('dark');
    expect(useAppStore.getState().theme).toBe('dark');
  });
});

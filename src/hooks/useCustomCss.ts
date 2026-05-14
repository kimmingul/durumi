import { useEffect } from 'react';

/**
 * Mirrors the user's custom CSS preference into a `<style id="custom-css">`
 * tag in the document head so renderer-side typography overrides apply
 * without a reload.
 *
 * Owns:
 * - Initial fetch via `window.api.customCssGet()` on mount.
 * - Re-injection whenever the main process broadcasts a change through
 *   `window.api.onCustomCssChanged`.
 * - Cleanup of the subscription on unmount.
 */
export function useCustomCss(): void {
  useEffect(() => {
    let active = true;
    void window.api.customCssGet().then((css) => {
      if (!active) return;
      upsertCustomCssTag(css);
    });
    const unsub = window.api.onCustomCssChanged((css) => upsertCustomCssTag(css));
    return () => {
      active = false;
      unsub();
    };
  }, []);
}

function upsertCustomCssTag(css: string) {
  let el = document.getElementById('custom-css') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'custom-css';
    document.head.appendChild(el);
  }
  el.textContent = css;
}

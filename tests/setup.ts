if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
if (typeof Range.prototype.getBoundingClientRect !== 'function') {
  Range.prototype.getBoundingClientRect = () => ({
    x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON() { return {}; },
  });
}

// Node 26 ships an experimental built-in `localStorage` that is unavailable
// unless the process was started with `--localstorage-file`, and it shadows
// the one jsdom installs. Files that touch storage (aiUsageStore) then see
// `localStorage === undefined` — but only when they land in a worker where
// nothing else initialised it first, so the failure moves around as the test
// file set changes. Install an in-memory Storage shim when the global is
// missing or unusable, matching the guard style above.
{
  const g = globalThis as unknown as { localStorage?: Storage };
  let usable = false;
  try {
    usable = typeof g.localStorage?.clear === 'function';
  } catch {
    usable = false;
  }
  if (!usable) {
    const store = new Map<string, string>();
    const shim: Storage = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      removeItem: (k: string) => void store.delete(k),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: shim,
      configurable: true,
      writable: true,
    });
  }
}

// Tell React 18 we're running in a unit-test ("act") environment so calling
// `act(() => root.render(...))` doesn't print a noisy warning. Only the React
// component tests touch this; the editor tests don't render React trees.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

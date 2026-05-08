import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: false,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
  // Use the automatic JSX runtime so .tsx test files don't need to
  // `import React`. Matches `tsconfig.web.json` ("jsx": "react-jsx").
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: { '@shared': resolve(__dirname, 'shared') },
  },
});

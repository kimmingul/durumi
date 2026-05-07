import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: { main: resolve(__dirname, 'electron/main.ts') },
        // Electron's `electron` module is CJS, so build main as CJS too —
        // an ESM main bundle fails on `import { app } from "electron"` under
        // Electron 31's Node 20.18 runtime.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
    resolve: { alias: { '@shared': resolve(__dirname, 'shared') } },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { preload: resolve(__dirname, 'electron/preload.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
    resolve: { alias: { '@shared': resolve(__dirname, 'shared') } },
  },
  renderer: {
    root: '.',
    build: {
      outDir: 'out/renderer',
      rollupOptions: { input: { index: resolve(__dirname, 'index.html') } },
    },
    resolve: { alias: { '@shared': resolve(__dirname, 'shared') } },
    plugins: [react()],
  },
});

import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: { input: { main: resolve(__dirname, 'electron/main.ts') } },
    },
    resolve: { alias: { '@shared': resolve(__dirname, 'shared') } },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: { input: { preload: resolve(__dirname, 'electron/preload.ts') } },
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

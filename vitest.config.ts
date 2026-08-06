import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: false,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // SPEC-V03-WORKSPACE-001 C-5: 커버리지 목표 85%, 커밋당 최소 80%.
    // 임계값을 여기서 강제하지 않는 이유: 저장소 전체는 현재 그 선 아래이며
    // (측정값은 progress.md §E.3), 전역 게이트를 켜면 이 SPEC과 무관한 기존
    // 코드 때문에 즉시 실패한다. 게이트 도입은 별도 결정 사항이다.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['shared/**/*.ts', 'src/**/*.ts', 'src/**/*.tsx', 'electron/**/*.ts'],
      exclude: ['**/*.d.ts'],
    },
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

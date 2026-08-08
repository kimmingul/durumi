import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { LEGACY_COVERAGE_EXCLUSIONS } from './vitest.legacy-coverage';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: false,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // SPEC-V03-WORKSPACE-001 C-5: 커버리지 목표 85%.
    //
    // 게이트는 **기본이 적용**이고 제외가 예외다. 새로 만든 모듈은 아무것도
    // 하지 않아도 85% 게이트 안에 들어온다 — 목록에 등록해야 게이트를 받는
    // 구조였다면 등록을 잊은 모듈이 조용히 빠져나가고, 그것이 이 SPEC이 내내
    // 막아 온 실패 방식이다.
    //
    // 제외 대상은 `vitest.legacy-coverage.ts`의 기존 부채 파일 목록뿐이다.
    // 그 파일들은 v0.3 이전부터 85% 아래였고 **담당자가 없다** — 제외는 승인이
    // 아니라 부채 기록이다. 목록은 줄어드는 방향으로만 움직인다.
    //
    // 제외가 리포트에서도 사라지는 점(= 부채 추이가 안 보임)은 감수한 대가다.
    // vitest 2.1.9의 glob threshold는 전역 집계에서 파일을 빼주지 않아
    // (`vitest/dist/coverage.js` resolveThresholds — 전역 맵에 모든 파일을 넣는다)
    // "리포트에는 남기되 게이트에서만 빼기"가 불가능했다. 부채 현황이 필요하면
    // 아래 목록을 일시적으로 비우고 한 번 측정한다.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['shared/**/*.ts', 'src/**/*.ts', 'src/**/*.tsx', 'electron/**/*.ts'],
      exclude: ['**/*.d.ts', ...LEGACY_COVERAGE_EXCLUSIONS],
      thresholds: {
        // C-5의 "85%"를 문자 그대로 읽어 statements/lines만 건다.
        // branches/functions에 임의의 값을 세우는 것은 SPEC에 없는 정책이다.
        statements: 85,
        lines: 85,
        // **파일 단위로** 건다. 전체 집계로 걸면 게이트가 사실상 무력하다:
        // 현재 게이트 대상은 statements 14,430개이고 96%가 덮여 있어, 집계
        // 임계값 85%를 깨려면 커버되지 않은 statement가 ~1,900개 더 필요하다.
        // 즉 테스트 없는 새 모듈 하나쯤은 집계에 묻혀 통과한다 — 이 게이트가
        // 잡으려던 바로 그 경우다. perFile이면 새 파일 하나가 곧바로 걸린다.
        perFile: true,
      },
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

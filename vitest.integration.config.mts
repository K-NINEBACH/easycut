import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// 실제 ffmpeg 를 실행하는 통합 테스트 (PRD 12.3). 먼저 node scripts/make-fixtures.mjs
export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(import.meta.dirname, 'src/shared') }
  },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    fileParallelism: false
  }
});

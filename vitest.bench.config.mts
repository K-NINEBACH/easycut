import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// 속도 재기 (tests/bench). 시스템 PATH 에 ffmpeg 가 있어야 함 (Windows: resources/bin 을 PATH 앞에)
export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(import.meta.dirname, 'src/shared') }
  },
  test: {
    include: ['tests/bench/**/*.bench.ts'],
    environment: 'node',
    testTimeout: 1_800_000
  }
});

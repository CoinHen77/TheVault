import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // All test files share one emulator Firestore project; each file's
    // beforeEach clears its data, so files can't safely run in parallel.
    fileParallelism: false,
  },
});

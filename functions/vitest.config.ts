import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // closeWeek/markBuyInPaid drive real Firestore-emulator transactions;
    // give the full fixture-week suite room to run sequentially per file.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // All test files share one emulator Firestore instance, and each file's
    // beforeEach wipes it clean — running files in parallel lets one file's
    // clearFirestore() delete another's in-flight data.
    fileParallelism: false,
  },
});

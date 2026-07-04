import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./__tests__/setupEnv.ts'],
    testTimeout: 15000,
  },
});

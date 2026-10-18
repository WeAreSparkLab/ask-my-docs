import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['lib/**/*.test.ts', 'src/**/*.test.{ts,tsx}'], environment: 'node' },
});

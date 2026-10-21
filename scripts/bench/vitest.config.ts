import { defineConfig } from 'vitest/config';

// `pnpm bench`: query timings on a seeded heavy-user DB (see seed.ts).
export default defineConfig({
  test: {
    environment: 'node',
    include: [],
    benchmark: { include: ['scripts/bench/**/*.bench.ts'] },
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});

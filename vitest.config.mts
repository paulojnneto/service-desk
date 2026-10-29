import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "apps/api/src/**/*.test.ts",
      "apps/web/src/**/*.test.ts",
      "apps/tickets/src/**/*.test.ts",
    ],
    // Lets the test command run before the first test file exists.
    passWithNoTests: true,
    // Each in-memory PostgreSQL (PGlite) applies every migration; with all files running in
    // parallel that can pass the default 5 s on a busy machine (stage 11).
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});

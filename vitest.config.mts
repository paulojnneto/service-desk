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
  },
});

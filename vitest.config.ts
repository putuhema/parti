import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The coach tests replay many puzzles; on a busy machine they can take longer than the 5s default.
    testTimeout: 60_000,
  },
});

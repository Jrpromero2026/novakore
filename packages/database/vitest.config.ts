import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // The isolation suite talks to a real Supabase instance.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Serial execution keeps auth calls well under rate limits.
    fileParallelism: false,
  },
});

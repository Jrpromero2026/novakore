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
    // Signs every seeded account in once for the whole run; test files then
    // build clients from those tokens instead of re-authenticating per file.
    globalSetup: ["./vitest.globalSetup.ts"],
    // Exclude helper modules — they are shared code, not test files.
    exclude: ["**/node_modules/**", "**/_*.ts"],
  },
});

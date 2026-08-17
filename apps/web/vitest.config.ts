import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Build-time-only guard with no runtime behaviour; vite cannot resolve
      // it, so server modules under test get an inert stand-in.
      "server-only": fileURLToPath(
        new URL("./test-stubs/server-only.ts", import.meta.url),
      ),
    },
  },
});

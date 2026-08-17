/**
 * Test stub for the `server-only` package.
 *
 * `server-only` has no runtime behaviour — it exists so that a bundler fails
 * the build when a Client Component imports a server module. Vite does not
 * resolve it, so tests alias it here. Keeping the real import in `src/`
 * preserves the guard where it matters (the Next build) instead of dropping
 * it to make a test runner happy.
 */
export {};

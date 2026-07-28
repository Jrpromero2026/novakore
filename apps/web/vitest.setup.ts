import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// With `globals: false`, Testing Library cannot self-register cleanup —
// without this, rendered DOM accumulates across tests.
afterEach(cleanup);

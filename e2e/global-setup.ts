import type { FullConfig } from "@playwright/test";

/**
 * Identity preflight: refuse to run against the wrong server.
 *
 * `reuseExistingServer` means ANY process holding the port becomes the
 * system under test — this suite once spent 21 minutes failing 12 of 13
 * specs against a different app that happened to be running on :3000, with
 * nothing in the output naming the mix-up. One request settles who is
 * answering before a single test runs.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3000";
  const url = `${baseURL}/api/health`;

  let service: string | undefined;
  try {
    const response = await fetch(url);
    service = ((await response.json()) as { service?: string }).service;
  } catch {
    // Nothing is holding the port: Playwright's webServer will start the
    // real app after this hook. Only an EXISTING server can be the wrong one.
    return;
  }

  if (service !== "novakore-web") {
    throw new Error(
      `E2E preflight: ${url} answered as "${service ?? "unknown"}" — a ` +
        "different app is holding this port and reuseExistingServer would " +
        "test it. Stop it, or point the suite elsewhere with " +
        "NOVAKORE_E2E_BASE_URL.",
    );
  }
}

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { siteLink, siteUrl } from "./site-url";

/**
 * These four lines decide whether an emailed sign-in or password-recovery
 * link works at all. They shipped wrong once — every production email pointed
 * at http://localhost:3000, because the only source was an env var nobody had
 * set and the fallback was a developer's laptop.
 */

const KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("siteUrl", () => {
  test("an explicit override wins over everything", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://academy.example.com";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "novakore.vercel.app";
    process.env.VERCEL_URL = "deploy-xyz.vercel.app";
    expect(siteUrl()).toBe("https://academy.example.com");
  });

  test("prefers the STABLE production domain over the per-deploy URL", () => {
    // A link emailed today must still work next week, so the deployment-
    // specific URL must never win over the production one.
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "novakore.vercel.app";
    process.env.VERCEL_URL = "novakore-git-abc123.vercel.app";
    expect(siteUrl()).toBe("https://novakore.vercel.app");
  });

  test("falls back to the deployment URL so previews link to themselves", () => {
    process.env.VERCEL_URL = "novakore-git-abc123.vercel.app";
    expect(siteUrl()).toBe("https://novakore-git-abc123.vercel.app");
  });

  test("localhost only when nothing else is available", () => {
    expect(siteUrl()).toBe("http://localhost:3000");
  });

  test("trailing slashes never produce a double slash", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://academy.example.com///";
    expect(siteLink("/auth/callback")).toBe(
      "https://academy.example.com/auth/callback",
    );
  });

  test("an empty env var is treated as unset, not as an origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "   ";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "novakore.vercel.app";
    expect(siteUrl()).toBe("https://novakore.vercel.app");
  });
});

describe("siteLink", () => {
  test("builds the recovery link the reset flow depends on", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://novakore.vercel.app";
    expect(
      siteLink(`/auth/callback?next=${encodeURIComponent("/auth/reset")}`),
    ).toBe("https://novakore.vercel.app/auth/callback?next=%2Fauth%2Freset");
  });

  test("tolerates a path without a leading slash", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://novakore.vercel.app";
    expect(siteLink("auth/callback")).toBe(
      "https://novakore.vercel.app/auth/callback",
    );
  });
});

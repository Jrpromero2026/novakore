import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  __testing,
  cached,
  invalidateOrg,
  invalidatePrefix,
  memberCacheKey,
  orgCacheKey,
} from "./cache";

/** Drives the cache's clock so TTL behaviour is tested without sleeping. */
let clock = 0;
const advance = (ms: number) => {
  clock += ms;
};

beforeEach(() => {
  clock = 1_000_000;
  __testing.reset(() => clock);
});

describe("cached", () => {
  test("loads once, then serves from memory until the TTL expires", async () => {
    const load = vi.fn(async () => "value");

    expect(await cached("k", 60_000, load)).toBe("value");
    expect(await cached("k", 60_000, load)).toBe("value");
    advance(59_999);
    expect(await cached("k", 60_000, load)).toBe("value");

    expect(load).toHaveBeenCalledTimes(1);
  });

  test("reloads once the entry is older than its TTL", async () => {
    const load = vi.fn(async () => "value");
    await cached("k", 60_000, load);

    advance(60_001);
    await cached("k", 60_000, load);

    expect(load).toHaveBeenCalledTimes(2);
  });

  test("distinct keys never share a value", async () => {
    await cached("a", 60_000, async () => "A");
    await cached("b", 60_000, async () => "B");

    expect(await cached("a", 60_000, async () => "reload")).toBe("A");
    expect(await cached("b", 60_000, async () => "reload")).toBe("B");
  });

  test("concurrent misses share one load rather than stampeding", async () => {
    let resolve!: (v: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => (resolve = r)));

    const all = Promise.all([
      cached("k", 60_000, load),
      cached("k", 60_000, load),
      cached("k", 60_000, load),
    ]);
    resolve("once");

    expect(await all).toEqual(["once", "once", "once"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("a failed load is not cached, and the next call retries", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("recovered");

    await expect(cached("k", 60_000, load)).rejects.toThrow("boom");
    // The rejected promise must not linger as an in-flight entry.
    expect(await cached("k", 60_000, load)).toBe("recovered");
    expect(load).toHaveBeenCalledTimes(2);
  });

  test("an expired entry is dropped even when the next load fails", async () => {
    await cached("k", 60_000, async () => "stale");
    advance(60_001);

    await expect(
      cached("k", 60_000, async () => {
        throw new Error("db down");
      }),
    ).rejects.toThrow("db down");

    // Serving the stale value here would be worse than failing: the caller
    // asked for data no older than the TTL.
    expect(__testing.size()).toBe(0);
  });

  test("stays bounded as keys accumulate", async () => {
    for (let i = 0; i < 700; i++) {
      await cached(`k${i}`, 60_000, async () => i);
    }
    expect(__testing.size()).toBeLessThanOrEqual(500);
  });
});

describe("invalidation", () => {
  test("invalidateOrg drops that org's entries and leaves others intact", async () => {
    const a = orgCacheKey("palette", "org-a", "content.view_draft");
    const b = orgCacheKey("palette", "org-b", "content.view_draft");
    await cached(a, 60_000, async () => "A");
    await cached(b, 60_000, async () => "B");

    invalidateOrg("org-a");

    expect(await cached(a, 60_000, async () => "reloaded")).toBe("reloaded");
    expect(await cached(b, 60_000, async () => "reloaded")).toBe("B");
  });

  test("invalidateOrg also clears that org's member-scoped entries", async () => {
    const key = memberCacheKey("nova", "org-a", "member-1");
    await cached(key, 60_000, async () => "report");

    invalidateOrg("org-a");

    expect(await cached(key, 60_000, async () => "fresh")).toBe("fresh");
  });

  test("invalidatePrefix is namespace-precise", async () => {
    const palette = orgCacheKey("palette", "org-a", "content.view_draft");
    const nova = memberCacheKey("nova", "org-a", "member-1");
    await cached(palette, 60_000, async () => "P");
    await cached(nova, 60_000, async () => "N");

    invalidatePrefix("org:org-a:palette");

    expect(await cached(palette, 60_000, async () => "reloaded")).toBe(
      "reloaded",
    );
    expect(await cached(nova, 60_000, async () => "reloaded")).toBe("N");
  });
});

describe("key construction", () => {
  test("organizations never collide", () => {
    expect(orgCacheKey("palette", "org-a", "x")).not.toBe(
      orgCacheKey("palette", "org-b", "x"),
    );
  });

  test("a different audience is a different entry", () => {
    // The whole point of the audience component: two gates must not share.
    expect(orgCacheKey("palette", "org-a", "content.view_draft")).not.toBe(
      orgCacheKey("palette", "org-a", "analytics.view"),
    );
  });

  test("members never collide, even in the same organization", () => {
    expect(memberCacheKey("nova", "org-a", "member-1")).not.toBe(
      memberCacheKey("nova", "org-a", "member-2"),
    );
  });

  test("a variant distinguishes entries for the same member", () => {
    expect(memberCacheKey("nova", "org-a", "m1", "learner")).not.toBe(
      memberCacheKey("nova", "org-a", "m1"),
    );
  });

  test("both key kinds carry the org prefix invalidateOrg relies on", () => {
    expect(orgCacheKey("palette", "org-a", "x")).toMatch(/^org:org-a:/);
    expect(memberCacheKey("nova", "org-a", "m1")).toMatch(/^org:org-a:/);
  });
});

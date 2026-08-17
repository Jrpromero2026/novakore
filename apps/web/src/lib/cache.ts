import "server-only";

/**
 * A small, bounded, in-process TTL cache for expensive per-organization
 * reads.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT `use cache`
 * ----------------------------------------------
 * Next's `use cache` cannot read `cookies()`, and every read in this app
 * builds its Supabase client from the session cookie so the database can
 * enforce RLS as the calling user. Adopting `use cache` would therefore mean
 * either enabling Cache Components app-wide (a prerendering-model change for
 * every route on a forked framework) or fetching with a non-session client,
 * which would bypass RLS — the platform's primary isolation guarantee. This
 * cache instead sits *above* the normal RLS-enforced read path and never
 * changes how a row is fetched.
 *
 * THE SAFETY RULE — read this before caching anything new
 * -------------------------------------------------------
 * A cached value is served to a *different request*, and potentially a
 * *different user*. That is only sound when the cache key contains
 * everything the RLS result depends on. Concretely, for every table a loader
 * touches, check its SELECT policy and ask what makes the row set vary:
 *
 *   - Depends only on the organization        → `organizationId` is enough.
 *   - Depends on a permission                 → that permission must be in
 *                                               the key (or the loader must
 *                                               only ever run for holders).
 *   - Has an "or the row is mine" clause      → identity must be in the key.
 *
 * That last case is easy to miss and is a real leak, not a theoretical one.
 * `enrollments`, `assessment_attempts`, and `organization_memberships` all
 * read roughly `<privileged permission> OR membership_id is mine`. Two users
 * holding an identical permission set still see different rows from those
 * tables, so any loader touching them must key on membership — see
 * `novaCacheKey`.
 *
 * Build keys with the helpers below rather than by hand; they exist to make
 * the audience of an entry explicit at the call site.
 *
 * SCOPE AND HONESTY
 * -----------------
 * This is a per-instance, best-effort cache. On serverless each instance
 * keeps its own map, so the hit rate depends on instance reuse and the real
 * saving is lower than a shared cache would give. It is deliberately not a
 * distributed cache: correctness never depends on a hit, entries expire on
 * their own, and the worst case is the uncached behaviour we have today.
 */

interface Entry {
  value: unknown;
  /** Epoch ms after which the entry is dead. */
  expiresAt: number;
}

/**
 * Bounded so a long-lived instance cannot grow without limit as tenants and
 * users accumulate. Eviction is oldest-inserted-first, which for TTL entries
 * of equal length is also nearest-to-expiry.
 */
const MAX_ENTRIES = 500;

const store = new Map<string, Entry>();
/** In-flight loads, so a cold key does not stampede the database. */
const inflight = new Map<string, Promise<unknown>>();

/** Overridable clock — tests drive time instead of sleeping. */
let now = () => Date.now();

/**
 * Read `key`, or produce it with `load` and remember it for `ttlMs`.
 *
 * Concurrent misses on the same key share a single `load` call. A rejected
 * load is never cached and never poisons the shared promise.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expiresAt > now()) return hit.value as T;
  // Expired: drop it now so a failing loader cannot keep serving stale data.
  if (hit) store.delete(key);

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = (async () => {
    const value = await load();
    if (store.size >= MAX_ENTRIES) {
      const oldest = store.keys().next();
      if (!oldest.done) store.delete(oldest.value);
    }
    store.set(key, { value, expiresAt: now() + ttlMs });
    return value;
  })();

  inflight.set(key, promise);
  try {
    return (await promise) as T;
  } finally {
    inflight.delete(key);
  }
}

/**
 * Drop every entry whose key starts with `prefix`.
 *
 * Call this from write paths so an author never has to wait out a TTL to see
 * their own change. Invalidation is best-effort in the same sense as the
 * cache itself: it clears this instance only.
 */
export function invalidatePrefix(prefix: string): void {
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Everything cached for one organization. Safe to over-invalidate. */
export function invalidateOrg(organizationId: string): void {
  invalidatePrefix(`org:${organizationId}:`);
}

/**
 * Key for data whose visible row set is identical for every caller that
 * reaches the loader — i.e. the loader is already gated on a permission, and
 * every table it touches resolves to that same org-wide permission.
 *
 * `audience` names that gate. It is part of the key so that adding a second
 * caller with a different gate cannot silently reuse the first one's entry.
 */
export function orgCacheKey(
  namespace: string,
  organizationId: string,
  audience: string,
): string {
  return `org:${organizationId}:${namespace}:aud=${audience}`;
}

/**
 * Key for data that varies per member — because a policy has an "or the row
 * is mine" clause, or because the caller's own permissions change the shape
 * of the result. Keyed on membership, so an entry is only ever reused by the
 * member who produced it.
 */
export function memberCacheKey(
  namespace: string,
  organizationId: string,
  membershipId: string,
  variant = "",
): string {
  return `org:${organizationId}:${namespace}:m=${membershipId}${
    variant ? `:v=${variant}` : ""
  }`;
}

/** Test-only: reset state and control the clock. */
export const __testing = {
  reset(clock: () => number = () => Date.now()) {
    store.clear();
    inflight.clear();
    now = clock;
  },
  size: () => store.size,
};

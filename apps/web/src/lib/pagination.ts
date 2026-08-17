/**
 * Collection pagination (CTO review P1, SCALABILITY_PLAN).
 *
 * Admin collections previously capped with `limit()` and truncated in
 * silence — the same defect class the analytics rollups fixed: past the cap
 * the surface looked complete while hiding rows, and item 201 was simply
 * unreachable. These helpers make the boundary explicit and every row
 * addressable.
 *
 * Offset-based on purpose. Keyset paging wins on very deep offsets, but it
 * costs opaque cursors and forfeits "page 4 of 9" and total counts — and
 * totals are exactly what makes a truncation bug visible. At NovaKore's real
 * collection sizes (hundreds, not millions) offsets are correct and legible;
 * SCALABILITY_PLAN records keyset as the next step if a tenant ever grows
 * deep enough for offsets to hurt.
 *
 * Pure functions only — no I/O, fully unit-tested.
 */

export const DEFAULT_PAGE_SIZE = 25;

export interface PageMeta {
  /** 1-based page actually shown, clamped into range. */
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  /** 0-based inclusive bounds for a Supabase `.range(from, to)` call. */
  from: number;
  to: number;
  /** 1-based inclusive bounds for display ("showing 26–50 of 83"). */
  showingFrom: number;
  showingTo: number;
  hasPrev: boolean;
  hasNext: boolean;
}

/**
 * Read a page number from a query-string value. Anything nonsensical
 * (absent, negative, zero, a word, an array) resolves to page 1 rather than
 * erroring — a bad URL should never break a workspace surface.
 */
export function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : 1;
}

/** 0-based inclusive range for the requested page, before the total is known. */
export function rangeFor(
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): { from: number; to: number } {
  const safePage = Math.max(1, Math.floor(page));
  const from = (safePage - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

/**
 * Build display metadata once the total is known. `page` is clamped to the
 * last page that actually exists, so a stale or hand-typed `?page=99` is
 * reported honestly instead of rendering an unexplained empty list.
 */
export function pageMeta(
  page: number,
  total: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): PageMeta {
  const safeTotal = Math.max(0, total);
  const pageCount = Math.max(1, Math.ceil(safeTotal / pageSize));
  const safePage = Math.min(Math.max(1, Math.floor(page)), pageCount);
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  return {
    page: safePage,
    pageSize,
    total: safeTotal,
    pageCount,
    from,
    to,
    showingFrom: safeTotal === 0 ? 0 : from + 1,
    showingTo: Math.min(to + 1, safeTotal),
    hasPrev: safePage > 1,
    hasNext: safePage < pageCount,
  };
}

/**
 * Href for another page of the same collection, preserving every other
 * query parameter (filters, search terms, a sibling list's page).
 */
export function pageHref(
  basePath: string,
  searchParams: Record<string, string | string[] | undefined>,
  param: string,
  page: number,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === param || value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      query.append(key, entry);
    }
  }
  // Page 1 is the canonical bare URL — no ?page=1 noise.
  if (page > 1) query.set(param, String(page));
  const suffix = query.toString();
  return suffix ? `${basePath}?${suffix}` : basePath;
}

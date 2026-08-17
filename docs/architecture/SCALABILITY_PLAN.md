# SCALABILITY_PLAN

Honest position (maturity audit, 2026-08-01): correct-by-construction, not
yet scaled-by-construction. What scales now: the multi-tenant schema, RLS,
immutable versions, the outbox, permission resolution. What does not:

| Bottleneck                              | Present shape                                   | Planned shape                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Analytics reads~~ **DONE 2026-08-01** | ~~2k–5k raw events per render, JS aggregation~~ | **Aggregated in Postgres** (`org_event_metrics`, `org_event_daily_by_type`; migrations 20260817040230/040453). Ops, Command Center, and Nova now receive a handful of pre-grouped rows. This also fixed a **correctness** bug: past the old `limit()` the counts were silently wrong. Equivalence proven against ground truth by 5 live-DB tests. Materialized/scheduled rollups remain the next step only if these aggregates themselves become slow.          |
| Admin lists **PARTIAL 2026-08-01**      | `limit()` truncation, no paging                 | **Offset pagination shipped** (`lib/pagination.ts` + `components/ui/pagination.tsx`, 11 unit tests) and applied to issued credentials, the Studio library, and the review queue. Offsets, not keyset: totals are what make truncation visible, and page-N URLs stay shareable. Keyset only if a tenant grows deep enough for offsets to hurt. **Remaining:** courses, members, enrollments, learning paths, assessments, ops feedback — same recipe, see below. |
| Palette search                          | 4 title queries per layout render               | cached / materialized per-org search index                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Nova report                             | ~14 queries, uncached                           | request-level cache → short-TTL per-org cache                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Lesson word counts                      | per-render block scans                          | persisted per-lesson stats, updated on save                                                                                                                                                                                                                                                                                                                                                                                                                     |

Sequencing rule: rollups first (they unblock everything), pagination
second, caching third. Each step lands behind existing test contracts.
**Rollups are done; pagination is shipped and partially applied.** The
primitives and three surfaces are in place; the remaining collections still
truncate silently at their `limit()` — the same class of correctness bug the
rollups fixed for analytics — and each is a mechanical application of the
recipe below. Caching is next after that.

## Paginating a remaining collection (the recipe)

Four mechanical steps — no design decisions left:

1. **Data function**: accept an optional `range?: { from: number; to: number }`,
   add `{ count: "exact" }` to the `select`, swap `.limit(n)` for
   `.range(range?.from ?? 0, range?.to ?? n - 1)`, and return the count as a
   `…Total` field on the result interface.
2. **Page**: accept `searchParams: Promise<Record<string, string | string[] |
undefined>>`, then
   `const page = parsePage(sp.page)` → pass `rangeFor(page, SIZE)` to the data
   function → `const meta = pageMeta(page, data.total, SIZE)`.
3. **Render** `<Pagination meta basePath searchParams itemLabel />` beneath the
   collection. Give sibling collections on one page distinct `param` keys.
4. **Verify**: `npm run typecheck && npm run test:run` — the pure helpers are
   already covered, so only the wiring is new.

Reference implementations: `admin/credentials/page.tsx` (sibling-list `param`),
`admin/studio/library/page.tsx`, `admin/studio/review/page.tsx`.

Deliberately out of scope until a real workload demands them: multi-region,
read replicas, queue-based fan-out. No speculative infrastructure.

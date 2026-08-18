# SCALABILITY_PLAN

Honest position (maturity audit, 2026-08-01): correct-by-construction, not
yet scaled-by-construction. What scales now: the multi-tenant schema, RLS,
immutable versions, the outbox, permission resolution. What does not:

| Bottleneck                                 | Present shape                                   | Planned shape                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Analytics reads~~ **DONE 2026-08-01**    | ~~2k–5k raw events per render, JS aggregation~~ | **Aggregated in Postgres** (`org_event_metrics`, `org_event_daily_by_type`; migrations 20260817040230/040453). Ops, Command Center, and Nova now receive a handful of pre-grouped rows. This also fixed a **correctness** bug: past the old `limit()` the counts were silently wrong. Equivalence proven against ground truth by 5 live-DB tests. Materialized/scheduled rollups remain the next step only if these aggregates themselves become slow.                                                                                                      |
| ~~Admin lists~~ **DONE 2026-08-17**        | ~~`limit()` truncation, no paging~~             | **Offset pagination shipped** (`lib/pagination.ts` + `components/ui/pagination.tsx`, 11 unit tests incl. a tiling proof) and applied to all eight unbounded collections: issued credentials, Studio library, review queue, courses, members, enrollments, assessments, ops feedback. Offsets, not keyset: totals are what make truncation visible, and page-N URLs stay shareable. Keyset only if a tenant grows deep enough for offsets to hurt. Proven end to end by an E2E spec that follows the real Next link to page 2 and asserts a different slice. |
| ~~Palette search~~ **DONE 2026-08-17**     | ~~4 title queries per layout render~~           | **Cached per organization** (`lib/cache.ts` + `lib/data/palette.ts`, 60s TTL). Measured 251ms p50 of round-trip that every navigation paid to populate a palette most users never open. Sharing one entry between members is sound only because all four policies reduce to org-wide `content.view_draft`; that equivalence is pinned by a real-DB test, not asserted in a comment.                                                                                                                                                                         |
| ~~Nova report~~ **DONE 2026-08-17**        | ~~≈14 queries, uncached~~                       | **Cached per (organization, membership, learner-flag)**, 60s TTL. Deliberately NOT org-keyed: `enrollments`, `assessment_attempts`, and `organization_memberships` each read `<privileged permission> OR the row is mine`, so an org-wide entry would have leaked one member's rows to another. Narrower hit rate, correct by construction.                                                                                                                                                                                                                 |
| ~~Lesson word counts~~ **DONE 2026-08-18** | ~~per-render block scans~~                      | **Persisted** as a generated `content_blocks.word_count` column (migration 20260818025504), aggregated by `org_lesson_word_counts`. The terminology-drift scan, the other reader of that fan-out, moved to `org_lesson_term_usage` (20260818025724) — otherwise the JSONB payload and its silent `.limit(5000)` truncation would have stayed. Nova no longer reads block content at all.                                                                                                                                                                    |

Sequencing rule: rollups first (they unblock everything), pagination
second, caching third. Each step lands behind existing test contracts.
**Every row in this table is now closed.** What remains are the standing
decisions below, not outstanding work.

Three of the four turned out to be correctness fixes wearing performance
costumes: analytics counts, admin lists, and lesson word counts were each
silently truncated at a `limit()`, reporting confident numbers computed from
an arbitrary subset. That pattern is the thing to watch for next, not slow
queries.

## Derived values in Postgres: the two hazards

`content_blocks.word_count` is a STORED generated column, which is why the
count is right for every write path — the editor, the Studio library, AI
authoring, seeds, and manual SQL alike — rather than only the ones the app
remembers to update. Two things to know before adding another one.

**A generated column does not recompute when you change its function.**
`create or replace` on `app.count_content_words` leaves every existing row
holding the value computed by the old definition. Nothing warns you. If the
rule ever changes, the migration must also touch the rows — an
`update content_blocks set data = data` forces re-evaluation — in the same
migration, not a follow-up.

**Two implementations of one rule will drift unless a test says otherwise.**
The rule lives in TypeScript (`countContentWords`, which sizes the lesson in
front of an author) and in SQL (`app.count_content_words`, which feeds Nova).
They must agree, or the editor and the intelligence layer report different
sizes for the same lesson. They already disagreed once by construction:
Postgres's `\s` splits on U+0085 where JavaScript's does not, and
JavaScript's splits on U+FEFF where Postgres's does not — so the SQL side
spells the whitespace class out literally instead of using `\s`, which also
stops the count depending on server collation. `word-count-equivalence.test.ts`
compares the two over every real block; it is what makes the mirroring safe
rather than merely intended.

## Caching: the rule, and why it is not `use cache`

Next 16 offers `use cache`, and this codebase does not use it. That is a
decision, not an oversight. `use cache` cannot read `cookies()`, and every
read here builds its Supabase client from the session cookie so Postgres can
enforce RLS as the calling user. Adopting it would mean either enabling
Cache Components app-wide — a prerendering-model change across every route
and GET route handler, on a **forked** framework — or fetching with a
non-session client, which bypasses RLS, the platform's primary isolation
guarantee. Neither belongs in a caching change. `lib/cache.ts` therefore
sits above the normal RLS-enforced read path and never changes how a row is
fetched.

Adopting Cache Components remains a legitimate future move, but it is a
framework migration with its own verification burden, not a performance
tweak. Note also that `unstable_cache` is deprecated in favour of
`use cache`, so it is not an escape hatch.

**The rule for caching anything new.** A cached value is served to another
request, and possibly another user. That is sound only when the key contains
everything the RLS result depends on. For every table a loader touches, read
its SELECT policy and ask what makes the row set vary:

- depends only on the organization → `organizationId` suffices;
- depends on a permission → that permission belongs in the key, or the
  loader must only ever run for holders;
- has an "or the row is mine" clause → identity belongs in the key.

That last case is the one that bites. It is why Nova is keyed per member
while the palette is keyed per organization, and the difference between the
two is a real leak rather than a stylistic choice.

Caching is per-instance and best-effort: on serverless each instance keeps
its own map, so real-world savings are lower than a shared cache would give.
Correctness never depends on a hit. A distributed cache is deliberately out
of scope until measurements justify the operational cost.

One collection was deliberately left unpaginated: learning paths. It carries
no `limit()` to truncate, its cardinality is bounded by how many journeys an
organization actually runs, and its rows are rendered grouped under their
parent systems — paging would cut a hierarchy in half. Revisit only if a real
tenant's path count grows past a screenful.

## Paginating a collection (the recipe)

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

**The trap: derived stats must not become page-scoped.** Anything computed
from the fetched array — a header count, a "12 published · 4 draft" summary,
an onboarding signal — silently starts describing 25 rows instead of the
collection the moment you add `.range()`. It still renders, and it is wrong.
Take those numbers from `{ count: "exact" }` or a dedicated `head: true`
count query instead. Two live examples: `courses` counts published via a
second head-count query and feeds `tourState` the total, not the slice;
`members` counts other members with its own filtered count query.

Reference implementations: `admin/credentials/page.tsx` (sibling-list `param`),
`admin/courses/page.tsx` (derived stats done right), `admin/ops/page.tsx`
(paging a _filtered_ set, so the total honours the filters).

Deliberately out of scope until a real workload demands them: multi-region,
read replicas, queue-based fan-out. No speculative infrastructure.

# SCALABILITY_PLAN

Honest position (maturity audit, 2026-08-01): correct-by-construction, not
yet scaled-by-construction. What scales now: the multi-tenant schema, RLS,
immutable versions, the outbox, permission resolution. What does not:

| Bottleneck         | Present shape                               | Planned shape                                                                                                          |
| ------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Analytics reads    | 2k–5k raw events per render, JS aggregation | SQL aggregates / scheduled rollup tables; the pure engines (ops/nova unit tests) define contracts that must not change |
| Admin lists        | `limit()` truncation, no paging             | keyset pagination on every collection                                                                                  |
| Palette search     | 4 title queries per layout render           | cached / materialized per-org search index                                                                             |
| Nova report        | ~14 queries, uncached                       | request-level cache → short-TTL per-org cache                                                                          |
| Lesson word counts | per-render block scans                      | persisted per-lesson stats, updated on save                                                                            |

Sequencing rule: rollups first (they unblock everything), pagination
second, caching third. Each step lands behind existing test contracts.

Deliberately out of scope until a real workload demands them: multi-region,
read replicas, queue-based fan-out. No speculative infrastructure.

# Analytics and Events

A clean event foundation — not a warehouse. Events are the system of record
for _what happened_; `progress_records` and friends remain the system of
record for _current state_.

## 1. Questions this design must eventually answer

Where learners stop; what content is ignored; what causes confusion; which
assessments produce failure; which competencies are weak; how long learning
takes; whether interventions work; which content versions perform better;
whether learners apply knowledge; how organizational readiness changes.

Every taxonomy choice below traces to one of these.

## 2. Event envelope (versioned, frozen shape)

```ts
{
  id: string;              // UUIDv7 — also the global ordering hint
  v: 1;                    // envelope version
  type: string;            // taxonomy: <domain>.<subject>.<verb-past>
  occurred_at: string;     // when it happened (client/system clock, ISO)
  received_at: string;     // when the platform recorded it (server clock)
  organization_id: string; // tenant scope — REQUIRED on every event
  actor: { kind: "user" | "system" | "ai" | "integration"; id: string | null };
  subject: { kind: string; id: string };          // what it happened to
  context: {               // resolution chain for slicing, all optional
    academy_id?, learning_system_id?, learning_path_id?, path_node_id?,
    course_id?, course_version_id?, module_id?, lesson_id?,
    lesson_version_id?, block_id?, enrollment_id?, assessment_version_id?,
    attempt_id?, session_id?
  };
  data: object;            // event-type-specific payload, schema-validated
  idempotency_key: string; // unique — dedupe on ingest
}
```

- **Version ids in context are mandatory where applicable** —
  "which content version performs better" is unanswerable without them.
- `data` payloads are schema-validated per `(type, version)` in the domain
  registry — the no-dumping-ground rule applies to events too.
- Envelope changes bump `v`; readers support all versions (append-only log
  is never rewritten).

## 3. Taxonomy (initial registered set)

`<domain>.<subject>.<verb-past>`, additive-only registry.

| Domain                | Phase 1C–1D events                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enrollment`          | `enrollment.learner.enrolled`, `.withdrawn`, `.completed`                                                                                                         |
| `learning`            | `learning.lesson.started`, `.completed`, `learning.block.viewed`*, `learning.block.interacted`, `learning.course.started`, `.completed`, `learning.node.unlocked` |
| `assessment`          | `assessment.attempt.started`, `.submitted`, `.graded`, `.passed`, `.failed`, `assessment.item.answered`                                                           |
| `credential`          | `credential.certificate.issued`, `.revoked`                                                                                                                       |
| `member`              | `member.membership.created`, `.suspended`, role assignment events                                                                                                 |
| `content` (authoring) | `content.lesson.published`, `content.course.published`, `.archived`                                                                                               |

Later domains: `rules.*` (evaluations, outcomes), `ai.*` (generations,
conversations, ratings), `integration.*` (external events in/out),
`competency.*`.

\* `learning.block.viewed` fires on **meaningful visibility** (intersection
threshold + dwell), throttled per (session, block) — this powers
"what content is ignored / where learners stop" without drowning ingest.
Confusion signals come from `block.interacted` payloads (repeated knowledge-
check failures, replays, tutor asks in Phase 3), not from raw scroll spam.

## 4. Ingest and storage

- **Phase 1 storage**: `analytics_events` append-only Postgres table.
  UUIDv7 PK; indexed on `(organization_id, type, occurred_at)` and
  `(organization_id, subject.kind, subject.id)`; monthly partitioning
  planned from day one (declarative partitioning by `occurred_at`) so
  growth never forces a migration crisis.
- **Write paths**: server-emitted events (authoritative: completions,
  grades, publishes) are written transactionally-adjacent to their state
  change (transactional outbox pattern — state change and event commit
  together; async fan-out reads the outbox). Client-emitted telemetry
  (views, interactions) posts to a batch endpoint → validated → deduped
  (`idempotency_key`) → inserted. Client events are advisory; nothing
  authoritative ever originates client-side.
- **Audit logs are separate** (`audit_logs`): different sensitivity,
  retention, and access (see tenancy doc). Analytics never absorbs audit.

## 5. Derived analytics

- Phase 1: direct SQL over events for simple admin views (enrollment counts,
  completion funnels per course version).
- Phase 3: scheduled aggregates (materialized views / summary tables):
  funnel-by-version, drop-off maps per lesson, item-difficulty stats,
  time-to-complete distributions, cohort comparisons, intervention deltas.
  Aggregates are rebuildable from the log — they are caches, never truth.
- Phase 4: optional export/stream to tenant warehouses (see §8).

## 6. Privacy and access

- Events inherit tenant isolation (org_id + RLS) and analytics access
  requires `analytics.view` — scoped by academy for scoped roles.
- **Aggregate-first surfaces**: observers/managers see aggregates;
  learner-identifiable drill-down requires `progress.view.others`;
  raw response content additionally `assessment.grade`.
- Small-cohort suppression (n < 5) on comparative views to prevent
  deanonymization — enforced in the query layer (Phase 3 dashboards).
- Learner-visible transparency page: what is collected and why (Phase 2).

## 7. Retention

- Platform default: raw events 24 months, then aggregate-and-prune (tenant
  configurable within platform bounds; compliance-mode tenants may extend —
  Phase 4 contract concern). Audit logs: 7 years, non-configurable floor.
- Erasure requests: actor/subject pseudonymization in place (id →
  tombstone), aggregates unaffected; events are never deleted wholesale.

## 8. Export and future warehouse

- Phase 3: org-scoped CSV/JSON export of events + aggregates
  (`data.export` permission, audited).
- Phase 4: outbound stream (webhook batch or object-storage drops) to
  tenant warehouses. The envelope above is designed to be
  warehouse-friendly now (flat, versioned, typed) precisely so this phase
  is a transport problem, not a remodel.

## 9. Explicitly not now

No general BI tool, no per-tenant dashboards builder, no third-party
analytics SDK embedded in the learner surface, no cross-tenant benchmarking
(privacy + positioning decision — recorded in risks R-10).

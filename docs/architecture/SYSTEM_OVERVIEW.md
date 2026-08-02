# SYSTEM_OVERVIEW

NovaKore is a multi-tenant operating system for organizational knowledge:
organizations build, govern, deliver, and understand institutional knowledge
on one shared platform that reflects each tenant's identity.

## Topology

- **apps/web** — Next.js (modified fork, App Router) serving all tenant
  surfaces: admin workspace, Studio (Knowledge IDE), learner Academy,
  Intelligence, Organization Hub, public `/verify`.
- **packages/domain** — pure domain: block schemas, permission catalog,
  BFH contract, rules. No I/O; the largest test surface.
- **packages/database** — env validation, client factories, generated DB
  types, the real-DB (RLS) test suite.
- **packages/authorization** — pure permission resolution, deny-by-default.
- **packages/design-system** — brand tokens, parity-tested against CSS.
- **Supabase** — Postgres (+RLS, `app` internal schema, SECURITY DEFINER
  RPCs), Auth, Storage, Edge Functions (`bfh-handoff`, `webhook-worker`),
  pg_cron outbox schedule.

## Load-bearing invariants

1. Authorization lives in three enforced layers: RLS (database), `can()`
   (server), `needsAny` (affordance only). See PERMISSION_MODEL.md.
2. Published versions are immutable, forever (versioning-and-publishing.md).
3. Events are facts: the analytics log + transactional outbox are the only
   sources of activity truth (EVENT_ARCHITECTURE.md).
4. Intelligence is derivation, never invention (INTELLIGENCE_ENGINE.md).
5. Tenant identity personalizes; platform structure stays shared
   (TENANT_MODEL.md).

Deep dives: entity-model.md, tenancy-and-authorization.md,
ui-architecture.md, data-access-layer.md, and the per-module as-built docs
in this directory.

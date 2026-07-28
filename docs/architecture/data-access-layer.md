# Data Access Layer (D-08)

Resolves owner decision **D-08**. ADR-016 records the decision.

## 1. Decision

Remain on the Phase 1A stack, formalized:

- `supabase-js` with generated database types (`@novakore/database`)
- Explicit server-side data-access modules by domain where they improve
  clarity (`apps/web/src/lib/data/*`), not a generic repository
  abstraction
- Domain validation (zod, `@novakore/domain` + `lib/validation`)
- Existing `can()` authorization (`@novakore/authorization`)
- RLS as the non-negotiable security boundary

**Not introduced:** Prisma, Drizzle, any ORM, GraphQL, or generic
repository indirection. Rationale: the platform's correctness posture is
RLS + explicit SQL-shaped queries; an ORM adds a translation layer that
obscures exactly the thing we audit. Revisit only with concrete evidence
(query duplication, migration pain), recorded as a superseding ADR.

## 2. The mutating-path contract (normative)

Every mutation, no exceptions:

1. **Input validation** — zod schema, server-side (client validation is
   advisory UX only).
2. **Authentication** — `requireUser()`.
3. **Organization context resolution** — `requireOrgContext(slug)`
   (membership-anchored at the database).
4. **`can()` authorization** — deny by default, academy scope aware.
5. **Database operation** — user-session client.
6. **RLS enforcement** — underneath everything, always.
7. **Audit logging** — via database triggers/definer functions where the
   action is material (Phase 1A audit model).
8. **Typed result handling** — generated types end-to-end.
9. **Safe error translation** — `dbErrorMessage()`; internals never reach
   the UI.

## 3. Module layout

- `apps/web/src/lib/data/branding.ts` — brand/theme + asset queries
  (Phase 1B). Subsequent domains (content, enrollment) add sibling
  modules per phase.
- Server actions stay thin: validate → authorize → call data module →
  translate result.
- Read paths used by multiple pages belong in data modules; one-off page
  queries may stay colocated until shared.

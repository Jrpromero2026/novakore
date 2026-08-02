# TENANT_MODEL

One deployment, many owners. Every tenant-scoped table carries
`organization_id`; isolation is enforced by RLS (119 policies, exercised by
the live-DB test suite), never by application discipline alone.

## The tenant stack

| Layer      | Mechanism                                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| Data       | `organization_id` + RLS on every tenant table                                                                        |
| Membership | `organization_memberships` (invited/active/suspended/removed)                                                        |
| Authority  | system + custom roles → 32-permission catalog (deny-by-default)                                                      |
| Identity   | branding themes (draft/publish), terminology overlay, `settings.identity` jsonb (mission/values/voice)               |
| Structure  | academies (multi-academy is native), journeys, courses                                                               |
| Operations | platform-admin-only RPCs: `provision_organization` (since Phase 1A), `set_organization_status`, `tenant_diagnostics` |

## Rules

- The platform brand never floods tenant surfaces; the tenant accent and
  vocabulary carry identity (docs/brand + experience-design-system.md).
- Cross-tenant reads are impossible by construction, not by convention.
- `archived` status is intentionally unreachable from operator tooling —
  destructive intent requires the runbook, not an RPC.
- Expansion path: cross-org sharing/templates/marketplace build on academies
  - the permission catalog; nothing in the current model forecloses them.

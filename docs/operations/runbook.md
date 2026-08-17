# NovaKore Operations Runbook

For any engineer operating NovaKore. Companion docs:
[production-setup.md](production-setup.md) (creating the prod environment),
docs/architecture/DEPLOYMENT_ARCHITECTURE.md,
docs/architecture/V1_EXIT_CRITERIA.md, docs/releases/internal-alpha.md
(alpha-specific operations).

## Deploy

1. Work lands on `main` only through a green verify run (CI enforces the
   same gate: format/lint/typecheck/tests/build).
2. `git push origin main` → Vercel builds and deploys automatically.
   `scripts/env-check.mjs` runs as `prebuild` and **fails closed** on any
   environment mismatch.
3. Post-deploy check: `curl https://novakore.vercel.app/api/health` →
   expect `200 {"ok":true,...}` with the new commit sha in `version`.

## Rollback

- **App**: Vercel dashboard → Deployments → previous deployment →
  "Promote to Production" (or `git revert <sha> && git push`). Surfaces are
  stateless; no data migration accompanies UI commits.
- **Schema**: migrations are forward-only. To undo, write a new inverse
  migration (see Migration process). Never edit or delete an applied
  migration file. Content is safe by design: published versions are
  immutable; archive rather than delete.

## Migration process

1. Apply to the dev project first via the Supabase MCP/`apply_migration`.
2. Mirror the SQL into `supabase/migrations/<remote-version>_<name>.sql`
   (version from `list_migrations` — file and remote must match).
3. Run the real-DB suite; regenerate types (`npm run db:types`) when the
   schema surface changed.
4. Promotion to prod (once it exists): `supabase db push` against the prod
   ref from a clean `main` — never hand-applied SQL.
5. Destructive statements (DROP/ALTER…DROP) require a second reviewer and
   an explicit note in the migration header. Operator RPCs deliberately
   cannot archive an organization — that intent goes through this runbook.

## Secrets

| Secret                                          | Lives in                                                              | Rotation                                                                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Supabase anon key                               | Vercel env + `.env.local` + CI secret                                 | Supabase dashboard → rotate → update all three                                                                      |
| Service-role key                                | **Owner only** — never in repo, Vercel, or CI                         | Supabase dashboard                                                                                                  |
| BFH handoff HMAC (`app.bfh_integration_config`) | Database only (never leaves Postgres)                                 | Update row via secure SQL; coordinate with BFH                                                                      |
| Per-org `/v1` API keys                          | Hashed in DB; plaintext held by the caller                            | Issue new, revoke old (`organization_api_keys`)                                                                     |
| Webhook endpoint secrets                        | DB (per endpoint)                                                     | Rotate per endpoint; receivers verify both during overlap                                                           |
| Dev fixture account password                    | `.env.test.local` → `NOVAKORE_TEST_PASSWORD` (gitignored) + CI secret | SQL update over `auth.users where email like '%@novakore.test'`; update the env file + CI secret in the same change |

Rules: no plaintext secrets in git, logs, or error messages; seed contains
dev-only placeholder values (labeled DO-NOT-USE-IN-PROD); rotation of the
seeded dev values is config, never a history rewrite.

## Incident response

1. **Detect**: `/api/health` 503, Vercel deploy failure, Supabase logs
   (dashboard or MCP `get_logs`), or user report via the Feedback widget.
2. **Classify**: P0 = data integrity / cross-tenant exposure / platform
   down. P1 = a core flow broken with no workaround. Else P2/P3.
3. **Stabilize first**: app issues → roll back the deployment; data issues
   → suspend the affected tenant (`set_organization_status`) before
   touching data.
4. **Diagnose**: `tenant_diagnostics(org_id)` for tenant state; audit_logs
   - analytics_events for what happened (they are immutable facts).
5. **Record**: every P0/P1 gets a short postmortem note in
   docs/operations/incidents/ (date, impact, cause, fix, prevention).

## Backups & recovery — ⚠ partially NOT VERIFIED

- Supabase provides daily automated backups on paid plans (dashboard →
  Database → Backups). **Restore has never been drilled on this project.**
- Required before onboarding paying orgs (V1 exit criteria): perform one
  full restore drill onto a scratch project and record evidence + timing
  here. Target objectives (proposed, unratified): RPO 24h, RTO 4h.
- What IS verified: the migration history + deterministic seed rebuild an
  empty, working platform from zero (rollback-validated in the alpha gate).

## CI (one-time owner setup)

1. GitHub → Settings → Secrets → Actions: add
   `NOVAKORE_TEST_SUPABASE_URL`, `NOVAKORE_TEST_SUPABASE_ANON_KEY`, and
   `NOVAKORE_TEST_PASSWORD` (all three values are in `.env.test.local`).
   Without the password secret the real-DB job authenticates with the public
   bootstrap literal and will fail against a rotated database.
2. Settings → Branches → add protection for `main`: require the `verify`
   status check, require PRs (optional but recommended once >1 committer).
3. Known flake mode: the real-DB suite signs in ~30 accounts; two runs
   within ~a minute can trip Supabase auth rate limits (beforeAll failures,
   mass skips). Space reruns out — a clean run passes every test.

## Release checklist

- [ ] CI green on the release commit (all jobs, including real-DB).
- [ ] `npm run verify` green locally; standalone build exit 0.
- [ ] New migrations mirrored + applied; types regenerated if needed.
- [ ] `/api/health` returns 200 post-deploy with the new sha.
- [ ] `npm run test:e2e` green (browser happy path: anonymous refusal →
      sign-in → Command Center → Studio → Knowledge IDE → Intelligence →
      learner Academy → public verification). Needs `NOVAKORE_TEST_PASSWORD`;
      skips loudly without it.
- [ ] docs/architecture/V1_EXIT_CRITERIA.md statuses still truthful.
- [ ] No new advisor ERRORs (`get_advisors`), no new high-severity
      `npm audit --omit=dev` findings beyond the accepted list.

## New engineer onboarding

1. Read docs/architecture/SYSTEM_OVERVIEW.md → TENANT_MODEL.md →
   PERMISSION_MODEL.md, then docs/design/experience-design-system.md.
2. `npm install`; copy `apps/web/.env.example` → `.env.local` (values from
   the owner); `.env.test.local` for the real-DB suite.
3. `npm run verify` must pass before your first change.
4. Conventions that will surprise you: the Next.js fork (read
   `node_modules/next/dist/docs/` before writing routes/layouts), the
   setState-in-effect lint ban, MCP-first migrations, and the honesty rule —
   nothing user-facing may claim what the database cannot prove.

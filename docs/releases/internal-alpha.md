# Built For Her Academy — Internal Alpha Operations

The runbook for operating the Built For Her Academy internal alpha on the
`bfh-dev` tenant (`novakore-dev`). Dev only — no production project, no BFH
production connection. Pairs with the RC-1 packet
([bfh-academy-rc1.md](bfh-academy-rc1.md)), the curriculum
([member-curriculum.md](../integrations/built-for-her/member-curriculum.md)),
the alpha validation
([phase-alpha-validation.md](../integrations/built-for-her/phase-alpha-validation.md)),
and the QA checklist ([alpha-regression-checklist.md](../qa/alpha-regression-checklist.md)).

## What's operational (this phase)

- **In-app feedback** — a widget on the member + admin shells; testers pick a
  category (bug / usability / confusion / suggestion / feature) and type. The
  app auto-captures route, browser/device, role hint, and any lesson/course/
  assessment id in the URL, plus a timestamp. RLS scopes each insert to the
  submitter's own membership.
- **Feedback review** — Admin → **Operations**: status, severity, category,
  assignee, notes, resolution, search, and filters.
- **Observability** — real activity from the analytics event log (active
  learners, enrollments, lessons started/completed, programs/journeys
  completed, evaluations passed/failed, credentials issued, feedback by
  status, and lesson drop-off). No fabricated metrics.
- **Tester cohorts** — members labelled Internal Alpha / Founder / Coach /
  Staff; dashboards filter by cohort.
- **Mapping revocation** — an external identity can be `active` or `revoked`
  (`bfh_set_external_identity_status`, `integrations.manage`, audited); a
  revoked mapping cannot SSO or be enrolled/assigned, without touching the
  person's NovaKore account.

## Tester onboarding

1. Ensure the tester has a NovaKore user in `bfh-dev` (seeded fixtures exist;
   real handoff comes via the `/v1` identity flow — deferred for alpha).
2. Label them: Admin → Operations → Tester cohorts (or seed a
   `tester_labels` row). Use `internal_alpha` for external testers,
   `founder`/`staff` for internal, `coach` for coaches.
3. Send them: the sign-in URL, their credentials, the member/coach test
   script (RC-1 packet), and "use the Feedback button early and often."
4. Confirm they land on `/bfh-dev/learn` and see their assigned Journey.

## How to reset a tester

- **Re-run a Journey:** withdraw the enrollment and re-assign via the `/v1`
  assignment API (or admin enrollments surface). Progress is per-enrollment.
- **Clear progress only:** delete the tester's `progress_records` for the
  enrollment (dev only).
- **Full reset:** re-seed the tester's identity/enrollment; the curriculum
  and tenant are unaffected.

## How to reproduce bugs

1. Open the feedback item in Operations — it carries the exact **route**,
   **device/userAgent**, **role**, and any **lesson/course/assessment id**.
2. Sign in as the same cohort/role and navigate to that route.
3. For data issues, query `novakore-dev` scoped to `bfh-dev`
   (`organization_id = …102`).

## How to collect logs

- **App/build:** dev-server console and `npm run build` output.
- **Edge Functions:** Supabase dashboard → Edge Functions → logs
  (`bfh-handoff`, `webhook-worker`).
- **Postgres/API/Auth:** Supabase dashboard logs (or the MCP `get_logs`).
- **Activity:** the `analytics_events` log is the source of truth for what a
  user did and when.

## How to archive resolved issues

- Set a feedback item's **status = resolved** with a **resolution** note.
- Periodically set long-resolved items to **archived** to keep the queue
  clean; archived items stay queryable and drop out of the default view.

## Triage workflow

`new → triaged → in_progress → resolved → archived`

1. **Daily:** review `new`. Set severity (blocker / major / minor /
   cosmetic) and category; add an assignee + note; move to `triaged`.
2. **Blockers** are fixed first; majors next; batch minors/cosmetics.
3. On fix: `resolved` + resolution note. Weekly: archive resolved.
4. Watch the **drop-off** panel — a spike of confusion feedback on one lesson
   is a content signal, not just a bug.

## Release checklist

- [ ] `npm run verify` green; `npm run build` succeeds.
- [ ] Alpha regression checklist passed in a standard browser.
- [ ] Migrations applied to the target dev project.
- [ ] `bfh-handoff` + `webhook-worker` Edge Functions ACTIVE; worker
      scheduled; leaked-password protection ON.
- [ ] `NOVAKORE_SITE_URL` set for `bfh-handoff` to the alpha host.
- [ ] Feedback widget visible on member + admin shells.

## Rollback checklist

- **App:** redeploy the previous commit (surfaces are stateless; no data
  migration to reverse for RC-1/RC-2/ops UI changes).
- **Schema:** the alpha-ops migration only ADDS `feedback` + `tester_labels`
  (+ policies). To roll back, drop those two tables; nothing else depends on
  them. Content migrations only add rows.
- **Content:** archive a Program/course rather than deleting; published
  versions are immutable by design.
- Never point at production; there is no production project.

## Known limitations (alpha)

- Interactive UI QA is manual (see the checklist); the embedded dev browser
  can't complete the SSO cookie round-trip.
- Screenshots in feedback are not captured (text + auto-context only).
- Feedback has no delete (archive instead) and no email notifications.
- Outbound webhook delivery to a real BFH receiver + auto credential-issue on
  final evaluation remain owner/Phase-follow-up items.
- Reflection blocks do not store learner input yet.

## Success metrics (what to watch)

- **Activation:** % of invited testers who start a lesson (event log).
- **Progression:** lessons started → completed; Journey completion.
- **Assessment:** evaluation pass rate; retakes.
- **Content signal:** drop-off by lesson; confusion feedback by lesson.
- **Feedback health:** volume by category/severity; time-to-triage;
  time-to-resolve; blocker count trending to zero.
- **Qualitative:** "premium feel" 1–5 and one-sentence takeaways from the
  RC-1 feedback template.

---

# Final handoff

## SSO setup (dev)

1. Deploy is done: `bfh-handoff` Edge Function is ACTIVE (`verify_jwt=false`);
   it verifies the BFH HMAC + timing + nonce in-DB and mints a one-time
   NovaKore magic link into `/auth/callback`.
2. Set `NOVAKORE_SITE_URL` on the `bfh-handoff` function to the alpha host
   (default `http://localhost:3000`) so the deep link lands correctly.
3. Provision the per-org secrets via the secure process (NOT committed):
   `app.bfh_integration_config.handoff_secret` (per-org HMAC secret) and
   `app.organization_api_keys` (hashed `/v1` key). Dev values live in
   `.env.test.local` for the simulator.
4. Smoke-test:
   `node scripts/bfh-alpha-simulator.mjs handoff bfh-member-alpha bfh.member@novakore.test member member`
   → expect `linked` + an action link.

## Required environment variables

| Where            | Var                                                          | Purpose                               |
| ---------------- | ------------------------------------------------------------ | ------------------------------------- |
| App              | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | app + `/v1` client                    |
| App              | `NEXT_PUBLIC_SITE_URL`                                       | auth redirects                        |
| `bfh-handoff` EF | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`                 | injected by Supabase                  |
| `bfh-handoff` EF | `NOVAKORE_SITE_URL`                                          | deep-link host                        |
| Simulator (dev)  | `BFH_HANDOFF_SECRET`, `BFH_API_KEY`                          | in `.env.test.local`, never committed |

No secrets are committed to the repo or the seed.

## Cohort assignment

Admin → **Operations → Tester cohorts** shows labelled members. Label a member
by inserting a `tester_labels` row (Internal Alpha / Founder / Coach / Staff)
— dev fixtures are seeded. Dashboards filter by cohort via the chips at the top
of Operations.

## Member test script

1. Sign in as `bfh.member@novakore.test`; land on the Academy home.
2. Use **Continue learning** to open _Strong Foundations_.
3. Work through the Programs: read a lesson, flip a flashcard, answer a
   knowledge check, read a comparison + callouts, complete each lesson.
4. Take a Program Check evaluation; then the final _Strong Foundations — Final
   Check_.
5. Confirm the credential appears on the home; open **Verify**.
6. Try `/bfh-dev/admin` and any coach content — confirm you cannot reach them.
7. Use **Feedback** at least twice (different categories).

## Coach test script

1. Sign in as `bfh.coach@novakore.test`; confirm the **Coach Certification**
   Journey shows (not member content).
2. Complete a coach lesson + an Evaluation.
3. Submit feedback.
4. (If given admin) as `bfh.owner@novakore.test`: assign a Journey, review
   learner progress, review an Evaluation, view credentials.

## Admin test script

1. Sign in as `bfh.owner@novakore.test`; open **Operations**.
2. Confirm metrics populate and match real activity; check drop-off.
3. Filter feedback by status/category/severity; search a message.
4. Triage an item: set status, severity, assignee, notes, resolution; save.
5. Filter metrics by a cohort chip.
6. Confirm a member/coach cannot reach Operations.

## Daily operating checklist

- [ ] Review new feedback; triage blockers first (severity + assignee).
- [ ] Scan Operations metrics: activation, completion, drop-off spikes.
- [ ] Fix or ticket blockers/majors; batch minors.
- [ ] Reply to testers where useful; keep momentum.
- [ ] End of day: no untriaged blocker older than 24h.

## Bug-severity definitions

- **Blocker** — prevents core use (cannot sign in, open the Academy, complete
  a lesson/evaluation, or a security/authorization/data-integrity failure).
- **Major** — materially degrades the alpha (a broken flow with no workaround,
  wrong content shown, a real accessibility barrier).
- **Minor** — noticeable but has a workaround; does not block progress.
- **Cosmetic** — visual/wording nit with no functional impact.

Fix Blockers + Majors (and any confirmed security/authz/data/a11y defect)
before/inside the alpha; backlog Minor + Cosmetic.

## Support owner

Repository owner (JR) is the alpha support + triage owner. Route blockers to
the owner; testers use the in-app **Feedback** widget as the primary channel.

## Alpha start checklist

- [ ] `main` is green (`npm run verify`; production build exit 0).
- [ ] Migrations applied; `bfh-handoff` + `webhook-worker` ACTIVE; worker
      scheduled; leaked-password protection ON.
- [ ] `NOVAKORE_SITE_URL` + per-org secrets provisioned (secure process).
- [ ] Standard-browser regression checklist passed; evidence stored.
- [ ] Testers labelled into cohorts; test scripts + tester guide sent.
- [ ] Feedback widget visible on member + admin shells.

## Alpha completion criteria

- [ ] Every invited tester completed the member script (and coaches the coach
      script) at least once.
- [ ] Zero open Blockers; all Majors resolved or explicitly accepted.
- [ ] Drop-off + confusion feedback reviewed per lesson; content issues
      ticketed.
- [ ] "Premium feel" median ≥ 4/5.
- [ ] Go/No-Go decision recorded for the next stage (beta).

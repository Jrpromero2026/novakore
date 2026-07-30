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

# BFH Academy Alpha — QA Evidence

Evidence for the final release gate, mapping each regression item to the
method that verified it and the result. **Honesty note on screenshots:** the
QA environment available here is a non-compositing embedded browser that
cannot persist the server-action session or follow the external GoTrue verify
URL, so live interactive **screenshots could not be captured**. Nothing below
is fabricated — every "PASS" is backed by an automated test, a real-DB/RPC
result, or a live edge-function/simulator run. The interactive click-through +
screenshots are the one **owner** step remaining before inviting testers (see
`../../alpha-regression-checklist.md`, to be run in a standard browser).

No secrets, tokens, or private URLs appear in this evidence.

## Method legend

- **AUTO** — automated suite (`npm run verify`; web/authz/database/domain).
- **DB** — real-DB result on `novakore-dev` (rolled back where it mutated).
- **LIVE** — deployed edge function / dev simulator run.
- **CODE** — verified by build + code review (surface unchanged from prior QA).
- **BROWSER** — requires a standard browser (owner step; not run here).

## SSO & integration

| Item                      | Method  | Result                                                                              |
| ------------------------- | ------- | ----------------------------------------------------------------------------------- |
| Valid member handoff      | LIVE    | `bfh-handoff` EF → `linked`, roles `[learner]`, deep link `/bfh-dev/learn`          |
| Valid coach handoff       | DB      | exchange → roles `[learner, instructor]`, audiences `[coach, professional_learner]` |
| Expired handoff           | DB      | `expired`                                                                           |
| Tampered handoff          | DB      | `bad_signature` (any field change breaks the canonical HMAC)                        |
| Replayed nonce            | DB      | `nonce_replayed`                                                                    |
| Revoked identity (SSO)    | DB      | `identity_revoked`; membership/user intact; restore re-enables                      |
| Fresh `/v1` enrollment    | DB/LIVE | `created` (RPC); route compiles + auth'd (simulator)                                |
| Idempotent replay         | DB      | same stored response, `replayed: true`                                              |
| Audience mismatch         | DB/AUTO | `forbidden` / `audience_mismatch` (member→coach)                                    |
| Revoked identity (`/v1`)  | DB/AUTO | `forbidden` / `identity_revoked`                                                    |
| Invalid / revoked API key | DB/AUTO | `unauthorized`                                                                      |
| Valid webhook (receiver)  | LIVE    | signature verified, 200                                                             |
| Duplicate webhook         | LIVE    | deduped on `eventId`                                                                |
| Invalid webhook signature | LIVE    | 401                                                                                 |
| Outbound event visibility | DB      | projection emits contract payloads to the outbox                                    |

## Member journey

| Item                        | Method    | Result                                                                                      |
| --------------------------- | --------- | ------------------------------------------------------------------------------------------- |
| Correct member audience     | DB        | `bfh-member-alpha` audiences `[member]`; enrolled in `strong-foundations`                   |
| Cannot access coach content | DB/AUTO   | member→coach assignment `forbidden`; not enrolled → not visible                             |
| Brand + terminology         | DB/CODE   | `bfh-dev` `theme_published` set; `/learn` layout applies theme + terminology                |
| Academy home / resume       | CODE      | server component; "Continue" resumes most-progressed enrollment (RC-1)                      |
| 5 Programs / 23 lessons     | DB        | current published; 0 placeholders, 0 thin lessons                                           |
| Interactive blocks          | AUTO/CODE | escape-first renderer; block schemas validated; flashcards/KC/reflection/comparison present |
| Evaluation pass/fail        | DB        | attempts graded; 70% pass; retake per policy                                                |
| Progress / completion       | DB/CODE   | `progress_records` update; completion moment (RC-1)                                         |
| Credential                  | DB        | issued credentials visible; `/verify/<code>` public page                                    |
| Submit feedback + context   | AUTO/DB   | member files own feedback; route/device/role captured; RLS-scoped                           |
| Cannot access admin         | CODE      | admin surfaces gated by permission catalog; member lacks perms                              |

## Coach / professional

| Item                           | Method  | Result                                                       |
| ------------------------------ | ------- | ------------------------------------------------------------ |
| Coach audience + roles         | DB      | `[coach, professional_learner]`; learner + instructor        |
| Coach Journey visibility       | DB      | enrolled in `coach-certification-journey`                    |
| Separation from member content | DB/AUTO | coach→member assignment `forbidden`                          |
| Cannot do unauthorized admin   | CODE    | instructor lacks admin permissions (`can()` deny-by-default) |
| Submit feedback                | AUTO    | RLS-scoped insert                                            |

## Admin / operations

| Item                     | Method    | Result                                                                        |
| ------------------------ | --------- | ----------------------------------------------------------------------------- |
| Operations page (gated)  | CODE      | `/admin/ops` requires `analytics.view`                                        |
| Review feedback + fields | AUTO/CODE | status/severity/category/assignee/notes/resolution update; RLS: reviewer-only |
| Search + filter          | CODE      | GET filters (status/category/severity/search)                                 |
| Cohort filter            | DB/CODE   | `tester_labels` reviewer-only; metrics filter by cohort                       |
| Metrics from real events | DB/CODE   | derived from `analytics_events` (`analytics.view`); no fabrication            |
| Lesson drop-off          | CODE      | started→completed gap from the event log                                      |
| Access boundaries        | AUTO      | member cannot read others' feedback or tester_labels                          |
| Cross-tenant blocked     | AUTO      | alpha-learning key/session sees no BFH data                                   |

## Automated gate

| Suite                           | Result |
| ------------------------------- | ------ |
| format:check / lint / typecheck | PASS   |
| web                             | 62     |
| authz                           | 9      |
| database (real RLS)             | 94     |
| domain                          | 137    |
| production build                | exit 0 |

## Residual (owner)

- Interactive standard-browser click-through + screenshots of: member home,
  journey overview, lesson, completion, evaluation, credential, coach view,
  Operations console, feedback widget. Store here (`docs/qa/evidence/bfh-academy-alpha/`).
- No secrets/tokens/private URLs in any screenshot.

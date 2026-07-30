# BFH Academy — Alpha Regression Checklist

Repeatable manual QA for the internal alpha. Run before each tester-facing
change. Dev tenant `bfh-dev`; seeded accounts share the dev password
(`docs/development/supabase.md#seeded-accounts`).

Fixtures: member `bfh.member@novakore.test` (Journey _Strong Foundations_),
coach/professional `bfh.coach@novakore.test` (_Coach Certification_), admin
`bfh.owner@novakore.test`.

## Member flow

- [ ] Sign in → land on the Academy home (`/bfh-dev/learn`).
- [ ] Home shows "Continue learning" and the Journey card grid (BFH brand).
- [ ] Open the Journey → progress bar + program list render.
- [ ] Open a lesson → all blocks render (rich text, callout, flashcards,
      knowledge check, comparison, reflection).
- [ ] Flashcards flip; knowledge check reveals correct answer + explanation.
- [ ] "Mark complete" → completion moment shows; progress persists on reload.
- [ ] Resume from the home returns to the in-progress Journey.

## Academy content

- [ ] All 5 Programs / 23 lessons open without error.
- [ ] Terminology reads Journey/Program/Phase/Evaluation/Credential.
- [ ] No placeholder or broken content.

## Evaluations

- [ ] Open an Evaluation (Training / Nutrition / Final Check).
- [ ] Submit → pass ≥70% → returns to lesson; lesson completes.
- [ ] Fail path allows retake per policy.

## Credentials

- [ ] Earned credential appears on the member home.
- [ ] "Verify" opens `/verify/<code>` and shows the public credential.

## SSO / identity

- [ ] `node scripts/bfh-alpha-simulator.mjs handoff bfh-member-alpha bfh.member@novakore.test member member`
      returns `linked` + a valid action link.
- [ ] Bad signature / expired / replayed nonce are rejected (see
      phase-alpha-validation.md matrix).

## Coach / professional flow

- [ ] Sign in as `bfh.coach@novakore.test` → sees the Coach Certification
      Journey, NOT member content.
- [ ] Complete a coach lesson + Evaluation.

## Admin flow

- [ ] Sign in as `bfh.owner@novakore.test` → admin nav shows **Operations**.
- [ ] Enrollments: assign a Journey to a learner.
- [ ] Reviews/Credentials surfaces load.
- [ ] Operations page: metrics populate from real activity; drop-off list;
      tester cohorts; feedback list with filters.

## Feedback

- [ ] Feedback widget appears on member + admin shells.
- [ ] Submit each category (bug / usability / confusion / suggestion /
      feature); confirmation shows.
- [ ] Item appears in Operations → Feedback for a reviewer.
- [ ] Reviewer can set status / severity / notes / resolution and save.
- [ ] A member cannot see other members' feedback or the Operations page.

## Access / isolation regression

- [ ] Member → coach content assignment is refused (`audience_mismatch`).
- [ ] Member cannot reach `/bfh-dev/admin/*`.
- [ ] Cross-tenant: an alpha-learning session sees no BFH data.

## Automated gate (must pass)

- [ ] `npm run verify` green (format, lint, typecheck, tests, build).
- [ ] `npm run build` succeeds.

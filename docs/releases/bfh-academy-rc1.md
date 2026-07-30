# Built For Her Academy — RC-1 (Internal Alpha)

Release candidate for the **internal alpha** of the Built For Her Academy,
running as the `bfh-dev` tenant on `novakore-dev`. Dev only — no BFH
production connection, no production Supabase project. This document is the
go/no-go packet for inviting internal testers.

> Scope note: RC-1 is an **experience-polish** release. No architecture,
> integration-contract, or NovaKore API changes were made. The underlying
> platform + BFH integration were validated separately in
> [phase-alpha-validation.md](../integrations/built-for-her/phase-alpha-validation.md).

---

## Executive summary

The Academy already sat on a clean, token-based design system and an
escape-first, keyboard-accessible content renderer — it was competent, but
read like a functional LMS rather than a premium consumer product. RC-1
sharpens the **member experience** where it is seen most: a "continue where
you left off" home, real progress visibility on the Journey overview, and a
rewarding (but restrained, reduced-motion-aware) lesson-completion moment.
Content is launch-quality (0 placeholders across the 6 member lessons).
The platform verification suite is green and the production build succeeds.

RC-1 is recommended **GO for internal alpha** with a small set of
non-blocking follow-ups (below), on the standing conditions from the alpha
validation (interactive UI walkthrough in a standard browser; live `/v1`
smoke test against a fresh server).

---

## Completed improvements

**Member home (`/{org}/learn`).** Rebuilt from a flat list into a premium
home: an "Academy / Welcome back" hero, a prominent **Continue learning**
card that resumes the most-progressed active Journey, a responsive
two-column card grid for Journeys/Programs (hover lift, focus ring, status
badge, real "N lessons done" momentum), a warmer empty state, and a
refined credentials section ("Verify ↗"). Real data only — no fabricated
percentages, streaks, or recommendations.

**Journey overview (`/{org}/learn/{enrollment}`).** Added a real progress
bar and "N of M complete" summary (completed programs ÷ total, with
`role="progressbar"` + aria values), a status glyph per node (✓ for
completed, index otherwise), refined breadcrumb, and focus-visible rings.

**Lesson completion (`lesson-actions`).** Replaced the plain "Completed ✓"
text with a restrained **completion moment** — a check badge that scales in
(`motion-reduce` disables it), an encouraging line, and a clear "Back to
overview" CTA. Only the fresh completion animates; revisits are static.

**Content.** All 6 member lessons reviewed — professional coaching voice,
BFH principles (progressive training, technique before load, consistency
over perfection, fuel/recovery, readiness-informs-adjustment), zero
placeholder wording.

**Consistency + a11y touches.** Focus-visible outlines on the new
interactive targets; progress bar and completion status use ARIA;
animations are `motion-reduce`-aware; all new styling uses existing design
tokens (no new colors/shadows invented — `shadow-raised`/`shadow-overlay`,
`accent`, `surface`, `border` families).

## Remaining issues (non-blocking)

- **Coach surfaces** were audited but not restyled in RC-1; they use the
  same refined primitives and are functional. A dedicated coach-dashboard
  polish pass (overdue indicators, saved filters, fewer clicks) is the top
  RC-2 candidate.
- **Two token vocabularies** coexist (`text-text*` in primitives vs.
  `text-text-primary`/`text-body`/`text-caption` in pages). Harmless
  (both resolve), but a one-time consolidation would tidy the system.
- **No true completion %** on the home cards (the per-enrollment total
  lesson count is not computed in the data layer). RC-1 shows honest
  counts instead; computing the denominator is a small, real enhancement.

## Known limitations

- No adaptive learning, AI tutor, competency tracking, streaks,
  recommendations, or estimated-completion — none are supported and none
  were fabricated (per scope).
- Interactive browser QA of the full member/coach walkthrough could not be
  completed in the embedded dev browser (no frame compositing, server-
  action session not persisted, external-nav to the GoTrue verify URL
  blocked). Server-side SSO + webhook receiver were validated live.
- Reflection blocks capture no learner input yet (documented; prompt-only).

## QA checklist (run in a standard browser before inviting testers)

- [ ] Member sign-in (or SSO handoff) lands on the Academy home.
- [ ] "Continue learning" resumes the correct active Journey.
- [ ] Journey overview shows the right progress bar + node states.
- [ ] Open a lesson; blocks render (rich text, callout, flashcards,
      knowledge check, reflection, comparison).
- [ ] Flashcards flip; knowledge check reveals correct/explanation.
- [ ] "Mark complete" shows the completion moment; progress persists on
      reload.
- [ ] Evaluation attempt → pass → returns to lesson/journey.
- [ ] Earned credential appears on the home with a working Verify link.
- [ ] Member cannot see coach-certification content or admin/Studio.
- [ ] Coach: assign a Journey, view learner progress, review an Evaluation,
      view credentials.
- [ ] Responsive: home grid + cards at mobile / tablet / desktop widths.
- [ ] Dark mode: brand palette + contrast hold.

## Accessibility checklist

- [x] Keyboard: all new links/buttons reachable; focus-visible rings added.
- [x] ARIA: progress bar (`role="progressbar"` + values), completion
      `role="status"`, decorative glyphs `aria-hidden`.
- [x] Reduced motion: completion + progress-bar transitions gated by
      `motion-reduce`.
- [x] Contrast: theme publication is contrast-gated (Phase 1B); new UI uses
      accent-on-surface / text-on-surface token pairs only.
- [ ] Screen-reader pass (VoiceOver/NVDA) on the member flow — pending the
      standard-browser QA.
- [ ] Touch-target audit (≥44px) on mobile — pending.

## Performance notes

- Member home / journey / lesson are **server components** with a small
  number of scoped queries; the only client components are the interactive
  blocks and lesson actions (unchanged in weight).
- Integration RPC latencies (from alpha validation): SSO exchange 0.58 ms,
  enroll 0.68 ms, projection 0.44 ms.
- No new client dependencies, no animation libraries (CSS transitions
  only), no new network waterfalls. Production build compiles cleanly.
- Not optimized prematurely: the per-enrollment lesson-total denominator is
  deliberately not computed to avoid an N+1 for a cosmetic %.

## Deployment checklist

- [ ] Merge `bfh-academy-alpha` → `main` after review.
- [ ] `npm run verify` green; `npm run build` succeeds. (Green at RC-1.)
- [ ] Migrations applied to the target dev project (they are, on
      `novakore-dev`).
- [ ] `bfh-handoff` + `webhook-worker` Edge Functions deployed ACTIVE.
- [ ] Outbox worker scheduled (`*/5`); leaked-password protection ON.
- [ ] Set `NOVAKORE_SITE_URL` for the `bfh-handoff` EF to the alpha host.
- [ ] Confirm the BFH webhook endpoint + shared secret point at a reachable
      receiver (BFH-side).

## Internal alpha instructions

1. Testers use the seeded dev identities (dev password in
   `docs/development/supabase.md#seeded-accounts`):
   - Member: `bfh.member@novakore.test` → Journey _Strong Foundations_.
   - Coach/professional: `bfh.coach@novakore.test` → _Coach Certification_.
2. Sign in at `/sign-in`, then open `/bfh-dev/learn`.
3. Follow the test scripts below; capture feedback with the template.

### Coach test script

1. Sign in as `bfh.coach@novakore.test`; confirm the Academy shows the
   **Coach Certification** Journey (and NOT member content).
2. Open the Journey; complete a Phase lesson; observe the completion moment.
3. Take an Evaluation; confirm pass/fail + score display.
4. (Admin surface) As `bfh.owner@novakore.test`: assign a Journey to a
   learner via the enrollments surface; view learner progress; review a
   submitted Evaluation; view issued credentials.
5. Note anything that took too many clicks or hid needed information.

### Member test script

1. Sign in as `bfh.member@novakore.test`; land on the Academy home.
2. Use **Continue learning** to resume _Strong Foundations_.
3. Work through Phase One → Three: read a lesson, flip a flashcard, answer a
   knowledge check, read the comparison + callouts, complete each lesson.
4. Take the _Foundations of Progress Check_ Evaluation.
5. Confirm the completion certificate appears on the home; open Verify.
6. Try to reach coach content or `/bfh-dev/admin` — confirm you cannot.

### Feedback collection template

```
Tester + role (member / coach / admin):
Device + browser:
Task attempted:
What felt premium / delightful:
What felt confusing or slow:
Any dead ends, errors, or wrong content shown:
Visual/polish nits (screen + description):
Severity (blocker / major / minor / cosmetic):
Overall 1–5 and one sentence:
```

## Go / No-Go recommendation

**GO for internal alpha**, conditioned on completing the standard-browser
QA checklist above (the one item the embedded environment could not
exercise) and pointing SSO/webhooks at the alpha host. No blocking defects
found; the platform + integration are validated; the member experience is
polished to a premium-consumer bar for the paths testers will touch.
Coach-surface polish and token consolidation are the RC-2 priorities and do
not block the alpha.

# G3 Performance Foundations v1.0 — implementation record

**Status:** implemented, seeded to `novakore-dev`, internal pilot ready.
**Tenant:** `g3-performance` (`26f6aa4a-4ade-4bb0-842f-12ca2e5bc115`), the
owner's self-provisioned org, adopted by the seed. `use_case = qualification`
(so the `instructor` term renders as **Assessor**).
**Authoritative source:** the canonical package in
`curriculum/g3-performance-foundations/` (hashes + canonicality record in its
`SOURCES.md`). The seed is **generated**, never hand-edited:

```
node scripts/g3-foundations/generate.mjs        # → supabase/seeds/g3-performance-foundations.sql
node scripts/g3-foundations/validate-package.mjs # parent §7.4 cross-course checks
```

## What the curriculum maps to

| Curriculum concept                       | NovaKore representation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundations parent curriculum / manifest | `learning_paths` row `g3-performance-foundations` + path-scoped `curriculum_records` (`kind = 'series'`): sequence, authority rule, taxonomy A–F+U, completion rule, workload, platform prohibitions, package record, governance, duplication rule. Established **first** in the seed (§6 ingestion order).                                                                                                                                                                                                                        |
| Five courses (101 v2.0, 102–105 v1.0)    | `courses` `g3-101`..`g3-105`, published, `enforce_sequence = true`. Curriculum version/standing carried in `curriculum_records` (`kind='governance'`) and the course summary.                                                                                                                                                                                                                                                                                                                                                      |
| 12 modules × 5                           | `modules` (`M1 — …` … `M12 — …`), positions `a0..b1`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Module content (17-element model)        | Five lessons per module — _Overview & objectives_ (framing quote, purpose, objectives checklist, gating callout), _Directed study_ (verbatim per-source-lesson prose), _Doctrine, evidence & standards_, _Case & application_, _Module assessment_ — plus gate lessons where the course's `sequencing.order` places PS-x / T-01. Lesson `estimated_minutes` split so each course sums exactly to its directed-study minutes (5,850 series total); **gate lessons carry no minutes** (practicals are additional to directed study). |
| Three-layer discipline                   | Tone-coded `callout` blocks, identical shape in all five courses: doctrine = `note`, evidence classification = `info`, G3 Applied Standard = `success`, Coach Judgment = `warning`, claim audit / common errors = `danger`. Cases render as `scenario` blocks.                                                                                                                                                                                                                                                                     |
| RECALL → deep link                       | New `lesson_reference` block (see below); downstream courses recall G3 101 (reasoning system) and G3 102 (decision model) in their first module.                                                                                                                                                                                                                                                                                                                                                                                   |
| Module assessments                       | One `manual_review` assessment per module (60 total): knowledge items verbatim as `short_answer` (recorded keys in the grader-only `rubric` field — no invented answer keys or distractors), applied competency as `long_answer` with the verbatim standard. `passingPercent 80`; assignments are `required` + `complete_lesson`, pinned to v1. Human-graded via the existing review queue.                                                                                                                                        |
| PS-1..PS-4, T-01                         | `practical_requirements` (25) on gate lessons, with kind, code, competency codes, verbatim structured rubric (defense rubric for T-01), and guidance. Recorded through `record_practical_evaluation` only.                                                                                                                                                                                                                                                                                                                         |
| Prerequisites                            | `prerequisites` edges exactly per each course's stated rule: 102←101, 103←102, 104←{102,103}, 105←{102,103,104}. DB-enforced for the path enrollment.                                                                                                                                                                                                                                                                                                                                                                              |
| Series completion                        | Path completion (all five course progress rows completed) — each course requires every required lesson, which includes all module assessments, PS-1..4, and T-01; an open remediation keeps its gate lesson incomplete. Credentials: 5 course certificates + 1 Foundations certificate (`learning_path` source), all titled "… (Internal G3 CEU)".                                                                                                                                                                                 |
| Registries                               | Course-scoped `curriculum_records`: doctrine, applied standards, coach judgment, claim audits, competencies (with module/sign-off linkage), cases, references, evidence classes, governance (versions, workload, standing, foundations position, change control, sequencing; G3 102 additionally carries the decision model verbatim). 763 records total.                                                                                                                                                                          |

## Platform additions (generic, not G3-specific)

- **`practical_requirements` / `practical_evaluations`**
  (`20260824042809_practical_evaluation_foundation`). Observed sign-offs and
  terminal defenses as first-class primitives. Evaluations are append-only
  (`protect_immutable`), audited, three-state
  (`passed | remediation_required | failed`), carry evaluator identity,
  human-recorded rubric scores, evidence, comments, competency codes. One
  `passed` per (enrollment, requirement) via partial unique index.
  `record_practical_evaluation` requires `assessment.grade`, blocks
  self-evaluation, requires the learner to have reached the gate, and on
  `passed` completes the gate lesson (apply_assessment_outcome pattern) and
  runs the completion cascade. `record_lesson_progress` gained the practical
  gate beside the Phase 1D assessment gate.
- **`courses.enforce_sequence`** — opt-in SQL enforcement of the in-course
  sequence (the hook `docs/architecture/prerequisites-and-unlocks.md` §4
  anticipated). Default `false`; existing tenants unchanged.
- **`lesson_reference` block** (`20260824042821`) — recall deep-link to
  another lesson; the learner viewer resolves it inside the reader's
  enrollment (`lessonHrefBase`), other surfaces render a reference card.
- **`curriculum_records`** (`20260824042830`) — org-scoped structured
  curriculum reference records (course- or path-scoped, kind + code + jsonb).
  Read-only to members; written by governed seeds/migrations.
- **`get_member_emails`** now also answers to `enrollment.manage`
  (`20260824045930`) so instructor-tier evaluators see learner identity.
- Event: `assessment.practical.recorded` (EVENT_TYPES + emitted by the RPC).
- UI: learner gate-lesson panel (status, rubric, record history, no
  self-complete), `/admin/practicals` evaluator workbench (nav: Assessment
  and verification → Practicals, gated on `assessment.grade`).

## What is deliberately NOT here

No automated training priorities, readiness prescriptions, ACWR/asymmetry
alerts, injury classifications or risk scores, age/puberty gates, recovery
clocks, periodization prescriptions, nonresponder classifications,
force–velocity diagnoses, optimal-load or contact prescriptions, ratio gates,
velocity-loss stop rules, or athlete capability rankings — the package's
platform prohibitions bind the whole series and are recorded in the series
`curriculum_records`. Every interpretive record carries a human author
(`evaluator_id`, reviewer identity). Rubrics are applied by people; the
platform never derives a pass from dimension scores.

## Pilot fixtures (synthetic, `@novakore.test`, dev password convention)

| Account                  | State                                                                        |
| ------------------------ | ---------------------------------------------------------------------------- |
| `g3.learner.new`         | enrolled, nothing started                                                    |
| `g3.learner.101`         | G3 101 complete (incl. T-01) → 102 unlocked, 103–105 locked                  |
| `g3.learner.102`         | through G3 102 → 103 unlocked                                                |
| `g3.learner.modules`     | G3 101 non-gate lessons complete, practicals open → course incomplete        |
| `g3.learner.practicals`  | PS-1..PS-4 passed, T-01 open → 102 stays locked                              |
| `g3.learner.remediation` | T-01 `remediation_required` open → completion withheld                       |
| `g3.learner.complete`    | all five complete; path completed; 6 credentials                             |
| `g3.assessor`            | `instructor` role (renders as Assessor) — records practicals, grades reviews |

## Tests

- `packages/domain/src/practical.test.ts` — status derivation, rubric schemas,
  `lesson_reference` validation.
- `packages/database/src/__tests__/g3-foundations.test.ts` — structure counts,
  minute totals, prerequisite/sequence/practical gates (negative, real RPCs),
  permission + self-record guards, reach-the-gate rule, fixture states,
  credentials, RLS visibility, immutability. Deliberately non-mutating; the
  positive record→complete→unlock→credential flow was proven once via the
  real RPCs against the `modules` fixture and rolled back (see the
  implementation session record).
- `scripts/g3-foundations/validate-package.mjs` — the parent §7.4 cross-course
  list re-run against the artifacts (105/106; the one open item is the absent
  manifest file, below).

## Known package gap

`G3-Performance-Foundations-Manifest-v1.0-FINAL.json` (package item #1) was
not delivered with the handoff. The parent curriculum document — authoritative
at series level — supplied every series-level fact, and the series
`curriculum_records` note the absence. When the manifest arrives: drop it into
`curriculum/g3-performance-foundations/`, re-run the package validator, and
re-record §7.4.

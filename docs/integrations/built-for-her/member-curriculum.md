# Built For Her Academy — Member Curriculum (RC-2)

The complete foundational curriculum every new Built For Her member
experiences, authored into NovaKore via the standard publishing workflow
(draft → immutable published `lesson_versions` + `course_versions`, ADR-007)
on the `bfh-dev` tenant. Content only — no platform or architecture change.

- **Journey:** _Strong Foundations_ (`strong-foundations`, audience `member`)
- **5 Programs · 9 Phases · 23 Lessons · 3 Evaluations · 1 Credential**
- **~171 minutes** total estimated reading (≈3 hours; ~7–8 min/lesson)
- Every lesson is published, placeholder-free, and reinforces the BFH
  coaching philosophy.

## Coaching philosophy (reinforced throughout)

Progress is earned · Technique before load · Consistency beats perfection ·
Nutrition supports performance · Recovery is training · Strength is a
long-term investment. Voice: professional, supportive, evidence-informed,
clear, confident — never condescending, clinical, or motivational fluff.

## Curriculum map

### Program 1 — Getting Started

_Orientation for every new member._

- **Phase: Welcome & Orientation**
  1. Welcome — _callout_ (how to use the Academy)
  2. How Built For Her Works — _comparison_ (is / is not)
  3. Expectations & Standards — _knowledge check_

### Program 2 — Training Foundations · Evaluation: **Training Foundations Check**

_How training works and how you actually get stronger._

Phase — Training Principles:

- 4. Training Principles — _flashcards_ (overload / specificity / individuality / recovery)
- 5. Progressive Overload — _knowledge check_
- 6. Technique Before Load — _comparison_

Phase — Recovery:

- 7. Recovery Fundamentals — _reflection_
- 8. Sleep — _flashcards_
- 9. Deloads — _callout_ (+ end-of-program Evaluation)

### Program 3 — Nutrition Foundations · Evaluation: **Nutrition Foundations Check**

_Fuel training without fear, rules, or perfectionism._

Phase — Nutrition Basics:

- 10. Nutrition Foundations — _flashcards_ (energy / protein / whole foods / hydration)
- 11. Calories — _comparison_ (under-fuelling / fuelling to train)
- 12. Protein — _knowledge check_

Phase — Fueling Strength:

- 13. Strength Nutrition — _reflection_ (+ end-of-program Evaluation)

### Program 4 — Consistency & Mindset

_The habits and mental skills that make training stick._

Phase — Building Consistency:

- 14. Consistency — _callout_ (define your minimum week)
- 15. Habit Formation — _flashcards_ (obvious / easy / stacking / satisfying)
- 16. Stress Management — _reflection_

Phase — The Mental Game:

- 17. Mindset — _comparison_ (inner critic / coach voice)
- 18. Navigating Setbacks — _knowledge check_

### Program 5 — Staying on Track · Evaluation: **Strong Foundations — Final Check** → Credential

_Sustaining progress through real life, then graduating._

Phase — Real Life:

- 19. Travel — _action step_ (write your travel minimum)
- 20. Holidays — _callout_
- 21. Plateau Management — _knowledge check_

Phase — Progress & Graduation:

- 22. Tracking Progress — _flashcards_ (strength / fit / energy / trends)
- 23. Graduation — _reflection_ (+ final Evaluation → **Strong Foundations — Graduate** credential)

## Interactive block inventory (88 blocks total)

| Type            | Count | Role                                      |
| --------------- | ----- | ----------------------------------------- |
| rich_text       | 28    | teaching content                          |
| heading         | 23    | one per lesson                            |
| callout         | 18    | principle emphasis / guidance             |
| knowledge_check | 5     | formative self-checks                     |
| flashcards      | 5     | recall of key concepts                    |
| comparison      | 4     | contrast the right vs. wrong mental model |
| reflection      | 4     | personal application                      |
| action_step     | 1     | concrete commitment                       |

Interaction is varied by design — no lesson repeats its neighbour's primary
pattern, and every lesson carries at least one interactive or emphasis block
(0 thin lessons).

## Evaluations (3)

- **Training Foundations Check** — gates completion of _Deloads_ (Program 2).
- **Nutrition Foundations Check** — gates completion of _Strength Nutrition_ (Program 3).
- **Strong Foundations — Final Check** — spans the curriculum; gates
  _Graduation_ (Program 5) and precedes the graduation credential.

All are `knowledge_check` assessments, 70% to pass, `scorePolicy: highest`,
attached via `assessment_assignments` with `completion_effect =
complete_lesson`.

## Quality control (audited)

- **Consistency / terminology:** Journey/Program/Phase/Lesson/Evaluation/
  Credential overlay throughout; the six philosophy lines recur verbatim.
- **Reading flow / length:** ~6–8 min/lesson; heading → teach → interact →
  reinforce.
- **Redundancy:** overlapping ideas (e.g. consistency, setbacks) are
  deliberately revisited from different angles, not duplicated.
- **Progression / sequencing:** orientation → training → nutrition → the
  inner game → sustaining & graduating — from mechanics to mindset to real
  life, easy to harder application.
- **Difficulty:** no jargon without a plain-language explanation; evidence-
  informed claims stated plainly, never clinically.
- **Placeholders:** 0 across 23 lessons.

## Structure in NovaKore

- Journey `strong-foundations` → 5 `path_nodes` → the 5 Programs (courses),
  each with `modules` (Phases) and `lesson_versions` referenced by the
  published `course_versions.structure`.
- The RC-1 single course _Foundations of Progress_ is archived and removed
  from the Journey; this curriculum supersedes it.
- All Programs are `allow_self_enrollment = false` (BFH assigns the Journey
  via the `/v1` API); members currently move freely between Programs (no
  hard prerequisite gating — a sequential-unlock option is noted below).

## Remaining content gaps / RC-3 candidates

- **Sequential unlocking** between Programs (prerequisite edges) if a guided
  order is preferred over free navigation.
- **Media**: no images/video/audio yet — text + interactive only. Optional
  demo clips (e.g. technique) would enrich Program 2.
- **Deeper tracks** beyond the foundation (per-goal nutrition, lift-specific
  technique) are intentionally out of scope for the foundational curriculum.
- **Graduation credential issuance** currently uses the standard
  `issue_credential` path (coach/automated on journey completion); wiring an
  automatic issue-on-final-evaluation is a small platform follow-up, not a
  content gap.

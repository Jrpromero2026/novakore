# Rules Engine

Design for modular progression: conditions gate and outcomes advance
learning. **Phase 1C implements only the `prerequisites` subset; the full
engine ships in Phase 3.** This document exists so the Phase 1 schema and
events migrate into the engine additively, with zero redesign of
foundational entities.

## 1. Condition representation

A rule's condition is a **typed tree** (JSONB, schema-validated via the
`@novakore/domain` registry — same discipline as content blocks):

```ts
type ConditionNode =
  | { kind: "group"; op: "and" | "or"; children: ConditionNode[] }
  | { kind: "not"; child: ConditionNode }
  | { kind: "condition"; type: ConditionType; schemaVersion: number; params: … };
```

- `and`/`or` groups take ≥1 children; `not` wraps exactly one node.
- Max tree depth: **5**; max leaves: **50** (validation-enforced — keeps
  evaluation, explainability, and the builder UI tractable).
- Every leaf is a discriminated, versioned schema — extension = new
  `ConditionType`, never a change to the tree shape.

### Condition types by phase

| Phase                                       | Types                                                                                                                                                                                                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1C (as `prerequisites` rows, not rule JSON) | `node_completed` (path-node completion)                                                                                                                                                                                                                              |
| 3 (engine launch)                           | `lesson_completed`, `course_completed`, `path_completed`, `assessment_score` (min score / passed), `competency_attained`, `enrollment_age` (relative date), `fixed_date`, `cohort_member`, `role_held`, `manual_approval`, `manager_approval`, `instructor_approval` |
| 3+ / 4                                      | `external_event` (tenant integration event with typed payload match), `milestone_reached`, `access_level` (integration-provided claim, e.g. subscription tier), `department` (if org structure data exists via integration)                                          |

### Outcome types by phase

| Phase         | Types                                                                                                                                                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1C (implicit) | `unlock_node` (the only outcome; computed, not stored)                                                                                                                                                                                                      |
| 3             | `unlock_content`, `assign_content` (create enrollment), `require_remediation` (assign + flag), `branch_path` (activate alternate nodes), `award_competency`, `issue_certificate`, `notify_learner`, `notify_instructor`, `mark_milestone`, `require_review` |
| 3+/4          | `trigger_webhook`                                                                                                                                                                                                                                           |

Outcomes are a flat array on the rule; each outcome is discriminated +
versioned like conditions.

## 2. Evaluation model

**Event-driven first, scheduled second.**

- Rules **subscribe to trigger event types** (from the analytics/domain event
  stream: `learning.lesson.completed`, `assessment.attempt.graded`,
  `enrollment.created`, `integration.event.received`, …). An event fires
  evaluation only for rules subscribed to that type within the event's
  org/scope — no global rescans.
- **Time-based conditions** (`fixed_date`, `enrollment_age`) are handled by a
  scheduler that materializes synthetic `time.tick` evaluations for rules
  with pending time conditions (coarse granularity: 15 min).
- Evaluation is **pure**: load rule version + subject context → evaluate tree
  → decide → emit outcomes. All I/O happens before (context assembly) and
  after (outcome execution) the pure core, making the evaluator unit-testable.

### Idempotency

- Every evaluation writes a `rule_evaluations` row keyed
  `(rule_id, rule_version, subject_id, trigger_event_id)` — **unique**.
  Redelivered events short-circuit.
- Outcome executors are idempotent by construction: `assign_content` upserts
  enrollment, `issue_certificate` respects the credential uniqueness
  constraint, notifications dedupe on evaluation id. An outcome that already
  holds is a recorded no-op, not an error.

### Priority and conflict resolution

- Rules carry integer `priority` (default 100; lower first) evaluated
  deterministically; ties break by `created_at`.
- **Outcomes are monotonic by design** — unlock, assign, award, notify. The
  engine deliberately has no "lock" or "revoke" outcomes in Phase 3, which
  eliminates the classic unlock/lock conflict class. If contradictory
  outcomes ever ship, the documented resolution is: restrictive outcome
  wins + both evaluations logged + authoring-time conflict lint. Until then,
  conflicts are limited to duplicate effects, which idempotency absorbs.

### Loop prevention

Outcomes emit events (`enrollment.created` from `assign_content`), which can
trigger rules. Safeguards:

1. Every derived event carries a `causation_chain` (evaluation ids); chain
   depth > **10** → evaluation refused + `rules.loop_suspected` audit event.
2. Idempotency keys stop identical re-firing outright.
3. Authoring-time static check flags rules whose outcome events intersect
   their own trigger set within the same scope.

## 3. Explainability and audit

Non-negotiable: **a learner-facing and admin-facing "why."**

- Each `rule_evaluations` row stores the evaluated tree with per-leaf
  results and the resolved input values (`assessment_score: required ≥ 80,
actual 74 → false`).
- Learner surface renders locked content with resolved requirement text
  ("Complete _Foundations_ and score 80%+ on the _Safety Check_") derived
  from the same structure — one truth for engine and UI.
- Admin surface: per-rule evaluation history, outcome log, dry-run mode
  ("evaluate this rule against learner X now, execute nothing").

## 4. Versioning and lifecycle

- `rule_definitions` are versioned (integer `version`); activating an edited
  rule creates version n+1; evaluations pin the version they ran.
- Lifecycle: draft → active → disabled → archived. Disabling stops future
  evaluation; history is never deleted.
- Changing a rule does **not** retro-evaluate past subjects by default;
  admins may explicitly trigger re-evaluation for a scope (audited,
  idempotent, so safe).

## 5. Failure handling

- Context-assembly or executor failures mark the evaluation `failed` with
  error class; retried with backoff (max 5) via the delivery-queue pattern
  shared with webhooks.
- Poison evaluations dead-letter with admin visibility; a failed outcome
  never blocks sibling outcomes (each outcome tracks its own status).
- The evaluator never throws into the triggering request path — evaluation
  is asynchronous from the event, so a learner completing a lesson is never
  blocked by rule processing.

## 6. Phase 1C subset: prerequisites

Phase 1C ships the `prerequisites` table (`node_id`, `requires_node_id`,
`requirement: 'completed'`) with synchronous unlock computation:

```
unlocked(node) = all prerequisites' nodes have progress = completed
```

- DAG enforced at write time (cycle check on edge insert).
- This is exactly the `and`-group / `node_completed` special case; Phase 3
  migrates each edge set mechanically into a rule tree — schema compatibility
  is proven by a test in `@novakore/domain` (condition-tree types cover the
  prerequisite case).
- No stored outcomes, no evaluation log in 1C — unlock state is derived and
  cheap (per-enrollment memoization).

## 7. Safe extension checklist (for every future rule type)

1. New `ConditionType`/`OutcomeType` + Zod schema + registry registration.
2. Context assembler declares data requirements (queried, never lazily
   fetched mid-evaluation).
3. Explainability template (how the leaf renders as human text).
4. Idempotent executor (outcomes only).
5. Unit tests over pure evaluation + one integration path.
6. No change to tree shape, envelope, storage, or existing types — additive
   only.

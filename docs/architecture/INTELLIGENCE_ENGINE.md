# INTELLIGENCE_ENGINE

Nova is an operating layer, not a chatbot. Its one law: **only what the
database can prove.**

## Shape

- **Pure core** — `apps/web/src/lib/nova-insights.ts` (+ lesson-health.ts):
  rows in → insights/scorecard/coaching out. Fully unit-tested; this is the
  contract layer for all future optimization.
- **Data layer** — `lib/data/nova.ts` (+ ops.ts, workspace.ts): RLS-scoped
  reads feeding the core. Learner signals are fetched only under
  `analytics.view`.
- **Surfaces** — Command Center panel, /intelligence (scorecard, digest,
  evolution), Studio inspector coaching, graph analysis, Hub health strip.

## Laws

1. No basis → no output (an em dash, never an invented number).
2. Every observation names its evidence ("2 of 6 starts finished").
3. Ratios and two-real-window comparisons only — never projected trends.
4. Learner intelligence is pattern-level; identity stays permission-gated.
5. Generation (drafting) goes through the governed AI pipeline only
   (AI_GOVERNANCE.md); observation never does — it is deterministic.

## Scaling path (see SCALABILITY_PLAN.md)

The pure core is the insurance policy: moving derivations from
JS-over-raw-events into SQL aggregates must preserve the unit-test
contracts exactly.

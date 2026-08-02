# AI_GOVERNANCE

AI output is a governed draft, never an autonomous publish.

- **Budget**: integer-cent reservations against a monthly cap
  (PLATFORM_AI_BUDGET_CENTS hard ceiling); reserve → settle lifecycle in
  `ai_generations`; failures release funds; budget actions are audited.
- **Providers**: mock (default) and deterministic today; `anthropic`
  activates only via `NOVAKORE_AI_PROVIDER` + a server-side key. No
  provider credentials exist in the repo or the database.
- **Validation**: every output passes the same domain schemas as human
  content (`validateAiOutput`); invalid output cannot enter a lesson.
- **Human gate**: accept/reject is explicit; the review workflow (no
  self-approval) applies before publish.
- **Boundaries**: source documents are explicit inputs (no ambient
  scraping); PDF extraction is honestly unimplemented; Nova observation is
  deterministic derivation and never billed as generation.

When the live provider lands: same pipeline, same caps, same validation —
plus provenance labeling on drafts. As-built: ai-architecture.md,
ai-authoring-as-built.md.

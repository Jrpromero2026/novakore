# AI Architecture

AI is structural in NovaKore — an authoring copilot and a grounded learner
tutor — governed by hard safety and cost boundaries. Nothing here connects to
a paid provider until the phase gates allow it.

## 1. Provider abstraction (ADR-010)

A thin platform interface; vendors are adapters. Candidate implementation
base: Vercel AI SDK (validate against current official docs at Phase 2
build time); the abstraction stands even if we hand-roll.

```ts
interface AiProvider {
  generateStructured<T>(req: {
    template: PromptTemplateRef; // registered template + version
    variables: Record<string, unknown>; // validated against template schema
    outputSchema: ZodType<T>; // structured output contract
    modelProfile: ModelProfileRef; // logical profile, not vendor string
    signal?: AbortSignal;
  }): Promise<AiResult<T>>; // parsed output + usage + trace id

  streamConversation(req: {
    template: PromptTemplateRef;
    context: GroundingBundle; // resolved, tenant-scoped retrieval
    messages: ChatMessage[];
    modelProfile: ModelProfileRef;
  }): AsyncIterable<AiStreamEvent>; // tokens, citations, safety events
}
```

- **Model profiles, not model ids**: platform-defined logical profiles
  (`authoring.fast`, `authoring.deep`, `tutor.default`, `eval.grader`)
  mapped to concrete provider/model/config in platform config. Tenants pick
  within allowed profiles; nothing tenant-facing ever names a vendor.
- **Fallback**: each profile declares an ordered provider chain; failover on
  provider error/timeout is automatic, logged, and surfaced in usage records.
- **Structured outputs are validated** against the declared Zod schema;
  invalid output triggers one bounded repair retry, then fails cleanly.
  Unvalidated AI JSON never enters the database (same registry discipline as
  content blocks).

## 2. Prompt templates

- Registered, versioned artifacts (id, version, purpose, variable schema,
  output schema ref, safety preamble ref) — in-repo registry, reviewed like
  code. No inline prompt strings scattered through features.
- Generation records pin `(template_id, template_version, model_profile,
resolved model)` — reproducibility and regression evals depend on this.

## 3. Authoring AI (Phase 2)

Capabilities (rolled out in this order): course outlines → lesson drafting →
quiz generation from lesson content → summarization/reading-level & audience
adaptation → scenario generation → rubric generation → curriculum/path
generation → competency mapping suggestions → content-gap analysis →
source-document transformation → refresh recommendations (Phase 3+ for the
last four).

Hard rules:

1. **Draft-only, always.** AI output lands as draft content marked
   `origin: ai` with its generation record. **AI-generated authoring content
   never publishes automatically** — publish remains a human, permissioned
   act. No exceptions, including "just this once" tenant requests.
2. **Grounding**: authoring generation may use tenant source documents and
   existing tenant content as context; the record stores which sources.
3. **Attribution surface**: authors see origin + sources; edits clear
   nothing — provenance is append-only.

## 4. Learner AI (Phase 3)

Tutor, Socratic guidance, personalized explanation, lesson-grounded Q&A,
adaptive review, roleplay (scenario blocks), remediation suggestions,
practice generation, reflection guidance, application coaching.

Hard rules:

1. **Lesson-grounded by default**: retrieval scope = current lesson version,
   its course, and tenant-approved knowledge base. The tutor cites sources
   (block/lesson refs); "I don't know — ask your instructor" is a designed,
   first-class response.
2. **No grade authority**: the tutor never marks anything complete, never
   grades, never unlocks (those are engine concerns).
3. **Methodology fidelity**: the tutor must not invent tenant policy,
   standards, or methodology claims. System prompts constrain to grounded
   content; ungrounded methodology questions get the designed refusal.
   This is a top BFH-tenant risk (fitness/medical adjacent) — see safety.
4. **Escalation**: configurable handoff ("flag for instructor") with
   conversation context attached, per tenant policy.

## 5. Retrieval and tenant knowledge bases (Phase 2 authoring / 3 learner)

- `source_documents` per org: upload → extraction → chunking → embedding →
  indexed. Status-tracked, re-processable, content-hash versioned.
- **Retrieval boundary = organization, enforced twice**: embedding store
  queries are org-filtered _and_ results are re-checked against org before
  prompt assembly (belt-and-suspenders, mirrors RLS + server-authz).
  A cross-tenant retrieval is a Sev-1 isolation incident by definition.
- Learner retrieval additionally respects content visibility (published,
  learner-accessible content only — no draft leakage through the tutor).

## 6. Safety

- **Prompt-injection defense**: retrieved content and learner input are
  _data, never instructions_ — enforced via prompt structure (delimited,
  role-separated), instruction hierarchy in templates, output validation,
  and denial of tool/action authority to learner-facing AI (the tutor has
  zero side-effecting capabilities to hijack).
- **Content safety**: platform-level safety preamble on every template;
  moderated categories (self-harm, medical/legal overreach, harassment)
  produce safe responses + flag events; tenant-configurable strictness
  within platform floors, never below them.
- **Human review**: authoring = human publish gate; grading = human confirm
  (Phase 3); tutor = post-hoc sampling + flag review queue.

## 7. Governance, cost, privacy

- `ai_generation_records` / `ai_conversations` + `ai_messages` capture every
  invocation: actor, org, template+version, profile, resolved model, token
  usage, computed cost, latency, outcome, safety flags.
- **Cost controls**: per-org monthly budgets + per-user rate limits
  (platform defaults, tenant-tightenable); soft-warning then hard-stop;
  usage dashboards for org admins. No unmetered endpoint, ever.
- **Privacy**: no tenant content used to train models; provider data
  retention constraints verified per provider before enablement; learner
  conversations retained per tenant policy (default 12 months) with
  learner-visible disclosure; PII redaction pass before third-party calls
  where feasible.
- **Data residency/BAA-class requirements** (healthcare tenants): tracked as
  Phase 4 enterprise concern (risk register), not silently promised.

## 8. Evaluation strategy

- Golden-set evals per template (inputs → expected properties, not exact
  strings): structure validity, grounding fidelity (citation presence &
  accuracy), refusal correctness, tone.
- Run on template/model-profile changes (CI job, Phase 2+) — a template
  version cannot roll out with failing evals.
- Tutor quality: sampled human review + learner feedback signals
  (`ai.message.rated`) feeding template iteration.

## 9. Phasing

| Phase | AI scope                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------- |
| 1A–1D | None. Schemas/interfaces defined in code; zero provider connection.                                                 |
| 2     | Provider abstraction live; authoring copilot (outline, lesson draft, quiz gen); generation records; budgets; evals. |
| 3     | Learner tutor + roleplay; AI-assisted grading (draft-only); adaptive review; knowledge-base retrieval for learners. |
| 4     | Enterprise controls: residency options, per-tenant provider selection (if validated), advanced analytics AI.        |

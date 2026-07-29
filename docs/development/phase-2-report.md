# Phase 2 Implementation Report

Completed 2026-07-29. The NovaKore Learning Studio: the primary
administrative environment for designing modular, AI-assisted learning
systems, plus governed AI authoring, the reusable content library, the
review workflow, Studio media/submission storage, and the outbox
delivery worker.

## 1. Executive status

**Phase 2 is complete.** An authorized org user can, in the Studio,
visually build a learning path (cycle/unreachable/orphan-aware), author
lessons with an expanded interactive block set, save and reuse blocks,
draft content with governed budget-capped AI that can never publish,
route drafts for review (no self-approval), and preview everything
through the one trusted renderer. Webhook delivery runs through a
deployed scheduled Edge Function with SSRF hardening. The BFH development
tenant demonstrates the whole flow under its terminology overlay. Proven
by 264 automated tests (all green), `npm run verify`, and a 30-point
browser walkthrough on the real dev database. Phase 3 has not started.

## 2. Baseline

Phase 1D accepted at `69c8d16` (225 tests, 15 migrations, clean tree).

## 3. Owner decisions applied

1. **Leaked-password protection** — previous state OFF; **still OFF**
   (verified directly via the security advisor). It is an Auth
   dashboard / Management-API setting and could not be toggled from this
   environment (no management token; the app holds only the anon key). It
   remains an owner dashboard action. No effect on seeded dev accounts
   either way (their password is never checked against HIBP at rest). See
   §28.
2. **Retake/passing defaults** — kept configurable per assessment draft,
   frozen into each published version, and never retroactively applied
   (unchanged from 1D). No Phase 2 change.
3. **QA fixtures** — kept and labeled development data; the new BFH Phase 2
   demo content is idempotent seed. Deterministic test dependencies
   preserved; nothing on a production seed/migration path. Documented in
   the BFH integration README and §15.
4. **Verification exposure** — public verification kept; a rate-limiting
   abstraction + production enforcement plan documented (ADR-027); no new
   infrastructure service added.
5. **AI budget** — hard $50/month platform cap in integer cents, tracked
   per org/provider/profile/operation/user, hard stop, no silent overage,
   platform-admin adjustable, tenant-uncapped-override impossible
   (ADR-024; real-DB test).
6. **AI provider** — provider abstraction with mock + deterministic +
   Anthropic adapters; live generation UNVERIFIED (no credentials);
   activation documented (ADR-022; §14).
7. **Submissions storage** — dedicated private `assessment-submissions`
   bucket, membership-scoped paths, signed URLs, MIME/size limits,
   metadata anchored to org/attempt/response/uploader (§18).
8. **Outbox worker** — scheduled Supabase Edge Function, no new hosting
   platform (ADR-025; §19).

## 4. Migrations (7 added — 26 total, local ↔ remote in sync)

- `20260729001411_studio_foundation` — Studio tables, 3 permissions +
  backfill + create_system_roles revision, expanded block CHECK, Studio/
  AI/review/webhook RPCs.
- `20260729002051_studio_storage` — three private buckets, path parsers,
  object policies, media_asset kind/bucket extension,
  register_submission_file.
- `20260729002511_media_kind_bounds` — widened media_assets MIME/size.
- `20260729004723_webhook_worker_wrappers` — service_role worker RPCs.
- `20260729005313` / `20260729005455_ai_budget_audit*` — dedicated
  dotted-action ai_budgets audit (fixes the generic trigger on a
  no-`id` table).

## 5. Tables added (10)

`reusable_blocks`, `source_documents`, `ai_budgets`, `ai_generations`,
`review_requests`, `review_comments`, `path_layouts`,
`webhook_endpoints`, `webhook_deliveries`, `assessment_submission_files`
— plus `content_blocks.source_reusable_block_id`. Each org-scoped where
tenant-owned, RLS + grants hygiene, audit + updated_at triggers.

## 6. Storage buckets (3 new)

`lesson-media`, `source-documents`, `assessment-submissions` — all
private, MIME-allowlisted, size-capped, deny-on-malformed path parsers,
signed URLs only, no SVG. Details:
[../architecture/media-and-storage-as-built.md](../architecture/media-and-storage-as-built.md).

## 7. Learning Studio surfaces

Shell at `/admin/studio` (context, Ctrl-K command palette, recent drafts,
review queue, AI activity, counts), plus `/studio/paths`,
`/studio/paths/[pathId]` (canvas), `/studio/library`, `/studio/ai`,
`/studio/review`. Access floor `content.view_draft`; each action keeps
its own permission. [../architecture/learning-studio.md](../architecture/learning-studio.md).

## 8. Visual path builder

SVG canvas (depth layout, saved coordinates, cycle/unreachable/orphan/
start signalling) with a keyboard-accessible ordered list as the
authoritative editor and human-readable prerequisite summaries. Adding a
prerequisite runs a client-side cycle pre-check; the 1C database trigger
remains the authority. [../architecture/visual-path-builder.md](../architecture/visual-path-builder.md).

## 9. Lesson editor

The 1C continuous editor gained 12 new implemented interactive block
types with typed inline editors, save-to-library, and request-review
affordances, alongside live domain validation, preview, diff, and
publish gating.

## 10. Content blocks

Registry grew to 30 types with a `BLOCK_STATUS` classification: 16
implemented, 6 implemented-with-limitations (image/audio/pdf via governed
media, video external-card, knowledge_check ungraded-by-design), 9
schema-only/deferred (survey, branching_scenario, decision_tree, ai_*,
manager_approval, instructor_feedback, live_session, diagram). All
validate + store; deferred types degrade to a neutral renderer notice.
[../domain/content-blocks.md](../domain/content-blocks.md) §4.

## 11. Reusable content library

Org-owned blocks with optional academy scope, tags, link-vs-copy
insertion, trigger-bumped versioning, usage counts, and archive; no
cross-tenant references; no marketplace (ADR-021).
[../architecture/reusable-content-library.md](../architecture/reusable-content-library.md).

## 12. Review workflow

`request_review`/`decide_review` with one-open-per-subject, threaded
comments, and a per-user no-self-approval guard enforced in SQL (ADR —
studio-review-workflow).

## 13. AI provider architecture

Server-only `AiProvider` interface, logical model profiles, structured
generation + text transformation, usage metadata, integer-cent cost
estimation, timeout, cancellation-ready signal, and error normalization;
deterministic + mock providers for tests/dev. Keys never reach the
browser (ADR-022).

## 14. Live vs mock provider status

**No AI provider credentials exist in this environment.** The default
provider is `mock` (realistic fixtures); `deterministic` powers tests.
The `anthropic` adapter is implemented but **UNVERIFIED against the live
API**. Activation: set `NOVAKORE_AI_PROVIDER=anthropic` and
`ANTHROPIC_API_KEY` in the server environment (never committed, never
`NEXT_PUBLIC_`). The workspace states the active provider and the dev
notice. No claim of working live generation is made.

## 15. AI budget enforcement

`ai_budgets.monthly_limit_cents` CHECK-capped at 5000. `reserve_ai_
generation` advisory-locks the org, sums committed + reserved cents for
the UTC month, and hard-stops when a reservation would exceed
`least(org_limit, 5000)`. Costs are integer-cent estimates (documented as
estimates until invoice reconciliation). Real-DB tests prove the stop,
the cap CHECK, and permission gating (ADR-024).

## 16. Source documents

`source_documents` (text/markdown inline or file), SHA-256 hash, review
state, provenance, org isolation, and the reserve-time per-source org
check. PDF auto-extraction is NOT implemented — files store but never
claim to be parsed; unparsed files cannot ground generation
([../architecture/source-document-model.md](../architecture/source-document-model.md)).

## 17. Media handling

Governed media blocks (image/audio/pdf) reference asset ids resolved to
short-lived signed URLs per render under the caller's RLS (fail-closed
cross-tenant); rendered by the ONE trusted renderer. Lesson-media upload
action with MIME/size limits, sanitized filenames, no SVG, orphan cleanup
on metadata failure.

## 18. Assessment-submission handling

Dedicated private bucket, membership-scoped upload paths, uploader+grader
read, `register_submission_file` metadata RPC that rejects mismatched
paths. The learner file-upload control remains a documented deferral (the
item type keeps its guarded plain-text state); the storage + metadata
foundation is complete.

## 19. Outbox worker

Deployed scheduled Edge Function (`webhook-worker`, ACTIVE, verify_jwt):
atomic `SKIP LOCKED` claim, HMAC signing, SSRF policy, 10s timeout, 4KB
redacted response, bounded backoff, dead-letter after 6 attempts,
outbox-event settlement, manual retry (permission-gated). Verified at the
SQL layer end to end (claim → deliver → settle → outbox processed →
success event). **Not yet scheduled** — a dashboard cron trigger is an
owner action (§28). [../architecture/outbox-worker.md](../architecture/outbox-worker.md).

## 20. Webhook security

https-only (localhost opt-in dev), metadata/loopback/link-local/private/
`.internal` blocked, `redirect: "error"`, no-credential URLs,
resolved-address recheck, secret redaction, per-endpoint rotatable
secrets (ADR-026). Pure policy shared with domain tests.

## 21. Analytics events

18 new registered types (42 total): studio session/authoring, review,
AI lifecycle, library, media, source, and webhook delivery. `emit_studio_
event` is an allowlist RPC (membership-checked; refuses non-Studio
types). Bounded, never per-keystroke
([../architecture/phase-2-event-catalog.md](../architecture/phase-2-event-catalog.md)).

## 22. BFH development demonstration

`bfh-dev` proves Studio modularity under Journey/Program/Phase/Coach/
Member/Evaluation/Credential: Coach Certification system → Certification
Journey (visual path) → Foundations Program with an interactive "Coaching
Fundamentals" Phase (flashcards, knowledge check, scenario, reflection),
the two Evaluations, a completion credential, a reusable "Intake trust
callout" library block, and AI-drafted content via the mock provider. QA
confirmed the interactive blocks render under the overlay. No production
connection, users, subscriptions, or health data.

## 23. Permission changes (29 → 32)

`library.manage`, `sources.manage` (owner/admin/academy-admin/author),
`ai.budget.manage` (owner/admin). Seeds + backfill + create_system_roles
revision in one migration; the future-org parity test proves the owner
bundle stays complete. AI generation reuses `ai.author.use` (no new
gate). [../architecture/phase-2-permission-matrix.md](../architecture/phase-2-permission-matrix.md).

## 24. RLS summary

Every new table is org-scoped with RLS; library/sources are draft-staff
read + manage-write; ledger + deliveries + submission metadata +
review_requests are RPC/worker-written (client writes revoked); budgets
are manage-write / manage-or-analytics read; webhooks are
integrations.manage; submission files are uploader-or-grader. Signed-URL
reads require object SELECT (fail-closed). All proven by the isolation
suite.

## 25. Test totals (264 — all passing)

- **Domain 110** (+29): path graph validation, structured diff, review
  state machine, path layout, 30-block catalog + classification, AI cost/
  budget/schemas/errors/lifecycle, webhook SSRF/backoff/signing/redaction.
- **Authorization 9**: unchanged (extended by parity).
- **Database 83** (+10): Studio isolation — reusable-block + source
  isolation, client-org-id rejection, version bump, AI permission + hard
  budget stop + cap CHECK, review self-approval block, webhook isolation +
  retry gating, permission seeding parity.
- **Web 62** (+0 net; extended editor coverage under existing suites).

## 26. Browser QA (30-point walkthrough, real novakore-dev)

Studio shell + full nav; visual path canvas with keyboard-accessible list
and human-readable prerequisites; **cycle rejection** on the canvas;
lesson interactive blocks rendering (flashcards/knowledge check/scenario/
reflection); library reuse; AI course-outline generation (mock),
budget-recorded, stayed draft (status=completed), accepted into a real
draft course; cross-tenant Studio access → 404; **stored-XSS probe inert**
(script/onerror rendered as text, nothing executed); BFH terminology
overlay on the interactive lesson; webhook worker pipeline verified at SQL
(claim → deliver → settle → outbox processed → success event); mobile
viewport with no horizontal overflow. Publish/enroll/complete/credential/
event-chain (steps 20-25) are unchanged Phase 1D flows already proven and
untouched by Phase 2.

## 27. Security findings

Full matrix in
[../architecture/phase-2-security-review.md](../architecture/phase-2-security-review.md).
No correct-answer/prompt/source cross-tenant leakage; no provider-key
exposure; AI budget bypass impossible; stored-XSS inert on new blocks; no
SVG in new buckets; signed-URL scope fail-closed; submission paths
membership-scoped; author self-approval blocked; webhook SSRF closed +
secrets redacted; outbox delivery exactly-once with dedupe; verification
enumeration resisted (rate limit documented, ADR-027); client-org-id
bypass rejected; published snapshots immutable; PDF parsing not faked.
New intentional advisor findings: the Studio/AI/review/webhook SECURITY
DEFINER RPCs (each authorizes internally) and the anon `verify_credential`
(documented public surface). Service-role key still never obtained by the
app.

## 28. Manual environment items (reported, not assumed)

- **Leaked-password protection: STILL OFF** — advisor-confirmed; requires
  the Auth dashboard / Management API (no management token here). Owner
  action.
- **SMTP**: Supabase built-in, unchanged.
- **Storage CORS**: bucket defaults; nothing required changes — unverified.
- **AI provider credentials**: none present; mock/deterministic in use.
- **Edge Function deployment**: `webhook-worker` deployed ACTIVE
  (verify_jwt on).
- **Edge Function schedule**: NOT scheduled — owner must add a cron
  trigger to activate delivery.
- **Webhook secrets**: per-endpoint, tenant-managed; none configured
  beyond QA test rows (revoked).
- **Storage bucket configuration**: three private buckets created via
  migration; image-transform settings default/unverified.
- **Production rate limiting**: abstraction documented (ADR-027); not
  enforced in dev.

## 29. Deferred items

Real learner file-submission upload UI (bucket + metadata done); PDF/file
text extraction; the 9 schema-only block editors + renderers; embedded-
academy view; simultaneous collaborative editing / presence; production
AI provider + budget; production webhook egress proxy; verification rate-
limit enforcement; the full Phase 3 rules engine and learner AI. All
documented, none faked.

## 30. Commit hashes

`26abbec` (Studio domain), `47ae36e` (storage), `cd27a14` (Studio shell +
path + lesson editors), `fff0d21` (library + review), `4a59ebb` (AI
authoring), `24940cc` (outbox worker), `b54b2a7` (Studio tests), plus the
docs + report commit.

## 31. npm run verify

Green end-to-end at the final tree: format:check, lint (0 problems),
typecheck (4 workspaces), 264 tests, production build (37 routes +
proxy).

## 32. Repository status

Working tree clean at the report commit; migrations 26/26 local↔remote;
generated types current; seeds idempotent; no credentials committed; BFH
and G3 repositories untouched; no production Supabase project exists.

## 33. Owner actions required

1. Enable leaked-password protection in the novakore-dev Auth dashboard
   (or via the Management API) — the only quality-gate item not
   completable from this environment.
2. Schedule the `webhook-worker` Edge Function (dashboard cron, e.g.
   every minute) to activate delivery; until then it runs only on manual
   POST.
3. (Optional) Provide `ANTHROPIC_API_KEY` + set
   `NOVAKORE_AI_PROVIDER=anthropic` server-side to verify live
   generation; the mock/deterministic providers cover everything else.
4. (Optional) Prune the Phase 2 QA fixtures (Alpha AI-drafted course,
   library blocks, BFH interactive lesson) if undesired — all clearly
   development data.

## 34. Decisions required before Phase 3

- Learner AI scope + safety envelope (tutor/roleplay blocks are
  schema-only pending this).
- Rules-engine condition/outcome model beyond prerequisites (ADR-009
  Phase 3).
- File-extraction + real submission-upload go-ahead (storage is ready).
- Webhook production egress controls and verification rate-limit
  enforcement (both designed, not enforced).
- Whether to promote any schema-only blocks (survey, branching_scenario,
  diagram) to implemented, and their editor/renderer safety model.

Phase 3 has not been started.

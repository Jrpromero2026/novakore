# Phase 2 Security Review

Threats inspected for the Studio, AI, storage, and worker additions, with
the defense and its verification.

| Threat                              | Defense (verified by)                                                                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-tenant reusable-block leakage | org-scoped RLS + FK; other tenants read nothing (real-DB test)                                                                                                  |
| Cross-tenant source retrieval       | org-scoped RLS + `reserve_ai_generation` per-source org check (real-DB test)                                                                                    |
| AI prompt content leakage           | only explicitly-attached tenant source excerpts cross to the provider; nothing else (domain contract + action code)                                             |
| Provider-key exposure               | providers are server-only; keys read from server env, never `NEXT_PUBLIC_`, never sent to the browser (code review)                                             |
| AI budget bypass                    | SQL reservation with advisory lock + platform-cap CHECK; hard stop, no silent overage (real-DB test)                                                            |
| Money precision                     | integer cents end to end; no float arithmetic (domain tests)                                                                                                    |
| Arbitrary CSS injection             | blocks stay in the validated registry; renderer is escape-first; no raw style (unchanged 1B/1C boundary)                                                        |
| Unsafe embeds                       | video renders as external card, no iframes; embed/external_tool are schema-only, not rendered (block classification)                                            |
| Stored XSS (new blocks)             | every new interactive block renders through the escape-first renderer; `<script>`/`onerror` probes inert in editor preview (browser QA + renderer)              |
| SVG execution                       | no SVG in lesson-media/source/submission buckets; branding gate remains the only SVG path (bucket MIME + policy)                                                |
| Signed-URL scope                    | signing requires SELECT on the object under the caller's RLS; cross-tenant asset refs resolve to nothing (fail closed)                                          |
| Assessment file-submission leakage  | submission paths are membership-scoped; uploader writes only own path; uploader+grader read (storage policy + real-DB)                                          |
| Unauthorized publishing             | unchanged 1C/1D publish RPCs; Studio adds no publish path; AI cannot publish (ADR-023)                                                                          |
| Author approving own review         | `decide_review` blocks the requester per-user, even owners holding both roles (real-DB test)                                                                    |
| Webhook SSRF                        | https-only, metadata/loopback/link-local/private/`.internal` blocked, `redirect: "error"`, no-credential URLs, resolved-address recheck (domain tests + worker) |
| Webhook secret leakage              | secrets `integrations.manage`-gated; response excerpts redacted; signing input never logged (worker + domain test)                                              |
| Outbox duplicate delivery           | atomic claim with `FOR UPDATE SKIP LOCKED`; at-least-once + consumer dedupe on event id (real-DB test + worker)                                                 |
| Public verification enumeration     | 64-bit random codes + strict format check; anon RPC returns privacy-safe fields only; rate-limit abstraction documented (ADR-027)                               |
| Client-supplied org-id bypass       | org-scoped WITH CHECK on every insert; forged org-id rejected (real-DB test)                                                                                    |
| Published-version mutation          | 1C immutability triggers unchanged; linked library updates flow only into DRAFTS on next publish (design)                                                       |
| Unsafe source-document parsing      | PDF auto-extraction NOT implemented; files store but never claim to be parsed; unparsed files can't ground generation (ADR / source-document doc)               |

## New intentional advisor findings

- `verify_credential` and (via the worker) `worker_*` functions are
  SECURITY DEFINER: the former is the documented anonymous verification
  surface; the latter are service_role-only wrappers. Both are intended.
- Service-role key: still never obtained by the app; the worker reads it
  only from the Edge Function environment.

## Residual / deferred (documented, owner-visible)

- Public verification is unthrottled in dev (ADR-027 enforcement plan).
- Webhook worker is deployed **and scheduled** (Phase 2 closeout):
  `pg_cron` `novakore-webhook-worker` `*/5 * * * *` via `pg_net`,
  verified live (HTTP 200, no secrets in response or logs).
- PDF extraction and real file-submission upload are deferred, not faked.
- Leaked-password protection: **ENABLED** (2026-07-29), advisor-verified.

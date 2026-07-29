# Studio Review Workflow (Phase 2)

Collaboration foundations — enough to route drafts for review, not
Google-Docs simultaneous editing (out of scope).

## 1. Model

- `review_requests`: one per (subject_type, subject_id) open at a time
  (partial unique index), status open → approved | changes_requested →
  (reopen) → closed, with requester, decider, and note.
- `review_comments`: threaded comments on a request, open/resolved.

## 2. Flow + guards

- **request_review** (RPC) — requires authoring access
  (`content.author`/`assessment.author`); reopens a `changes_requested`
  cycle or creates a fresh request. Emitted as `review.request.created`.
- **decide_review** (RPC) — approve / request-changes requires publish
  access (`content.publish`/`assessment.publish`); **the requester can
  never decide their own request** (enforced in SQL, per-user, even for
  owners holding both roles — proven by the isolation suite). Closing is
  allowed to the requester or a publisher. Emitted as
  `review.request.decided`.
- **comments** — any draft-visible staff member; authored as themselves
  (RLS WITH CHECK on `author_id`); resolve/reopen toggles status.

## 3. Not in scope

Simultaneous collaborative editing, presence cursors, and mentions are
deferred (presence architecture only). The workflow is request →
comment → decide, with a full audit trail (`audit_change` + events).

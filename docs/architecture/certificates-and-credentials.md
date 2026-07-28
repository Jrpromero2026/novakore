# Certificates and Credentials

Four cleanly separated concepts (entity-model 2.6 as built):

1. **Template** (`certificate_templates`) — the constrained presentation
   schema: headline, subtitle, body text, ≤3 signatories, verification
   toggle, optional expiration months. Plain text only, rendered through
   org theme tokens; no design canvas, no raw CSS/HTML.
2. **Certificate rule** (`certificates`) — eligibility: template + ONE
   explicit source (`course` | `learning_path` |
   `assessment_assignment`; CHECK-enforced columns, no polymorphic
   dumping ground) + credential title. One active rule per source
   (partial unique indexes) keeps issuance deterministic.
3. **Issued credential** (`issued_credentials`) — immutable evidence:
   recipient name snapshot, template snapshot, verification code, exact
   evidence references (enrollment, course version, attempt).
4. **Verification identifier** — `NVK-XXXX-XXXX-XXXX-XXXX`, 64 random
   bits, format-checked at the database. Never a row UUID.

## 1. Issuance

Automatic: course completion, path completion (via
`app.issue_credentials_for_completion` inside the completion cascade),
and passed assignment attempts (via `app.apply_assessment_outcome`) all
call `app.issue_credential_internal`, which:

- refuses inactive rules/templates;
- snapshots the recipient name (email local part; overridable on manual
  issuance) and the template;
- computes `expires_at` from the template's `expirationMonths`;
- inserts idempotently — one non-revoked credential per
  (certificate, membership) via partial unique index + ON CONFLICT — and
  emits `credential.certificate.issued` only on a real insert
  (exactly-once, proven by tests).

Manual issuance (`issue_credential`) requires `credential.issue` and an
active membership; it surfaces a clear error when a live credential
already exists.

## 2. Immutability and revocation

Issued credentials are evidence: a field-protection trigger rejects any
change outside status/revocation fields, deletes are blocked, and client
write grants are revoked. Revocation (`revoke_credential`) requires
`credential.revoke` and a reason (≥5 chars), stamps
revoked_at/by/reason, emits `credential.certificate.revoked`, and is
idempotent. Revocation is permanent — re-earning issues a NEW credential
(the partial unique index excludes revoked rows).

## 3. Expiration

Lazy: `expires_at` is stored; readers (`effectiveCredentialStatus`,
`verify_credential`) compute expired status on read. No background
worker in Phase 1D, so no `credential.certificate.expired` event is
registered yet — it arrives with the worker (documented deferral).

## 4. Public verification

`/verify/[code]` + the anon-callable `verify_credential` RPC — the ONE
deliberate anonymous surface, documented as such. Returns only: title,
issuing organization display name, recipient name snapshot, issue and
expiration dates, effective status, and the code itself. Never emails,
internal ids, scores, answers, or audit data. Enumeration resistance
comes from the 64-bit random code space plus strict input format
checking; raw `issued_credentials` rows remain closed to anonymous
clients (proven by tests).

## 5. Learner and admin surfaces

Learners see their credentials (with verification links) on the learning
home. Admins (`certificates.manage`) manage templates, rules, and the
issued list; revocation additionally requires `credential.revoke` and a
typed reason in the UI.

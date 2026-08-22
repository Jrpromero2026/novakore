# NovaKore — How a use case shapes a workspace

_Canonical description of the shipped use-case architecture. Sections are
marked **Implemented**, **Principle**, or **Deferred** so current behaviour is
never confused with intent._

---

## What NovaKore is

NovaKore is multi-tenant **learning infrastructure**: one platform built from
shared primitives. Organizations use it to build courses, assessments, learning
paths and credentials for their own people or customers. It is not a certifying
body — it is the software an organization that certifies (or trains, or
onboards) runs on.

Its distinctive machinery is about **evidence**: content is versioned and
published versions are immutable, enrollments pin the exact version a person
took, assessments can require a named human sign-off, credentials expire and
carry a public verification URL, and everything is audited.

It also has a **terminology system**: twenty core concepts (course, lesson,
learner, credential, instructor, academy, …) can be renamed per organization,
and those names flow through navigation, breadcrumbs and guidance copy.

---

## The premise — Principle

The same primitives serve a certifying body, a gym documenting its procedures,
and a coach running client programs. What separates them is **vocabulary and
emphasis, not capability**. A Standard Operating Procedure _is_ a course wearing
the word its organization uses.

At signup we ask one question — _what are you primarily here to do?_ — and the
answer seeds vocabulary and shapes setup guidance.

A use case is **configuration and emphasis**: not a product edition, a feature
gate, a permission tier, or a separate application.

---

## The two rules — Principle

**Rule 1.** A use case may change defaults, terminology, navigation emphasis,
guidance, templates and recommended workflows. It may **not** make an underlying
platform capability unavailable. _Visibility and emphasis are allowed to change;
capability availability is not._

**Rule 2.** Everything a use case sets is editable afterwards through the normal
customer UI.

### How rule 1 is enforced — Implemented

Not by intention. Three automated tests:

- Hidden setup steps must come from an allowlist of **presentational** steps
  (`branding`, `preview`). Every other step stands for a platform object, so a
  step added later is protected by default rather than needing to be remembered.
- No use case may hide the steps representing core objects.
- The catalog data must contain no permission, role or grant vocabulary — if an
  authorization concept ever appears there, the test fails.

---

## The terminology principle — Principle

**Only override a platform term when the use case gives high confidence that the
domain uses a meaningfully better word. No override is preferable to a
speculative one.**

The terminology system exists to make NovaKore feel native to a customer's
domain, not to demonstrate how many labels it can change. Most use cases
override three or four terms; several override one. A term is never overridden
with the platform's own default.

Three overrides were **deliberately removed** under this principle and are
pinned by test so they do not creep back:

| Removed                                     | Why                                                                                                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `certification` → assessment: _Examination_ | A certifying body may call one particular assessment an examination; that is the organization's later choice, not a default for all of them. |
| `school` → credential: _Transcript Record_  | A transcript is an academic record containing outcomes, not a synonym for one credential. Nothing was invented to replace it.                |
| `customer_academy` → learner: _Member_      | Customer academies serve customers, users, members or purchasers. Guessing one is exactly the speculative override the principle forbids.    |

---

## The catalog — Implemented

Twelve options, in signup order, most common first. `id` is canonical and stored
on the organization; the signup label is action-oriented.

| Signup label (`id`)                                       | Vocabulary seeded                                                                                                                                                              | Guidance hidden   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| **Train or onboard my team**<br>`staff_onboarding`        | course → SOP<br>module → Section<br>lesson → Procedure<br>learner → Team Member<br>instructor → Trainer<br>credential → Sign-off                                               | branding, preview |
| **Develop my people**<br>`professional_development`       | course → Development Program<br>learning_path → Development Path<br>learner → Participant<br>credential → Completion Record                                                    | —                 |
| **Qualify people to a standard**<br>`qualification`       | course → Qualification<br>learning_path → Qualification Path<br>learner → Trainee<br>assessment → Competency Assessment<br>credential → Qualification<br>instructor → Assessor | —                 |
| **Deliver compliance or safety training**<br>`compliance` | course → Training Requirement<br>learner → Employee<br>credential → Training Record<br>assessment → Competency Verification                                                    | branding, preview |
| **Award continuing education**<br>`continuing_education`  | course → Continuing Education Course<br>learner → Participant<br>credential → Certificate of Completion<br>certificate → Certificate of Completion                             | —                 |
| **Run a certification program**<br>`certification`        | course → Certification Program<br>learner → Candidate<br>credential → Certification                                                                                            | —                 |
| **Coach clients**<br>`coaching`                           | course → Program<br>learning_path → Journey<br>learner → Client<br>instructor → Coach                                                                                          | —                 |
| **Educate customers**<br>`customer_academy`               | course → Program                                                                                                                                                               | —                 |
| **Train partners or locations**<br>`partner_network`      | course → Playbook<br>academy → Partner Academy<br>learner → Partner<br>credential → Qualification                                                                              | —                 |
| **Teach students**<br>`school`                            | learner → Student                                                                                                                                                              | —                 |
| **Educate members**<br>`membership`                       | learner → Member                                                                                                                                                               | —                 |
| **Something else**<br>`unspecified`                       | _nothing seeded_                                                                                                                                                               | —                 |

### Why only two hide anything

Ten of twelve hide no setup steps, which is the model working: most differences
are vocabulary, and vocabulary is not a restriction. Only the two internal cases
skip anything, and both skip the same two things — an SOP library and a
compliance programme have no public front door, so "brand your academy" and
"preview it as a learner" are noise.

**Test for future additions:** if a proposed use case wants to hide a great
deal, it is really a different product and should be questioned rather than
added.

---

## Two use cases added after review — Implemented

Both were evaluated against the bar that a candidate must imply a genuinely
different vocabulary, not name another customer segment. Both passed.

**`professional_development`** — structured growth, leadership and upskilling
that produces a completion record rather than formal credit or a certification.
Distinct from `staff_onboarding` (procedures, not growth) and from
`continuing_education` (no external credit body).

**`qualification`** — proving a person can perform work to a defined standard,
with named human assessment. The question is _can this person do the work_
rather than _did this person complete the training_, which is what separates it
from `compliance`. It maps directly onto competency and named sign-off, which
the platform already has.

---

## Rejected: industry verticals — Principle

No use case is added merely for healthcare, sports, nonprofits, employee
training, franchise training, product training, leadership development,
volunteer training, sales enablement, or corporate universities. These map onto
broader use cases. **The catalog must not become an industry directory.**

---

## How it works — Implemented

- The catalog lives in the shared domain package as pure data, so vocabulary has
  one definition rather than a copy in SQL drifting from a copy in the
  application. The database constraint lists the ids; the words live in one
  place.
- On organization creation the chosen use case seeds rows into the normal
  terminology table. Seeding is deliberately **non-fatal**: the workspace is
  usable with platform defaults, and failing an entire signup because a naming
  preference did not save would be the worse outcome.
- The setup checklist filters by use case. It filters **guidance only** — every
  underlying surface stays reachable, and progress is measured against the steps
  that apply, so an SOP library is not stranded at 80% having finished
  everything asked of it.
- Terminology flows through navigation, breadcrumbs and checklist copy, so a
  seeded vocabulary reaches the whole workspace rather than a few labels.
- After creation, the setup checklist carries one line — _"Terminology set up
  for Onboarding staff and documenting SOPs. Review terms"_ — linking to the
  existing terminology editor. It blocks nothing, adds no signup step, and
  leaves with the checklist. It appears only when words were actually seeded.

---

## Existing organizations — Implemented

`organization_terminology` records **no provenance**: a row seeded at signup and
a word a customer typed are byte-for-byte indistinguishable.

Therefore corrected vocabulary applies to **new organizations only**, and
nothing ever re-seeds an existing one. This fails closed by construction rather
than by judgement, because guessing wrong overwrites a customer's own words with
no way back.

Current state: no organization holds use-case-seeded terminology, so nothing is
stranded by this decision today. Built For Her has seven overrides authored
before use cases existed, and a null `use_case` — both pinned by test, including
the fact that its `course → Program` and `instructor → Coach` collide with words
a use case would have chosen.

**Deferred question:** if seeded terminology ever needs correcting in place, a
provenance column (`source: 'seeded' | 'customer'`) would be required first.
Nothing should attempt it without one.

---

## Multiple use cases — Deferred

The intended long-term model is one `primary_use_case` plus zero or more
`additional_use_cases`, where the secondary ones influence recommendations,
guidance, templates and suggestions but **never automatically overwrite
terminology the organization already uses**.

**Not implemented, deliberately.** Signup remains single-select. The existing
`use_case` column already serves as the primary, so no rename is needed yet;
`additional_use_cases` would be added alongside it when there is a surface that
writes and reads it. Adding storage now with no writer and no consumer is the
unnecessary complexity the review warned against — and renaming a column added
days earlier would churn migrations for no functional gain.

Real motivation, unchanged: Timberhill Athletic Club does staff SOPs, trainer
development and CEU issuance simultaneously. Today it picks one and edits the
rest by hand.

---

## Continuing-education units — Deferred

A CEU is a **quantitative** continuing-education unit, not inherently the
credential. `continuing_education` therefore seeds _Certificate of Completion_
rather than _CEU Credit_ — naming the credential after the unit conflated two
things.

NovaKore should eventually represent quantitative awards: CEUs, contact hours,
CECs, PDHs and other provider-defined units. **No accounting system was built
here**, and the current model has no extension point for one. This is recorded
as a future domain requirement.

---

## Real tenants this was designed against

- **Built For Her** — an academy selling programs to members. Would map to
  `customer_academy`; currently has no use case and its own terminology.
- **Timberhill Athletic Club, Personal Training** — SOPs, trainer development
  and CEUs. Maps to `staff_onboarding`, but genuinely spans three cases.
- **G3 Performance** — building continuing-education courses. Maps to
  `continuing_education`.

---

## Known open question

**`qualification` uses the same word twice.** `course → Qualification` and
`credential → Qualification` mean a workspace says "Create your first
Qualification" for the content and "Qualification" for the award. That may be
how the field genuinely speaks, or it may need the content called something
else. Flagged for owner decision; implemented as specified.

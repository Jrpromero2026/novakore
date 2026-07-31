# Brand Voice (v1.0)

NovaKore writes like infrastructure: direct, professional, specific. Say
what a thing does. No marketing inflation, no consumer-education tone.

## Principles

- **Precision over promise.** "Versioned content with deliberate publishing"
  beats "powerful authoring experience".
- **Infrastructure, not app.** NovaKore powers organizations; it is not a
  destination people "enjoy".
- **Calm authority.** Errors are specific; empty states explain and offer
  the next action; nothing shouts.
- Uppercase only for labels, metadata, and short navigational cues.

## Vocabulary

| Say                                          | Never say                            |
| -------------------------------------------- | ------------------------------------ |
| learning infrastructure                      | learning platform, training platform |
| knowledge infrastructure, knowledge systems  | LMS, e-learning suite                |
| organizations                                | customers' workspaces, tribes        |
| academies, journeys, programs                | course catalog (marketing surfaces)  |
| members, credentials, standards              | learners' badges, gamified rewards   |
| publish, review, certify, configure, operate | supercharge, revolutionize           |

Machine-readable lists: `BRAND_VOCABULARY` / `BRAND_BANNED_VOCABULARY` in
`@novakore/design-system`.

**Scope rule (ADR-003):** canonical entity names in code and schema
(`courses`, `lessons`, …) never change. Tenant-facing entity words always
pass through the terminology resolver. Voice rules govern _marketing and
platform-identity surfaces_ — they are not a rename of the domain model.

## Examples

- ✅ "Learning infrastructure for professional organizations."
- ✅ "Governed evaluation workflows that end in verifiable credentials."
- ❌ "The all-in-one learning platform that supercharges your team!"
- ❌ "Create amazing courses your learners will love."

Knovacora (the separate future ecosystem) vocabulary — marketplace,
discovery, creator economy — remains prohibited in NovaKore surfaces
(framework §1).

# G3 Performance Foundations — Curriculum

**Version:** 1.0
**Scope:** G3 101 through G3 105 as one Foundations curriculum
**Curriculum Review Gate:** **PASS** — Corrections 1–4 complete; parent artifacts created
**Status:** **G3 PERFORMANCE FOUNDATIONS v1.0 — LOCKED FOR NOVAKORE IMPLEMENTATION**
**Authority:** G3 Performance

## Parent Curriculum Document (Authoritative at Series Level)

**Division:** G3 Performance, the human performance division of G3 Sports & Fitness
**Owner / approver:** JR Romero, CSCS — Director of Training, G3 Performance
**Date:** August 2026
**Machine-readable counterpart:** `G3-Performance-Foundations-Manifest-v1.0-FINAL.json`
**Supersedes:** No prior series-level artifact. This is the first Foundations parent document.

---

## 0. DOCUMENT CONTROL

### 0.1 What this document is

This is the **parent curriculum document** for the G3 Performance Foundations series. It defines the relationship among the five courses: their sequence, their roles, where authority sits when they overlap, what a learner must complete, and what NovaKore receives.

It is **authoritative at series level** and only at series level. It does not restate course content, and it creates no doctrine, no Applied Standard, no competency, no assessment, and no number. Where this document and a course specification disagree on something inside that course, **the course specification governs**; where they disagree on something between courses, **this document governs**.

### 0.2 Gate record

| Stage | Artifact | Status |
|---|---|---|
| Course production | G3 101 v2.0, G3 102–105 v1.0 specifications and build files | **COMPLETE** |
| Curriculum review | G3 Performance Foundations — 101–105 Curriculum Review Gate v1.0 | **CONDITIONAL PASS** — curriculum sound; series-level production corrections required |
| Research reopen | — | **NO** |
| Doctrine reopen | — | **NO** |
| Course redesign | — | **NO** |
| Foundations Harmonization Pass | Corrections 1–4 + parent artifacts | **COMPLETE** — §7 |
| Curriculum Review Gate, post-correction | This document + the manifest | **PASS** |
| NovaKore implementation | Foundations package (§6) | **RELEASED FROM HOLD** |

### 0.3 What the harmonization pass was permitted to change

**Changed:** governance text, metadata, inheritance references, JSON authority fields, version control of G3 102 artifacts, and the ratification status of two G3 101 production additions.

**Not changed, in any course:** doctrine · evidence classes · module architecture · course outcomes · practical sign-offs · terminal defenses · assessment architecture · rubrics · the G3 programming decision model · reference mapping · any numerical position. **No claim was reclassified, no research was performed, and no numerical prescription was added anywhere in the series.**

---

## 1. THE SERIES

### 1.1 Sequence

```
G3 101 → G3 102 → G3 103 → G3 104 → G3 105
```

The sequence is **normative**. A course does not open until its predecessor is complete, including that predecessor's terminal defense.

### 1.2 Course roles

| # | Course | Role | What it installs |
|---|---|---|---|
| **1** | **G3 101 — Foundations of Athletic Performance** | **Reasoning System** | The G3 reasoning system, evidence discipline, scope boundaries, testing and monitoring restraint, and the foundational training principles |
| **2** | **G3 102 — Needs Analysis & Performance Program Design** | **Programming Decision System** | The authoritative G3 programming decision model: DEMAND → PROFILE → GAP → PRIORITY → PRESCRIPTION → RESPONSE → ADJUST |
| **3** | **G3 103 — Speed, Agility & Change of Direction** | **Speed / Multidirectional Domain** | The 101/102 system applied to linear speed, deceleration, COD, agility, testing, and transfer |
| **4** | **G3 104 — Strength Development** | **Strength Domain** | The 101/102 system applied to strength, loading, exercise selection, dose, testing, and integration |
| **5** | **G3 105 — Power Development** | **Power Domain / Foundations Integration** | Reasoning, programming, speed, and strength integrated into task-specific power development, testing, technology governance, and transfer |

### 1.3 The intellectual progression

```
reasoning → programming → domain application → integration
```

Each course assumes the one before it. **G3 103, G3 104, and G3 105 do not re-teach the reasoning system or the decision model** — they recall it, apply it in a domain, and require a new decision (§5.2).

### 1.4 Series-level competency statement

A G3 Performance Foundations graduate can:

**REASON → ANALYZE → PRIORITIZE → PRESCRIBE → COACH → MEASURE → INTERPRET → ADJUST → DEFEND**

Across the five courses the competency ladder runs **KNOW → UNDERSTAND → APPLY → COACH → EVALUATE → DEFEND**. **Applied coaching competence is never certified by written work alone, in any course in the series.**

---

## 2. THE FOUNDATIONS AUTHORITY RULE

This is the series-level hierarchy. It is stated identically in all five course specifications and in all five build files, and it does not vary by course, document, or context.

| Course | Authoritative on |
|---|---|
| **G3 101** | The **G3 reasoning system**: evidence classes, certainty language, Evidence / G3 Applied Standard / Coach Judgment separation, population-transfer disclosure, testing and monitoring interpretation, claim-correction symmetry, scope of practice, and evidence restraint. |
| **G3 102** | The **G3 programming decision model**: DEMAND → PROFILE → GAP → PRIORITY → PRESCRIPTION → RESPONSE → ADJUST, including programming priority and change governance. |
| **G3 103** | **Speed, deceleration, COD, and agility** — where its standard is narrower than the upstream rule. |
| **G3 104** | **Strength development** — where its standard is narrower than the upstream rule. |
| **G3 105** | **Power development** — where its standard is narrower than the upstream rule. |

**Two rules bind every course:**

1. **No downstream course may loosen an upstream evidence, scope, measurement, or programming-integrity standard.**
2. **Where domain courses overlap, the more specific domain governs only inside that domain; otherwise the upstream standard controls.**

### 2.1 How to apply it

- A domain course may be **narrower** than an upstream rule. It may never be **looser**.
- "Narrower" means: a tighter constraint, a smaller permitted range, an additional required disclosure, or a stricter prohibition. It does not mean a different classification of the same claim.
- Where two domain courses touch the same decision — a jump that appears in both G3 103 and G3 105, a lift that appears in both G3 104 and G3 105 — **the domain that owns the decision governs inside its own domain only.** Outside it, the upstream standard applies unchanged.
- A conflict that cannot be resolved by this rule is **not** resolved by production, editorial, or platform work. It is returned to the Director of Training as a **BLOCKER**.

### 2.2 Series attribution

Several things the later courses use originate in an earlier one. Attribution is recorded so that the series has **one origin per standard** rather than several.

| What | Origin | Local restatements |
|---|---|---|
| Evidence taxonomy and certainty language | **G3 101** | Extended by G3 103 (Class F) and G3 104 (Class U); harmonized at series level (§3) |
| Three-layer discipline — Evidence / G3 Applied Standard / Coach Judgment | **G3 101** | Carried unchanged by G3 102–105 |
| Population-transfer disclosure | **AS-101-16** | **G3 103 restates it as AS-103-12**; G3 104 and G3 105 carry that restatement |
| Claim-correction symmetry rule | **G3 101** | Restated by G3 103; applied in every claim-audit register |
| Testing and monitoring interpretation rule | **G3 101** | Restated by G3 105 as *what the test measures ≠ what the coach wished it measured* |
| Change governance | **G3 101** | Carried by **G3 102 as Doctrine 12**, which is authoritative for programming |
| Programming decision model | **G3 102** | Applied by G3 103, G3 104, and G3 105; **never modified by them** |

---

## 3. SERIES EVIDENCE TAXONOMY

One taxonomy across all five courses.

| Class | Name |
|---|---|
| **A** | Established Evidence |
| **B** | Supported Practice |
| **C** | Emerging / Conditional Evidence |
| **D** | Applied Coaching Inference |
| **E** | Historical / Practitioner Framework |
| **F** | Unsupported / Overstated Claim |
| **U** | Unresolved / Unknown |

**U is the machine-readable series class** for a question about which no defensible evidence-class assignment can be made. **"Unknown" remains the human-facing certainty label** for the same condition. The two are equivalent in force, and both mean: *G3 does not know, and no G3 material may proceed as though it does.*

### 3.1 Recognition, not reclassification

**Every course recognizes all seven classes. No course is required to use all of them. No claim in any course has been reclassified in order to populate a class.**

| Course | Classes used | Note |
|---|---|---|
| **G3 101** | A, B, C, D, E, F, U | U is carried as the **Unknown** certainty label, which is its human-facing form |
| **G3 102** | A, B, C, D, E | F and U are recognized but not used: overstated claims live in the Prohibited Claims Register, unresolved questions in the Conditional & Professional-Judgment Register. Neither register was reclassified. |
| **G3 103** | A, B, C, D, E, F | U is recognized but not used: unresolved questions live in the Coach Judgment register |
| **G3 104** | A, B, C, D, E, F, U | G3 104 introduced U to the series; usage unchanged |
| **G3 105** | A, B, C, D, E, F, U | U carried alongside the Known / Probable / Possible / Unknown / Organizational-choice certainty language; usage unchanged |

---

## 4. WORKLOAD AND STRUCTURE

### 4.1 Directed study

| Course | Modules | Minutes | Hours |
|---|---|---|---|
| G3 101 | 12 | 1,050 | **17.5** |
| G3 102 | 12 | 1,110 | **18.5** |
| G3 103 | 12 | 1,170 | **19.5** |
| G3 104 | 12 | 1,245 | **20.75** |
| G3 105 | 12 | 1,275 | **21.25** |
| **Total** | **60** | **5,850** | **97.5** |

**Total directed study: 97.5 hours.** This excludes practical windows, sign-off observation, artifact work, and terminal defenses — all of which are additional and are collected on the floor.

The ascending order is deliberate: the entry course is the shortest, and the load rises as the coach's competence and the domain complexity rise.

### 4.2 Practical requirement

Across the five courses:

- **20 practical sign-offs** — PS-1 through PS-4 in each of the five courses
- **5 terminal defenses** — T-01 in each of the five courses
- **5 practical windows** — a minimum of four weeks in each course

### 4.3 Common course structure

Every course in the series carries: 12 modules · a seventeen-element module content model · four observed practical sign-offs · a terminal defense · required cases · real-world artifact requirements · a minimum practical window · sequential prerequisites · and the three-layer discipline rendered visually distinct.

**A coach moving through the series meets the same page shape every time.** That is a design decision, and it is the reason the series can be taught by different instructors without drift.

---

## 5. SERIES COMPLETION AND DUPLICATION

### 5.1 Series completion rule

A learner completes **G3 Performance Foundations** only when **all six** conditions hold:

1. **G3 101 through G3 105 are complete, in sequence.**
2. All required module assessments are at standard.
3. **All 20 course practical sign-offs are recorded** by an approved assessor.
4. **All 5 terminal defenses are passed.**
5. All required practical windows are satisfied.
6. **No required remediation remains open.**

Partial completion confers no series credential. A coach who has completed G3 101 and G3 102 holds those two course completions, and the programming authority G3 102 carries — not Foundations.

### 5.2 Duplication is intentional — and bounded

Twelve concepts are **deliberately reinforced** across the series and must not be de-duplicated: the Evidence / Applied Standard / Coach Judgment separation · specificity ≠ resemblance · measurement ≠ diagnosis · transfer must be evaluated · youth age myths · technology restraint · no universal thresholds · the fatigue-quality distinction · conservative injury language · population-transfer disclosure · testing reliability and error · no single metric runs the program.

**The editorial rule that bounds the repetition:**

```
RECALL → DOMAIN APPLICATION → NEW DECISION
```

A downstream course **recalls** the upstream concept in a sentence, **applies** it to its domain, and requires a **new decision** the upstream course did not ask for. **It does not re-teach the upstream lesson.** NovaKore deep-links to the upstream concept rather than reproducing it.

---

## 6. THE NOVAKORE FOUNDATIONS PACKAGE

NovaKore receives **one approved package**. The five course build files are **not** ingested independently.

**The manifest is ingested first.**

| # | Artifact | Type |
|---|---|---|
| 1 | `G3-Performance-Foundations-Manifest-v1.0-FINAL.json` | **Manifest — ingested first** |
| 2 | `G3-Performance-Foundations-Curriculum-v1.0-FINAL.md` | Parent curriculum (this document) |
| 3 | `G3-101-Course-Specification-v2.0-FINAL.md` | Course specification |
| 4 | `G3-101-NovaKore-Build-v2.0-FINAL.json` | Course build |
| 5 | `G3-102-Course-Specification-v1.0-FINAL.md` | Course specification — **canonical** |
| 6 | `G3-102-NovaKore-Build-v1.0-FINAL.json` | Course build — **canonical** |
| 7 | `G3-103-Course-Specification-v1.0-FINAL.md` | Course specification |
| 8 | `G3-103-NovaKore-Build-v1.0-FINAL.json` | Course build |
| 9 | `G3-104-Course-Specification-v1.0-FINAL.md` | Course specification |
| 10 | `G3-104-NovaKore-Build-v1.0-FINAL.json` | Course build |
| 11 | `G3-105-Course-Specification-v1.0-FINAL.md` | Course specification |
| 12 | `G3-105-NovaKore-Build-v1.0-FINAL.json` | Course build |

### 6.1 Excluded from ingestion

Pre-FINAL, duplicate, derivative, and rendering artifacts are **excluded**. For G3 102 specifically, the pre-gate specification Markdown, its DOCX and PDF renderings, the DOCX source, the pre-FINAL build JSON, and the DOCX working directory have been moved to an archive directory carrying a notice, and are not current. The archived pre-gate Markdown still contains the superseded delivery sentence *"two supervised practical blocks and a final defense"*; **the approved G3 102 architecture is PS-1, PS-2, PS-3, PS-4, and T-01**, and that sentence appears nowhere in the canonical pair.

### 6.2 Platform prohibitions that bind the whole series

No NovaKore feature, report, dashboard, template, or automation may generate: an automated training priority · a readiness prescription or automated session determination · an ACWR injury alert or safe-zone classification · an asymmetry alert · a movement-screen injury classification or risk score · a youth age or puberty gate · a recovery clock · a periodization prescription · a "nonresponder" classification · a force-velocity diagnosis · an optimal-load prescription · a prescribed contact count · a strength-ratio gate · a velocity-loss stop rule · an injury-risk score or injury-prevention claim · or a capability ranking of an athlete.

**Every interpretive statement in NovaKore carries a human author.** This holds in all five courses and is not relaxed by any of them.

---

## 7. HARMONIZATION RECORD

### 7.1 Corrections applied

| # | Correction | What was done |
|---|---|---|
| **1** | **Canonicalize G3 102 files** | The canonical pair was confirmed to be already correct — 12 modules, 1,110 minutes / 18.5 hours, four-week window, PS-1 through PS-4, T-01, prerequisite G3 101, sequencing and hard gates all present and agreeing between MD and JSON. The superseded delivery sentence exists **only** in pre-FINAL artifacts, which were moved to `_archive-not-for-ingestion/` with a notice. Three derived course-level fields (`module_count`, `directed_study_minutes`, `terminal_defense`) were added to the build file for uniform cross-course validation, computed from the file's own data. **Version control only.** |
| **2** | **Harmonize the Foundations Authority Rule** | The rule was added verbatim to all five specifications as a §0 subsection and to all five build files as `foundations.authority_rule`, together with each course's own position and the series attribution table. |
| **3** | **Harmonize the evidence taxonomy** | A series-level taxonomy subsection recognizing **A–F + U** was added to §2 of all five specifications and to all five build files as `foundations.series_evidence_taxonomy`, with each course's actually-used class set recorded. **No claim in any course was reclassified.** |
| **4** | **Resolve G3 101 pending ratification** | **AS-101-16** (Disclose Population Transfer) and **CA-28** (the "nonresponder" claim audit) are **ratified**. Record: *Ratified by Director of Training as part of the G3 Performance Foundations Curriculum Review Gate.* Both are minor-release items and are **binding from G3 101 v2.0**. AS-101-16 is carried at series level as the population-transfer standard; **G3 103's AS-103-12 is recorded as its local restatement**. No G3 101 ratification remains outstanding. |

### 7.2 Parent artifacts created

`G3-Performance-Foundations-Curriculum-v1.0-FINAL.md` and `G3-Performance-Foundations-Manifest-v1.0-FINAL.json`.

### 7.3 Cross-course validation

A cross-course validator (`validate_foundations.py`) was run over all twelve package artifacts, implementing the gate's §8 Required Cross-Course QA list. Every assertion is made **against the artifacts themselves**, never against this document or the manifest — the parent artifacts are checked *by* the validator, not trusted by it. **The result is recorded in §7.4 and in the manifest.**

Each course's own production QA harness was also re-run after harmonization: G3 101 **235/235**, G3 102 all checks passed, G3 103 **79/79**, G3 104 **92/92**, G3 105 **187/187**. One harness defect surfaced and was corrected in the process: G3 102's audit flagged the superseded delivery sentence *quoted* in its new archive record (§20.6a) as though it were asserted. The check now requires that the sentence never be asserted and appear only where it is identified as superseded — a stricter test than the one it replaced, not a weaker one. The cross-course validator carries the same rule.

### 7.4 Validation record

**244 cross-course checks, all passed.** The validator verifies, from the artifacts themselves rather than from this document: one canonical MD and JSON per course · no stale G3 102 artifact marked current · the 101 → 102 → 103 → 104 → 105 sequence · prerequisites following that sequence · 12 modules in every course · directed-study hours of 17.5 / 18.5 / 19.5 / 20.75 / 21.25 · a 97.5-hour total · PS-1 through PS-4 and T-01 in every course · 20 sign-offs and 5 terminal defenses across the series · the authority rule present and identical in all ten course artifacts · A–F + U recognized everywhere · the three-layer discipline attributed to G3 101 · population-transfer governance attributed to AS-101-16 with AS-103-12 recorded as a local restatement · the G3 102 decision model unchanged · no automated priority, readiness, injury, or asymmetry prescription introduced · MD and JSON prerequisite and gating statements in agreement · and every manifest reference pointing to a canonical FINAL artifact.

### 7.5 What a future change must do

- A change **inside** a course follows that course's own change-control table and does not touch this document — **unless** it alters a count this document states, in which case the manifest and this document are updated in the same release.
- A change to the **authority rule**, the **taxonomy**, the **sequence**, the **completion rule**, or the **package contents** is a series-level change requiring Director of Training approval and a new Foundations version.
- **Any change to any artifact requires the cross-course validator to be re-run** and §7.4 re-recorded before NovaKore re-ingestion.

---

## 8. GOVERNANCE

**Owner:** G3 Performance. **Approver:** Director of Training.
**Review cycle:** 24 months, or on any trigger recorded in a course's own review-trigger list.

**Series-level review triggers:** a course changes at major-release level · a new course is added to the series · an external-use gate is released for any course · a cross-course validation failure · a NovaKore implementation constraint that cannot be satisfied without a series-level change.

**Production prohibition, inherited from every course in the series:** no change may be made to doctrine, an evidence class, or an Applied Standard by production, editorial, or platform work. A production process that finds a doctrinal contradiction returns a **BLOCKER**; it does not resolve it.

**External use.** Each course carries its own external-use gate, and those gates are **not** released by this document. Until a course's gate is released by the Director of Training, it is an internal G3 CEU course and is described as one — in NovaKore, in marketing, and to coaches. **The series is described the same way.**

---

**G3 PERFORMANCE FOUNDATIONS v1.0 — LOCKED FOR NOVAKORE IMPLEMENTATION**

*G3 Performance · The human performance division of G3 Sports & Fitness · The Standard is the Product.*

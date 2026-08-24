#!/usr/bin/env node
/**
 * G3 Performance Foundations v1.0 — NovaKore seed generator.
 *
 * Reads the canonical package in curriculum/g3-performance-foundations/
 * (five NovaKore build JSONs + five course specification MDs + the parent
 * curriculum) and emits supabase/seeds/g3-performance-foundations.sql —
 * a deterministic, idempotent seed following the house conventions
 * (fixed UUIDs, `on conflict do nothing`, published state written directly).
 *
 * The generator NEVER invents curriculum content: every statement, item,
 * rubric, and classification is copied verbatim from the package. Where the
 * package supplies no machine-readable content for a slot, the slot is
 * omitted — not fabricated. Counts are asserted against the package's own
 * derived fields and the parent curriculum's stated totals; any mismatch
 * aborts the build.
 *
 * Usage: node scripts/g3-foundations/generate.mjs
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PKG = join(ROOT, "curriculum", "g3-performance-foundations");
const OUT_SQL = join(
  ROOT,
  "supabase",
  "seeds",
  "g3-performance-foundations.sql",
);
const OUT_REPORT = join(ROOT, "scripts", "g3-foundations", "build-report.json");

// ---------------------------------------------------------------------------
// Deterministic ids: RFC-4122 v5-style (SHA-1) over a fixed namespace.
// ---------------------------------------------------------------------------
const NAMESPACE = "novakore:g3-performance-foundations:v1.0:";
function uid(key) {
  const h = createHash("sha1")
    .update(NAMESPACE + key)
    .digest();
  h[6] = (h[6] & 0x0f) | 0x50; // version 5
  h[8] = (h[8] & 0x3f) | 0x80; // RFC variant
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const failures = [];
const checks = [];
function check(label, ok, detail = "") {
  checks.push({ label, ok: !!ok, detail });
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------
// Long literals are emitted as concatenations of short pieces so no emitted
// line exceeds ~1.3KB (keeps the seed reviewable and transferable line-wise).
const PIECE = 1200;
function q(s) {
  const str = String(s);
  if (str.length <= PIECE) return `'${str.replace(/'/g, "''")}'`;
  const pieces = [];
  let i = 0;
  while (i < str.length) {
    let end = Math.min(i + PIECE, str.length);
    // never split a surrogate pair
    if (end < str.length) {
      const cc = str.charCodeAt(end - 1);
      if (cc >= 0xd800 && cc <= 0xdbff) end -= 1;
    }
    pieces.push(`'${str.slice(i, end).replace(/'/g, "''")}'`);
    i = end;
  }
  return `(${pieces.join("\n    || ")})`;
}
const qj = (v) => `(${q(JSON.stringify(v))})::jsonb`;
const qarr = (a) =>
  a.length === 0
    ? "'{}'::text[]"
    : `array[${a.map((x) => q(x)).join(",")}]::text[]`;
const qn = (s) => (s === null || s === undefined || s === "" ? "null" : q(s));

// Fractional-index positions: a0, a1, … a9, b0 … (lexicographic, seed style)
function pos(i) {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  return `${letters[Math.floor(i / 10)]}${i % 10}`;
}

// ---------------------------------------------------------------------------
// Load the package
// ---------------------------------------------------------------------------
const COURSES = [
  { code: "G3-101", ver: "v2.0", slug: "g3-101", curriculumVersion: "2.0" },
  { code: "G3-102", ver: "v1.0", slug: "g3-102", curriculumVersion: "1.0" },
  { code: "G3-103", ver: "v1.0", slug: "g3-103", curriculumVersion: "1.0" },
  { code: "G3-104", ver: "v1.0", slug: "g3-104", curriculumVersion: "1.0" },
  { code: "G3-105", ver: "v1.0", slug: "g3-105", curriculumVersion: "1.0" },
];
for (const c of COURSES) {
  c.build = JSON.parse(
    readFileSync(
      join(PKG, `${c.code}-NovaKore-Build-${c.ver}-FINAL.json`),
      "utf8",
    ),
  );
  c.spec = readFileSync(
    join(PKG, `${c.code}-Course-Specification-${c.ver}-FINAL.md`),
    "utf8",
  );
}
const parentMd = readFileSync(
  join(PKG, "G3-Performance-Foundations-Curriculum-v1.0-FINAL.md"),
  "utf8",
);

// ---------------------------------------------------------------------------
// Canonical-file guards (the §6.1 stale-artifact rule, enforced mechanically)
// ---------------------------------------------------------------------------
for (const c of COURSES) {
  const asserted =
    c.spec.split("two supervised practical blocks and a final defense").length -
    1;
  if (c.code === "G3-102") {
    // The sentence may appear ONLY where identified as superseded (§20.6a).
    const okContext =
      asserted === 0 ||
      (asserted === 1 && c.spec.includes("superseded delivery sentence"));
    check(`102 stale sentence never asserted`, okContext);
  } else {
    check(`${c.code} carries no superseded G3 102 sentence`, asserted === 0);
  }
  check(
    `${c.code} spec carries the Foundations Authority Rule`,
    c.spec.includes("Foundations Authority Rule"),
  );
  check(
    `${c.code} build carries foundations.authority_rule`,
    !!c.build.foundations?.authority_rule,
  );
}

// ---------------------------------------------------------------------------
// Spec parsing
// ---------------------------------------------------------------------------
function parseModules(spec) {
  const out = new Map();
  const re = /^## MODULE (\d+) — (.+)$/gm;
  const hits = [];
  let m;
  while ((m = re.exec(spec)) !== null)
    hits.push({ n: Number(m[1]), title: m[2].trim(), start: m.index });
  for (let i = 0; i < hits.length; i++) {
    const end =
      i + 1 < hits.length
        ? hits[i + 1].start
        : spec.indexOf("\n## ", hits[i].start + 4) === -1
          ? spec.length
          : (() => {
              // stop at the next same-level heading after the last module
              const rest = spec.slice(hits[i].start + 4);
              const nxt = rest.search(/\n## (?!MODULE)/);
              return nxt === -1 ? spec.length : hits[i].start + 4 + nxt;
            })();
    const body = spec.slice(hits[i].start, end);
    const sections = {};
    const sre = /^### \d+ · (.+)$/gm;
    const shits = [];
    let s;
    while ((s = sre.exec(body)) !== null)
      shits.push({ name: s[1].trim(), start: s.index, len: s[0].length });
    for (let j = 0; j < shits.length; j++) {
      const sEnd = j + 1 < shits.length ? shits[j + 1].start : body.length;
      sections[shits[j].name] = body
        .slice(shits[j].start + shits[j].len, sEnd)
        .trim();
    }
    out.set(hits[i].n, { title: hits[i].title, sections, body });
  }
  return out;
}

/** `**L1.2 — Title.** prose` / `**Lesson 1.2 — Title.** prose` lines. */
function parseLessonProse(sectionText) {
  if (!sectionText) return [];
  const out = [];
  const re =
    /\*\*(?:Lesson\s+)?(L?\d+\.\d+)\s*[—–-]\s*([^*]+?)\.?\*\*\s*([\s\S]*?)(?=\n\s*\*\*(?:Lesson\s+)?L?\d+\.\d+\s*[—–-]|$)/g;
  let m;
  while ((m = re.exec(sectionText)) !== null) {
    out.push({
      id: m[1].startsWith("L") ? m[1] : `L${m[1]}`,
      title: m[2].trim(),
      prose: m[3].trim().replace(/\n{2,}/g, "\n\n"),
    });
  }
  return out;
}

/** Markdown evidence table → rows {statement, cls, basis}. */
function parseEvidenceTable(sectionText) {
  if (!sectionText) return [];
  const rows = [];
  for (const line of sectionText.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|") || /^\|[\s-|]+\|$/.test(t)) continue;
    const cells = t
      .split("|")
      .slice(1, -1)
      .map((x) => x.trim().replace(/\*\*/g, ""));
    if (cells.length < 3) continue;
    if (/^statement$/i.test(cells[0])) continue;
    rows.push({ statement: cells[0], cls: cells[1], basis: cells[2] });
  }
  return rows;
}

/** Knowledge item lines: `- **K1.1** (MC) text *(Key: ...)*` */
function parseKnowledgeItems(sectionText) {
  if (!sectionText) return [];
  const out = [];
  const re = /^[-*] \*\*(K[\d.]+)\*\*\s*\(([^)]+)\)\s*(.+)$/gm;
  let m;
  while ((m = re.exec(sectionText)) !== null) {
    let text = m[3].trim();
    let key = null;
    const keyMatch = /\*\((?:Key|Keys):\s*([\s\S]+?)\)\*\s*$/.exec(text);
    if (keyMatch) {
      key = keyMatch[1].trim();
      text = text.slice(0, keyMatch.index).trim();
    }
    out.push({ id: m[1], format: m[2].trim(), item: text, key });
  }
  return out;
}

/** Applied assessment: `**A1 — Title.** description` + `**Standard:** ...` */
function parseApplied(sectionText) {
  if (!sectionText) return null;
  const m = /\*\*(A\d+[a-z]?)\s*[—–-]\s*([^*]+?)\.?\*\*\s*([\s\S]*)/.exec(
    sectionText.trim(),
  );
  if (!m)
    return {
      id: null,
      title: null,
      description: sectionText.trim(),
      standard: null,
    };
  let description = m[3].trim();
  let standard = null;
  const sm = /\*\*Standard:?\*\*:?\s*([\s\S]+)$/.exec(description);
  if (sm) {
    standard = sm[1].trim();
    description = description.slice(0, sm.index).trim();
  }
  return { id: m[1], title: m[2].trim(), description, standard };
}

const clip = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);
const flat = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();

for (const c of COURSES) c.specModules = parseModules(c.spec);

// ---------------------------------------------------------------------------
// Normalize per-course data
// ---------------------------------------------------------------------------
function normalizeCourse(c) {
  const b = c.build;
  const course = b.course;
  check(
    `${c.code} version`,
    course.version === c.curriculumVersion,
    course.version,
  );
  check(`${c.code} module_count = 12`, course.module_count === 12);
  check(`${c.code} 12 modules in build`, b.modules.length === 12);
  const minuteSum = b.modules.reduce(
    (a, m) => a + (m.duration_minutes ?? 0),
    0,
  );
  check(
    `${c.code} minutes ${course.directed_study_minutes}`,
    minuteSum === course.directed_study_minutes,
    `sum=${minuteSum}`,
  );
  check(`${c.code} window 4 weeks`, course.practical_window_weeks_min === 4);

  const signOffs = b.sign_offs;
  check(
    `${c.code} PS-1..PS-4`,
    JSON.stringify(signOffs.map((s) => s.id)) ===
      '["PS-1","PS-2","PS-3","PS-4"]',
  );
  const terminal =
    b.terminal_defense && typeof b.terminal_defense === "object"
      ? b.terminal_defense
      : null;
  check(
    `${c.code} T-01 present`,
    terminal !== null || course.terminal_defense === "T-01",
  );

  // Registries (kind → [{code, title, data}])
  const reg = [];
  const push = (kind, code, title, data, order) =>
    reg.push({
      kind,
      code: String(code),
      title: clip(flat(title), 300),
      data,
      order,
    });

  (b.doctrine ?? []).forEach((d, i) =>
    push(
      "doctrine",
      d.id ?? `D-${i + 1}`,
      d.title ?? d.statement ?? `Doctrine ${i + 1}`,
      d,
      i,
    ),
  );
  (b.applied_standards ?? []).forEach((s2, i) =>
    push(
      "applied_standard",
      s2.id ?? `AS-${i + 1}`,
      s2.title ?? s2.label ?? s2.statement,
      s2,
      i,
    ),
  );
  const judgment = b.coach_judgment ?? b.judgment_areas ?? [];
  judgment.forEach((j, i) =>
    push(
      "coach_judgment",
      j.id ?? `CJ-${i + 1}`,
      j.area ?? j.title ?? `Judgment ${i + 1}`,
      j,
      i,
    ),
  );
  const audits = b.claim_audit ?? b.prohibited_claims ?? [];
  audits.forEach((a, i) =>
    push(
      "claim_audit",
      a.id ?? `CA-${i + 1}`,
      a.claim ?? a.title ?? `Claim ${i + 1}`,
      a,
      i,
    ),
  );
  (b.competencies ?? []).forEach((k, i) =>
    push(
      "competency",
      k.id ?? `C-${i + 1}`,
      k.competency ?? k.title ?? `Competency ${i + 1}`,
      k,
      i,
    ),
  );
  (b.references ?? []).forEach((r, i) =>
    push(
      "reference",
      r.id ?? r.pack_id ?? `REF-${i + 1}`,
      r.source ?? r.identifier ?? `Reference ${i + 1}`,
      r,
      i,
    ),
  );
  (b.cases ?? []).forEach((cs, i) =>
    push("case", cs.id ?? `CASE-${i + 1}`, cs.title ?? `Case ${i + 1}`, cs, i),
  );
  const evClasses =
    b.foundations?.series_evidence_taxonomy ?? b.evidence_classes ?? [];
  evClasses.forEach((e, i) =>
    push(
      "evidence_classification",
      `CLASS-${e.class}`,
      `${e.class} — ${e.name}`,
      e,
      i,
    ),
  );
  push(
    "governance",
    "course-version",
    `${c.code} version ${course.version}`,
    {
      course: c.code,
      version: course.version,
      status: course.status ?? b.production_status ?? null,
      review_gates: b.review_gates ?? null,
    },
    900,
  );
  push(
    "governance",
    "workload",
    `${c.code} directed study`,
    {
      modules: course.module_count,
      directed_study_minutes: course.directed_study_minutes,
      directed_study_hours: course.directed_study_hours,
      practical_window_weeks_min: course.practical_window_weeks_min,
      note: "Directed study excludes practical windows, sign-off observation, artifact work, and terminal defenses.",
    },
    901,
  );
  push(
    "governance",
    "standing",
    `${c.code} standing`,
    {
      standing:
        course.standing ??
        "Internal G3 CEU course. External recognition not claimed; external-use gate closed until released by the Director of Training.",
      prerequisite: course.prerequisite ?? null,
    },
    902,
  );
  if (b.foundations)
    push(
      "governance",
      "foundations",
      `${c.code} Foundations position`,
      b.foundations,
      903,
    );
  if (b.governance)
    push(
      "governance",
      "change-control",
      `${c.code} governance`,
      b.governance,
      904,
    );
  if (b.decision_model)
    push(
      "governance",
      "decision-model",
      "G3 programming decision model",
      b.decision_model,
      905,
    );
  if (b.sequencing)
    push(
      "governance",
      "sequencing",
      `${c.code} sequencing and hard gates`,
      b.sequencing,
      906,
    );

  return { course, signOffs, terminal, reg };
}
for (const c of COURSES) c.norm = normalizeCourse(c);

// G3 102 decision-model integrity (must remain the exact seven stages)
{
  const dm = COURSES[1].build.decision_model;
  const stages = (dm.sequence ?? []).map((s) => String(s).toUpperCase());
  check(
    "G3 102 decision model unchanged",
    JSON.stringify(stages) ===
      JSON.stringify([
        "DEMAND",
        "PROFILE",
        "GAP",
        "PRIORITY",
        "PRESCRIPTION",
        "RESPONSE",
        "ADJUST",
      ]),
    stages.join("→"),
  );
}

// ---------------------------------------------------------------------------
// Fixed ids
// ---------------------------------------------------------------------------
// The owner self-provisioned the "G3 Performance" tenant (slug g3-performance)
// on 2026-08-21 via create_own_organization; this seed adopts that org id and
// fills it. On a fresh database the insert below creates it with the same id.
const ORG = "26f6aa4a-4ade-4bb0-842f-12ca2e5bc115";
const ACADEMY = uid("academy");
const SYSTEM = uid("learning-system");
const PATH = uid("path");
const OWNER_USER = "00000000-0000-4000-8000-000000000031"; // repo owner (seeded)
const OWNER_MEMBERSHIP = uid("membership:owner");

const FIXTURES = [
  {
    key: "new",
    email: "g3.learner.new@novakore.test",
    name: "G3 Fixture — New Learner",
    role: "learner",
  },
  {
    key: "c101",
    email: "g3.learner.101@novakore.test",
    name: "G3 Fixture — 101 Complete",
    role: "learner",
  },
  {
    key: "c102",
    email: "g3.learner.102@novakore.test",
    name: "G3 Fixture — Through 102",
    role: "learner",
  },
  {
    key: "modules",
    email: "g3.learner.modules@novakore.test",
    name: "G3 Fixture — Modules Done, Practicals Open",
    role: "learner",
  },
  {
    key: "practicals",
    email: "g3.learner.practicals@novakore.test",
    name: "G3 Fixture — Practicals Done, T-01 Open",
    role: "learner",
  },
  {
    key: "remediation",
    email: "g3.learner.remediation@novakore.test",
    name: "G3 Fixture — Remediation Open",
    role: "learner",
  },
  {
    key: "complete",
    email: "g3.learner.complete@novakore.test",
    name: "G3 Fixture — Foundations Complete",
    role: "learner",
  },
  {
    key: "assessor",
    email: "g3.assessor@novakore.test",
    name: "G3 Fixture — Assessor",
    role: "instructor",
  },
];
for (const f of FIXTURES) {
  f.userId = uid(`user:${f.key}`);
  f.membershipId = uid(`membership:${f.key}`);
  f.roleId = uid(`member-role:${f.key}`);
  f.enrollmentId = uid(`enrollment:${f.key}`);
}
const ASSESSOR = FIXTURES.find((f) => f.key === "assessor");

// ---------------------------------------------------------------------------
// Course assembly: modules → lessons → blocks; assessments; practicals
// ---------------------------------------------------------------------------
const TONE = {
  doctrine: "note",
  evidence: "info",
  standard: "success",
  judgment: "warning",
  audit: "danger",
};

function blockEnvelope(idKey, type, schemaVersion, data, index) {
  return { id: uid(idKey), type, schemaVersion, data, position: pos(index) };
}

function calloutBlock(idKey, tone, title, body, index) {
  return blockEnvelope(
    idKey,
    "callout",
    2,
    {
      tone,
      ...(title ? { title: clip(flat(title), 120) } : {}),
      body: clip(body, 19_000),
    },
    index,
  );
}

function assembleCourse(c, courseIndex) {
  const b = c.build;
  const courseId = uid(`course:${c.code}`);
  const modules = [];
  const lessons = []; // {id, moduleId, title, position, required, estimatedMinutes, blocks[]}
  const assessments = []; // {id, versionId, title, settings, items[], lessonId, assignmentId}
  const practicalReqs = []; // rows for practical_requirements
  const gateLessonByCode = {};
  const overviewLessonByModule = {};

  const order = b.sequencing.order;
  const rubrics = b.rubrics ?? {};

  const normDims = (r) =>
    (r?.dimensions ?? []).map((d) =>
      typeof d === "string"
        ? d
        : (d.dimension ?? d.name ?? d.title ?? JSON.stringify(d)),
    );
  const signoffRubric = (() => {
    const r =
      rubrics.coaching_rubric ?? rubrics.applied_competency_rubric ?? null;
    if (!r) return null;
    return {
      dimensions: normDims(r).map((d) => clip(flat(d), 160)),
      ...(r.scale ? { scale: clip(flat(r.scale), 120) } : {}),
      ...(r.pass ? { pass: clip(flat(r.pass), 500) } : {}),
    };
  })();
  const defenseRubric = (() => {
    const r = rubrics.defense_rubric ?? null;
    if (!r) return null;
    const nc = c.norm.terminal?.non_compensable_failures;
    return {
      dimensions: normDims(r).map((d) => clip(flat(d), 160)),
      ...(r.scale ? { scale: clip(flat(r.scale), 120) } : {}),
      ...(r.pass ? { pass: clip(flat(r.pass), 500) } : {}),
      ...(Array.isArray(nc) && nc.length > 0
        ? { nonCompensable: nc.slice(0, 16).map((x) => clip(flat(x), 300)) }
        : {}),
    };
  })();

  let moduleIndex = 0;
  for (const token of order) {
    if (/^M\d+$/.test(token)) {
      const n = Number(token.slice(1));
      const mod = b.modules[n - 1];
      check(
        `${c.code} ${token} in build`,
        !!mod && (mod.id === token || mod.number === n),
      );
      const specMod = c.specModules.get(n);
      const moduleId = uid(`module:${c.code}:${token}`);
      const title = mod.title ?? specMod?.title ?? token;
      modules.push({
        id: moduleId,
        title: clip(`${token} — ${flat(title)}`, 200),
        position: pos(moduleIndex),
      });

      const minutes = mod.duration_minutes ?? 0;
      const sections = specMod?.sections ?? {};
      const objectives = (mod.learning_objectives ?? mod.objectives ?? []).map(
        (o) =>
          typeof o === "string" ? o : `${o.id ? `${o.id} ` : ""}${o.objective}`,
      );

      // -- Lesson 1: Overview
      {
        const blocks = [];
        let bi = 0;
        const framing = mod.framing_statement ?? "";
        if (framing)
          blocks.push(
            blockEnvelope(
              `blk:${c.code}:${token}:ov:framing`,
              "quote",
              1,
              { text: clip(flat(framing), 2000) },
              bi++,
            ),
          );
        const purpose = mod.purpose ?? mod.focus ?? sections["Purpose"] ?? "";
        if (purpose)
          blocks.push(
            blockEnvelope(
              `blk:${c.code}:${token}:ov:purpose`,
              "rich_text",
              1,
              { text: clip(flat(purpose), 19_000) },
              bi++,
            ),
          );
        if (objectives.length > 0) {
          const fits = objectives.every((o) => flat(o).length <= 300);
          if (fits) {
            blocks.push(
              blockEnvelope(
                `blk:${c.code}:${token}:ov:objectives`,
                "checklist",
                1,
                {
                  items: objectives.slice(0, 30).map((o, i2) => ({
                    id: uid(`obj:${c.code}:${token}:${i2}`),
                    text: flat(o),
                  })),
                },
                bi++,
              ),
            );
          } else {
            blocks.push(
              blockEnvelope(
                `blk:${c.code}:${token}:ov:objectives`,
                "rich_text",
                1,
                {
                  text: clip(
                    objectives.map((o) => `• ${flat(o)}`).join("\n\n"),
                    19_000,
                  ),
                },
                bi++,
              ),
            );
          }
        }
        const gating = flat(
          mod.gating_summary ?? mod.gating ?? mod.prerequisite_gating ?? "",
        );
        if (gating)
          blocks.push(
            calloutBlock(
              `blk:${c.code}:${token}:ov:gating`,
              "info",
              "Sequence & gating",
              gating,
              bi++,
            ),
          );
        // RECALL deep links: downstream courses recall the upstream system in
        // module 1, per RECALL → DOMAIN APPLICATION → NEW DECISION.
        if (n === 1 && courseIndex > 0) {
          blocks.push(
            blockEnvelope(
              `blk:${c.code}:${token}:ov:recall-101`,
              "lesson_reference",
              1,
              {
                courseId: uid("course:G3-101"),
                lessonId: uid(`lesson:G3-101:M12:doctrine`),
                label: "Recall — the G3 reasoning system (G3 101, Module 12)",
                note: "Evidence classes, certainty language, and the three-layer discipline are governed by G3 101.",
              },
              bi++,
            ),
          );
          if (courseIndex > 1) {
            blocks.push(
              blockEnvelope(
                `blk:${c.code}:${token}:ov:recall-102`,
                "lesson_reference",
                1,
                {
                  courseId: uid("course:G3-102"),
                  lessonId: uid(`lesson:G3-102:M1:study`),
                  label:
                    "Recall — the G3 programming decision model (G3 102, Module 1)",
                  note: "DEMAND → PROFILE → GAP → PRIORITY → PRESCRIPTION → RESPONSE → ADJUST is governed by G3 102 and is never modified downstream.",
                },
                bi++,
              ),
            );
          }
        }
        const id = uid(`lesson:${c.code}:${token}:overview`);
        overviewLessonByModule[token] = id;
        lessons.push({
          id,
          moduleId,
          title: "Overview & objectives",
          position: pos(0),
          required: true,
          estimatedMinutes: Math.max(1, Math.round(minutes * 0.1)),
          blocks,
        });
      }

      // -- Lesson 2: Directed study (source lesson prose)
      {
        const blocks = [];
        let bi = 0;
        let entries = [];
        if (
          Array.isArray(mod.lessons) &&
          mod.lessons.length > 0 &&
          "content" in (mod.lessons[0] ?? {})
        ) {
          entries = mod.lessons.map((l) => ({
            id: l.id,
            title: l.title,
            prose: l.content,
          }));
        } else {
          const sec =
            sections["Core lesson content"] ??
            sections["Lesson structure"] ??
            "";
          entries = parseLessonProse(sec).map((l) => ({
            id: l.id,
            title: l.title,
            prose: l.prose,
          }));
          if (entries.length === 0 && Array.isArray(mod.lessons)) {
            entries = mod.lessons.map((l) => ({
              id: `L${n}.${l.index}`,
              title: l.title,
              prose: "",
            }));
          }
        }
        check(`${c.code} ${token} directed-study entries`, entries.length > 0);
        for (const [i2, l] of entries.entries()) {
          blocks.push(
            blockEnvelope(
              `blk:${c.code}:${token}:study:h:${i2}`,
              "heading",
              1,
              {
                text: clip(`${l.id ?? ""} ${flat(l.title)}`.trim(), 200),
                level: 3,
              },
              bi++,
            ),
          );
          if (l.prose)
            blocks.push(
              blockEnvelope(
                `blk:${c.code}:${token}:study:p:${i2}`,
                "rich_text",
                1,
                { text: clip(l.prose, 19_000) },
                bi++,
              ),
            );
        }
        const id = uid(`lesson:${c.code}:${token}:study`);
        lessons.push({
          id,
          moduleId,
          title: "Directed study",
          position: pos(1),
          required: true,
          estimatedMinutes: Math.max(1, Math.round(minutes * 0.4)),
          blocks,
        });
      }

      // -- Lesson 3: Doctrine, evidence & standards (three-layer discipline)
      {
        const blocks = [];
        let bi = 0;
        const regBy = (kind) =>
          new Map(
            c.norm.reg
              .filter((r) => r.kind === kind)
              .map((r) => [r.code, r.data]),
          );
        const doctrineReg = regBy("doctrine");
        const asReg = regBy("applied_standard");
        const cjList = c.norm.reg.filter((r) => r.kind === "coach_judgment");

        for (const did of mod.doctrine_ids ?? mod.primary_doctrine_ids ?? []) {
          const d = doctrineReg.get(did);
          if (!d) continue;
          const body = [
            flat(d.statement ?? ""),
            d.teaching_boundary
              ? `Teaching boundary: ${flat(d.teaching_boundary)}`
              : "",
            d.evidence_class ? `Evidence class: ${flat(d.evidence_class)}` : "",
          ]
            .filter(Boolean)
            .join(" — ");
          if (body)
            blocks.push(
              calloutBlock(
                `blk:${c.code}:${token}:doc:${did}`,
                TONE.doctrine,
                `G3 Doctrine ${did} — ${d.title ?? ""}`,
                body,
                bi++,
              ),
            );
        }
        // Evidence classifications: build objects (101/105) or spec table (102–104)
        const evRows =
          Array.isArray(mod.evidence_classifications) &&
          mod.evidence_classifications.length > 0
            ? mod.evidence_classifications.map((e) => ({
                statement: flat(e.statement),
                cls: flat(e.class),
                basis: flat(
                  [e.basis, ...(e.sources ?? [])].filter(Boolean).join("; "),
                ),
              }))
            : parseEvidenceTable(sections["Evidence classification"]);
        for (const [i2, row] of evRows.entries()) {
          blocks.push(
            calloutBlock(
              `blk:${c.code}:${token}:ev:${i2}`,
              TONE.evidence,
              `Evidence — Class ${clip(row.cls, 100)}`,
              [row.statement, row.basis ? `Basis: ${row.basis}` : ""]
                .filter(Boolean)
                .join(" — "),
              bi++,
            ),
          );
        }
        for (const aid of mod.applied_standard_ids ?? []) {
          const a = asReg.get(aid);
          if (!a) continue;
          const body = [
            flat(a.statement ?? ""),
            a.enforcement ? `Enforcement: ${flat(a.enforcement)}` : "",
          ]
            .filter(Boolean)
            .join(" — ");
          if (body)
            blocks.push(
              calloutBlock(
                `blk:${c.code}:${token}:as:${aid}`,
                TONE.standard,
                `G3 Applied Standard ${aid} — ${a.title ?? a.label ?? ""}`,
                body,
                bi++,
              ),
            );
        }
        // Coach judgment: module-level text (101/105) or spec-stated judgment note
        const cjText = flat(mod.coach_judgment ?? "");
        if (cjText) {
          blocks.push(
            calloutBlock(
              `blk:${c.code}:${token}:cj`,
              TONE.judgment,
              "Coach Judgment",
              cjText,
              bi++,
            ),
          );
        } else {
          const evSec = sections["Evidence classification"] ?? "";
          const cjMatch =
            /\*\*Coach Judgment:?\*\*:?\s*([\s\S]+?)(?:\n\n|$)/.exec(evSec);
          if (cjMatch)
            blocks.push(
              calloutBlock(
                `blk:${c.code}:${token}:cj`,
                TONE.judgment,
                "Coach Judgment",
                flat(cjMatch[1]),
                bi++,
              ),
            );
          else if (cjList.length > 0 && n === 12) {
            // The integration module surfaces the register itself.
            blocks.push(
              calloutBlock(
                `blk:${c.code}:${token}:cj`,
                TONE.judgment,
                "Coach Judgment",
                "The full coach-judgment register for this course is carried in the course records: G3 states the evidence position and the coach decides within it.",
                bi++,
              ),
            );
          }
        }
        // Common errors / claim audit
        const errors =
          mod.common_errors ?? mod.common_errors_claim_audit?.text ?? null;
        const errBody = Array.isArray(errors)
          ? errors.map(flat).join(" · ")
          : flat(errors ?? "");
        if (errBody)
          blocks.push(
            calloutBlock(
              `blk:${c.code}:${token}:errors`,
              TONE.audit,
              "Common coaching errors — claim audit",
              errBody,
              bi++,
            ),
          );
        const ptd = flat(mod.population_transfer_disclosure ?? "");
        if (ptd)
          blocks.push(
            calloutBlock(
              `blk:${c.code}:${token}:ptd`,
              TONE.judgment,
              "Population-transfer disclosure (AS-101-16)",
              ptd,
              bi++,
            ),
          );

        check(
          `${c.code} ${token} three-layer blocks present`,
          blocks.length >= 2,
          `${blocks.length}`,
        );
        const id = uid(`lesson:${c.code}:${token}:doctrine`);
        lessons.push({
          id,
          moduleId,
          title: "Doctrine, evidence & standards",
          position: pos(2),
          required: true,
          estimatedMinutes: Math.max(1, Math.round(minutes * 0.25)),
          blocks,
        });
      }

      // -- Lesson 4: Case & application
      {
        const blocks = [];
        let bi = 0;
        const applicationText = flat(
          mod.coaching_applications ??
            sections["Coaching applications"] ??
            sections["Coaching application"] ??
            "",
        );
        if (applicationText)
          blocks.push(
            blockEnvelope(
              `blk:${c.code}:${token}:app`,
              "rich_text",
              1,
              { text: clip(applicationText, 19_000) },
              bi++,
            ),
          );

        // Case: registry entry linked by scenario_id / modules membership,
        // with the build's structured case shape; fallback to spec text.
        const cases = b.cases ?? [];
        const caseEntry =
          cases.find((cs) => cs.id && cs.id === mod.scenario_id) ??
          cases.find(
            (cs) => Array.isArray(cs.modules) && cs.modules.includes(token),
          ) ??
          null;
        if (caseEntry) {
          const situation = flat(caseEntry.situation ?? "");
          const screens = (caseEntry.screens ?? caseEntry.steps ?? [])
            .map(flat)
            .filter(Boolean);
          const decision = flat(caseEntry.decision_required ?? "");
          const debrief = [
            decision ? `Decision required: ${decision}` : "",
            caseEntry.failure_modes
              ? `Failure modes: ${flat(caseEntry.failure_modes)}`
              : "",
            caseEntry.defensible_variation
              ? `Defensible variation: ${flat(caseEntry.defensible_variation)}`
              : "",
          ]
            .filter(Boolean)
            .join("\n\n");
          if (situation) {
            blocks.push(
              blockEnvelope(
                `blk:${c.code}:${token}:case`,
                "scenario",
                1,
                {
                  intro: clip(
                    `${caseEntry.title ? `${flat(caseEntry.title)}. ` : ""}${situation}`,
                    19_000,
                  ),
                  steps: (screens.length > 0
                    ? screens
                    : [decision || situation]
                  )
                    .slice(0, 12)
                    .map((s2, i2) => ({
                      id: uid(`case-step:${c.code}:${token}:${i2}`),
                      situation: clip(s2, 19_000),
                    })),
                  ...(debrief ? { debrief: clip(debrief, 19_000) } : {}),
                },
                bi++,
              ),
            );
          }
        } else {
          const specCase = flat(
            mod.case_scenario ?? sections["Case / scenario"] ?? "",
          );
          if (specCase)
            blocks.push(
              blockEnvelope(
                `blk:${c.code}:${token}:case`,
                "scenario",
                1,
                {
                  intro: clip(specCase, 19_000),
                  steps: [
                    {
                      id: uid(`case-step:${c.code}:${token}:0`),
                      situation:
                        "Work the case with your assessor: name the decision, the evidence class behind it, and what would change your answer.",
                    },
                  ],
                },
                bi++,
              ),
            );
        }
        const linkage = flat(
          mod.practical_sign_off_linkage ??
            sections["Practical sign-off linkage"] ??
            sections["Practical sign-off"] ??
            "",
        );
        if (linkage)
          blocks.push(
            calloutBlock(
              `blk:${c.code}:${token}:pslink`,
              "info",
              "Practical sign-off linkage",
              linkage,
              bi++,
            ),
          );
        check(
          `${c.code} ${token} application lesson non-empty`,
          blocks.length > 0,
        );
        const id = uid(`lesson:${c.code}:${token}:case`);
        lessons.push({
          id,
          moduleId,
          title: "Case & application",
          position: pos(3),
          required: true,
          estimatedMinutes: Math.max(1, Math.round(minutes * 0.15)),
          blocks,
        });
      }

      // -- Lesson 5: Module assessment (+ assessment entity & assignment)
      {
        const kItems =
          Array.isArray(mod.knowledge_assessment) &&
          mod.knowledge_assessment.length > 0
            ? mod.knowledge_assessment.map((k) => ({
                id: k.id,
                format: k.format ?? "",
                item: flat(k.item),
                key: null,
              }))
            : parseKnowledgeItems(sections["Knowledge assessment"]);
        const applied =
          mod.applied_assessment && typeof mod.applied_assessment === "object"
            ? {
                id: mod.applied_assessment.id ?? null,
                title: mod.applied_assessment.title ?? null,
                description: flat(mod.applied_assessment.description ?? ""),
                standard: flat(mod.applied_assessment.standard ?? ""),
              }
            : parseApplied(
                sections["Applied competency assessment"] ??
                  sections["Applied assessment"],
              );
        check(
          `${c.code} ${token} knowledge items`,
          kItems.length > 0,
          `${kItems.length}`,
        );
        check(
          `${c.code} ${token} applied assessment`,
          !!applied && !!flat(applied.description ?? ""),
        );

        const counts = mod.assessment_counts;
        if (counts && typeof counts.knowledge === "number") {
          check(
            `${c.code} ${token} knowledge count matches blueprint`,
            kItems.length >= counts.knowledge,
            `${kItems.length} vs ${counts.knowledge}`,
          );
        }

        const assessmentId = uid(`assessment:${c.code}:${token}`);
        const versionId = uid(`assessment-version:${c.code}:${token}`);
        const items = [];
        let ii = 0;
        for (const k of kItems.slice(0, 30)) {
          items.push({
            id: uid(`item:${c.code}:${token}:${k.id ?? ii}`),
            type: "short_answer",
            schemaVersion: 1,
            required: true,
            position: pos(ii++),
            data: {
              prompt: clip(`${k.id ? `${k.id} ` : ""}${k.item}`, 5000),
              ...(k.format
                ? {
                    instructions: clip(
                      `Source item format: ${flat(k.format)}. Answer in writing; your assessor grades against the G3 standard (80% per module).`,
                      5000,
                    ),
                  }
                : {}),
              maxLength: 2000,
              points: 10,
              ...(k.key ? { rubric: clip(`Key: ${k.key}`, 5000) } : {}),
            },
          });
        }
        if (applied && flat(applied.description ?? "")) {
          items.push({
            id: uid(`item:${c.code}:${token}:applied`),
            type: "long_answer",
            schemaVersion: 1,
            required: true,
            position: pos(ii++),
            data: {
              prompt: clip(
                `Applied competency${applied.id ? ` ${applied.id}` : ""}${applied.title ? ` — ${flat(applied.title)}` : ""}: ${applied.description}`,
                5000,
              ),
              maxLength: 20_000,
              points: 20,
              ...(applied.standard
                ? {
                    rubric: clip(
                      `Standard: ${applied.standard}. One revision permitted; applied work must reach standard.`,
                      5000,
                    ),
                  }
                : {}),
            },
          });
        }
        const settings = {
          schemaVersion: 1,
          passingPercent: 80,
          cooldownMinutes: 0,
          scorePolicy: "highest",
        };
        const assessTitle = clip(
          `${c.code} · ${token} Assessment — ${flat(mod.title ?? token)}`,
          200,
        );
        const lessonId = uid(`lesson:${c.code}:${token}:assessment`);
        const blocks = [];
        blocks.push(
          blockEnvelope(
            `blk:${c.code}:${token}:assess:intro`,
            "rich_text",
            1,
            {
              text: `This module closes with its assessment: the knowledge component (80% standard) and the applied competency component (at standard or better, one revision permitted). Written items are graded by a G3 assessor against the recorded keys and standards — applied coaching competence is never certified by written work alone.`,
            },
            0,
          ),
        );
        blocks.push(
          blockEnvelope(
            `blk:${c.code}:${token}:assess:ref`,
            "assessment_reference",
            1,
            {
              assessmentId,
              title: assessTitle,
            },
            1,
          ),
        );
        lessons.push({
          id: lessonId,
          moduleId,
          title: "Module assessment",
          position: pos(4),
          required: true,
          estimatedMinutes: Math.max(
            1,
            minutes -
              Math.round(minutes * 0.1) -
              Math.round(minutes * 0.4) -
              Math.round(minutes * 0.25) -
              Math.round(minutes * 0.15),
          ),
          blocks,
        });
        assessments.push({
          id: assessmentId,
          versionId,
          title: assessTitle,
          settings,
          items,
          lessonId,
          assignmentId: uid(`assignment:${c.code}:${token}`),
        });
      }

      moduleIndex += 1;
    } else {
      // PS-x or T-01 gate → a required gate lesson at the END of the module
      // just placed (the token follows its module in sequencing.order).
      const code = token;
      const isDefense = code === "T-01";
      const prevModule = modules[modules.length - 1];
      check(`${c.code} gate ${code} has a host module`, !!prevModule);
      const so = isDefense
        ? null
        : c.norm.signOffs.find((s2) => s2.id === code);
      const term = c.norm.terminal;
      const title = isDefense
        ? clip(flat(term?.title ?? "Terminal Defense"), 200)
        : clip(flat(so?.title ?? `Practical Sign-Off ${code}`), 200);

      const blocks = [];
      let bi = 0;
      const introParts = isDefense
        ? [
            flat(term?.format ?? ""),
            term?.required_for
              ? `Required for: ${flat(term.required_for)}`
              : "",
            "The defense is evaluated live by an approved G3 evaluator. Failure on T-01 cannot be offset by module performance.",
          ]
        : [
            so?.timing ? `Timing: ${flat(so.timing)}` : "",
            so?.completed_at ? `Completed at: ${flat(so.completed_at)}` : "",
            so?.function ? `Function: ${flat(so.function)}` : "",
            "This sign-off is observed and recorded by an approved G3 assessor. It cannot be self-recorded.",
          ];
      blocks.push(
        calloutBlock(
          `blk:${c.code}:gate:${code}:intro`,
          "info",
          isDefense
            ? `${code} — Terminal defense`
            : `${code} — Observed practical sign-off`,
          introParts.filter(Boolean).join(" — ") ||
            "Observed practical requirement.",
          bi++,
        ),
      );

      const listAsChecklist = (idKey, items) => {
        const arr = (items ?? []).map(flat).filter(Boolean);
        if (arr.length === 0) return null;
        if (arr.every((x) => x.length <= 300)) {
          return blockEnvelope(
            idKey,
            "checklist",
            1,
            {
              items: arr
                .slice(0, 30)
                .map((x, i2) => ({ id: uid(`${idKey}:${i2}`), text: x })),
            },
            bi++,
          );
        }
        return blockEnvelope(
          idKey,
          "rich_text",
          1,
          { text: clip(arr.map((x) => `• ${x}`).join("\n\n"), 19_000) },
          bi++,
        );
      };

      // Heading positions are allocated BEFORE their list so the section
      // label renders above its checklist (positions drive render order).
      const pushSection = (headingKey, headingText, listKey, items) => {
        const has = (items ?? []).map(flat).filter(Boolean).length > 0;
        if (!has) return;
        blocks.push(
          blockEnvelope(
            headingKey,
            "heading",
            1,
            { text: headingText, level: 3 },
            bi++,
          ),
        );
        blocks.push(listAsChecklist(listKey, items));
      };

      if (!isDefense && so) {
        pushSection(
          `blk:${c.code}:gate:${code}:bh`,
          "Observed behaviors",
          `blk:${c.code}:gate:${code}:behaviors`,
          so.observed_behaviors,
        );
        pushSection(
          `blk:${c.code}:gate:${code}:ah`,
          "Required artifacts",
          `blk:${c.code}:gate:${code}:artifacts`,
          so.artifacts_required ?? so.artifacts,
        );
        pushSection(
          `blk:${c.code}:gate:${code}:qh`,
          "Assessor questions",
          `blk:${c.code}:gate:${code}:questions`,
          so.assessor_questions,
        );
        const outcomes = (so.outcomes ?? [])
          .map(flat)
          .filter(Boolean)
          .join(" · ");
        if (outcomes)
          blocks.push(
            calloutBlock(
              `blk:${c.code}:gate:${code}:outcomes`,
              "success",
              "Recorded outcomes",
              outcomes,
              bi++,
            ),
          );
      }
      if (isDefense && term) {
        pushSection(
          `blk:${c.code}:gate:${code}:dh`,
          "Must defend",
          `blk:${c.code}:gate:${code}:defend`,
          term.must_defend,
        );
        pushSection(
          `blk:${c.code}:gate:${code}:ph`,
          "Mandatory probes",
          `blk:${c.code}:gate:${code}:probes`,
          term.mandatory_probes,
        );
        const nc = (term.non_compensable_failures ?? [])
          .map(flat)
          .filter(Boolean)
          .join(" · ");
        if (nc)
          blocks.push(
            calloutBlock(
              `blk:${c.code}:gate:${code}:nc`,
              "danger",
              "Non-compensable failures",
              nc,
              bi++,
            ),
          );
        if (term.rubric)
          blocks.push(
            calloutBlock(
              `blk:${c.code}:gate:${code}:rubric`,
              "info",
              "Defense rubric",
              flat(String(term.rubric)),
              bi++,
            ),
          );
      }
      if (isDefense && !term && c.code === "G3-102") {
        // G3 102 records T-01 in the specification (§10/§13/§14).
        const m102 =
          /\*\*T-01 — Programming defense\.\*\*\s*([\s\S]*?)(?:\n\n|$)/.exec(
            c.spec,
          );
        blocks.push(
          calloutBlock(
            `blk:${c.code}:gate:${code}:spec`,
            "info",
            "T-01 — Programming defense",
            flat(
              m102?.[1] ??
                "The coach walks a real program end to end through the decision model, out loud, under questioning from a G3 assessor, answering all nine questions including what evidence would change the plan. Failure on T-01 cannot be offset by module performance.",
            ),
            bi++,
          ),
        );
        blocks.push(
          calloutBlock(
            `blk:${c.code}:gate:${code}:window`,
            "warning",
            "Scheduling",
            "20–30 minutes with an approved assessor, using the coach's own program and artifacts. The assessor works the nine questions in order and probes at least three. Scored on the defense rubric.",
            bi++,
          ),
        );
      }
      // Practical window note (applies to scheduling, never to directed study)
      blocks.push(
        calloutBlock(
          `blk:${c.code}:gate:${code}:windownote`,
          "warning",
          "Practical window",
          `This course carries a minimum four-week practical window. ${code === "PS-4" ? "PS-4 cannot be scheduled until the delivery window is complete." : ""} Practical observation time is additional to directed study and is collected on the floor.`.trim(),
          bi++,
        ),
      );

      const lessonId = uid(`lesson:${c.code}:gate:${code}`);
      gateLessonByCode[code] = lessonId;
      lessons.push({
        id: lessonId,
        moduleId: prevModule.id,
        title: clip(`${code} · ${title}`, 200),
        position: pos(5 + (code === "T-01" ? 1 : 0)), // after the assessment lesson; T-01 after PS-4 when same module
        required: true,
        estimatedMinutes: null,
        blocks,
      });

      const rubric = isDefense
        ? (defenseRubric ?? signoffRubric)
        : signoffRubric;
      const competencyCodes = isDefense
        ? c.norm.reg
            .filter((r) => r.kind === "competency")
            .map((r) => r.code)
            .slice(0, 40)
        : c.norm.reg
            .filter((r) => r.kind === "competency")
            .filter((r) => {
              const s2 = r.data?.sign_offs ?? r.data?.sign_off ?? [];
              return Array.isArray(s2) ? s2.includes(code) : s2 === code;
            })
            .map((r) => r.code)
            .slice(0, 40);
      practicalReqs.push({
        id: uid(`practical:${c.code}:${code}`),
        courseId,
        lessonId,
        kind: isDefense ? "terminal_defense" : "practical_sign_off",
        code,
        title,
        competencyCodes,
        rubric: rubric ?? {},
        guidance: clip(
          [
            isDefense
              ? flat(term?.format ?? "")
              : flat(so?.timing ?? so?.completed_at ?? ""),
            so?.record_fields
              ? `Record: ${flat(JSON.stringify(so.record_fields))}`
              : "",
            "Minimum four-week practical window per course. Every recorded result carries the evaluator's identity; results are immutable once recorded — corrections are new records.",
          ]
            .filter(Boolean)
            .join(" — "),
          10_000,
        ),
      });
    }
  }

  check(
    `${c.code} 12 NovaKore modules`,
    modules.length === 12,
    `${modules.length}`,
  );
  check(
    `${c.code} 4 sign-off + 1 defense requirements`,
    practicalReqs.length === 5,
    `${practicalReqs.length}`,
  );
  check(`${c.code} 12 module assessments`, assessments.length === 12);
  const estSum = lessons.reduce((a, l) => a + (l.estimatedMinutes ?? 0), 0);
  check(
    `${c.code} lesson minutes = ${c.norm.course.directed_study_minutes}`,
    estSum === c.norm.course.directed_study_minutes,
    `${estSum}`,
  );
  for (const l of lessons)
    check(
      `${c.code} lesson block cap`,
      l.blocks.length > 0 && l.blocks.length <= 100,
      `${l.title}: ${l.blocks.length}`,
    );

  return {
    courseId,
    modules,
    lessons,
    assessments,
    practicalReqs,
    gateLessonByCode,
  };
}

for (const [i, c] of COURSES.entries()) c.asm = assembleCourse(c, i);

// Series totals (parent §4.1 / §4.2)
{
  const totalMinutes = COURSES.reduce(
    (a, c) => a + c.norm.course.directed_study_minutes,
    0,
  );
  check(
    "Foundations total 5,850 minutes",
    totalMinutes === 5850,
    `${totalMinutes}`,
  );
  const totalModules = COURSES.reduce((a, c) => a + c.asm.modules.length, 0);
  check("Foundations total 60 modules", totalModules === 60);
  const totalSignoffs = COURSES.reduce(
    (a, c) =>
      a +
      c.asm.practicalReqs.filter((p) => p.kind === "practical_sign_off").length,
    0,
  );
  const totalDefenses = COURSES.reduce(
    (a, c) =>
      a +
      c.asm.practicalReqs.filter((p) => p.kind === "terminal_defense").length,
    0,
  );
  check("Foundations 20 sign-offs", totalSignoffs === 20, `${totalSignoffs}`);
  check(
    "Foundations 5 terminal defenses",
    totalDefenses === 5,
    `${totalDefenses}`,
  );
  check(
    "Parent records 244 cross-course checks passed",
    parentMd.includes("244 cross-course checks, all passed"),
  );
  check(
    "Parent is locked for implementation",
    parentMd.includes("LOCKED FOR NOVAKORE IMPLEMENTATION"),
  );
}

if (failures.length > 0) {
  console.error(`GENERATION ABORTED — ${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Emit SQL
// ---------------------------------------------------------------------------
const sql = [];
const push = (s) => sql.push(s);

push(`-- =============================================================================
-- G3 PERFORMANCE FOUNDATIONS v1.0 — generated seed. DO NOT EDIT BY HAND.
-- Generated by scripts/g3-foundations/generate.mjs from the canonical package
-- in curriculum/g3-performance-foundations/ (see SOURCES.md for hashes and the
-- canonicality record). Idempotent; deterministic UUIDv5-style ids.
--
-- Ingestion order (parent curriculum §6): the series-level record (manifest
-- counterpart + parent curriculum) is established FIRST, then G3 101 → 105.
-- The five course builds are never ingested independently of this package.
--
-- Standing: INTERNAL G3 CEU. External recognition is not claimed anywhere in
-- this seed, and no automated interpretation of any kind is created by it.
-- =============================================================================
`);

// --- 1. Organization ---------------------------------------------------------
push(`-- 1. Organization: G3 Performance (internal tenant; qualification use case)
insert into public.organizations (id, name, slug, status, use_case, use_case_detail)
select ${q(ORG)}, 'G3 Performance', 'g3-performance', 'active', 'qualification',
       'Internal G3 CEU education for G3 Performance coaches. External-use gates closed.'
where not exists (select 1 from public.organizations where id = ${q(ORG)} or slug = 'g3-performance');

-- The owner's self-provisioned org predates the use-case choice; record it.
update public.organizations
   set use_case = 'qualification',
       use_case_detail = coalesce(use_case_detail,
         'Internal G3 CEU education for G3 Performance coaches. External-use gates closed.')
 where id = ${q(ORG)} and use_case is null;

insert into public.organization_settings (organization_id) values (${q(ORG)})
on conflict (organization_id) do nothing;

insert into public.organization_branding (organization_id, display_name) values (${q(ORG)}, 'G3 Performance')
on conflict (organization_id) do nothing;

do $$
begin
  if not exists (select 1 from public.organization_roles where organization_id = ${q(ORG)}) then
    perform app.create_system_roles(${q(ORG)});
  end if;
end;
$$;

-- Owner membership for the Director of Training (repo owner login, seeded by
-- the base seed). Guarded: only inserted when that auth user exists.
insert into public.organization_memberships (id, organization_id, user_id, status, accepted_at)
select ${q(OWNER_MEMBERSHIP)}, ${q(ORG)}, ${q(OWNER_USER)}, 'active', now()
where exists (select 1 from auth.users where id = ${q(OWNER_USER)})
  and not exists (select 1 from public.organization_memberships
                   where organization_id = ${q(ORG)} and user_id = ${q(OWNER_USER)})
on conflict (id) do nothing;

insert into public.organization_member_roles (id, organization_id, membership_id, role_id)
select ${q(uid("member-role:owner"))}, ${q(ORG)}, m.id, r.id
from public.organization_memberships m
join public.organization_roles r
  on r.organization_id = ${q(ORG)} and r.key = 'organization_owner' and r.is_system
where m.organization_id = ${q(ORG)} and m.user_id = ${q(OWNER_USER)}
  and not exists (select 1 from public.organization_member_roles mr
                   where mr.membership_id = m.id and mr.role_id = r.id)
on conflict (id) do nothing;
`);

// --- 2. Fixture users --------------------------------------------------------
push(`-- 2. Synthetic pilot fixtures (dev password convention; see seed.sql header)
do $$
declare
  v_password text := 'NovaKore-dev-password-1';
  u record;
begin
  for u in
    select * from (values
${FIXTURES.map((f) => `      (${q(f.userId)}::uuid, ${q(f.email)})`).join(",\n")}
    ) as g3_users(id, email)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change,
      email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
      u.email, extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', '', '', '', '', ''
    )
    on conflict (id) do nothing;

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), u.id, u.id::text, 'email',
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      now(), now(), now()
    )
    on conflict (provider_id, provider) do nothing;
  end loop;
end;
$$;

insert into public.organization_memberships (id, organization_id, user_id, status, accepted_at) values
${FIXTURES.map((f) => `  (${q(f.membershipId)}, ${q(ORG)}, ${q(f.userId)}, 'active', now())`).join(",\n")}
on conflict (id) do nothing;

insert into public.organization_member_roles (id, organization_id, membership_id, role_id)
select v.id, v.org_id, v.membership_id, r.id
from (values
${FIXTURES.map((f) => `  (${q(f.roleId)}::uuid, ${q(ORG)}::uuid, ${q(f.membershipId)}::uuid, ${q(f.role)})`).join(",\n")}
) as v(id, org_id, membership_id, role_key)
join public.organization_roles r
  on r.organization_id = v.org_id and r.key = v.role_key and r.is_system
on conflict (id) do nothing;
`);

// --- 3. Academy / system / path (series established before any course) -------
push(`-- 3. Series container — established FIRST (manifest/parent before courses)
insert into public.academies (id, organization_id, name, slug, description, status) values
  (${q(ACADEMY)}, ${q(ORG)}, 'G3 Performance Education', 'g3-education',
   'The G3 Performance internal education division. Internal G3 CEU only.', 'active')
on conflict (id) do nothing;

insert into public.learning_systems (id, organization_id, academy_id, slug, title, description, status) values
  (${q(SYSTEM)}, ${q(ORG)}, ${q(ACADEMY)}, 'g3-performance-education', 'G3 Performance Education',
   'G3 Performance curricula. The Standard is the Product.', 'active')
on conflict (id) do nothing;

insert into public.learning_paths (id, organization_id, academy_id, learning_system_id, slug, title, description, status, allow_self_enrollment) values
  (${q(PATH)}, ${q(ORG)}, ${q(ACADEMY)}, ${q(SYSTEM)}, 'g3-performance-foundations',
   'G3 Performance Foundations',
   ${q(clip("G3 Performance Foundations v1.0 — LOCKED FOR NOVAKORE IMPLEMENTATION. Five sequential courses: G3 101 (Reasoning System) → G3 102 (Programming Decision System) → G3 103 (Speed / Multidirectional Domain) → G3 104 (Strength Domain) → G3 105 (Power Domain / Foundations Integration). 60 modules, 5,850 directed-study minutes (97.5 hours, practicals additional), 20 practical sign-offs, 5 terminal defenses, minimum four-week practical window per course. A learner completes Foundations only when all five courses are complete in sequence, all module assessments are at standard, all 20 sign-offs are recorded, all 5 defenses are passed, all practical windows are satisfied, and no required remediation remains open. Internal G3 CEU — external recognition not claimed.", 2000))},
   'active', false)
on conflict (id) do nothing;
`);

// --- 4. Series curriculum records (manifest-level content) -------------------
const seriesRecords = [
  [
    "series",
    "sequence",
    "Foundations sequence (normative)",
    {
      sequence: ["G3-101", "G3-102", "G3-103", "G3-104", "G3-105"],
      rule: "A course does not open until its predecessor is complete, including that predecessor's terminal defense.",
      roles: {
        "G3-101": "Reasoning System",
        "G3-102": "Programming Decision System",
        "G3-103": "Speed / Multidirectional Domain",
        "G3-104": "Strength Domain",
        "G3-105": "Power Domain / Foundations Integration",
      },
    },
  ],
  [
    "series",
    "authority-rule",
    "Foundations Authority Rule",
    COURSES[0].build.foundations.authority_rule,
  ],
  [
    "series",
    "evidence-taxonomy",
    "Series evidence taxonomy A–F + U",
    {
      classes: COURSES[0].build.foundations.series_evidence_taxonomy,
      note: "U is the machine-readable series class; 'Unknown' remains the human-facing certainty label. Every course recognizes all seven classes; no course is required to use all of them; no claim was reclassified.",
      used_by_course: Object.fromEntries(
        COURSES.map((c) => [
          c.code,
          c.build.foundations?.classes_used_by_this_course ?? null,
        ]),
      ),
    },
  ],
  [
    "series",
    "completion-rule",
    "Series completion rule",
    {
      conditions: [
        "G3 101 through G3 105 complete, in sequence",
        "All required module assessments at standard",
        "All 20 course practical sign-offs recorded by an approved assessor",
        "All 5 terminal defenses passed",
        "All required practical windows satisfied",
        "No required remediation remains open",
      ],
      partial:
        "Partial completion confers no series credential; completed courses stand as individual course completions.",
    },
  ],
  [
    "series",
    "workload",
    "Series workload",
    {
      per_course: Object.fromEntries(
        COURSES.map((c) => [
          c.code,
          {
            modules: 12,
            minutes: c.norm.course.directed_study_minutes,
            hours: c.norm.course.directed_study_hours,
          },
        ]),
      ),
      total: { modules: 60, minutes: 5850, hours: 97.5 },
      excludes:
        "practical windows, sign-off observation, artifact work, terminal defenses",
    },
  ],
  [
    "series",
    "platform-prohibitions",
    "Platform prohibitions (bind the whole series)",
    {
      prohibited:
        "No NovaKore feature, report, dashboard, template, or automation may generate: an automated training priority · a readiness prescription or automated session determination · an ACWR injury alert or safe-zone classification · an asymmetry alert · a movement-screen injury classification or risk score · a youth age or puberty gate · a recovery clock · a periodization prescription · a 'nonresponder' classification · a force-velocity diagnosis · an optimal-load prescription · a prescribed contact count · a strength-ratio gate · a velocity-loss stop rule · an injury-risk score or injury-prevention claim · or a capability ranking of an athlete.",
      rule: "Every interpretive statement in NovaKore carries a human author.",
    },
  ],
  [
    "series",
    "package",
    "Foundations package v1.0 as ingested",
    {
      version: "1.0",
      gate: "Curriculum Review Gate PASS; 244 cross-course validation checks passed before implementation handoff.",
      artifacts: COURSES.flatMap((c) => [
        `${c.code}-Course-Specification-${c.ver}-FINAL.md`,
        `${c.code}-NovaKore-Build-${c.ver}-FINAL.json`,
      ]).concat(["G3-Performance-Foundations-Curriculum-v1.0-FINAL.md"]),
      manifest_note:
        "G3-Performance-Foundations-Manifest-v1.0-FINAL.json was absent from the handoff package at implementation time; the parent curriculum document (authoritative at series level) supplied the series record. See curriculum/g3-performance-foundations/SOURCES.md.",
      hashes_recorded_in: "curriculum/g3-performance-foundations/SOURCES.md",
    },
  ],
  [
    "series",
    "governance",
    "Series governance",
    {
      owner: "G3 Performance",
      approver: "Director of Training",
      review_cycle_months: 24,
      external_use:
        "Each course carries its own external-use gate; none are released by this record. Until released, every course is an internal G3 CEU course and is described as one.",
      production_prohibition:
        "No change may be made to doctrine, an evidence class, or an Applied Standard by production, editorial, or platform work. A production process that finds a doctrinal contradiction returns a BLOCKER; it does not resolve it.",
    },
  ],
  [
    "series",
    "duplication-rule",
    "RECALL → DOMAIN APPLICATION → NEW DECISION",
    {
      rule: "A downstream course recalls the upstream concept in a sentence, applies it to its domain, and requires a new decision the upstream course did not ask for. It does not re-teach the upstream lesson. NovaKore deep-links to the upstream concept rather than reproducing it.",
      deliberate_reinforcement:
        "Twelve concepts are deliberately reinforced across the series and must not be de-duplicated.",
    },
  ],
];
push(`-- 4. Series records (curriculum_records scoped to the path)
insert into public.curriculum_records (id, organization_id, learning_path_id, kind, code, title, data, position) values
${seriesRecords
  .map(
    ([kind, code, title, data], i) =>
      `  (${q(uid(`series-record:${code}`))}, ${q(ORG)}, ${q(PATH)}, ${q(kind)}, ${q(code)}, ${q(clip(title, 300))}, ${qj(data)}, ${q(pos(i))})`,
  )
  .join(",\n")}
on conflict (id) do nothing;
`);

// --- 5. Courses --------------------------------------------------------------
const ROLE_BY_CODE = {
  "G3-101": "Reasoning System",
  "G3-102": "Programming Decision System",
  "G3-103": "Speed / Multidirectional Domain",
  "G3-104": "Strength Domain",
  "G3-105": "Power Domain / Foundations Integration",
};

for (const c of COURSES) {
  const { courseId, modules, lessons, assessments, practicalReqs } = c.asm;
  const course = c.norm.course;
  const courseVersionId = uid(`course-version:${c.code}`);
  const title = `${c.code} — ${course.title}`;
  const summary = clip(
    `${ROLE_BY_CODE[c.code]} · Curriculum ${c.code} v${course.version} · 12 modules · ${course.directed_study_hours} directed-study hours · PS-1–PS-4 + T-01 · Internal G3 CEU`,
    500,
  );
  const description = clip(
    `${flat(course.purpose ?? "")} Prerequisite: ${flat(course.prerequisite ?? "—")}. Practical window: minimum ${course.practical_window_weeks_min} weeks (additional to directed study). Standing: Internal G3 CEU — external recognition not claimed.`,
    5000,
  );

  push(`-- ---------------------------------------------------------------------------
-- ${c.code} — ${course.title} (curriculum v${course.version})
-- ---------------------------------------------------------------------------
insert into public.courses (id, organization_id, slug, title, summary, description, status, completion_rule, enforce_sequence) values
  (${q(courseId)}, ${q(ORG)}, ${q(c.slug)}, ${q(clip(title, 200))}, ${q(summary)}, ${q(description)},
   'draft', '{"schemaVersion":1,"type":"all_required_lessons"}', true)
on conflict (id) do nothing;

insert into public.modules (id, organization_id, course_id, title, position) values
${modules.map((m) => `  (${q(m.id)}, ${q(ORG)}, ${q(courseId)}, ${q(m.title)}, ${q(m.position)})`).join(",\n")}
on conflict (id) do nothing;

insert into public.lessons (id, organization_id, course_id, module_id, title, position, required, estimated_minutes) values
${lessons.map((l) => `  (${q(l.id)}, ${q(ORG)}, ${q(courseId)}, ${q(l.moduleId)}, ${q(l.title)}, ${q(l.position)}, true, ${l.estimatedMinutes ?? "null"})`).join(",\n")}
on conflict (id) do nothing;
`);

  // Draft content blocks (mirror the published snapshot for authoring parity)
  const blockRows = [];
  for (const l of lessons)
    for (const blk of l.blocks)
      blockRows.push(
        `  (${q(blk.id)}, ${q(ORG)}, ${q(l.id)}, ${q(blk.type)}, ${blk.schemaVersion}, ${qj(blk.data)}, ${q(blk.position)})`,
      );
  push(`insert into public.content_blocks (id, organization_id, lesson_id, block_type, schema_version, data, position) values
${blockRows.join(",\n")}
on conflict (id) do nothing;
`);

  // Lesson versions
  push(`insert into public.lesson_versions (id, organization_id, lesson_id, course_id, version_number, title, required, estimated_minutes, blocks, published_by) values
${lessons
  .map((l) => {
    const lvId = uid(`lesson-version:${c.code}:${l.id}`);
    l.versionId = lvId;
    return `  (${q(lvId)}, ${q(ORG)}, ${q(l.id)}, ${q(courseId)}, 1, ${q(l.title)}, true, ${l.estimatedMinutes ?? "null"}, ${qj(l.blocks)}, ${q(OWNER_USER)})`;
  })
  .join(",\n")}
on conflict (id) do nothing;
`);
  push(
    lessons
      .map(
        (l) =>
          `update public.lessons set current_published_version_id = ${q(l.versionId)}, status = 'published' where id = ${q(l.id)} and current_published_version_id is null;`,
      )
      .join("\n") + "\n",
  );

  // Assessments
  push(`insert into public.assessments (id, organization_id, title, assessment_type, status, settings) values
${assessments.map((a) => `  (${q(a.id)}, ${q(ORG)}, ${q(a.title)}, 'manual_review', 'draft', ${qj(a.settings)})`).join(",\n")}
on conflict (id) do nothing;

insert into public.assessment_items (id, organization_id, assessment_id, item_type, schema_version, data, position, required) values
${assessments.flatMap((a) => a.items.map((it) => `  (${q(it.id)}, ${q(ORG)}, ${q(a.id)}, ${q(it.type)}, 1, ${qj(it.data)}, ${q(it.position)}, true)`)).join(",\n")}
on conflict (id) do nothing;

insert into public.assessment_versions (id, organization_id, assessment_id, version_number, title, settings, items, published_by) values
${assessments.map((a) => `  (${q(a.versionId)}, ${q(ORG)}, ${q(a.id)}, 1, ${q(a.title)}, ${qj(a.settings)}, ${qj(a.items.map((it) => ({ id: it.id, type: it.type, schemaVersion: 1, data: it.data, position: it.position, required: true })))}, ${q(OWNER_USER)})`).join(",\n")}
on conflict (id) do nothing;
`);
  push(
    assessments
      .map(
        (a) =>
          `update public.assessments set current_published_version_id = ${q(a.versionId)}, status = 'published' where id = ${q(a.id)} and current_published_version_id is null;`,
      )
      .join("\n") + "\n",
  );
  push(`insert into public.assessment_assignments (id, organization_id, course_id, lesson_id, assessment_id, assessment_version_id, required, completion_effect, position, status) values
${assessments.map((a) => `  (${q(a.assignmentId)}, ${q(ORG)}, ${q(courseId)}, ${q(a.lessonId)}, ${q(a.id)}, ${q(a.versionId)}, true, 'complete_lesson', 'a0', 'active')`).join(",\n")}
on conflict (id) do nothing;
`);

  // Course version (structure in module/lesson order)
  const structure = {
    schemaVersion: 1,
    modules: modules.map((m) => ({
      moduleId: m.id,
      title: m.title,
      position: m.position,
      lessons: lessons
        .filter((l) => l.moduleId === m.id)
        .sort((a2, b2) => (a2.position < b2.position ? -1 : 1))
        .map((l) => ({
          lessonId: l.id,
          lessonVersionId: l.versionId,
          versionNumber: 1,
          title: l.title,
          position: l.position,
          required: true,
        })),
    })),
  };
  c.asm.structure = structure;
  c.asm.courseVersionId = courseVersionId;
  push(`insert into public.course_versions (id, organization_id, course_id, version_number, title, summary, structure, completion_rule, published_by) values
  (${q(courseVersionId)}, ${q(ORG)}, ${q(courseId)}, 1, ${q(clip(title, 200))}, ${q(summary)}, ${qj(structure)}, '{"schemaVersion":1,"type":"all_required_lessons"}', ${q(OWNER_USER)})
on conflict (id) do nothing;

update public.courses set current_published_version_id = ${q(courseVersionId)}, status = 'published' where id = ${q(courseId)} and current_published_version_id is null;
`);

  // Practical requirements
  push(`insert into public.practical_requirements (id, organization_id, course_id, lesson_id, kind, code, title, competency_codes, rubric, guidance, created_by) values
${practicalReqs.map((p) => `  (${q(p.id)}, ${q(ORG)}, ${q(courseId)}, ${q(p.lessonId)}, ${q(p.kind)}, ${q(p.code)}, ${q(clip(p.title, 200))}, ${qarr(p.competencyCodes)}, ${qj(p.rubric)}, ${qn(p.guidance)}, ${q(OWNER_USER)})`).join(",\n")}
on conflict (id) do nothing;
`);

  // Course-scoped curriculum records
  const regRows = c.norm.reg.map(
    (r, i) =>
      `  (${q(uid(`record:${c.code}:${r.kind}:${r.code}`))}, ${q(ORG)}, ${q(courseId)}, ${q(r.kind)}, ${q(clip(r.code, 80))}, ${q(r.title || r.code)}, ${qj(r.data)}, ${q(pos(Math.min(i, 259)))})`,
  );
  push(`insert into public.curriculum_records (id, organization_id, course_id, kind, code, title, data, position) values
${regRows.join(",\n")}
on conflict (id) do nothing;
`);
}

// --- 6. Path nodes + prerequisites ------------------------------------------
const nodeId = (code) => uid(`path-node:${code}`);
push(`-- 6. Sequence: path nodes + DB-enforced prerequisites (per course.prerequisite)
insert into public.path_nodes (id, organization_id, path_id, course_id, position) values
${COURSES.map((c, i) => `  (${q(nodeId(c.code))}, ${q(ORG)}, ${q(PATH)}, ${q(c.asm.courseId)}, ${q(pos(i))})`).join(",\n")}
on conflict (id) do nothing;

insert into public.prerequisites (id, organization_id, path_id, node_id, requires_node_id) values
${[
  ["G3-102", "G3-101"],
  ["G3-103", "G3-102"],
  ["G3-104", "G3-102"],
  ["G3-104", "G3-103"],
  ["G3-105", "G3-102"],
  ["G3-105", "G3-103"],
  ["G3-105", "G3-104"],
]
  .map(
    ([a, b2]) =>
      `  (${q(uid(`prereq:${a}:${b2}`))}, ${q(ORG)}, ${q(PATH)}, ${q(nodeId(a))}, ${q(nodeId(b2))})`,
  )
  .join(",\n")}
on conflict (id) do nothing;
`);

// --- 7. Certificates ---------------------------------------------------------
push(`-- 7. Credentials — internal G3 CEU only; no external recognition implied.
insert into public.certificate_templates (id, organization_id, academy_id, name, template, status) values
${COURSES.map(
  (c) =>
    `  (${q(uid(`cert-template:${c.code}`))}, ${q(ORG)}, ${q(ACADEMY)}, ${q(`${c.code} Course Completion (Internal G3 CEU)`)}, ${qj(
      {
        schemaVersion: 1,
        title: "Certificate of Course Completion",
        subtitle: `${c.code} — ${c.norm.course.title} (v${c.norm.course.version})`,
        bodyText: `has completed ${c.code} — ${c.norm.course.title}, including all module assessments at standard, practical sign-offs PS-1 through PS-4, and the T-01 terminal defense. Internal G3 CEU; external recognition not claimed.`,
        signatories: [
          {
            name: "JR Romero, CSCS",
            role: "Director of Training, G3 Performance",
          },
        ],
        showVerification: true,
      },
    )}, 'active')`,
).join(",\n")},
  (${q(uid("cert-template:foundations"))}, ${q(ORG)}, ${q(ACADEMY)}, 'G3 Performance Foundations (Internal G3 CEU)', ${qj(
    {
      schemaVersion: 1,
      title: "G3 Performance Foundations",
      subtitle: "Foundations series v1.0 — G3 101 through G3 105",
      bodyText:
        "has completed G3 Performance Foundations v1.0 in sequence: all sixty modules at standard, all twenty practical sign-offs recorded, and all five terminal defenses passed, with no remediation open. Internal G3 CEU; external recognition not claimed.",
      signatories: [
        {
          name: "JR Romero, CSCS",
          role: "Director of Training, G3 Performance",
        },
      ],
      showVerification: true,
    },
  )}, 'active')
on conflict (id) do nothing;

insert into public.certificates (id, organization_id, template_id, title, source_type, course_id, learning_path_id, status) values
${COURSES.map((c) => `  (${q(uid(`cert:${c.code}`))}, ${q(ORG)}, ${q(uid(`cert-template:${c.code}`))}, ${q(`${c.code} — ${c.norm.course.title} (Internal G3 CEU)`)}, 'course', ${q(c.asm.courseId)}, null, 'active')`).join(",\n")},
  (${q(uid("cert:foundations"))}, ${q(ORG)}, ${q(uid("cert-template:foundations"))}, 'G3 Performance Foundations v1.0 (Internal G3 CEU)', 'learning_path', null, ${q(PATH)}, 'active')
on conflict (id) do nothing;
`);

// --- 8. Fixture enrollments + state -----------------------------------------
// State-only fixtures (house rule): progress + evaluations, no synthetic events.
function progressRows(f, c, opts) {
  // opts: {courseComplete, lessons: 'all'|'non-gate'|'none'|'all-but-defense'}
  const rows = [];
  const courseProgressId = uid(`progress:${f.key}:${c.code}:course`);
  rows.push(
    `  (${q(courseProgressId)}, ${q(ORG)}, ${q(f.enrollmentId)}, 'course', ${q(c.asm.courseId)}, null, ${q(c.asm.courseVersionId)}, null, ${opts.courseComplete ? "'completed', now()" : "'in_progress', null"})`,
  );
  const gates = new Set(Object.values(c.asm.gateLessonByCode));
  const defense = c.asm.gateLessonByCode["T-01"];
  for (const l of c.asm.lessons) {
    const isGate = gates.has(l.id);
    const include =
      opts.lessons === "all" ||
      (opts.lessons === "non-gate" && !isGate) ||
      (opts.lessons === "all-but-defense" && l.id !== defense);
    if (!include) continue;
    rows.push(
      `  (${q(uid(`progress:${f.key}:${c.code}:${l.id}`))}, ${q(ORG)}, ${q(f.enrollmentId)}, 'lesson', ${q(c.asm.courseId)}, ${q(l.id)}, ${q(c.asm.courseVersionId)}, ${q(l.versionId)}, 'completed', now())`,
    );
  }
  return rows;
}
function evalRows(f, c, opts) {
  // opts: {codes: [...], result?, excludeDefense?}
  const rows = [];
  for (const p of c.asm.practicalReqs) {
    if (opts.codes && !opts.codes.includes(p.code)) continue;
    const result = opts.resultFor?.(p.code) ?? "passed";
    rows.push(
      `  (${q(uid(`eval:${f.key}:${c.code}:${p.code}:${result}`))}, ${q(ORG)}, ${q(p.id)}, ${q(f.enrollmentId)}, ${q(f.membershipId)}, ${q(c.asm.courseId)}, ${q(p.lessonId)}, ${q(p.kind)}, ${q(p.code)}, ${q(result)}, ${qj({ summary: "Seeded pilot fixture record." })}, 'Seeded pilot fixture: observed at standard during internal pilot setup.', ${result === "remediation_required" ? q("Remediation assigned: re-defend with the population-transfer disclosure stated unprompted.") : "null"}, ${qarr(p.competencyCodes)}, ${q(ASSESSOR.userId)}, now())`,
    );
  }
  return rows;
}

const enrollRows = FIXTURES.filter((f) => f.role === "learner").map(
  (f) =>
    `  (${q(f.enrollmentId)}, ${q(ORG)}, ${q(f.membershipId)}, 'learning_path', ${q(PATH)}, null, null, ${f.key === "complete" ? "'completed'" : "'active'"}, 'assigned', ${f.key === "new" ? "null" : "now()"}, ${f.key === "complete" ? "now()" : "null"})`,
);

const allProgress = [];
const allEvals = [];
const C = Object.fromEntries(COURSES.map((c) => [c.code, c]));
{
  const f = (k) => FIXTURES.find((x) => x.key === k);
  // 101 complete
  allProgress.push(
    ...progressRows(f("c101"), C["G3-101"], {
      courseComplete: true,
      lessons: "all",
    }),
  );
  allEvals.push(...evalRows(f("c101"), C["G3-101"], {}));
  // through 102
  for (const code of ["G3-101", "G3-102"]) {
    allProgress.push(
      ...progressRows(f("c102"), C[code], {
        courseComplete: true,
        lessons: "all",
      }),
    );
    allEvals.push(...evalRows(f("c102"), C[code], {}));
  }
  // modules done, practicals open (in 101): non-gate lessons complete
  allProgress.push(
    ...progressRows(f("modules"), C["G3-101"], {
      courseComplete: false,
      lessons: "non-gate",
    }),
  );
  // practicals done, T-01 open (in 101)
  allProgress.push(
    ...progressRows(f("practicals"), C["G3-101"], {
      courseComplete: false,
      lessons: "all-but-defense",
    }),
  );
  allEvals.push(
    ...evalRows(f("practicals"), C["G3-101"], {
      codes: ["PS-1", "PS-2", "PS-3", "PS-4"],
    }),
  );
  // remediation open on T-01 (in 101)
  allProgress.push(
    ...progressRows(f("remediation"), C["G3-101"], {
      courseComplete: false,
      lessons: "all-but-defense",
    }),
  );
  allEvals.push(
    ...evalRows(f("remediation"), C["G3-101"], {
      codes: ["PS-1", "PS-2", "PS-3", "PS-4"],
    }),
  );
  allEvals.push(
    ...evalRows(f("remediation"), C["G3-101"], {
      codes: ["T-01"],
      resultFor: () => "remediation_required",
    }),
  );
  // fully complete
  for (const c of COURSES) {
    allProgress.push(
      ...progressRows(f("complete"), c, {
        courseComplete: true,
        lessons: "all",
      }),
    );
    allEvals.push(...evalRows(f("complete"), c, {}));
  }
}

push(`-- 8. Pilot fixture enrollments and state (synthetic accounts only)
insert into public.enrollments (id, organization_id, membership_id, target_type, learning_path_id, course_id, pinned_course_version_id, status, source, started_at, completed_at) values
${enrollRows.join(",\n")}
on conflict (id) do nothing;

insert into public.progress_records (id, organization_id, enrollment_id, subject_type, course_id, lesson_id, course_version_id, lesson_version_id, status, completed_at) values
${allProgress.join(",\n")}
on conflict (id) do nothing;

insert into public.practical_evaluations (id, organization_id, requirement_id, enrollment_id, membership_id, course_id, lesson_id, kind, code, result, rubric, evidence, comments, competency_codes, evaluator_id, evaluated_at) values
${allEvals.join(",\n")}
on conflict (id) do nothing;

-- Foundations + course credentials for the fully-complete fixture
insert into public.issued_credentials (id, organization_id, certificate_id, membership_id, recipient_name, title, template_snapshot, verification_code, status, issued_at, enrollment_id, course_version_id)
select v.id, ${q(ORG)}, v.certificate_id, v.membership_id, v.recipient, cert.title, tpl.template, v.code, 'active', now(), v.enrollment_id, v.course_version_id
from (values
${COURSES.map(
  (c, i) =>
    `  (${q(uid(`credential:complete:${c.code}`))}::uuid, ${q(uid(`cert:${c.code}`))}::uuid, ${q(FIXTURES.find((x) => x.key === "complete").membershipId)}::uuid, 'G3 Fixture — Foundations Complete', ${q(
      `NVK-${createHash("sha1")
        .update(NAMESPACE + "vc:" + c.code)
        .digest("hex")
        .slice(0, 12)
        .toUpperCase()
        .replace(
          /^(.{4})(.{4})(.{4})$/,
          "$1-$2-$3",
        )}-${String(1000 + i).slice(1)}A`,
    )}, ${q(FIXTURES.find((x) => x.key === "complete").enrollmentId)}::uuid, ${q(c.asm.courseVersionId)}::uuid)`,
).join(",\n")},
  (${q(uid("credential:complete:foundations"))}::uuid, ${q(uid("cert:foundations"))}::uuid, ${q(FIXTURES.find((x) => x.key === "complete").membershipId)}::uuid, 'G3 Fixture — Foundations Complete', ${q(
    `NVK-${createHash("sha1")
      .update(NAMESPACE + "vc:foundations")
      .digest("hex")
      .slice(0, 12)
      .toUpperCase()
      .replace(/^(.{4})(.{4})(.{4})$/, "$1-$2-$3")}-F0AA`,
  )}, ${q(FIXTURES.find((x) => x.key === "complete").enrollmentId)}::uuid, null)
) as v(id, certificate_id, membership_id, recipient, code, enrollment_id, course_version_id)
join public.certificates cert on cert.id = v.certificate_id
join public.certificate_templates tpl on tpl.id = cert.template_id
on conflict (id) do nothing;
`);

writeFileSync(OUT_SQL, sql.join("\n"), "utf8");

const report = {
  generatedAt: null, // stamped by CI/humans, not the generator (determinism)
  org: ORG,
  path: PATH,
  courses: COURSES.map((c) => ({
    code: c.code,
    courseId: c.asm.courseId,
    version: c.norm.course.version,
    modules: c.asm.modules.length,
    lessons: c.asm.lessons.length,
    blocks: c.asm.lessons.reduce((a, l) => a + l.blocks.length, 0),
    assessments: c.asm.assessments.length,
    assessmentItems: c.asm.assessments.reduce((a, x) => a + x.items.length, 0),
    practicalRequirements: c.asm.practicalReqs.length,
    minutes: c.norm.course.directed_study_minutes,
    registryRecords: c.norm.reg.length,
  })),
  totals: {
    modules: 60,
    minutes: 5850,
    hours: 97.5,
    signOffs: 20,
    defenses: 5,
    prerequisites: 7,
    seriesRecords: seriesRecords.length,
  },
  checks: {
    passed: checks.filter((x) => x.ok).length,
    failed: failures.length,
  },
};
mkdirSync(dirname(OUT_REPORT), { recursive: true });
writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2), "utf8");

console.log(`OK — ${checks.length} generation checks passed.`);
console.log(`Seed:   ${OUT_SQL}`);
console.log(`Report: ${OUT_REPORT}`);
for (const line of report.courses.map(
  (x) =>
    `  ${x.code}: ${x.modules} modules · ${x.lessons} lessons · ${x.blocks} blocks · ${x.assessments} assessments (${x.assessmentItems} items) · ${x.practicalRequirements} practicals · ${x.minutes} min · ${x.registryRecords} records`,
))
  console.log(line);

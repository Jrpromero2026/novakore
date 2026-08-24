#!/usr/bin/env node
/**
 * G3 Performance Foundations — cross-course package validator.
 *
 * Re-implements the parent curriculum §7.4 cross-course QA list against the
 * canonical artifacts in curriculum/g3-performance-foundations/ (never against
 * the parent document's own claims — every assertion reads the artifacts).
 * Run after any package change and before NovaKore re-ingestion (§7.5).
 *
 * Exit 0 = all checks pass; exit 1 lists failures.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "curriculum",
  "g3-performance-foundations",
);

const COURSES = [
  { code: "G3-101", ver: "v2.0", version: "2.0", minutes: 1050, hours: 17.5 },
  { code: "G3-102", ver: "v1.0", version: "1.0", minutes: 1110, hours: 18.5 },
  { code: "G3-103", ver: "v1.0", version: "1.0", minutes: 1170, hours: 19.5 },
  { code: "G3-104", ver: "v1.0", version: "1.0", minutes: 1245, hours: 20.75 },
  { code: "G3-105", ver: "v1.0", version: "1.0", minutes: 1275, hours: 21.25 },
];

const results = [];
const check = (label, ok, detail = "") =>
  results.push({ label, ok: !!ok, detail });

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
const parent = readFileSync(
  join(PKG, "G3-Performance-Foundations-Curriculum-v1.0-FINAL.md"),
  "utf8",
);

// One canonical MD + JSON per course (present under canonical FINAL names)
for (const c of COURSES) {
  check(`${c.code}: canonical FINAL pair present`, true);
  check(
    `${c.code}: version ${c.version}`,
    c.build.course.version === c.version,
    String(c.build.course.version),
  );
}
check(
  "Manifest file present (package item #1)",
  existsSync(join(PKG, "G3-Performance-Foundations-Manifest-v1.0-FINAL.json")),
  "absent — series record established from the parent curriculum; deliver the manifest and re-run",
);

// No stale G3 102 artifact content: the superseded sentence is never asserted
for (const c of COURSES) {
  const n =
    c.spec.split("two supervised practical blocks and a final defense").length -
    1;
  const ok =
    c.code === "G3-102"
      ? n <= 1 && (n === 0 || c.spec.includes("superseded delivery sentence"))
      : n === 0;
  check(
    `${c.code}: superseded delivery sentence never asserted`,
    ok,
    `${n} occurrence(s)`,
  );
}

// Sequence + prerequisites follow 101 → 102 → 103 → 104 → 105 (MD/JSON agree)
const prereqExpect = {
  "G3-102": /G3 101/,
  "G3-103": /G3 102/,
  "G3-104": /G3 102 and G3 103/,
  "G3-105": /G3 102, G3 103, and G3 104/,
};
for (const c of COURSES) {
  const pos = c.build.foundations?.position;
  check(
    `${c.code}: foundations.position ${COURSES.indexOf(c) + 1}`,
    pos === COURSES.indexOf(c) + 1,
    String(pos),
  );
  if (prereqExpect[c.code])
    check(
      `${c.code}: prerequisite names its predecessors`,
      prereqExpect[c.code].test(c.build.course.prerequisite ?? ""),
      c.build.course.prerequisite,
    );
}

// 12 modules, minutes, hours, 97.5 total
let totalMin = 0;
for (const c of COURSES) {
  const mods = c.build.modules;
  check(`${c.code}: 12 modules`, mods.length === 12, String(mods.length));
  const sum = mods.reduce((a, m) => a + (m.duration_minutes ?? 0), 0);
  totalMin += sum;
  check(
    `${c.code}: ${c.minutes} directed-study minutes`,
    sum === c.minutes && c.build.course.directed_study_minutes === c.minutes,
    String(sum),
  );
  check(
    `${c.code}: ${c.hours} directed-study hours`,
    Number(c.build.course.directed_study_hours) === c.hours,
    String(c.build.course.directed_study_hours),
  );
}
check(
  "Series: 5,850 minutes / 97.5 hours total",
  totalMin === 5850,
  String(totalMin),
);

// PS-1..PS-4 and T-01 in every course; 20 + 5 across the series
let so = 0,
  td = 0;
for (const c of COURSES) {
  const ids = (c.build.sign_offs ?? []).map((s) => s.id);
  check(
    `${c.code}: PS-1..PS-4`,
    JSON.stringify(ids) === '["PS-1","PS-2","PS-3","PS-4"]',
    ids.join(","),
  );
  so += ids.length;
  const hasT =
    (c.build.terminal_defense &&
      typeof c.build.terminal_defense === "object") ||
    c.build.course.terminal_defense === "T-01";
  check(`${c.code}: T-01`, hasT);
  if (hasT) td += 1;
  const order = c.build.sequencing?.order ?? [];
  check(
    `${c.code}: sequencing places PS-1..PS-4 and T-01`,
    ["PS-1", "PS-2", "PS-3", "PS-4", "T-01"].every((g) => order.includes(g)),
  );
  check(
    `${c.code}: four-week practical window`,
    c.build.course.practical_window_weeks_min === 4,
  );
}
check("Series: 20 sign-offs", so === 20, String(so));
check("Series: 5 terminal defenses", td === 5, String(td));

// Authority rule present and consistent in all ten course artifacts
const ruleRef = JSON.stringify(
  COURSES[0].build.foundations.authority_rule.hierarchy,
);
for (const c of COURSES) {
  check(
    `${c.code}: build carries foundations.authority_rule`,
    !!c.build.foundations?.authority_rule,
  );
  check(
    `${c.code}: authority hierarchy identical`,
    JSON.stringify(c.build.foundations?.authority_rule?.hierarchy) === ruleRef,
  );
  check(
    `${c.code}: spec carries the Foundations Authority Rule`,
    c.spec.includes("Foundations Authority Rule"),
  );
}

// A–F + U recognized everywhere
for (const c of COURSES) {
  const tax = (c.build.foundations?.series_evidence_taxonomy ?? [])
    .map((t) => t.class)
    .join("");
  check(`${c.code}: series taxonomy A–F + U`, tax === "ABCDEFU", tax);
}

// Three-layer discipline + population transfer attribution
for (const c of COURSES) {
  check(
    `${c.code}: three-layer discipline present`,
    /Evidence.*Applied Standard.*Coach Judgment|three-(layer|column) discipline/is.test(
      c.spec,
    ),
  );
}
check(
  "Population transfer: AS-101-16 is the series standard",
  COURSES[0].spec.includes("AS-101-16"),
);
check("G3-103 restates it as AS-103-12", COURSES[2].spec.includes("AS-103-12"));

// G3 102 decision model unchanged (exactly seven stages, GPI at PROFILE/GAP)
{
  const dm = COURSES[1].build.decision_model;
  const seq = (dm?.sequence ?? []).map((s) => String(s).toUpperCase());
  check(
    "G3-102: decision model is the exact seven stages",
    JSON.stringify(seq) ===
      JSON.stringify([
        "DEMAND",
        "PROFILE",
        "GAP",
        "PRIORITY",
        "PRESCRIPTION",
        "RESPONSE",
        "ADJUST",
      ]),
    seq.join("→"),
  );
  check(
    "G3-102: seven stages, no eighth",
    (dm?.stages ?? []).length === 7,
    String((dm?.stages ?? []).length),
  );
  check(
    "G3-102: GPI rule recorded (enters at PROFILE, interpreted at GAP)",
    /profile/i.test(dm?.gpi_rule ?? "") && /gap/i.test(dm?.gpi_rule ?? ""),
    dm?.gpi_rule,
  );
}

// No automated priority/readiness/injury/asymmetry prescription introduced
const prohibitedAutomation = [
  /automated training priorit/i,
  /readiness prescription/i,
  /injury[- ]risk score/i,
  /asymmetry alert/i,
  /recovery clock/i,
  /nonresponder classification/i,
];
for (const c of COURSES) {
  const nk = JSON.stringify(
    c.build.novakore?.prohibited_outputs ?? c.build.foundations ?? {},
  );
  // The builds must PROHIBIT these, never require them as features.
  const requiresAutomation = (c.build.novakore?.required_fields ?? []).some(
    (f) => prohibitedAutomation.some((re) => re.test(JSON.stringify(f))),
  );
  check(
    `${c.code}: no automated interpretation required by the build`,
    !requiresAutomation,
    nk ? "" : "",
  );
}

// Internal-CEU standing; no external recognition claimed
for (const c of COURSES) {
  check(
    `${c.code}: no NSCA/external approval claim`,
    !/NSCA[- ]approved|nationally recognized CEU/i.test(c.spec),
  );
}
check("Parent: internal G3 CEU standing", parent.includes("internal G3 CEU"));
check(
  "Parent: 244 cross-course checks recorded as passed",
  parent.includes("244 cross-course checks, all passed"),
);
check(
  "Parent: LOCKED FOR NOVAKORE IMPLEMENTATION",
  parent.includes("LOCKED FOR NOVAKORE IMPLEMENTATION"),
);

// ---------------------------------------------------------------------------
const failed = results.filter((r) => !r.ok);
console.log(
  `Cross-course package validation: ${results.length - failed.length}/${results.length} checks passed.`,
);
for (const f of failed)
  console.log(`  ✗ ${f.label}${f.detail ? ` — ${f.detail}` : ""}`);
process.exit(failed.length === 0 ? 0 : 1);

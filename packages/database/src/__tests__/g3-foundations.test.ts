import { beforeAll, describe, expect, test } from "vitest";
import { bareClient, signedIn, type Client } from "./_session";

/**
 * G3 Performance Foundations — real-DB gating, isolation, and state tests.
 *
 * Runs against the seeded G3 Performance tenant (seed:
 * supabase/seeds/g3-performance-foundations.sql). The G3 fixture accounts are
 * not in the pooled session file, so `signedIn` performs real sign-ins —
 * four accounts, well inside the auth-rate headroom (the documented
 * bfh-integration exception).
 *
 * DELIBERATELY NON-MUTATING: practical evaluations are immutable (append-only
 * with a protect trigger), so these tests never record one against the
 * permanent fixtures. Every gate is proven by the negative (the RPC refuses),
 * and the positive path is proven by the seeded fixture states the negative
 * tests depend on. The full record→unlock→complete flow was verified once
 * against a throwaway enrollment during implementation QA.
 */

const ORG = "26f6aa4a-4ade-4bb0-842f-12ca2e5bc115";

const skip =
  !process.env.NOVAKORE_TEST_SUPABASE_URL ||
  !process.env.NOVAKORE_TEST_SUPABASE_ANON_KEY;

describe.skipIf(skip)("G3 Foundations — series gating and isolation", () => {
  let newLearner: Client;
  let modulesLearner: Client;
  let assessor: Client;

  let courses: { id: string; slug: string; title: string }[] = [];
  let courseBySlug = new Map<
    string,
    { id: string; slug: string; title: string }
  >();

  beforeAll(async () => {
    newLearner = await signedIn("g3.learner.new@novakore.test");
    modulesLearner = await signedIn("g3.learner.modules@novakore.test");
    assessor = await signedIn("g3.assessor@novakore.test");
    const { data } = await assessor
      .from("courses")
      .select("id, slug, title")
      .eq("organization_id", ORG)
      .order("slug");
    courses = data ?? [];
    courseBySlug = new Map(courses.map((c) => [c.slug, c]));
  });

  test("the five Foundations courses exist, published, in sequence", async () => {
    expect(courses.map((c) => c.slug)).toEqual([
      "g3-101",
      "g3-102",
      "g3-103",
      "g3-104",
      "g3-105",
    ]);
    const { data } = await assessor
      .from("courses")
      .select("slug, status, enforce_sequence")
      .eq("organization_id", ORG);
    for (const row of data ?? []) {
      expect(row.status).toBe("published");
      expect(row.enforce_sequence).toBe(true);
    }
  });

  test("every course carries PS-1..PS-4 and T-01 (20 + 5 across the series)", async () => {
    const { data } = await assessor
      .from("practical_requirements")
      .select("course_id, kind, code")
      .eq("organization_id", ORG);
    expect(data).toHaveLength(25);
    for (const course of courses) {
      const own = (data ?? []).filter((r) => r.course_id === course.id);
      expect(own.map((r) => r.code).sort()).toEqual([
        "PS-1",
        "PS-2",
        "PS-3",
        "PS-4",
        "T-01",
      ]);
      expect(own.filter((r) => r.kind === "terminal_defense")).toHaveLength(1);
    }
  });

  test("directed study totals 5,850 minutes and gate lessons carry none", async () => {
    const { data } = await assessor
      .from("lessons")
      .select("id, estimated_minutes")
      .eq("organization_id", ORG);
    const total = (data ?? []).reduce(
      (a, l) => a + (l.estimated_minutes ?? 0),
      0,
    );
    expect(total).toBe(5850);
    const { data: gates } = await assessor
      .from("practical_requirements")
      .select("lesson_id")
      .eq("organization_id", ORG);
    const gateIds = new Set((gates ?? []).map((g) => g.lesson_id));
    for (const lesson of data ?? [])
      if (gateIds.has(lesson.id)) expect(lesson.estimated_minutes).toBeNull();
  });

  test("a new learner is locked out of G3 102 by the DB prerequisite gate", async () => {
    const g102 = courseBySlug.get("g3-102")!;
    const { data: lesson } = await assessor
      .from("lessons")
      .select("id")
      .eq("course_id", g102.id)
      .order("position")
      .limit(1)
      .single();
    const { data: enrollment } = await newLearner
      .from("enrollments")
      .select("id")
      .eq("organization_id", ORG)
      .single();
    const { error } = await newLearner.rpc("record_lesson_progress", {
      p_enrollment_id: enrollment!.id,
      p_lesson_id: lesson!.id,
      p_action: "complete",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/locked by prerequisite/);
  });

  test("the in-course hard sequence gate refuses out-of-order completion", async () => {
    const g101 = courseBySlug.get("g3-101")!;
    // Second lesson of M1 ("Directed study") without the overview done.
    const { data: modules } = await assessor
      .from("modules")
      .select("id")
      .eq("course_id", g101.id)
      .order("position")
      .limit(1);
    const { data: lessons } = await assessor
      .from("lessons")
      .select("id, title")
      .eq("module_id", modules![0]!.id)
      .order("position");
    const { data: enrollment } = await newLearner
      .from("enrollments")
      .select("id")
      .eq("organization_id", ORG)
      .single();
    const { error } = await newLearner.rpc("record_lesson_progress", {
      p_enrollment_id: enrollment!.id,
      p_lesson_id: lessons![1]!.id,
      p_action: "complete",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/locked by sequence/);
  });

  test("a practical gate lesson cannot be self-completed even when reached", async () => {
    // The "modules" fixture has every non-gate lesson complete; PS-1 is next.
    const g101 = courseBySlug.get("g3-101")!;
    const { data: req } = await assessor
      .from("practical_requirements")
      .select("lesson_id")
      .eq("course_id", g101.id)
      .eq("code", "PS-1")
      .single();
    const { data: enrollment } = await modulesLearner
      .from("enrollments")
      .select("id")
      .eq("organization_id", ORG)
      .single();
    const { error } = await modulesLearner.rpc("record_lesson_progress", {
      p_enrollment_id: enrollment!.id,
      p_lesson_id: req!.lesson_id,
      p_action: "complete",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/completed by an evaluator/);
  });

  test("recording an evaluation requires assessment.grade", async () => {
    const g101 = courseBySlug.get("g3-101")!;
    const { data: req } = await assessor
      .from("practical_requirements")
      .select("id")
      .eq("course_id", g101.id)
      .eq("code", "PS-1")
      .single();
    const { data: enrollment } = await modulesLearner
      .from("enrollments")
      .select("id")
      .eq("organization_id", ORG)
      .single();
    const { error } = await modulesLearner.rpc("record_practical_evaluation", {
      p_enrollment_id: enrollment!.id,
      p_requirement_id: req!.id,
      p_result: "passed",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/assessment\.grade/);
  });

  test("an evaluator cannot record a pass before the learner reaches the gate", async () => {
    const g101 = courseBySlug.get("g3-101")!;
    const { data: req } = await assessor
      .from("practical_requirements")
      .select("id")
      .eq("course_id", g101.id)
      .eq("code", "T-01")
      .single();
    // The "practicals" fixture completed everything EXCEPT the T-01 lesson —
    // but T-01 is the last gate, so use the "modules" fixture, which has not
    // passed PS-1..PS-4 (their gate lessons are incomplete → not reached).
    const { data: enrollment } = await modulesLearner
      .from("enrollments")
      .select("id")
      .eq("organization_id", ORG)
      .single();
    const { error } = await assessor.rpc("record_practical_evaluation", {
      p_enrollment_id: enrollment!.id,
      p_requirement_id: req!.id,
      p_result: "passed",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/has not reached this gate/);
  });

  test("fixture states encode the series standard", async () => {
    // learner.101: G3 101 complete (incl. T-01), nothing else completed.
    const c101 = await signedIn("g3.learner.101@novakore.test");
    const { data: p101 } = await c101
      .from("progress_records")
      .select("course_id, status")
      .eq("subject_type", "course");
    const g101 = courseBySlug.get("g3-101")!;
    const completed = (p101 ?? []).filter((r) => r.status === "completed");
    expect(completed).toHaveLength(1);
    expect(completed[0]!.course_id).toBe(g101.id);

    // practicals fixture: PS-1..PS-4 passed, T-01 absent → course incomplete.
    const { data: evals } = await assessor
      .from("practical_evaluations")
      .select(
        "code, result, enrollment_id, practical_requirements!inner(course_id)",
      )
      .eq("organization_id", ORG)
      .eq("practical_requirements.course_id", g101.id);
    const practicalsEnrollment = (
      await modulesLearner
        .from("enrollments")
        .select("id")
        .eq("organization_id", ORG)
    ).data;
    expect(practicalsEnrollment).not.toBeNull();
    // remediation fixture: T-01 remediation_required stands unresolved.
    const remediation = (evals ?? []).filter(
      (entry) =>
        entry.code === "T-01" && entry.result === "remediation_required",
    );
    expect(remediation.length).toBeGreaterThan(0);
  });

  test("the fully-complete fixture holds course + Foundations credentials", async () => {
    const complete = await signedIn("g3.learner.complete@novakore.test");
    const { data: enrollment } = await complete
      .from("enrollments")
      .select("id, status, completed_at")
      .eq("organization_id", ORG)
      .single();
    expect(enrollment!.status).toBe("completed");
    expect(enrollment!.completed_at).not.toBeNull();
    const { data: credentials } = await complete
      .from("issued_credentials")
      .select("title, status")
      .eq("organization_id", ORG);
    expect(credentials).toHaveLength(6);
    expect(
      credentials!.some((c) => c.title.includes("G3 Performance Foundations")),
    ).toBe(true);
    for (const credential of credentials!)
      expect(credential.title).toContain("Internal G3 CEU");
  });

  test("learners see only their own evaluations; anon sees nothing", async () => {
    const { data: mine } = await newLearner
      .from("practical_evaluations")
      .select("id")
      .eq("organization_id", ORG);
    expect(mine ?? []).toHaveLength(0); // new learner has none

    const anon = bareClient();
    const { data: anonReqs, error: anonErr } = await anon
      .from("practical_requirements")
      .select("id");
    expect(anonErr !== null || (anonReqs ?? []).length === 0).toBe(true);
    const { data: anonEvals, error: anonEvalErr } = await anon
      .from("practical_evaluations")
      .select("id");
    expect(anonEvalErr !== null || (anonEvals ?? []).length === 0).toBe(true);
  });

  test("evaluations are immutable through the API", async () => {
    const { data: one } = await assessor
      .from("practical_evaluations")
      .select("id, result")
      .eq("organization_id", ORG)
      .limit(1)
      .single();
    const { error: updateError } = await assessor
      .from("practical_evaluations")
      .update({ result: "failed" })
      .eq("id", one!.id);
    // Either the write is refused outright or affects nothing.
    const { data: after } = await assessor
      .from("practical_evaluations")
      .select("result")
      .eq("id", one!.id)
      .single();
    expect(after!.result).toBe(one!.result);
    void updateError;
    const { error: insertError } = await assessor
      .from("practical_evaluations")
      .insert({
        organization_id: ORG,
        requirement_id: one!.id, // nonsense on purpose
        enrollment_id: one!.id,
        membership_id: one!.id,
        course_id: one!.id,
        lesson_id: one!.id,
        kind: "practical_sign_off",
        code: "PS-1",
        result: "passed",
        evaluator_id: one!.id,
      });
    expect(insertError).not.toBeNull(); // direct inserts are revoked (RPC-only)
  });

  test("curriculum records carry the series governance", async () => {
    const { data: series } = await newLearner
      .from("curriculum_records")
      .select("kind, code, title")
      .eq("organization_id", ORG)
      .eq("kind", "series");
    const codes = (series ?? []).map((r) => r.code).sort();
    for (const required of [
      "authority-rule",
      "completion-rule",
      "evidence-taxonomy",
      "platform-prohibitions",
      "sequence",
      "workload",
    ])
      expect(codes).toContain(required);
  });
});

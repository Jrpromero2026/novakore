import "server-only";
import type {
  PracticalKind,
  PracticalResult,
  PracticalRubricDefinition,
} from "@novakore/domain";
import { practicalRubricDefinitionSchema } from "@novakore/domain";
import { supabaseServer } from "../supabase/server";

/**
 * Practical evaluation data access. All reads run under the caller's RLS
 * session: learners see requirements on courses they can access and their own
 * evaluations; evaluators (assessment.grade) see the org's evaluation records.
 */

export interface PracticalRequirementDetail {
  id: string;
  courseId: string;
  lessonId: string;
  kind: PracticalKind;
  code: string;
  title: string;
  competencyCodes: string[];
  rubric: PracticalRubricDefinition | null;
  guidance: string | null;
}

export interface PracticalEvaluationRecord {
  id: string;
  requirementId: string;
  enrollmentId: string;
  result: PracticalResult;
  rubric: Record<string, unknown>;
  evidence: string | null;
  comments: string | null;
  evaluatedAt: string;
}

function toRequirement(row: {
  id: string;
  course_id: string;
  lesson_id: string;
  kind: string;
  code: string;
  title: string;
  competency_codes: string[] | null;
  rubric: unknown;
  guidance: string | null;
}): PracticalRequirementDetail {
  const rubric = practicalRubricDefinitionSchema.safeParse(row.rubric);
  return {
    id: row.id,
    courseId: row.course_id,
    lessonId: row.lesson_id,
    kind: row.kind as PracticalKind,
    code: row.code,
    title: row.title,
    competencyCodes: row.competency_codes ?? [],
    rubric: rubric.success ? rubric.data : null,
    guidance: row.guidance,
  };
}

/** The requirement (if any) carried by one lesson, with this enrollment's record. */
export async function getLessonPractical(
  organizationId: string,
  lessonId: string,
  enrollmentId: string,
): Promise<{
  requirement: PracticalRequirementDetail;
  evaluations: PracticalEvaluationRecord[];
} | null> {
  const supabase = await supabaseServer();
  const { data: req } = await supabase
    .from("practical_requirements")
    .select(
      "id, course_id, lesson_id, kind, code, title, competency_codes, rubric, guidance",
    )
    .eq("organization_id", organizationId)
    .eq("lesson_id", lessonId)
    .maybeSingle();
  if (!req) return null;

  const { data: evals } = await supabase
    .from("practical_evaluations")
    .select(
      "id, requirement_id, enrollment_id, result, rubric, evidence, comments, evaluated_at",
    )
    .eq("requirement_id", req.id)
    .eq("enrollment_id", enrollmentId)
    .order("evaluated_at");

  return {
    requirement: toRequirement(req),
    evaluations: (evals ?? []).map((row) => ({
      id: row.id,
      requirementId: row.requirement_id,
      enrollmentId: row.enrollment_id,
      result: row.result as PracticalResult,
      rubric: (row.rubric as Record<string, unknown>) ?? {},
      evidence: row.evidence,
      comments: row.comments,
      evaluatedAt: row.evaluated_at,
    })),
  };
}

export interface PracticalWorkbenchRow {
  requirement: PracticalRequirementDetail;
  courseTitle: string;
  lessonTitle: string;
  learners: {
    enrollmentId: string;
    membershipId: string;
    learnerName: string;
    status: "not_evaluated" | "passed" | "remediation_open" | "failed";
    lastEvaluatedAt: string | null;
    lastComments: string | null;
  }[];
}

/**
 * Evaluator workbench: every practical requirement in the org, with each
 * covered enrollment's current standing. Enrollment coverage mirrors the SQL
 * rule (direct course target or a path containing the course).
 */
export async function getPracticalWorkbench(
  organizationId: string,
): Promise<PracticalWorkbenchRow[]> {
  const supabase = await supabaseServer();
  const { data: reqs } = await supabase
    .from("practical_requirements")
    .select(
      "id, course_id, lesson_id, kind, code, title, competency_codes, rubric, guidance, courses(title), lessons(title)",
    )
    .eq("organization_id", organizationId)
    .order("code");
  if (!reqs || reqs.length === 0) return [];

  const courseIds = [...new Set(reqs.map((r) => r.course_id))];

  const [{ data: pathNodes }, { data: evals }] = await Promise.all([
    supabase
      .from("path_nodes")
      .select("path_id, course_id")
      .eq("organization_id", organizationId)
      .in("course_id", courseIds),
    supabase
      .from("practical_evaluations")
      .select("requirement_id, enrollment_id, result, evaluated_at, comments")
      .eq("organization_id", organizationId)
      .order("evaluated_at"),
  ]);
  const pathIds = [...new Set((pathNodes ?? []).map((n) => n.path_id))];

  const [{ data: enrollments }, { data: emails }] = await Promise.all([
    supabase
      .from("enrollments")
      .select(
        "id, membership_id, target_type, course_id, learning_path_id, status",
      )
      .eq("organization_id", organizationId)
      .in("status", ["active", "completed"]),
    supabase.rpc("get_member_emails", { p_organization_id: organizationId }),
  ]);
  const emailByMembership = new Map(
    (emails ?? []).map((row) => [row.membership_id, row.email]),
  );

  const covered = (enrollments ?? []).filter(
    (e) =>
      (e.target_type === "course" &&
        e.course_id !== null &&
        courseIds.includes(e.course_id)) ||
      (e.target_type === "learning_path" &&
        e.learning_path_id !== null &&
        pathIds.includes(e.learning_path_id)),
  );

  const coursesOnPath = new Map<string, Set<string>>();
  for (const node of pathNodes ?? []) {
    const set = coursesOnPath.get(node.path_id) ?? new Set<string>();
    set.add(node.course_id);
    coursesOnPath.set(node.path_id, set);
  }

  return reqs.map((req) => {
    const learners = covered
      .filter((e) =>
        e.target_type === "course"
          ? e.course_id === req.course_id
          : (coursesOnPath.get(e.learning_path_id ?? "") ?? new Set()).has(
              req.course_id,
            ),
      )
      .map((e) => {
        const own = (evals ?? []).filter(
          (v) => v.requirement_id === req.id && v.enrollment_id === e.id,
        );
        const passed = own.some((v) => v.result === "passed");
        const latest = own.at(-1);
        return {
          enrollmentId: e.id,
          membershipId: e.membership_id,
          learnerName: emailByMembership.get(e.membership_id) ?? "Member",
          status: passed
            ? ("passed" as const)
            : latest === undefined
              ? ("not_evaluated" as const)
              : latest.result === "remediation_required"
                ? ("remediation_open" as const)
                : ("failed" as const),
          lastEvaluatedAt: latest?.evaluated_at ?? null,
          lastComments: latest?.comments ?? null,
        };
      });
    return {
      requirement: toRequirement(req),
      courseTitle: (req.courses as { title: string } | null)?.title ?? "",
      lessonTitle: (req.lessons as { title: string } | null)?.title ?? "",
      learners,
    };
  });
}

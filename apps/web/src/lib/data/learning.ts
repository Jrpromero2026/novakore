import "server-only";
import {
  computeLessonAccess,
  computePathAccess,
  courseStructureSchema,
  contentBlockSchema,
  type ContentBlock,
  type CourseStructure,
  type LessonAccess,
  type PathNodeAccess,
  type ProgressStatus,
} from "@novakore/domain";
import { supabaseServer } from "../supabase/server";

/**
 * Learning data access (D-08 module). All reads run under the caller's RLS
 * session. Access states come exclusively from the domain computations —
 * no surface re-implements unlock logic.
 */

export interface LearnerEnrollmentSummary {
  id: string;
  targetType: "course" | "learning_path";
  title: string;
  status: string;
  completedLessons: number;
  totalRequiredLessons: number | null;
}

/** The signed-in member's own enrollments in this organization. */
export async function getMyEnrollments(
  organizationId: string,
  userId: string,
): Promise<LearnerEnrollmentSummary[]> {
  const supabase = await supabaseServer();
  const { data: rows } = await supabase
    .from("enrollments")
    .select(
      "id, target_type, status, course_id, learning_path_id, organization_memberships!inner(user_id)",
    )
    .eq("organization_id", organizationId)
    .eq("organization_memberships.user_id", userId)
    .in("status", ["active", "completed"])
    .order("created_at");

  const summaries: LearnerEnrollmentSummary[] = [];
  for (const row of rows ?? []) {
    let title = "Enrollment";
    if (row.target_type === "course" && row.course_id) {
      const { data } = await supabase
        .from("courses")
        .select("title")
        .eq("id", row.course_id)
        .maybeSingle();
      title = data?.title ?? title;
    } else if (row.learning_path_id) {
      const { data } = await supabase
        .from("learning_paths")
        .select("title")
        .eq("id", row.learning_path_id)
        .maybeSingle();
      title = data?.title ?? title;
    }
    const { data: progress } = await supabase
      .from("progress_records")
      .select("status, lesson_id")
      .eq("enrollment_id", row.id)
      .not("lesson_id", "is", null);
    summaries.push({
      id: row.id,
      targetType: row.target_type as "course" | "learning_path",
      title,
      status: row.status,
      completedLessons:
        progress?.filter(
          (p) => p.status === "completed" || p.status === "exempted",
        ).length ?? 0,
      totalRequiredLessons: null,
    });
  }
  return summaries;
}

export interface EnrolledCourseView {
  enrollmentId: string;
  enrollmentStatus: "active" | "completed" | "withdrawn" | "expired";
  courseId: string;
  courseTitle: string;
  versionNumber: number;
  /** Exact pinned structure the learner experiences. */
  structure: CourseStructure;
  access: LessonAccess[];
  courseCompleted: boolean;
  progressByLesson: Map<string, ProgressStatus>;
}

/**
 * Resolve the exact course version a learner experiences for an enrollment:
 * course-progress pin → enrollment pin → current published (ADR-017).
 * Returns null when the version cannot be resolved (safety state).
 */
export async function getEnrolledCourse(
  enrollmentId: string,
  courseId: string,
  userId: string,
): Promise<EnrolledCourseView | "version_unavailable" | null> {
  const supabase = await supabaseServer();
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select(
      "id, status, course_id, learning_path_id, pinned_course_version_id, organization_memberships!inner(user_id)",
    )
    .eq("id", enrollmentId)
    .eq("organization_memberships.user_id", userId)
    .maybeSingle();
  if (!enrollment) return null;

  const covers =
    enrollment.course_id === courseId ||
    (enrollment.learning_path_id !== null &&
      (
        await supabase
          .from("path_nodes")
          .select("id")
          .eq("path_id", enrollment.learning_path_id)
          .eq("course_id", courseId)
      ).data?.length);
  if (!covers) return null;

  const { data: progressRows } = await supabase
    .from("progress_records")
    .select("subject_type, lesson_id, course_version_id, status")
    .eq("enrollment_id", enrollmentId)
    .eq("course_id", courseId);

  const coursePin = progressRows?.find((p) => p.subject_type === "course");
  let versionId =
    coursePin?.course_version_id ?? enrollment.pinned_course_version_id;
  if (!versionId) {
    const { data: course } = await supabase
      .from("courses")
      .select("current_published_version_id")
      .eq("id", courseId)
      .maybeSingle();
    versionId = course?.current_published_version_id ?? null;
  }
  if (!versionId) return "version_unavailable";

  const { data: version } = await supabase
    .from("course_versions")
    .select("id, version_number, title, structure")
    .eq("id", versionId)
    .maybeSingle();
  if (!version) return "version_unavailable";
  const structure = courseStructureSchema.safeParse(version.structure);
  if (!structure.success) return "version_unavailable";

  const progress =
    progressRows
      ?.filter((p) => p.lesson_id !== null)
      .map((p) => ({
        lessonId: p.lesson_id!,
        status: p.status as ProgressStatus,
      })) ?? [];

  return {
    enrollmentId,
    enrollmentStatus:
      enrollment.status as EnrolledCourseView["enrollmentStatus"],
    courseId,
    courseTitle: version.title,
    versionNumber: version.version_number,
    structure: structure.data,
    access: computeLessonAccess({
      enrollmentStatus:
        enrollment.status as EnrolledCourseView["enrollmentStatus"],
      structure: structure.data,
      progress,
    }),
    courseCompleted: coursePin?.status === "completed",
    progressByLesson: new Map(progress.map((p) => [p.lessonId, p.status])),
  };
}

export interface EnrolledPathView {
  enrollmentId: string;
  pathTitle: string;
  enrollmentStatus: "active" | "completed" | "withdrawn" | "expired";
  nodes: (PathNodeAccess & { title: string })[];
}

export async function getEnrolledPath(
  enrollmentId: string,
  userId: string,
): Promise<EnrolledPathView | null> {
  const supabase = await supabaseServer();
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select(
      "id, status, learning_path_id, organization_memberships!inner(user_id)",
    )
    .eq("id", enrollmentId)
    .eq("organization_memberships.user_id", userId)
    .not("learning_path_id", "is", null)
    .maybeSingle();
  if (!enrollment?.learning_path_id) return null;

  const [
    { data: path },
    { data: nodes },
    { data: prereqs },
    { data: progress },
  ] = await Promise.all([
    supabase
      .from("learning_paths")
      .select("title")
      .eq("id", enrollment.learning_path_id)
      .maybeSingle(),
    supabase
      .from("path_nodes")
      .select(
        "id, course_id, position, courses!path_nodes_course_id_organization_id_fkey(title)",
      )
      .eq("path_id", enrollment.learning_path_id),
    supabase
      .from("prerequisites")
      .select("node_id, requires_node_id")
      .eq("path_id", enrollment.learning_path_id),
    supabase
      .from("progress_records")
      .select("course_id, status")
      .eq("enrollment_id", enrollmentId)
      .eq("subject_type", "course"),
  ]);
  if (!path || !nodes) return null;

  const nodeInputs = nodes.map((n) => ({
    nodeId: n.id,
    courseId: n.course_id,
    title: (n.courses as { title: string } | null)?.title ?? "Course",
    position: n.position,
  }));
  const access = computePathAccess({
    enrollmentStatus: enrollment.status as EnrolledPathView["enrollmentStatus"],
    nodes: nodeInputs,
    prerequisites: (prereqs ?? []).map((p) => ({
      nodeId: p.node_id,
      requiresNodeId: p.requires_node_id,
    })),
    completedCourseIds:
      progress
        ?.filter((p) => p.status === "completed")
        .map((p) => p.course_id) ?? [],
  });
  const titleByNode = new Map(nodeInputs.map((n) => [n.nodeId, n.title]));

  return {
    enrollmentId,
    pathTitle: path.title,
    enrollmentStatus: enrollment.status as EnrolledPathView["enrollmentStatus"],
    nodes: access.map((a) => ({
      ...a,
      title: titleByNode.get(a.nodeId) ?? "Course",
    })),
  };
}

/** Parse frozen blocks from a lesson version snapshot (render-safe). */
export function parseFrozenBlocks(blocks: unknown): ContentBlock[] {
  if (!Array.isArray(blocks)) return [];
  const parsed: ContentBlock[] = [];
  for (const raw of blocks) {
    const result = contentBlockSchema.safeParse(raw);
    if (result.success) parsed.push(result.data);
    // unknown/invalid blocks degrade silently at render (documented fallback)
  }
  return parsed;
}

import "server-only";
import type { AssessmentItemType, AttemptStatus } from "@novakore/domain";
import { supabaseServer } from "../supabase/server";

/**
 * Assessment data access (D-08 module). All reads run under the caller's
 * RLS session; learner item content only ever flows through the
 * answer-stripped get_assessment_attempt_payload RPC.
 */

export interface AssessmentSummary {
  id: string;
  title: string;
  assessmentType: string;
  status: string;
  publishedVersionNumber: number | null;
  itemCount: number;
}

export async function listAssessments(
  organizationId: string,
): Promise<AssessmentSummary[]> {
  const supabase = await supabaseServer();
  const { data: rows } = await supabase
    .from("assessments")
    .select(
      "id, title, assessment_type, status, current_published_version_id, assessment_versions!assessments_current_published_version_fk(version_number), assessment_items(count)",
    )
    .eq("organization_id", organizationId)
    .neq("status", "archived")
    .order("created_at");
  return (rows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    assessmentType: row.assessment_type,
    status: row.status,
    publishedVersionNumber:
      (row.assessment_versions as { version_number: number } | null)
        ?.version_number ?? null,
    itemCount:
      (row.assessment_items as unknown as { count: number }[])[0]?.count ?? 0,
  }));
}

export interface DraftItem {
  id: string;
  type: AssessmentItemType;
  schemaVersion: number;
  data: Record<string, unknown>;
  position: string;
  required: boolean;
}

export interface AssessmentDetail {
  id: string;
  title: string;
  assessmentType: string;
  status: string;
  settings: Record<string, unknown>;
  currentPublishedVersionId: string | null;
  publishedVersionNumber: number | null;
  publishedAt: string | null;
  items: DraftItem[];
  assignments: {
    id: string;
    lessonId: string;
    lessonTitle: string;
    courseTitle: string;
    versionNumber: number;
    required: boolean;
    status: string;
  }[];
  attempts: {
    id: string;
    status: AttemptStatus;
    attemptNumber: number;
    scorePercent: number | null;
    startedAt: string;
  }[];
}

export async function getAssessmentDetail(
  organizationId: string,
  assessmentId: string,
): Promise<AssessmentDetail | null> {
  const supabase = await supabaseServer();
  const [
    { data: assessment },
    { data: items },
    { data: assignments },
    { data: attempts },
  ] = await Promise.all([
    supabase
      .from("assessments")
      .select(
        "id, title, assessment_type, status, settings, current_published_version_id, assessment_versions!assessments_current_published_version_fk(version_number, published_at)",
      )
      .eq("id", assessmentId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("assessment_items")
      .select("id, item_type, schema_version, data, position, required")
      .eq("assessment_id", assessmentId)
      .order("position"),
    supabase
      .from("assessment_assignments")
      .select(
        "id, lesson_id, required, status, assessment_versions!assessment_assignments_assessment_version_id_fkey(version_number), lessons!assessment_assignments_lesson_id_organization_id_fkey(title, courses!lessons_course_id_organization_id_fkey(title))",
      )
      .eq("assessment_id", assessmentId)
      .order("created_at"),
    supabase
      .from("assessment_attempts")
      .select("id, status, attempt_number, score_percent, started_at")
      .eq("assessment_id", assessmentId)
      .order("started_at", { ascending: false })
      .limit(50),
  ]);
  if (!assessment) return null;

  const published = assessment.assessment_versions as {
    version_number: number;
    published_at: string;
  } | null;
  return {
    id: assessment.id,
    title: assessment.title,
    assessmentType: assessment.assessment_type,
    status: assessment.status,
    settings: (assessment.settings ?? {}) as Record<string, unknown>,
    currentPublishedVersionId: assessment.current_published_version_id,
    publishedVersionNumber: published?.version_number ?? null,
    publishedAt: published?.published_at ?? null,
    items: (items ?? []).map((i) => ({
      id: i.id,
      type: i.item_type as AssessmentItemType,
      schemaVersion: i.schema_version,
      data: (i.data ?? {}) as Record<string, unknown>,
      position: i.position,
      required: i.required,
    })),
    assignments: (assignments ?? []).map((a) => {
      const lesson = a.lessons as unknown as {
        title: string;
        courses: { title: string } | null;
      } | null;
      return {
        id: a.id,
        lessonId: a.lesson_id,
        lessonTitle: lesson?.title ?? "Lesson",
        courseTitle: lesson?.courses?.title ?? "Course",
        versionNumber:
          (a.assessment_versions as { version_number: number } | null)
            ?.version_number ?? 1,
        required: a.required,
        status: a.status,
      };
    }),
    attempts: (attempts ?? []).map((a) => ({
      id: a.id,
      status: a.status as AttemptStatus,
      attemptNumber: a.attempt_number,
      scorePercent: a.score_percent === null ? null : Number(a.score_percent),
      startedAt: a.started_at,
    })),
  };
}

// ---------------------------------------------------------------------------
// Review queue (graders)
// ---------------------------------------------------------------------------

export interface ReviewQueueEntry {
  attemptId: string;
  reviewStatus: string;
  assessmentTitle: string;
  attemptNumber: number;
  submittedAt: string | null;
  claimedByMe: boolean;
}

export async function getReviewQueue(
  organizationId: string,
  userId: string,
): Promise<ReviewQueueEntry[]> {
  const supabase = await supabaseServer();
  const { data: reviews } = await supabase
    .from("assessment_reviews")
    .select(
      "attempt_id, status, reviewer_id, assessment_attempts!assessment_reviews_attempt_id_organization_id_fkey(attempt_number, submitted_at, assessment_id)",
    )
    .eq("organization_id", organizationId)
    .neq("status", "completed")
    .order("created_at");
  if (!reviews || reviews.length === 0) return [];

  const assessmentIds = [
    ...new Set(
      reviews.map(
        (r) =>
          (r.assessment_attempts as unknown as { assessment_id: string })
            .assessment_id,
      ),
    ),
  ];
  const { data: assessments } = await supabase
    .from("assessments")
    .select("id, title")
    .in("id", assessmentIds);
  const titleById = new Map((assessments ?? []).map((a) => [a.id, a.title]));

  return reviews.map((r) => {
    const attempt = r.assessment_attempts as unknown as {
      attempt_number: number;
      submitted_at: string | null;
      assessment_id: string;
    };
    return {
      attemptId: r.attempt_id,
      reviewStatus: r.status,
      assessmentTitle: titleById.get(attempt.assessment_id) ?? "Assessment",
      attemptNumber: attempt.attempt_number,
      submittedAt: attempt.submitted_at,
      claimedByMe: r.reviewer_id === userId,
    };
  });
}

export interface ReviewDetail {
  attemptId: string;
  assessmentTitle: string;
  attemptNumber: number;
  status: AttemptStatus;
  passingPercent: number;
  reviewStatus: string;
  /** Full item definitions INCLUDING rubric — grader-side only. */
  items: {
    id: string;
    type: AssessmentItemType;
    prompt: string;
    points: number;
    required: boolean;
    rubric: string | null;
    objective: boolean;
  }[];
  responses: Map<
    string,
    {
      response: Record<string, unknown>;
      pointsEarned: number | null;
      correct: boolean | null;
      needsReview: boolean;
    }
  >;
}

export async function getReviewDetail(
  organizationId: string,
  attemptId: string,
): Promise<ReviewDetail | null> {
  const supabase = await supabaseServer();
  const [{ data: attempt }, { data: review }, { data: responses }] =
    await Promise.all([
      supabase
        .from("assessment_attempts")
        .select(
          "id, status, attempt_number, passing_percent, assessment_id, assessment_version_id",
        )
        .eq("id", attemptId)
        .eq("organization_id", organizationId)
        .maybeSingle(),
      supabase
        .from("assessment_reviews")
        .select("status")
        .eq("attempt_id", attemptId)
        .maybeSingle(),
      supabase
        .from("assessment_responses")
        .select("item_id, response, points_earned, correct, needs_review")
        .eq("attempt_id", attemptId),
    ]);
  if (!attempt) return null;

  // grader path: read the pinned version directly (content.view_draft holders)
  const [{ data: version }, { data: assessmentRow }] = await Promise.all([
    supabase
      .from("assessment_versions")
      .select("items")
      .eq("id", attempt.assessment_version_id)
      .maybeSingle(),
    supabase
      .from("assessments")
      .select("title")
      .eq("id", attempt.assessment_id)
      .maybeSingle(),
  ]);
  if (!version || !Array.isArray(version.items)) return null;

  const items = (version.items as Record<string, unknown>[]).map((item) => {
    const data = (item.data ?? {}) as Record<string, unknown>;
    const type = item.type as AssessmentItemType;
    return {
      id: String(item.id),
      type,
      prompt: String(data.prompt ?? ""),
      points: Number(data.points ?? 0),
      required: Boolean(item.required),
      rubric: typeof data.rubric === "string" ? data.rubric : null,
      objective: ["multiple_choice", "multiple_select", "true_false"].includes(
        type,
      ),
    };
  });

  return {
    attemptId,
    assessmentTitle: assessmentRow?.title ?? "Assessment",
    attemptNumber: attempt.attempt_number,
    status: attempt.status as AttemptStatus,
    passingPercent: attempt.passing_percent,
    reviewStatus: review?.status ?? "pending_review",
    items,
    responses: new Map(
      (responses ?? []).map((r) => [
        r.item_id,
        {
          response: (r.response ?? {}) as Record<string, unknown>,
          pointsEarned:
            r.points_earned === null ? null : Number(r.points_earned),
          correct: r.correct,
          needsReview: r.needs_review,
        },
      ]),
    ),
  };
}

// ---------------------------------------------------------------------------
// Learner-side
// ---------------------------------------------------------------------------

export interface LessonAssessmentEntry {
  assignmentId: string;
  assessmentTitle: string;
  required: boolean;
  attempts: {
    id: string;
    status: AttemptStatus;
    attemptNumber: number;
    scorePercent: number | null;
  }[];
}

export async function getLessonAssessments(
  organizationId: string,
  lessonId: string,
  enrollmentId: string,
): Promise<LessonAssessmentEntry[]> {
  const supabase = await supabaseServer();
  const { data: assignments } = await supabase
    .from("assessment_assignments")
    .select("id, assessment_id, required")
    .eq("organization_id", organizationId)
    .eq("lesson_id", lessonId)
    .eq("status", "active")
    .order("position");
  if (!assignments || assignments.length === 0) return [];

  const [{ data: assessments }, { data: attempts }] = await Promise.all([
    supabase
      .from("assessments")
      .select("id, title")
      .in(
        "id",
        assignments.map((a) => a.assessment_id),
      ),
    supabase
      .from("assessment_attempts")
      .select("id, assignment_id, status, attempt_number, score_percent")
      .eq("enrollment_id", enrollmentId)
      .in(
        "assignment_id",
        assignments.map((a) => a.id),
      )
      .order("attempt_number"),
  ]);
  const titleById = new Map((assessments ?? []).map((a) => [a.id, a.title]));

  return assignments.map((a) => ({
    assignmentId: a.id,
    assessmentTitle: titleById.get(a.assessment_id) ?? "Assessment",
    required: a.required,
    attempts: (attempts ?? [])
      .filter((at) => at.assignment_id === a.id)
      .map((at) => ({
        id: at.id,
        status: at.status as AttemptStatus,
        attemptNumber: at.attempt_number,
        scorePercent:
          at.score_percent === null ? null : Number(at.score_percent),
      })),
  }));
}

export interface CredentialView {
  id: string;
  title: string;
  status: string;
  issuedAt: string;
  expiresAt: string | null;
  verificationCode: string;
  recipientName: string;
  revocationReason: string | null;
}

export async function getMyCredentials(
  organizationId: string,
  userId: string,
): Promise<CredentialView[]> {
  const supabase = await supabaseServer();
  const { data: rows } = await supabase
    .from("issued_credentials")
    .select(
      "id, title, status, issued_at, expires_at, verification_code, recipient_name, revocation_reason, organization_memberships!issued_credentials_membership_id_organization_id_fkey!inner(user_id)",
    )
    .eq("organization_id", organizationId)
    .eq("organization_memberships.user_id", userId)
    .order("issued_at", { ascending: false });
  return (rows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    issuedAt: r.issued_at,
    expiresAt: r.expires_at,
    verificationCode: r.verification_code,
    recipientName: r.recipient_name,
    revocationReason: r.revocation_reason,
  }));
}

// ---------------------------------------------------------------------------
// Credential administration
// ---------------------------------------------------------------------------

export interface CredentialAdminData {
  templates: { id: string; name: string; status: string }[];
  certificates: {
    id: string;
    title: string;
    sourceType: string;
    status: string;
  }[];
  issued: (CredentialView & { certificateTitle: string })[];
}

export async function getCredentialAdminData(
  organizationId: string,
): Promise<CredentialAdminData> {
  const supabase = await supabaseServer();
  const [{ data: templates }, { data: certificates }, { data: issued }] =
    await Promise.all([
      supabase
        .from("certificate_templates")
        .select("id, name, status")
        .eq("organization_id", organizationId)
        .neq("status", "archived")
        .order("created_at"),
      supabase
        .from("certificates")
        .select("id, title, source_type, status")
        .eq("organization_id", organizationId)
        .order("created_at"),
      supabase
        .from("issued_credentials")
        .select(
          "id, title, status, issued_at, expires_at, verification_code, recipient_name, revocation_reason, certificates!issued_credentials_certificate_id_organization_id_fkey(title)",
        )
        .eq("organization_id", organizationId)
        .order("issued_at", { ascending: false })
        .limit(100),
    ]);
  return {
    templates: templates ?? [],
    certificates: (certificates ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      sourceType: c.source_type,
      status: c.status,
    })),
    issued: (issued ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      issuedAt: r.issued_at,
      expiresAt: r.expires_at,
      verificationCode: r.verification_code,
      recipientName: r.recipient_name,
      revocationReason: r.revocation_reason,
      certificateTitle:
        (r.certificates as unknown as { title: string } | null)?.title ?? "",
    })),
  };
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/org-context";
import { requireUser } from "@/lib/auth";
import { getTerminology } from "@/lib/terminology";
import { supabaseServer } from "@/lib/supabase/server";
import { AttemptFlow, type AttemptPayload } from "./attempt-flow";

export const metadata: Metadata = { title: "Assessment" };

export default async function LearnerAssessmentPage({
  params,
}: {
  params: Promise<{
    orgSlug: string;
    enrollmentId: string;
    assignmentId: string;
  }>;
}) {
  const { orgSlug, enrollmentId, assignmentId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const user = await requireUser();
  const { term } = await getTerminology(ctx.organization.id);
  const supabase = await supabaseServer();

  // the enrollment must be the caller's own (server check; RPCs re-enforce)
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, organization_memberships!inner(user_id)")
    .eq("id", enrollmentId)
    .eq("organization_memberships.user_id", user.id)
    .maybeSingle();
  if (!enrollment) notFound();

  const { data: assignment } = await supabase
    .from("assessment_assignments")
    .select("id, assessment_id, required, status, course_id, lesson_id")
    .eq("id", assignmentId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!assignment || assignment.status !== "active") notFound();

  const [{ data: assessment }, { data: attempts }] = await Promise.all([
    supabase
      .from("assessments")
      .select("title")
      .eq("id", assignment.assessment_id)
      .maybeSingle(),
    supabase
      .from("assessment_attempts")
      .select(
        "id, status, attempt_number, score_percent, passing_percent, finalized_at, expires_at",
      )
      .eq("assignment_id", assignmentId)
      .eq("enrollment_id", enrollmentId)
      .order("attempt_number"),
  ]);

  // open attempt → fetch the answer-stripped payload for the flow
  const open = (attempts ?? []).find((a) => a.status === "started");
  let payload: AttemptPayload | null = null;
  if (open) {
    const { data } = await supabase.rpc("get_assessment_attempt_payload", {
      p_attempt_id: open.id,
    });
    payload = data as unknown as AttemptPayload;
  }

  // reviewer feedback for the latest finalized attempt
  const latest = (attempts ?? []).at(-1);
  let feedback: {
    itemFeedback: { prompt: string; text: string }[];
    overall: string | null;
  } | null = null;
  if (latest && (latest.status === "passed" || latest.status === "failed")) {
    const [{ data: review }, { data: responses }, { data: reviewedPayload }] =
      await Promise.all([
        supabase
          .from("assessment_reviews")
          .select("overall_feedback, status")
          .eq("attempt_id", latest.id)
          .maybeSingle(),
        supabase
          .from("assessment_responses")
          .select("item_id, reviewer_feedback")
          .eq("attempt_id", latest.id)
          .not("reviewer_feedback", "is", null),
        supabase.rpc("get_assessment_attempt_payload", {
          p_attempt_id: latest.id,
        }),
      ]);
    const items = ((reviewedPayload as unknown as AttemptPayload | null)
      ?.items ?? []) as {
      id: string;
      prompt: string;
    }[];
    const promptById = new Map(items.map((i) => [i.id, i.prompt]));
    feedback = {
      itemFeedback: (responses ?? []).map((r) => ({
        prompt: promptById.get(r.item_id) ?? "Response",
        text: r.reviewer_feedback ?? "",
      })),
      overall: review?.overall_feedback ?? null,
    };
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p
          className="text-caption uppercase text-text-muted"
          style={{ letterSpacing: "var(--tracking-caps)" }}
        >
          <Link href={`/${orgSlug}/learn`} className="hover:text-text-primary">
            My learning
          </Link>{" "}
          / {term("assessment").singular.toLowerCase()}
        </p>
        <h1 className="text-h1 text-text-primary">
          {assessment?.title ?? term("assessment").singular}
        </h1>
      </header>

      <AttemptFlow
        orgSlug={orgSlug}
        assignmentId={assignmentId}
        enrollmentId={enrollmentId}
        attempts={(attempts ?? []).map((a) => ({
          id: a.id,
          status: a.status,
          attemptNumber: a.attempt_number,
          scorePercent:
            a.score_percent === null ? null : Number(a.score_percent),
          passingPercent: a.passing_percent,
        }))}
        openPayload={payload}
        feedback={feedback}
        backHref={`/${orgSlug}/learn/${enrollmentId}/courses/${assignment.course_id}/lessons/${assignment.lesson_id}`}
      />
    </div>
  );
}

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { bareClient, signedIn, type Client as SharedClient } from "./_session";
import type { Database } from "../types/database";

/**
 * Assessment, review, and credential isolation suite (Phase 1D). Runs
 * against the REAL novakore-dev database: real sign-ins, real RLS, real
 * SECURITY DEFINER grading — zero mocks. Uses the seeded BFH fixtures as
 * cross-tenant targets plus a throwaway per-run Alpha flow that exercises
 * authoring → publication → assignment → attempt → grading → review →
 * completion → credential issuance → revocation → public verification.
 */

const url = process.env.NOVAKORE_TEST_SUPABASE_URL;
const anonKey = process.env.NOVAKORE_TEST_SUPABASE_ANON_KEY;
const configured = Boolean(url && anonKey);

const ORG_A = "00000000-0000-4000-8000-000000000101";
const ORG_B = "00000000-0000-4000-8000-000000000104";
const MEMBERSHIP_LEARNER = "00000000-0000-4000-8000-000000000306";
// Seeded BFH fixtures (cross-tenant targets)
const BFH_ASSESSMENT = "00000000-0000-4000-8000-000000000801";
const BFH_VERSION = "00000000-0000-4000-8000-000000000831";
const BFH_ASSIGNMENT = "00000000-0000-4000-8000-000000000841";

// Sessions come from the suite-wide pool (vitest.globalSetup.ts).
type Client = SharedClient;

const runTag = Date.now().toString(36);
const uuid = () => crypto.randomUUID();

describe.skipIf(!configured)(
  "assessment isolation + integrity (real RLS)",
  () => {
    let alphaOwner: Client;
    let alphaAuthor: Client; // assessment.author, NO assessment.publish/grade
    let alphaReviewer: Client; // assessment.publish + assessment.grade
    let alphaLearner: Client;
    let bfhOwner: Client;

    // runtime flow state
    let assessmentId: string;
    let mcItemId: string;
    let essayItemId: string;
    let mcCorrectOptionId: string;
    let versionId: string;
    let courseId: string;
    let lessonId: string;
    let assignmentId: string;
    let enrollmentId: string;
    let attemptId: string;
    let certificateId: string;
    let credentialId: string;
    let verificationCode: string;

    beforeAll(async () => {
      [alphaOwner, alphaAuthor, alphaReviewer, alphaLearner, bfhOwner] =
        await Promise.all([
          signedIn("alpha.owner@novakore.test"),
          signedIn("alpha.author@novakore.test"),
          signedIn("alpha.reviewer@novakore.test"),
          signedIn("alpha.learner@novakore.test"),
          signedIn("beta.owner@novakore.test"),
        ]);
    });

    afterAll(async () => {
      // No sign-out: sessions are shared suite-wide (see _session.ts).
    });

    // -----------------------------------------------------------------------
    // Cross-tenant isolation against seeded BFH fixtures
    // -----------------------------------------------------------------------
    test("org A cannot read org B assessments, items, versions, or assignments", async () => {
      for (const table of [
        "assessments",
        "assessment_items",
        "assessment_versions",
        "assessment_assignments",
        "certificate_templates",
        "certificates",
      ] as const) {
        const { data } = await alphaOwner
          .from(table)
          .select("id")
          .eq("organization_id", ORG_B);
        expect(data, `${table} must be isolated`).toEqual([]);
      }
    });

    test("client-supplied organization ids cannot bypass scope", async () => {
      const { error } = await alphaOwner.from("assessment_items").insert({
        organization_id: ORG_B,
        assessment_id: BFH_ASSESSMENT,
        item_type: "true_false",
        schema_version: 1,
        data: { prompt: "Injected?", correctValue: true, points: 1 },
        position: "zz",
      });
      expect(error).not.toBeNull();
    });

    test("multi-org permissions stay isolated: an Alpha author is only a learner in BFH", async () => {
      const { error: itemInsert } = await alphaAuthor
        .from("assessment_items")
        .insert({
          organization_id: ORG_B,
          assessment_id: BFH_ASSESSMENT,
          item_type: "true_false",
          schema_version: 1,
          data: {
            prompt: "Cross-org authoring?",
            correctValue: true,
            points: 1,
          },
          position: "zy",
        });
      expect(itemInsert).not.toBeNull();

      const { error: publishError } = await alphaAuthor.rpc(
        "publish_assessment",
        { p_assessment_id: BFH_ASSESSMENT },
      );
      expect(publishError?.message).toMatch(/assessment\.publish/);
    });

    // -----------------------------------------------------------------------
    // Runtime Alpha flow: authoring → publish (separation of duties)
    // -----------------------------------------------------------------------
    test("author drafts an assessment with items but cannot publish", async () => {
      mcCorrectOptionId = uuid();
      const wrongOption = uuid();
      const { data: assessment, error } = await alphaAuthor
        .from("assessments")
        .insert({
          organization_id: ORG_A,
          title: `Flow Assessment ${runTag}`,
          assessment_type: "quiz",
          settings: {
            schemaVersion: 1,
            passingPercent: 50,
            cooldownMinutes: 0,
            scorePolicy: "highest",
          },
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      assessmentId = assessment!.id;

      const { data: mc } = await alphaAuthor
        .from("assessment_items")
        .insert({
          organization_id: ORG_A,
          assessment_id: assessmentId,
          item_type: "multiple_choice",
          schema_version: 1,
          data: {
            prompt: "Which layer grades objective responses?",
            options: [
              { id: mcCorrectOptionId, text: "The server, deterministically" },
              { id: wrongOption, text: "The learner's browser" },
            ],
            correctOptionId: mcCorrectOptionId,
            points: 10,
          },
          position: "a0",
        })
        .select("id")
        .single();
      mcItemId = mc!.id;

      const { data: essay } = await alphaAuthor
        .from("assessment_items")
        .insert({
          organization_id: ORG_A,
          assessment_id: assessmentId,
          item_type: "long_answer",
          schema_version: 1,
          data: {
            prompt: "Explain why attempts pin exact versions.",
            maxLength: 2000,
            points: 10,
            rubric: "Full marks for evidence + stability arguments.",
          },
          position: "a1",
        })
        .select("id")
        .single();
      essayItemId = essay!.id;

      const { error: publishDenied } = await alphaAuthor.rpc(
        "publish_assessment",
        { p_assessment_id: assessmentId },
      );
      expect(publishDenied?.message).toMatch(/assessment\.publish/);
    });

    test("publisher freezes an immutable version that pins the items", async () => {
      const { data, error } = await alphaReviewer.rpc("publish_assessment", {
        p_assessment_id: assessmentId,
      });
      expect(error).toBeNull();
      versionId = data as string;

      const { data: version } = await alphaReviewer
        .from("assessment_versions")
        .select("version_number, items")
        .eq("id", versionId)
        .single();
      expect(version!.version_number).toBe(1);
      expect(JSON.stringify(version!.items)).toContain(mcItemId);

      // immutable even for owners; reviewers cannot modify either
      const { error: ownerUpdate } = await alphaOwner
        .from("assessment_versions")
        .update({ title: "Rewritten" })
        .eq("id", versionId);
      expect(ownerUpdate).not.toBeNull();
      const { error: reviewerUpdate } = await alphaReviewer
        .from("assessment_versions")
        .update({ title: "Rewritten" })
        .eq("id", versionId);
      expect(reviewerUpdate).not.toBeNull();
    });

    test("assignment pins the published version to a lesson", async () => {
      const { data: course } = await alphaOwner
        .from("courses")
        .insert({
          organization_id: ORG_A,
          slug: `qa-assess-${runTag}`,
          title: "Assessment Flow Course",
        })
        .select("id")
        .single();
      courseId = course!.id;
      const { data: module } = await alphaOwner
        .from("modules")
        .insert({
          organization_id: ORG_A,
          course_id: courseId,
          title: "Only Module",
          position: "a0",
        })
        .select("id")
        .single();
      const { data: lesson } = await alphaOwner
        .from("lessons")
        .insert({
          organization_id: ORG_A,
          course_id: courseId,
          module_id: module!.id,
          title: "Gated Lesson",
          position: "a0",
        })
        .select("id")
        .single();
      lessonId = lesson!.id;
      await alphaOwner.from("content_blocks").insert({
        organization_id: ORG_A,
        lesson_id: lessonId,
        block_type: "rich_text",
        schema_version: 1,
        data: { text: "Pass the assessment to complete this lesson." },
        position: "a0",
      });
      await alphaOwner.rpc("publish_lesson", { p_lesson_id: lessonId });
      await alphaOwner.rpc("publish_course", { p_course_id: courseId });

      const { data: assignment, error } = await alphaOwner.rpc(
        "assign_assessment",
        {
          p_lesson_id: lessonId,
          p_assessment_id: assessmentId,
          p_required: true,
          p_completion_effect: "complete_lesson",
        },
      );
      expect(error).toBeNull();
      assignmentId = assignment as string;

      const { data: row } = await alphaOwner
        .from("assessment_assignments")
        .select("assessment_version_id, required, status")
        .eq("id", assignmentId)
        .single();
      expect(row!.assessment_version_id).toBe(versionId);
      expect(row!.required).toBe(true);

      // credential on passing this assignment (template + certificate)
      const { data: template } = await alphaOwner
        .from("certificate_templates")
        .insert({
          organization_id: ORG_A,
          name: `Flow Template ${runTag}`,
          template: {
            schemaVersion: 1,
            title: "Certificate of Mastery",
            signatories: [],
            showVerification: true,
          },
          status: "active",
        })
        .select("id")
        .single();
      const { data: certificate } = await alphaOwner
        .from("certificates")
        .insert({
          organization_id: ORG_A,
          template_id: template!.id,
          title: `Flow Credential ${runTag}`,
          source_type: "assessment_assignment",
          assignment_id: assignmentId,
        })
        .select("id")
        .single();
      certificateId = certificate!.id;
    });

    // -----------------------------------------------------------------------
    // Attempt: ownership, answer privacy, submission immutability
    // -----------------------------------------------------------------------
    test("enrolled learner starts an attempt; the payload never leaks answers", async () => {
      const { data: enrollment } = await alphaOwner.rpc("create_enrollment", {
        p_membership_id: MEMBERSHIP_LEARNER,
        p_target_type: "course",
        p_target_id: courseId,
        p_source: "assigned",
      });
      enrollmentId = enrollment as string;

      const { data: attempt, error } = await alphaLearner.rpc(
        "start_assessment_attempt",
        { p_assignment_id: assignmentId, p_enrollment_id: enrollmentId },
      );
      expect(error).toBeNull();
      attemptId = attempt as string;

      // regression (browser QA): learners read the METADATA row of an
      // assigned published assessment (title for the entry point) …
      const { data: metadata } = await alphaLearner
        .from("assessments")
        .select("title")
        .eq("id", assessmentId);
      expect(metadata?.[0]?.title).toMatch(/Flow Assessment/);

      const { data: payload } = await alphaLearner.rpc(
        "get_assessment_attempt_payload",
        { p_attempt_id: attemptId },
      );
      const json = JSON.stringify(payload);
      expect(json).toContain("Which layer grades objective responses?");
      expect(json).not.toMatch(/correctOptionId|correctValue|rubric|feedback/);

      // the raw version row (which holds answers) is not learner-readable
      const { data: rawVersion } = await alphaLearner
        .from("assessment_versions")
        .select("id")
        .eq("id", versionId);
      expect(rawVersion).toEqual([]);
    });

    test("a learner cannot start an attempt on someone else's enrollment", async () => {
      const { error } = await alphaReviewer.rpc("start_assessment_attempt", {
        p_assignment_id: assignmentId,
        p_enrollment_id: enrollmentId,
      });
      expect(error?.message).toMatch(/own enrollment/i);
    });

    test("assessment-gated lessons cannot be self-completed", async () => {
      const { error } = await alphaLearner.rpc("record_lesson_progress", {
        p_enrollment_id: enrollmentId,
        p_lesson_id: lessonId,
        p_action: "complete",
      });
      expect(error?.message).toMatch(/requires passing its assessment/i);
    });

    test("responses save, submit grades objectively, and the attempt awaits review", async () => {
      const { error: saveMc } = await alphaLearner.rpc(
        "save_assessment_response",
        {
          p_attempt_id: attemptId,
          p_item_id: mcItemId,
          p_response: { optionId: mcCorrectOptionId },
        },
      );
      expect(saveMc).toBeNull();
      const { error: saveEssay } = await alphaLearner.rpc(
        "save_assessment_response",
        {
          p_attempt_id: attemptId,
          p_item_id: essayItemId,
          p_response: {
            text: "Pinning keeps evidence stable across republishes.",
          },
        },
      );
      expect(saveEssay).toBeNull();

      const { error: submitError } = await alphaLearner.rpc(
        "submit_assessment_attempt",
        { p_attempt_id: attemptId },
      );
      expect(submitError).toBeNull();

      const { data: attempt } = await alphaLearner
        .from("assessment_attempts")
        .select("status, points_earned, points_possible, assessment_version_id")
        .eq("id", attemptId)
        .single();
      expect(attempt!.status).toBe("pending_review");
      expect(Number(attempt!.points_earned)).toBe(10); // MC graded server-side
      expect(Number(attempt!.points_possible)).toBe(20);
      expect(attempt!.assessment_version_id).toBe(versionId); // exact pin
    });

    test("submitted responses are locked against the learner", async () => {
      const { error: rpcEdit } = await alphaLearner.rpc(
        "save_assessment_response",
        {
          p_attempt_id: attemptId,
          p_item_id: essayItemId,
          p_response: { text: "revised after submission" },
        },
      );
      expect(rpcEdit?.message).toMatch(/locked/i);

      const { error: directEdit } = await alphaLearner
        .from("assessment_responses")
        .update({ response: { text: "tampered" } })
        .eq("attempt_id", attemptId);
      expect(directEdit).not.toBeNull(); // write grants revoked
    });

    test("learners cannot grade or finalize their own attempts", async () => {
      const { error } = await alphaLearner.rpc("complete_assessment_review", {
        p_attempt_id: attemptId,
        p_item_scores: { [essayItemId]: 10 },
        p_item_feedback: {},
        p_overall_feedback: "self-approved",
      });
      expect(error?.message).toMatch(/assessment\.grade/);
    });

    test("attempt privacy: staff without grade/progress permissions see nothing", async () => {
      // alpha.author holds neither assessment.grade nor progress.view.others
      const { data: attempts } = await alphaAuthor
        .from("assessment_attempts")
        .select("id")
        .eq("id", attemptId);
      expect(attempts).toEqual([]);
      const { data: responses } = await alphaAuthor
        .from("assessment_responses")
        .select("id")
        .eq("attempt_id", attemptId);
      expect(responses).toEqual([]);
      const { data: reviews } = await alphaAuthor
        .from("assessment_reviews")
        .select("id")
        .eq("attempt_id", attemptId);
      expect(reviews).toEqual([]);
    });

    test("org B cannot read org A attempts, responses, or reviews", async () => {
      const { data: attempts } = await bfhOwner
        .from("assessment_attempts")
        .select("id")
        .eq("id", attemptId);
      expect(attempts).toEqual([]);
      const { data: responses } = await bfhOwner
        .from("assessment_responses")
        .select("id")
        .eq("attempt_id", attemptId);
      expect(responses).toEqual([]);
      const { data: reviews } = await bfhOwner
        .from("assessment_reviews")
        .select("id")
        .eq("attempt_id", attemptId);
      expect(reviews).toEqual([]);
    });

    // -----------------------------------------------------------------------
    // Review → completion cascade → credential
    // -----------------------------------------------------------------------
    test("an authorized reviewer completes the review; the attempt passes and the lesson completes", async () => {
      const { error: claimError } = await alphaReviewer.rpc(
        "claim_assessment_review",
        { p_attempt_id: attemptId },
      );
      expect(claimError).toBeNull();

      const { error } = await alphaReviewer.rpc("complete_assessment_review", {
        p_attempt_id: attemptId,
        p_item_scores: { [essayItemId]: 10 },
        p_item_feedback: { [essayItemId]: "Clear evidence argument." },
        p_overall_feedback: "Strong work.",
      });
      expect(error).toBeNull();

      const { data: attempt } = await alphaLearner
        .from("assessment_attempts")
        .select("status, score_percent, finalized_at")
        .eq("id", attemptId)
        .single();
      expect(attempt!.status).toBe("passed");
      expect(Number(attempt!.score_percent)).toBe(100);
      expect(attempt!.finalized_at).toBeTruthy();

      // completion cascade: gated lesson completed, course-target enrollment completed
      const { data: lessonProgress } = await alphaLearner
        .from("progress_records")
        .select("status")
        .eq("enrollment_id", enrollmentId)
        .eq("lesson_id", lessonId)
        .single();
      expect(lessonProgress!.status).toBe("completed");
      const { data: enrollment } = await alphaLearner
        .from("enrollments")
        .select("status")
        .eq("id", enrollmentId)
        .single();
      expect(enrollment!.status).toBe("completed");
    });

    test("re-review of a completed review is rejected; resubmission is a no-op", async () => {
      const { error: reReview } = await alphaReviewer.rpc(
        "complete_assessment_review",
        {
          p_attempt_id: attemptId,
          p_item_scores: { [essayItemId]: 0 },
          p_item_feedback: {},
          p_overall_feedback: "second thoughts",
        },
      );
      expect(reReview?.message).toMatch(/already completed/i);

      const { error: resubmit } = await alphaLearner.rpc(
        "submit_assessment_attempt",
        { p_attempt_id: attemptId },
      );
      expect(resubmit).toBeNull(); // idempotent no-op
      const { data: attempt } = await alphaLearner
        .from("assessment_attempts")
        .select("status")
        .eq("id", attemptId)
        .single();
      expect(attempt!.status).toBe("passed");
    });

    test("events and outbox emit exactly once across grading and replays", async () => {
      const { data: finalized } = await alphaOwner
        .from("analytics_events")
        .select("id, type")
        .eq("subject_id", attemptId)
        .in("type", ["assessment.attempt.passed", "assessment.attempt.failed"]);
      expect(finalized!.length).toBe(1);
      expect(finalized![0]!.type).toBe("assessment.attempt.passed");

      const { data: submitted } = await alphaOwner
        .from("analytics_events")
        .select("id")
        .eq("subject_id", attemptId)
        .eq("type", "assessment.attempt.submitted");
      expect(submitted!.length).toBe(1);

      const { data: completionEvents } = await alphaOwner
        .from("analytics_events")
        .select("id")
        .eq("type", "learning.completion.triggered_by_assessment")
        .eq("subject_id", lessonId);
      expect(completionEvents!.length).toBe(1);
    });

    // -----------------------------------------------------------------------
    // Credentials: issuance, isolation, revocation, public verification
    // -----------------------------------------------------------------------
    test("passing issued the credential automatically and idempotently", async () => {
      const { data: credentials } = await alphaLearner
        .from("issued_credentials")
        .select("id, status, verification_code, attempt_id, title")
        .eq("certificate_id", certificateId);
      expect(credentials!.length).toBe(1);
      credentialId = credentials![0]!.id;
      verificationCode = credentials![0]!.verification_code;
      expect(credentials![0]!.status).toBe("active");
      expect(credentials![0]!.attempt_id).toBe(attemptId); // evidence pin
      expect(verificationCode).toMatch(
        /^NVK-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/,
      );

      const { data: issuedEvents } = await alphaOwner
        .from("analytics_events")
        .select("id")
        .eq("type", "credential.certificate.issued")
        .eq("subject_id", credentialId);
      expect(issuedEvents!.length).toBe(1);
    });

    test("credential isolation: other orgs and unprivileged staff see nothing", async () => {
      const { data: crossOrg } = await bfhOwner
        .from("issued_credentials")
        .select("id")
        .eq("id", credentialId);
      expect(crossOrg).toEqual([]);
      // alpha.author: no certificates.manage, not the recipient
      const { data: staff } = await alphaAuthor
        .from("issued_credentials")
        .select("id")
        .eq("id", credentialId);
      expect(staff).toEqual([]);
    });

    test("credentials are immutable evidence; ordinary users cannot revoke", async () => {
      const { error: learnerRevoke } = await alphaLearner.rpc(
        "revoke_credential",
        { p_credential_id: credentialId, p_reason: "self-service revocation" },
      );
      expect(learnerRevoke?.message).toMatch(/credential\.revoke/);

      const { error: directEdit } = await alphaOwner
        .from("issued_credentials")
        .update({ recipient_name: "Someone Else" })
        .eq("id", credentialId);
      expect(directEdit).not.toBeNull();
    });

    test("anonymous verification returns privacy-safe fields only; raw tables stay closed", async () => {
      const anonClient = bareClient();
      const { data: verified, error } = await anonClient.rpc(
        "verify_credential",
        { p_code: verificationCode },
      );
      expect(error).toBeNull();
      const json = JSON.stringify(verified);
      expect(json).toContain("Flow Credential");
      expect(json).toContain('"status":"active"');
      expect(json).not.toMatch(/@novakore\.test|membership|user_id|score/i);

      const { data: anonRows, error: anonError } = await anonClient
        .from("issued_credentials")
        .select("id")
        .limit(1);
      expect(anonRows ?? []).toEqual([]);
      expect(anonError).not.toBeNull();

      const { data: anonAssessments, error: anonAssessError } = await anonClient
        .from("assessment_versions")
        .select("id")
        .limit(1);
      expect(anonAssessments ?? []).toEqual([]);
      expect(anonAssessError).not.toBeNull();
    });

    test("authorized revocation is audited, idempotent, and publicly visible", async () => {
      const { error } = await alphaOwner.rpc("revoke_credential", {
        p_credential_id: credentialId,
        p_reason: "Issued during automated verification run",
      });
      expect(error).toBeNull();
      const { error: replay } = await alphaOwner.rpc("revoke_credential", {
        p_credential_id: credentialId,
        p_reason: "Issued during automated verification run",
      });
      expect(replay).toBeNull(); // idempotent

      const { data: revokedEvents } = await alphaOwner
        .from("analytics_events")
        .select("id")
        .eq("type", "credential.certificate.revoked")
        .eq("subject_id", credentialId);
      expect(revokedEvents!.length).toBe(1);

      const anonClient = bareClient();
      const { data: verified } = await anonClient.rpc("verify_credential", {
        p_code: verificationCode,
      });
      expect(JSON.stringify(verified)).toContain('"status":"revoked"');
    });

    // -----------------------------------------------------------------------
    // Suspended / removed / audit
    // -----------------------------------------------------------------------
    test("suspended and removed members lose assessment access entirely", async () => {
      for (const email of [
        "alpha.suspended@novakore.test",
        "alpha.removed@novakore.test",
      ]) {
        const client = await signedIn(email);
        const { data: rows } = await client
          .from("assessments")
          .select("id")
          .limit(5);
        expect(rows, `${email} must see no assessments`).toEqual([]);
        const { error } = await client.rpc("start_assessment_attempt", {
          p_assignment_id: assignmentId,
          p_enrollment_id: enrollmentId,
        });
        expect(error, `${email} must not start attempts`).not.toBeNull();
      }
    });

    test("audit logs remain append-only even for owners", async () => {
      const { error: updateError } = await alphaOwner
        .from("audit_logs")
        .update({ action: "tampered" })
        .eq("organization_id", ORG_A);
      expect(updateError).not.toBeNull();
      const { error: deleteError } = await alphaOwner
        .from("audit_logs")
        .delete()
        .eq("organization_id", ORG_A);
      expect(deleteError).not.toBeNull();
    });
  },
);

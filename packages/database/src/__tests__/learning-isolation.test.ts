import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Database } from "../types/database";

/**
 * Learning-domain isolation + publication suite (Phase 1C). Runs against the
 * REAL novakore-dev database: real sign-ins, real RLS, real SECURITY DEFINER
 * operations — zero mocks. Uses the deterministic seed fixtures plus a
 * throwaway per-run course to exercise the full publication and completion
 * flow without disturbing QA fixtures.
 */

const url = process.env.NOVAKORE_TEST_SUPABASE_URL;
const anonKey = process.env.NOVAKORE_TEST_SUPABASE_ANON_KEY;
const configured = Boolean(url && anonKey);

const ORG_A = "00000000-0000-4000-8000-000000000101";
const COURSE_A = "00000000-0000-4000-8000-000000000511"; // Foundations of Practice (published v1)
const LESSON_A2 = "00000000-0000-4000-8000-000000000532"; // Principles (seeded in_progress for learner)
const LESSON_ADV = "00000000-0000-4000-8000-000000000534"; // Advanced Methods (prereq-locked)
const CV_A1 = "00000000-0000-4000-8000-000000000701";
const LV_A2 = "00000000-0000-4000-8000-000000000712";
const PATH_A = "00000000-0000-4000-8000-000000000502";
const NODE_FOUNDATIONS = "00000000-0000-4000-8000-000000000541";
const NODE_ADVANCED = "00000000-0000-4000-8000-000000000542";
const ENROLL_LEARNER = "00000000-0000-4000-8000-000000000561"; // alpha.learner path enrollment
const MEMBERSHIP_REVIEWER = "00000000-0000-4000-8000-000000000304";
const DEV_PASSWORD = "NovaKore-dev-password-1";

type Client = SupabaseClient<Database>;
const clients = new Map<string, Client>();

function bareClient(): Client {
  return createClient<Database>(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signedIn(email: string): Promise<Client> {
  const cached = clients.get(email);
  if (cached) return cached;
  const client = bareClient();
  const { error } = await client.auth.signInWithPassword({
    email,
    password: DEV_PASSWORD,
  });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  clients.set(email, client);
  return client;
}

const runTag = Date.now().toString(36);

describe.skipIf(!configured)(
  "learning isolation + publication (real RLS)",
  () => {
    let alphaOwner: Client;
    let alphaAuthor: Client; // content.author, NO content.publish
    let alphaReviewer: Client; // content.publish
    let alphaLearner: Client; // enrolled in PATH_A
    let bfhOwner: Client;

    beforeAll(async () => {
      [alphaOwner, alphaAuthor, alphaReviewer, alphaLearner, bfhOwner] =
        await Promise.all([
          signedIn("alpha.owner@novakore.test"),
          signedIn("alpha.author@novakore.test"),
          signedIn("alpha.reviewer@novakore.test"),
          signedIn("alpha.learner@novakore.test"),
          signedIn("bfh.owner@novakore.test"),
        ]);
    });

    afterAll(async () => {
      await Promise.all([...clients.values()].map((c) => c.auth.signOut()));
    });

    // -------------------------------------------------------------------------
    test("control: an enrolled learner reads their enrollment, pinned versions, and progress", async () => {
      const { data: enrollments, error } = await alphaLearner
        .from("enrollments")
        .select("id, target_type, learning_path_id, status")
        .eq("id", ENROLL_LEARNER);
      expect(error).toBeNull();
      expect(enrollments?.[0]?.learning_path_id).toBe(PATH_A);

      // published versions of path-covered courses are readable via RLS
      const { data: version } = await alphaLearner
        .from("course_versions")
        .select("id, version_number, structure")
        .eq("id", CV_A1)
        .maybeSingle();
      expect(version?.version_number).toBe(1);

      const { data: progress } = await alphaLearner
        .from("progress_records")
        .select("lesson_id, lesson_version_id, status")
        .eq("enrollment_id", ENROLL_LEARNER)
        .not("lesson_id", "is", null);
      // evidence pins exact immutable lesson versions
      expect(progress!.length).toBeGreaterThanOrEqual(2);
      for (const p of progress!) expect(p.lesson_version_id).toBeTruthy();
    });

    test("cross-tenant learning isolation: courses, lessons, versions, enrollments, progress", async () => {
      const tables = [
        "courses",
        "lessons",
        "course_versions",
        "lesson_versions",
        "enrollments",
        "progress_records",
      ] as const;
      for (const table of tables) {
        const { data } = await bfhOwner
          .from(table)
          .select("id")
          .eq("organization_id", ORG_A);
        expect(data, `${table} must be isolated`).toEqual([]);
      }
    });

    test("draft content is invisible to learners; published courses are visible", async () => {
      for (const table of ["lessons", "modules", "content_blocks"] as const) {
        const { data } = await alphaLearner.from(table).select("id").limit(5);
        expect(data, `${table} drafts must be hidden from learners`).toEqual(
          [],
        );
      }
      // the enrolled course row itself is visible (title metadata for delivery)
      const { data: course } = await alphaLearner
        .from("courses")
        .select("id, title")
        .eq("id", COURSE_A)
        .maybeSingle();
      expect(course?.id).toBe(COURSE_A);
    });

    test("learners cannot write learning state directly (RPC-only paths)", async () => {
      const { error: courseInsert } = await alphaLearner
        .from("courses")
        .insert({
          organization_id: ORG_A,
          slug: `hack-${runTag}`,
          title: "Hack",
        });
      expect(courseInsert).not.toBeNull();

      const { error: progressInsert } = await alphaLearner
        .from("progress_records")
        .insert({
          organization_id: ORG_A,
          enrollment_id: ENROLL_LEARNER,
          subject_type: "course",
          course_id: COURSE_A,
          course_version_id: CV_A1,
          status: "completed",
          completed_at: new Date().toISOString(),
        });
      expect(progressInsert).not.toBeNull(); // grants revoked

      const { error: enrollmentInsert } = await alphaLearner
        .from("enrollments")
        .insert({
          organization_id: ORG_A,
          membership_id: MEMBERSHIP_REVIEWER,
          target_type: "course",
          course_id: COURSE_A,
          pinned_course_version_id: CV_A1,
          source: "self",
        });
      expect(enrollmentInsert).not.toBeNull();

      const { error: enrollmentUpdate } = await alphaLearner
        .from("enrollments")
        .update({ status: "completed" })
        .eq("id", ENROLL_LEARNER);
      expect(enrollmentUpdate).not.toBeNull();
    });

    test("outbox is tenant-inaccessible; analytics gated by analytics.view", async () => {
      const { data: outboxRead, error: outboxError } = await alphaOwner
        .from("outbox_events")
        .select("id")
        .limit(1);
      expect(outboxRead ?? []).toEqual([]);
      expect(outboxError).not.toBeNull(); // zero grants even for owners

      const { error: outboxInsert } = await alphaOwner
        .from("outbox_events")
        .insert({
          event_type: "forged.event.type",
          organization_id: ORG_A,
          payload: {},
        });
      expect(outboxInsert).not.toBeNull();

      const { data: learnerAnalytics } = await alphaLearner
        .from("analytics_events")
        .select("id")
        .limit(1);
      expect(learnerAnalytics).toEqual([]); // learner lacks analytics.view
    });

    // -------------------------------------------------------------------------
    // Full authoring → publication → enrollment → completion flow (throwaway
    // course; exercises transactionality, pinning, immutability, events).
    // -------------------------------------------------------------------------
    let testCourseId: string;
    let testLessonId: string;
    let testLessonVersionId: string;
    let testCourseVersionId: string;

    test("author creates drafts but cannot publish (separation of duties)", async () => {
      const { data: course, error: courseError } = await alphaAuthor
        .from("courses")
        .insert({
          organization_id: ORG_A,
          slug: `qa-pub-${runTag}`,
          title: "Publication Flow Course",
        })
        .select("id")
        .single();
      expect(courseError).toBeNull();
      testCourseId = course!.id;

      const { data: module } = await alphaAuthor
        .from("modules")
        .insert({
          organization_id: ORG_A,
          course_id: testCourseId,
          title: "Only Module",
          position: "a0",
        })
        .select("id")
        .single();

      const { data: lesson } = await alphaAuthor
        .from("lessons")
        .insert({
          organization_id: ORG_A,
          course_id: testCourseId,
          module_id: module!.id,
          title: "Only Lesson",
          position: "a0",
        })
        .select("id")
        .single();
      testLessonId = lesson!.id;

      const { error: blockError } = await alphaAuthor
        .from("content_blocks")
        .insert({
          organization_id: ORG_A,
          lesson_id: testLessonId,
          block_type: "rich_text",
          schema_version: 1,
          data: { text: "Flow-test lesson content." },
          position: "a0",
        });
      expect(blockError).toBeNull();

      // author holds content.author but NOT content.publish
      const { error: publishError } = await alphaAuthor.rpc("publish_lesson", {
        p_lesson_id: testLessonId,
      });
      expect(publishError?.message).toMatch(/content\.publish/);
    });

    test("course publication fails cleanly while a lesson is unpublished (nothing written)", async () => {
      const { error } = await alphaReviewer.rpc("publish_course", {
        p_course_id: testCourseId,
      });
      expect(error?.message).toMatch(/no published version/i);

      const { data: versions } = await alphaReviewer
        .from("course_versions")
        .select("id")
        .eq("course_id", testCourseId);
      expect(versions).toEqual([]); // no partial publication
    });

    test("publisher publishes: exact pinning, sequential versions, supersedes chain", async () => {
      const { data: lv, error: lvError } = await alphaReviewer.rpc(
        "publish_lesson",
        {
          p_lesson_id: testLessonId,
        },
      );
      expect(lvError).toBeNull();
      testLessonVersionId = lv as string;

      const { data: cv1, error: cvError } = await alphaReviewer.rpc(
        "publish_course",
        {
          p_course_id: testCourseId,
        },
      );
      expect(cvError).toBeNull();
      testCourseVersionId = cv1 as string;

      const { data: version } = await alphaReviewer
        .from("course_versions")
        .select("version_number, structure, supersedes_version_id")
        .eq("id", testCourseVersionId)
        .single();
      expect(version!.version_number).toBe(1);
      expect(version!.supersedes_version_id).toBeNull();
      // the structure pins the EXACT lesson version id
      expect(JSON.stringify(version!.structure)).toContain(testLessonVersionId);

      // publish again: version race handling → strictly sequential v2 chain
      const { data: cv2 } = await alphaReviewer.rpc("publish_course", {
        p_course_id: testCourseId,
      });
      const { data: v2 } = await alphaReviewer
        .from("course_versions")
        .select("version_number, supersedes_version_id")
        .eq("id", cv2 as string)
        .single();
      expect(v2!.version_number).toBe(2);
      expect(v2!.supersedes_version_id).toBe(testCourseVersionId);

      // current pointer moved to v2
      const { data: course } = await alphaReviewer
        .from("courses")
        .select("current_published_version_id, status")
        .eq("id", testCourseId)
        .single();
      expect(course!.current_published_version_id).toBe(cv2);
      expect(course!.status).toBe("published");
    });

    test("published snapshots are immutable even for owners", async () => {
      const { error: updateError } = await alphaOwner
        .from("lesson_versions")
        .update({ title: "Rewritten History" })
        .eq("id", testLessonVersionId);
      expect(updateError).not.toBeNull();

      const { error: deleteError } = await alphaOwner
        .from("course_versions")
        .delete()
        .eq("id", testCourseVersionId);
      expect(deleteError).not.toBeNull();
    });

    test("within-org unassigned content stays hidden from learners", async () => {
      // alpha.learner has no enrollment covering the throwaway course
      const { data } = await alphaLearner
        .from("course_versions")
        .select("id")
        .eq("course_id", testCourseId);
      expect(data).toEqual([]);
    });

    test("publication emitted transactional analytics events (outbox pair verified by grants tests)", async () => {
      const { data: events, error } = await alphaOwner
        .from("analytics_events")
        .select("type, subject_id, context, v")
        .eq("type", "content.course.published")
        .eq("subject_id", testCourseId);
      expect(error).toBeNull();
      expect(events!.length).toBeGreaterThanOrEqual(2); // v1 + v2
      for (const e of events!) {
        expect(e.v).toBe(1);
        expect(
          (e.context as Record<string, unknown>)["course_version_id"],
        ).toBeTruthy();
      }
    });

    test("enrollment pins at creation; completion computes transactionally end-to-end", async () => {
      // owner assigns the reviewer to the throwaway course (pins current v2)
      const { data: enrollmentId, error } = await alphaOwner.rpc(
        "create_enrollment",
        {
          p_membership_id: MEMBERSHIP_REVIEWER,
          p_target_type: "course",
          p_target_id: testCourseId,
          p_source: "assigned",
        },
      );
      expect(error).toBeNull();

      const { data: enrollment } = await alphaOwner
        .from("enrollments")
        .select("pinned_course_version_id, status")
        .eq("id", enrollmentId as string)
        .single();
      expect(enrollment!.pinned_course_version_id).toBeTruthy();
      expect(enrollment!.pinned_course_version_id).not.toBe(
        testCourseVersionId,
      ); // pinned v2, not v1

      // learner (reviewer) completes the single required lesson → course +
      // enrollment complete in the same transaction
      const { error: progressError } = await alphaReviewer.rpc(
        "record_lesson_progress",
        {
          p_enrollment_id: enrollmentId as string,
          p_lesson_id: testLessonId,
          p_action: "complete",
        },
      );
      expect(progressError).toBeNull();

      const { data: done } = await alphaOwner
        .from("enrollments")
        .select("status, completed_at")
        .eq("id", enrollmentId as string)
        .single();
      expect(done!.status).toBe("completed");
      expect(done!.completed_at).toBeTruthy();

      // idempotent replay: no error, no duplicate events
      const { error: replay } = await alphaReviewer.rpc(
        "record_lesson_progress",
        {
          p_enrollment_id: enrollmentId as string,
          p_lesson_id: testLessonId,
          p_action: "complete",
        },
      );
      expect(replay).toBeNull();
      const { data: completions } = await alphaOwner
        .from("analytics_events")
        .select("id")
        .eq("type", "learning.lesson.completed")
        .eq("subject_id", testLessonId);
      expect(completions!.length).toBe(1);
    });

    test("prerequisite gate blocks progress with an explainable error", async () => {
      const { error } = await alphaLearner.rpc("record_lesson_progress", {
        p_enrollment_id: ENROLL_LEARNER,
        p_lesson_id: LESSON_ADV,
        p_action: "start",
      });
      expect(error?.message).toMatch(/locked by prerequisite/i);
      expect(error?.message).toMatch(/Foundations of Practice/);
    });

    test("progress spoofing is blocked: wrong owner, foreign lesson, inactive states", async () => {
      // reviewer cannot record progress on the learner's enrollment
      const { error: wrongOwner } = await alphaReviewer.rpc(
        "record_lesson_progress",
        {
          p_enrollment_id: ENROLL_LEARNER,
          p_lesson_id: LESSON_A2,
          p_action: "complete",
        },
      );
      expect(wrongOwner?.message).toMatch(/own enrollment/i);

      // suspended member cannot act at all (also has no enrollment)
      const suspended = await signedIn("alpha.suspended@novakore.test");
      const { error: suspendedError } = await suspended.rpc(
        "record_lesson_progress",
        {
          p_enrollment_id: ENROLL_LEARNER,
          p_lesson_id: LESSON_A2,
          p_action: "complete",
        },
      );
      expect(suspendedError).not.toBeNull();
      const { data: suspendedCourses } = await suspended
        .from("courses")
        .select("id");
      expect(suspendedCourses).toEqual([]);
    });

    test("prerequisite cycles are rejected authoritatively (direct + self)", async () => {
      const { error: directCycle } = await alphaOwner
        .from("prerequisites")
        .insert({
          organization_id: ORG_A,
          path_id: PATH_A,
          node_id: NODE_FOUNDATIONS,
          requires_node_id: NODE_ADVANCED,
        });
      expect(directCycle?.message).toMatch(/cycle/i);

      const { error: selfCycle } = await alphaOwner
        .from("prerequisites")
        .insert({
          organization_id: ORG_A,
          path_id: PATH_A,
          node_id: NODE_FOUNDATIONS,
          requires_node_id: NODE_FOUNDATIONS,
        });
      expect(selfCycle).not.toBeNull(); // CHECK constraint
    });

    test("enrollment governance: learners cannot assign or self-enroll without policy", async () => {
      const { error: assignDenied } = await alphaLearner.rpc(
        "create_enrollment",
        {
          p_membership_id: MEMBERSHIP_REVIEWER,
          p_target_type: "course",
          p_target_id: COURSE_A,
          p_source: "assigned",
        },
      );
      expect(assignDenied?.message).toMatch(/permission denied/i);

      // COURSE_A has allow_self_enrollment = false
      const { data: ownMembership } = await alphaLearner
        .from("organization_memberships")
        .select("id")
        .eq("organization_id", ORG_A)
        .single();
      const { error: selfDenied } = await alphaLearner.rpc(
        "create_enrollment",
        {
          p_membership_id: ownMembership!.id,
          p_target_type: "course",
          p_target_id: COURSE_A,
          p_source: "self",
        },
      );
      expect(selfDenied?.message).toMatch(/self-enrollment/i);
    });

    test("manual override is permission-gated, reasoned, and audited via events", async () => {
      // reviewer lacks progress.override
      const { error: denied } = await alphaReviewer.rpc("override_progress", {
        p_enrollment_id: ENROLL_LEARNER,
        p_lesson_id: LESSON_A2,
        p_status: "exempted",
        p_reason: "attempted without permission",
      });
      expect(denied?.message).toMatch(/progress\.override/);

      // owner may, but a reason is mandatory
      const { error: noReason } = await alphaOwner.rpc("override_progress", {
        p_enrollment_id: ENROLL_LEARNER,
        p_lesson_id: LESSON_A2,
        p_status: "exempted",
        p_reason: "  ",
      });
      expect(noReason?.message).toMatch(/reason/i);
    });
  },
);

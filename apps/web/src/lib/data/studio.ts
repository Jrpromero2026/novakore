import "server-only";
import {
  pathLayoutSchema,
  validatePathGraph,
  type BlockType,
  type PathGraphReport,
  type PathLayout,
} from "@novakore/domain";
import { supabaseServer } from "../supabase/server";

/** Studio data access — all reads under the caller's RLS session. */

// ---------------------------------------------------------------------------
// Studio home
// ---------------------------------------------------------------------------

export interface StudioHome {
  recentLessons: {
    id: string;
    courseId: string;
    title: string;
    status: string;
    updatedAt: string;
  }[];
  draftCourses: { id: string; title: string; status: string }[];
  openReviews: {
    id: string;
    subjectType: string;
    subjectId: string;
    status: string;
    note: string | null;
  }[];
  recentGenerations: {
    id: string;
    operation: string;
    status: string;
    createdAt: string;
  }[];
  counts: {
    paths: number;
    courses: number;
    assessments: number;
    libraryBlocks: number;
  };
}

export async function getStudioHome(
  organizationId: string,
): Promise<StudioHome> {
  const supabase = await supabaseServer();
  const [lessons, courses, reviews, generations, paths, assessments, library] =
    await Promise.all([
      supabase
        .from("lessons")
        .select("id, course_id, title, status, updated_at")
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(8),
      supabase
        .from("courses")
        .select("id, title, status")
        .eq("organization_id", organizationId)
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(8),
      supabase
        .from("review_requests")
        .select("id, subject_type, subject_id, status, note")
        .eq("organization_id", organizationId)
        .in("status", ["open", "changes_requested"])
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("ai_generations")
        .select("id, operation, status, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("learning_paths")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .neq("status", "archived"),
      supabase
        .from("assessments")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .neq("status", "archived"),
      supabase
        .from("reusable_blocks")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "active"),
    ]);
  return {
    recentLessons: (lessons.data ?? []).map((l) => ({
      id: l.id,
      courseId: l.course_id,
      title: l.title,
      status: l.status,
      updatedAt: l.updated_at,
    })),
    draftCourses: courses.data ?? [],
    openReviews: (reviews.data ?? []).map((r) => ({
      id: r.id,
      subjectType: r.subject_type,
      subjectId: r.subject_id,
      status: r.status,
      note: r.note,
    })),
    recentGenerations: (generations.data ?? []).map((g) => ({
      id: g.id,
      operation: g.operation,
      status: g.status,
      createdAt: g.created_at,
    })),
    counts: {
      paths: paths.count ?? 0,
      courses: courses.data?.length ?? 0,
      assessments: assessments.count ?? 0,
      libraryBlocks: library.count ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Path builder
// ---------------------------------------------------------------------------

export interface PathBuilderData {
  pathId: string;
  title: string;
  status: string;
  nodes: {
    nodeId: string;
    courseId: string;
    title: string;
    position: string;
    published: boolean;
  }[];
  prerequisites: { id: string; nodeId: string; requiresNodeId: string }[];
  layout: PathLayout | null;
  report: PathGraphReport;
  availableCourses: { id: string; title: string }[];
}

export async function getPathBuilder(
  organizationId: string,
  pathId: string,
): Promise<PathBuilderData | null> {
  const supabase = await supabaseServer();
  const [
    { data: path },
    { data: nodes },
    { data: prereqs },
    { data: layoutRow },
    { data: courses },
  ] = await Promise.all([
    supabase
      .from("learning_paths")
      .select("id, title, status")
      .eq("id", pathId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("path_nodes")
      .select(
        "id, course_id, position, courses!path_nodes_course_id_organization_id_fkey(title, current_published_version_id)",
      )
      .eq("path_id", pathId)
      .order("position"),
    supabase
      .from("prerequisites")
      .select("id, node_id, requires_node_id")
      .eq("path_id", pathId),
    supabase
      .from("path_layouts")
      .select("layout")
      .eq("path_id", pathId)
      .maybeSingle(),
    supabase
      .from("courses")
      .select("id, title, current_published_version_id")
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .not("current_published_version_id", "is", null)
      .order("title"),
  ]);
  if (!path) return null;

  const nodeViews = (nodes ?? []).map((n) => {
    const course = n.courses as unknown as {
      title: string;
      current_published_version_id: string | null;
    } | null;
    return {
      nodeId: n.id,
      courseId: n.course_id,
      title: course?.title ?? "Course",
      position: n.position,
      published: course?.current_published_version_id !== null,
    };
  });
  const edges = (prereqs ?? []).map((p) => ({
    id: p.id,
    nodeId: p.node_id,
    requiresNodeId: p.requires_node_id,
  }));
  const parsedLayout = layoutRow
    ? pathLayoutSchema.safeParse(layoutRow.layout)
    : null;

  return {
    pathId,
    title: path.title,
    status: path.status,
    nodes: nodeViews,
    prerequisites: edges,
    layout: parsedLayout?.success ? parsedLayout.data : null,
    report: validatePathGraph({
      nodes: nodeViews.map((n) => ({ nodeId: n.nodeId, position: n.position })),
      prerequisites: edges,
    }),
    availableCourses: (courses ?? [])
      .filter((c) => !nodeViews.some((n) => n.courseId === c.id))
      .map((c) => ({ id: c.id, title: c.title })),
  };
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

export interface LibraryData {
  blocks: {
    id: string;
    title: string;
    description: string | null;
    blockType: BlockType;
    schemaVersion: number;
    data: Record<string, unknown>;
    tags: string[];
    version: number;
    status: string;
    usageCount: number;
  }[];
  lessons: { id: string; title: string; courseTitle: string }[];
  /** Total reusable blocks in the organization, for honest pagination. */
  blocksTotal: number;
}

export async function getLibrary(
  organizationId: string,
  /** 0-based inclusive slice of the block library. */
  blockRange?: { from: number; to: number },
): Promise<LibraryData> {
  const supabase = await supabaseServer();
  const [
    { data: blocks, count: blocksCount },
    { data: refs },
    { data: lessons },
  ] = await Promise.all([
    supabase
      .from("reusable_blocks")
      .select(
        "id, title, description, block_type, schema_version, data, tags, version, status",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .range(blockRange?.from ?? 0, blockRange?.to ?? 199),
    supabase
      .from("content_blocks")
      .select("source_reusable_block_id")
      .eq("organization_id", organizationId)
      .not("source_reusable_block_id", "is", null),
    supabase
      .from("lessons")
      .select(
        "id, title, courses!lessons_course_id_organization_id_fkey(title)",
      )
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("title")
      .limit(200),
  ]);
  const usage = new Map<string, number>();
  for (const ref of refs ?? []) {
    const key = ref.source_reusable_block_id!;
    usage.set(key, (usage.get(key) ?? 0) + 1);
  }
  return {
    blocks: (blocks ?? []).map((b) => ({
      id: b.id,
      title: b.title,
      description: b.description,
      blockType: b.block_type as BlockType,
      schemaVersion: b.schema_version,
      data: (b.data ?? {}) as Record<string, unknown>,
      tags: b.tags ?? [],
      version: b.version,
      status: b.status,
      usageCount: usage.get(b.id) ?? 0,
    })),
    lessons: (lessons ?? []).map((l) => ({
      id: l.id,
      title: l.title,
      courseTitle:
        (l.courses as unknown as { title: string } | null)?.title ?? "",
    })),
    blocksTotal: blocksCount ?? 0,
  };
}

// ---------------------------------------------------------------------------
// AI workspace
// ---------------------------------------------------------------------------

export interface AiWorkspaceData {
  limitCents: number;
  usedCents: number;
  reservedCents: number;
  monthKey: string;
  generations: {
    id: string;
    operation: string;
    status: string;
    objective: string;
    provider: string;
    modelProfile: string;
    actualCents: number | null;
    reservedCents: number;
    error: string | null;
    output: unknown;
    sourceCount: number;
    createdAt: string;
  }[];
  sources: {
    id: string;
    title: string;
    kind: string;
    reviewState: string;
    hasContent: boolean;
  }[];
  lessons: { id: string; title: string; courseTitle: string }[];
  modules: {
    id: string;
    courseId: string;
    title: string;
    courseTitle: string;
  }[];
}

// ---------------------------------------------------------------------------
// Source workspace
// ---------------------------------------------------------------------------

export interface SourceWorkspaceItem {
  id: string;
  title: string;
  kind: string;
  mimeType: string | null;
  byteSize: number | null;
  originalFilename: string | null;
  reviewState: string;
  extractionStatus: string;
  extractionNote: string | null;
  extractedChars: number | null;
  hasContent: boolean;
  contentPreview: string | null;
  provenance: string | null;
  createdAt: string;
  /** Signed download URL (1 hour) for file sources; null for inline text. */
  downloadUrl: string | null;
}

/** Everything in the org's source workspace, newest first. */
export async function getSourceWorkspace(
  organizationId: string,
): Promise<SourceWorkspaceItem[]> {
  const supabase = await supabaseServer();
  const { data: rows } = await supabase
    .from("source_documents")
    .select(
      "id, title, kind, mime_type, byte_size, original_filename, review_state, extraction_status, extraction_note, extracted_chars, content, provenance, storage_path, created_at",
    )
    .eq("organization_id", organizationId)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(200);

  return Promise.all(
    (rows ?? []).map(async (row) => {
      let downloadUrl: string | null = null;
      if (row.storage_path) {
        const { data: signed } = await supabase.storage
          .from("source-documents")
          .createSignedUrl(row.storage_path, 3600);
        downloadUrl = signed?.signedUrl ?? null;
      }
      return {
        id: row.id,
        title: row.title,
        kind: row.kind,
        mimeType: row.mime_type,
        byteSize: row.byte_size,
        originalFilename: row.original_filename,
        reviewState: row.review_state,
        extractionStatus: row.extraction_status,
        extractionNote: row.extraction_note,
        extractedChars: row.extracted_chars,
        hasContent: row.content !== null,
        contentPreview: row.content?.slice(0, 600) ?? null,
        provenance: row.provenance,
        createdAt: row.created_at,
        downloadUrl,
      };
    }),
  );
}

export async function getAiWorkspace(
  organizationId: string,
): Promise<AiWorkspaceData> {
  const supabase = await supabaseServer();
  const month = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
  const [
    { data: budget },
    { data: monthRows },
    { data: generations },
    { data: sources },
    { data: lessons },
    { data: modules },
  ] = await Promise.all([
    supabase
      .from("ai_budgets")
      .select("monthly_limit_cents")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("ai_generations")
      .select("status, reserved_cents, actual_cents")
      .eq("organization_id", organizationId)
      .eq("month_key", month),
    supabase
      .from("ai_generations")
      .select(
        "id, operation, status, objective, provider, model_profile, actual_cents, reserved_cents, error, output, source_document_ids, created_at",
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("source_documents")
      .select("id, title, kind, review_state, content")
      .eq("organization_id", organizationId)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("lessons")
      .select(
        "id, title, courses!lessons_course_id_organization_id_fkey(title)",
      )
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("title")
      .limit(200),
    supabase
      .from("modules")
      .select(
        "id, course_id, title, courses!modules_course_id_organization_id_fkey(title)",
      )
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("title")
      .limit(200),
  ]);

  let used = 0;
  let reserved = 0;
  for (const row of monthRows ?? []) {
    if (row.status === "reserved") reserved += row.reserved_cents;
    else if (row.status !== "failed")
      used += row.actual_cents ?? row.reserved_cents;
  }

  return {
    limitCents: Math.min(budget?.monthly_limit_cents ?? 5000, 5000),
    usedCents: used,
    reservedCents: reserved,
    monthKey: month,
    generations: (generations ?? []).map((g) => ({
      id: g.id,
      operation: g.operation,
      status: g.status,
      objective: g.objective,
      provider: g.provider,
      modelProfile: g.model_profile,
      actualCents: g.actual_cents,
      reservedCents: g.reserved_cents,
      error: g.error,
      output: g.output,
      sourceCount: (g.source_document_ids ?? []).length,
      createdAt: g.created_at,
    })),
    sources: (sources ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      kind: s.kind,
      reviewState: s.review_state,
      hasContent: s.content !== null,
    })),
    lessons: (lessons ?? []).map((l) => ({
      id: l.id,
      title: l.title,
      courseTitle:
        (l.courses as unknown as { title: string } | null)?.title ?? "",
    })),
    modules: (modules ?? []).map((m) => ({
      id: m.id,
      courseId: m.course_id,
      title: m.title,
      courseTitle:
        (m.courses as unknown as { title: string } | null)?.title ?? "",
    })),
  };
}

// ---------------------------------------------------------------------------
// Lesson workspace (Knowledge IDE)
// ---------------------------------------------------------------------------

export interface LessonWorkspaceData {
  /** The knowledge tree: journeys, courses, and the open course's structure. */
  tree: {
    journeys: { id: string; title: string; status: string }[];
    courses: { id: string; title: string; status: string }[];
    /** Modules + lessons of the course the open lesson belongs to. */
    currentCourse: {
      id: string;
      title: string;
      modules: {
        id: string;
        title: string;
        lessons: { id: string; title: string; status: string }[];
      }[];
    } | null;
  };
  /** Real published-version history for the open lesson, newest first. */
  versions: {
    id: string;
    versionNumber: number;
    title: string;
    publishedAt: string;
    blockCount: number;
  }[];
  /** Real review requests (+ comments) targeting the open lesson. */
  reviews: {
    id: string;
    status: string;
    note: string | null;
    createdAt: string;
    comments: { id: string; body: string; status: string; createdAt: string }[];
  }[];
}

export async function getLessonWorkspace(
  organizationId: string,
  courseId: string,
  lessonId: string,
): Promise<LessonWorkspaceData> {
  const supabase = await supabaseServer();
  const [
    { data: journeys },
    { data: courses },
    { data: course },
    { data: modules },
    { data: lessons },
    { data: versions },
    { data: reviews },
  ] = await Promise.all([
    supabase
      .from("learning_paths")
      .select("id, title, status")
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .order("title")
      .limit(50),
    supabase
      .from("courses")
      .select("id, title, status")
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .order("title")
      .limit(100),
    supabase
      .from("courses")
      .select("id, title")
      .eq("id", courseId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("modules")
      .select("id, title, position")
      .eq("course_id", courseId)
      .is("archived_at", null)
      .order("position"),
    supabase
      .from("lessons")
      .select("id, module_id, title, status, position")
      .eq("course_id", courseId)
      .is("archived_at", null)
      .order("position"),
    supabase
      .from("lesson_versions")
      .select("id, version_number, title, blocks, published_at")
      .eq("lesson_id", lessonId)
      .order("version_number", { ascending: false })
      .limit(20),
    supabase
      .from("review_requests")
      .select("id, status, note, created_at")
      .eq("organization_id", organizationId)
      .eq("subject_type", "lesson")
      .eq("subject_id", lessonId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const reviewIds = (reviews ?? []).map((r) => r.id);
  const { data: comments } = reviewIds.length
    ? await supabase
        .from("review_comments")
        .select("id, request_id, body, status, created_at")
        .in("request_id", reviewIds)
        .order("created_at")
    : { data: [] as never[] };

  return {
    tree: {
      journeys: journeys ?? [],
      courses: courses ?? [],
      currentCourse: course
        ? {
            id: course.id,
            title: course.title,
            modules: (modules ?? []).map((m) => ({
              id: m.id,
              title: m.title,
              lessons: (lessons ?? [])
                .filter((l) => l.module_id === m.id)
                .map((l) => ({ id: l.id, title: l.title, status: l.status })),
            })),
          }
        : null,
    },
    versions: (versions ?? []).map((v) => ({
      id: v.id,
      versionNumber: v.version_number,
      title: v.title,
      publishedAt: v.published_at,
      blockCount: Array.isArray(v.blocks) ? v.blocks.length : 0,
    })),
    reviews: (reviews ?? []).map((r) => ({
      id: r.id,
      status: r.status,
      note: r.note,
      createdAt: r.created_at,
      comments: (comments ?? [])
        .filter((c) => c.request_id === r.id)
        .map((c) => ({
          id: c.id,
          body: c.body,
          status: c.status,
          createdAt: c.created_at,
        })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Curriculum map
// ---------------------------------------------------------------------------

export interface CurriculumMapCourse {
  id: string;
  title: string;
  published: boolean;
  moduleCount: number;
  lessonCount: number;
  assessmentCount: number;
  practicalCount: number;
  /** Titles of the courses this one unlocks after (real prerequisites rows). */
  requires: string[];
}

export interface CurriculumMapJourney {
  id: string;
  title: string;
  status: string;
  /** Courses in journey order (path_nodes.position). */
  courses: CurriculumMapCourse[];
}

export interface CurriculumMapData {
  journeys: CurriculumMapJourney[];
  /** Courses on no journey — knowledge learners may never be routed to. */
  unattachedCourses: CurriculumMapCourse[];
  /** Non-archived assessments with no active lesson assignment. */
  unattachedAssessmentCount: number;
}

/**
 * The organization's curriculum as structure, not decoration: journeys own
 * courses in a real order (path_nodes), courses unlock after real
 * prerequisites rows, and every count is a count of real rows (modules,
 * lessons, active evaluation assignments, practical requirements). Nothing
 * inferred, nothing drawn that is not a database row — the same honesty rule
 * the knowledge graph carried, at a grain that stays readable as content
 * grows.
 */
export async function getCurriculumMap(
  organizationId: string,
): Promise<CurriculumMapData> {
  const supabase = await supabaseServer();
  const [
    { data: journeys },
    { data: courses },
    { data: nodes },
    { data: prereqs },
    { data: modules },
    { data: lessons },
    { data: assignments },
    { data: practicals },
    { data: assessments },
  ] = await Promise.all([
    supabase
      .from("learning_paths")
      .select("id, title, status")
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .order("title"),
    supabase
      .from("courses")
      .select("id, title, current_published_version_id")
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .order("title"),
    supabase
      .from("path_nodes")
      .select("id, path_id, course_id, position")
      .eq("organization_id", organizationId),
    supabase
      .from("prerequisites")
      .select("node_id, requires_node_id")
      .eq("organization_id", organizationId),
    supabase
      .from("modules")
      .select("id, course_id")
      .eq("organization_id", organizationId)
      .is("archived_at", null),
    supabase
      .from("lessons")
      .select("id, course_id")
      .eq("organization_id", organizationId)
      .neq("status", "archived"),
    supabase
      .from("assessment_assignments")
      .select("assessment_id, course_id")
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    supabase
      .from("practical_requirements")
      .select("id, course_id")
      .eq("organization_id", organizationId),
    supabase
      .from("assessments")
      .select("id")
      .eq("organization_id", organizationId)
      .neq("status", "archived"),
  ]);

  const countBy = (rows: { course_id: string }[] | null) => {
    const map = new Map<string, number>();
    for (const row of rows ?? [])
      map.set(row.course_id, (map.get(row.course_id) ?? 0) + 1);
    return map;
  };
  const moduleCounts = countBy(modules);
  const lessonCounts = countBy(lessons);
  const assignmentCounts = countBy(assignments);
  const practicalCounts = countBy(practicals);

  const nodeCourse = new Map((nodes ?? []).map((n) => [n.id, n.course_id]));
  const courseTitle = new Map((courses ?? []).map((c) => [c.id, c.title]));
  const requiresByCourse = new Map<string, string[]>();
  for (const edge of prereqs ?? []) {
    const courseId = nodeCourse.get(edge.node_id);
    const requiredTitle = courseTitle.get(
      nodeCourse.get(edge.requires_node_id) ?? "",
    );
    if (!courseId || !requiredTitle) continue;
    const list = requiresByCourse.get(courseId) ?? [];
    list.push(requiredTitle);
    requiresByCourse.set(courseId, list);
  }

  const toCourse = (id: string): CurriculumMapCourse | null => {
    const row = (courses ?? []).find((c) => c.id === id);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      published: row.current_published_version_id !== null,
      moduleCount: moduleCounts.get(id) ?? 0,
      lessonCount: lessonCounts.get(id) ?? 0,
      assessmentCount: assignmentCounts.get(id) ?? 0,
      practicalCount: practicalCounts.get(id) ?? 0,
      requires: (requiresByCourse.get(id) ?? []).sort(),
    };
  };

  const onAJourney = new Set<string>();
  const journeyRows: CurriculumMapJourney[] = (journeys ?? []).map((j) => {
    const ordered = (nodes ?? [])
      .filter((n) => n.path_id === j.id)
      .sort((a, b) => (a.position < b.position ? -1 : 1))
      .map((n) => toCourse(n.course_id))
      .filter((c): c is CurriculumMapCourse => c !== null);
    for (const c of ordered) onAJourney.add(c.id);
    return { id: j.id, title: j.title, status: j.status, courses: ordered };
  });

  const unattachedCourses = (courses ?? [])
    .filter((c) => !onAJourney.has(c.id))
    .map((c) => toCourse(c.id))
    .filter((c): c is CurriculumMapCourse => c !== null);

  const assignedAssessments = new Set(
    (assignments ?? []).map((a) => a.assessment_id),
  );
  const unattachedAssessmentCount = (assessments ?? []).filter(
    (a) => !assignedAssessments.has(a.id),
  ).length;

  return {
    journeys: journeyRows,
    unattachedCourses,
    unattachedAssessmentCount,
  };
}

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

export interface StudioReviewData {
  requests: {
    id: string;
    subjectType: string;
    subjectId: string;
    subjectTitle: string;
    status: string;
    note: string | null;
    requestedBy: string;
    comments: { id: string; body: string; status: string; createdAt: string }[];
  }[];
  /** Total review requests in the organization, for honest pagination. */
  total: number;
}

export async function getStudioReviews(
  organizationId: string,
  /** 0-based inclusive slice of the review history. */
  range?: { from: number; to: number },
): Promise<StudioReviewData> {
  const supabase = await supabaseServer();
  const { data: requests, count } = await supabase
    .from("review_requests")
    .select("id, subject_type, subject_id, status, note, requested_by", {
      count: "exact",
    })
    .eq("organization_id", organizationId)
    .range(range?.from ?? 0, range?.to ?? 29);
  const total = count ?? 0;
  if (!requests || requests.length === 0) return { requests: [], total };

  const lessonIds = requests
    .filter((r) => r.subject_type === "lesson")
    .map((r) => r.subject_id);
  const courseIds = requests
    .filter((r) => r.subject_type === "course")
    .map((r) => r.subject_id);
  const assessmentIds = requests
    .filter((r) => r.subject_type === "assessment")
    .map((r) => r.subject_id);
  const [
    { data: lessons },
    { data: courses },
    { data: assessments },
    { data: comments },
  ] = await Promise.all([
    lessonIds.length
      ? supabase.from("lessons").select("id, title").in("id", lessonIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    courseIds.length
      ? supabase.from("courses").select("id, title").in("id", courseIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    assessmentIds.length
      ? supabase.from("assessments").select("id, title").in("id", assessmentIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    supabase
      .from("review_comments")
      .select("id, request_id, body, status, created_at")
      .in(
        "request_id",
        requests.map((r) => r.id),
      )
      .order("created_at"),
  ]);
  const titles = new Map<string, string>();
  for (const row of [
    ...(lessons ?? []),
    ...(courses ?? []),
    ...(assessments ?? []),
  ]) {
    titles.set(row.id, row.title);
  }

  return {
    requests: requests.map((r) => ({
      id: r.id,
      subjectType: r.subject_type,
      subjectId: r.subject_id,
      subjectTitle: titles.get(r.subject_id) ?? "Untitled",
      status: r.status,
      note: r.note,
      requestedBy: r.requested_by,
      comments: (comments ?? [])
        .filter((c) => c.request_id === r.id)
        .map((c) => ({
          id: c.id,
          body: c.body,
          status: c.status,
          createdAt: c.created_at,
        })),
    })),
    total,
  };
}

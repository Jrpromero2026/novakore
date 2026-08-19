import "server-only";
import {
  templateVariablesSchema,
  type TemplateCategory,
  type TemplateVariable,
} from "@novakore/domain";
import { supabaseServer } from "../supabase/server";

/**
 * Content template reads.
 *
 * Templates are org-scoped and RLS-gated (`content.view_draft` to see,
 * `library.manage` to change), so every query here runs under the caller's
 * session like the rest of the data layer.
 */

export interface TemplateBlock {
  type: string;
  schemaVersion: number;
  data: Record<string, unknown>;
}

export interface ContentTemplate {
  id: string;
  title: string;
  description: string | null;
  category: TemplateCategory;
  status: string;
  variables: TemplateVariable[];
  blocks: TemplateBlock[];
  blockCount: number;
  updatedAt: string;
}

export interface TemplateSummary {
  id: string;
  title: string;
  description: string | null;
  category: TemplateCategory;
  /** Carried on the list itself: small, and it saves a round trip when the
   *  author opens the fill-in form. */
  variables: TemplateVariable[];
  blockCount: number;
  updatedAt: string;
}

/**
 * Stored JSON is validated on the way out, not trusted.
 *
 * A template row can predate a schema change, or have been written by an
 * older client. Parsing defensively here means a malformed row renders as an
 * empty variable list rather than throwing inside a page render.
 */
function parseVariables(raw: unknown): TemplateVariable[] {
  const parsed = templateVariablesSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

function parseBlocks(raw: unknown): TemplateBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((b) => {
    if (b === null || typeof b !== "object") return [];
    const row = b as Record<string, unknown>;
    if (typeof row.type !== "string") return [];
    return [
      {
        type: row.type,
        schemaVersion:
          typeof row.schemaVersion === "number" ? row.schemaVersion : 1,
        data:
          row.data !== null && typeof row.data === "object"
            ? (row.data as Record<string, unknown>)
            : {},
      },
    ];
  });
}

export async function listTemplates(
  organizationId: string,
): Promise<TemplateSummary[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("content_templates")
    .select("id, title, description, category, variables, blocks, updated_at")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category as TemplateCategory,
    variables: parseVariables(row.variables),
    blockCount: parseBlocks(row.blocks).length,
    updatedAt: row.updated_at,
  }));
}

export async function getTemplate(
  organizationId: string,
  templateId: string,
): Promise<ContentTemplate | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("content_templates")
    .select(
      "id, title, description, category, status, variables, blocks, updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("id", templateId)
    .maybeSingle();

  if (!data) return null;
  const blocks = parseBlocks(data.blocks);
  return {
    id: data.id,
    title: data.title,
    description: data.description,
    category: data.category as TemplateCategory,
    status: data.status,
    variables: parseVariables(data.variables),
    blocks,
    blockCount: blocks.length,
    updatedAt: data.updated_at,
  };
}

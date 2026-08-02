import { z } from "zod";

/**
 * Organization identity (Experience Design System — Organizational OS).
 *
 * Who the organization is — mission, vision, values, operating principles,
 * voice. Stored in `organization_settings.settings` (jsonb, RLS: members
 * read, `org.manage` writes) under the `identity` key — an additive use of
 * an existing column, no schema change. Identity is culture the organization
 * supplies; the platform reflects it, never invents it.
 */

const line = z.string().trim().min(1).max(200);

export const orgIdentitySchema = z.object({
  mission: z.string().trim().max(500).optional(),
  vision: z.string().trim().max(500).optional(),
  values: z.array(line).max(8).optional(),
  principles: z.array(line).max(8).optional(),
  /** How the organization speaks — guides authors, and later, Nova drafts. */
  voice: z.string().trim().max(500).optional(),
});

export type OrgIdentity = z.infer<typeof orgIdentitySchema>;

/** Read the identity out of a raw settings jsonb value; absent = empty. */
export function parseOrgIdentity(settings: unknown): OrgIdentity {
  if (settings === null || typeof settings !== "object") return {};
  const parsed = orgIdentitySchema.safeParse(
    (settings as Record<string, unknown>).identity ?? {},
  );
  return parsed.success ? parsed.data : {};
}

export function identityIsEmpty(identity: OrgIdentity): boolean {
  return (
    !identity.mission &&
    !identity.vision &&
    !(identity.values?.length ?? 0) &&
    !(identity.principles?.length ?? 0) &&
    !identity.voice
  );
}

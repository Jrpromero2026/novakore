"use server";

import { revalidatePath } from "next/cache";
import { can, requireOrgContext } from "../org-context";
import { supabaseServer } from "../supabase/server";
import { orgIdentitySchema } from "../org-identity";
import {
  academySchema,
  organizationNameSchema,
  roleSchema,
  terminologyEntrySchema,
} from "../validation";
import { dbErrorMessage, fieldErrors, type ActionState } from "./types";

export async function updateOrganizationNameAction(
  orgSlug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "org.manage")) {
    return {
      ok: false,
      message: "You do not have permission to edit the organization.",
    };
  }
  const parsed = organizationNameSchema.safeParse({
    name: formData.get("name"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("organizations")
    .update({ name: parsed.data.name })
    .eq("id", ctx.organization.id);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin`, "layout");
  return { ok: true, message: "Organization name updated." };
}

/** One-per-line textarea → trimmed list (empty lines dropped). */
function linesOf(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export async function updateOrgIdentityAction(
  orgSlug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "org.manage")) {
    return {
      ok: false,
      message: "You do not have permission to edit the organization.",
    };
  }
  const parsed = orgIdentitySchema.safeParse({
    mission: String(formData.get("mission") ?? "").trim() || undefined,
    vision: String(formData.get("vision") ?? "").trim() || undefined,
    values: linesOf(formData.get("values")),
    principles: linesOf(formData.get("principles")),
    voice: String(formData.get("voice") ?? "").trim() || undefined,
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  // Merge under the `identity` key so other settings survive untouched.
  const supabase = await supabaseServer();
  const { data: row, error: readError } = await supabase
    .from("organization_settings")
    .select("settings")
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (readError) return { ok: false, message: dbErrorMessage(readError) };

  const current =
    row?.settings && typeof row.settings === "object"
      ? (row.settings as Record<string, unknown>)
      : {};
  const { error } = await supabase
    .from("organization_settings")
    .update({ settings: { ...current, identity: parsed.data } })
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath(`/${orgSlug}/admin/organization`);
  return { ok: true, message: "Organization identity updated." };
}

export async function saveTerminologyAction(
  orgSlug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "org.terminology.manage")) {
    return {
      ok: false,
      message: "You do not have permission to edit terminology.",
    };
  }
  const parsed = terminologyEntrySchema.safeParse({
    term_key: formData.get("term_key"),
    singular: formData.get("singular"),
    plural: formData.get("plural"),
    short_form: formData.get("short_form") ?? "",
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await supabaseServer();
  const { error } = await supabase.from("organization_terminology").upsert({
    organization_id: ctx.organization.id,
    term_key: parsed.data.term_key,
    singular: parsed.data.singular,
    plural: parsed.data.plural,
    short_form: parsed.data.short_form === "" ? null : parsed.data.short_form,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/terminology`);
  return { ok: true, message: "Term saved." };
}

export async function resetTerminologyAction(
  orgSlug: string,
  termKey: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "org.terminology.manage")) {
    return {
      ok: false,
      message: "You do not have permission to edit terminology.",
    };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("organization_terminology")
    .delete()
    .eq("organization_id", ctx.organization.id)
    .eq("term_key", termKey);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/terminology`);
  return { ok: true };
}

export async function createRoleAction(
  orgSlug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "org.roles.manage")) {
    return {
      ok: false,
      message: "You do not have permission to manage roles.",
    };
  }
  const parsed = roleSchema.safeParse({
    key: formData.get("key"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await supabaseServer();
  const { error } = await supabase.from("organization_roles").insert({
    organization_id: ctx.organization.id,
    key: parsed.data.key,
    name: parsed.data.name,
    description:
      parsed.data.description === "" ? null : parsed.data.description,
    is_system: false,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/roles`);
  return { ok: true, message: `Role "${parsed.data.name}" created.` };
}

export async function setRolePermissionAction(
  orgSlug: string,
  roleId: string,
  permissionCode: string,
  granted: boolean,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "org.roles.manage")) {
    return {
      ok: false,
      message: "You do not have permission to manage roles.",
    };
  }
  const supabase = await supabaseServer();
  const { error } = granted
    ? await supabase.from("organization_role_permissions").insert({
        organization_id: ctx.organization.id,
        role_id: roleId,
        permission_code: permissionCode,
      })
    : await supabase
        .from("organization_role_permissions")
        .delete()
        .eq("role_id", roleId)
        .eq("permission_code", permissionCode)
        .eq("organization_id", ctx.organization.id);
  if (error) {
    return {
      ok: false,
      message: error.message.includes("managed by the platform")
        ? "System roles are managed by the platform and cannot be edited."
        : dbErrorMessage(error),
    };
  }
  revalidatePath(`/${orgSlug}/admin/roles`);
  return { ok: true };
}

export async function createAcademyAction(
  orgSlug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "academy.manage")) {
    return {
      ok: false,
      message: "You do not have permission to create academies.",
    };
  }
  const parsed = academySchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await supabaseServer();
  const { error } = await supabase.from("academies").insert({
    organization_id: ctx.organization.id,
    name: parsed.data.name,
    slug: parsed.data.slug,
    description:
      parsed.data.description === "" ? null : parsed.data.description,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/academies`);
  return { ok: true, message: `Academy "${parsed.data.name}" created.` };
}

export async function updateAcademyAction(
  orgSlug: string,
  academyId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "academy.manage", { academyId })) {
    return {
      ok: false,
      message: "You do not have permission to edit this academy.",
    };
  }
  const parsed = academySchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("academies")
    .update({
      name: parsed.data.name,
      slug: parsed.data.slug,
      description:
        parsed.data.description === "" ? null : parsed.data.description,
    })
    .eq("id", academyId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/academies`);
  return { ok: true, message: "Academy updated." };
}

export async function setAcademyStatusAction(
  orgSlug: string,
  academyId: string,
  status: "active" | "archived",
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "academy.manage", { academyId })) {
    return {
      ok: false,
      message: "You do not have permission to change this academy.",
    };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("academies")
    .update({ status })
    .eq("id", academyId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/academies`);
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, requireOrgContext } from "../org-context";
import { supabaseServer } from "../supabase/server";
import { inviteMemberSchema } from "../validation";
import { dbErrorMessage, fieldErrors, type ActionState } from "./types";

export async function inviteMemberAction(
  orgSlug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "org.members.manage")) {
    return {
      ok: false,
      message: "You do not have permission to invite members.",
    };
  }
  const parsed = inviteMemberSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return fieldErrors(parsed.error);

  // Optional: the access level chosen while onboarding. Empty string is the
  // "decide later" option, not a role, so it must become null rather than an
  // empty uuid the database would reject.
  const roleId = (formData.get("roleId") as string | null) || null;
  const academyId = (formData.get("academyId") as string | null) || null;

  // Granting a role is a higher act than adding a person, so it carries the
  // stricter permission. Checked here for a usable message and again inside
  // invite_member, which is the boundary that actually enforces it — this
  // check is an affordance, not the gate.
  if (roleId && !can(ctx, "org.roles.manage")) {
    return {
      ok: false,
      message:
        "You can invite people, but assigning an access level requires the role-management permission. Invite without one and ask an owner to set it.",
    };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("invite_member", {
    p_organization_id: ctx.organization.id,
    p_email: parsed.data.email,
    ...(roleId ? { p_role_id: roleId } : {}),
    // An academy-scoped grant only means something alongside a role.
    ...(roleId && academyId ? { p_academy_id: academyId } : {}),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath(`/${orgSlug}/admin/members`);
  return { ok: true, message: `Invitation created for ${parsed.data.email}.` };
}

export async function setMembershipStatusAction(
  orgSlug: string,
  membershipId: string,
  status: "active" | "suspended" | "removed",
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "org.members.manage")) {
    return {
      ok: false,
      message: "You do not have permission to manage members.",
    };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("set_membership_status", {
    p_membership_id: membershipId,
    p_status: status,
  });
  if (error) {
    return {
      ok: false,
      message: error.message.includes("last active organization owner")
        ? "You cannot suspend or remove the last active owner."
        : error.message.includes("own membership")
          ? "You cannot change your own membership."
          : dbErrorMessage(error),
    };
  }
  revalidatePath(`/${orgSlug}/admin/members`);
  return { ok: true };
}

export async function assignRoleAction(
  orgSlug: string,
  input: { membershipId: string; roleId: string; academyId: string | null },
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "org.roles.manage")) {
    return {
      ok: false,
      message: "You do not have permission to assign roles.",
    };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.from("organization_member_roles").insert({
    organization_id: ctx.organization.id,
    membership_id: input.membershipId,
    role_id: input.roleId,
    academy_id: input.academyId,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/members`);
  return { ok: true };
}

export async function revokeRoleAction(
  orgSlug: string,
  memberRoleId: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx, "org.roles.manage")) {
    return {
      ok: false,
      message: "You do not have permission to revoke roles.",
    };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("organization_member_roles")
    .delete()
    .eq("id", memberRoleId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/${orgSlug}/admin/members`);
  return { ok: true };
}

export async function acceptInvitationAction(
  organizationId: string,
): Promise<void> {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("accept_invitation", {
    p_organization_id: organizationId,
  });
  if (error) redirect(`/select-org?error=accept`);

  const { data: org } = await supabase
    .from("organizations")
    .select("slug")
    .eq("id", organizationId)
    .maybeSingle();
  redirect(org ? `/${org.slug}/admin` : "/select-org");
}

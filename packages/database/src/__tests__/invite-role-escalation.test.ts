import { afterAll, describe, expect, test } from "vitest";
import { signedIn, userIdFor } from "./_session";

/**
 * Inviting a person and deciding what they may do are separate permissions.
 *
 * `invite_member` now takes an optional role so an admin can onboard someone
 * at an access level in one step. That convenience is exactly where an
 * escalation would hide: if supplying a role rode along on the invite
 * permission, anyone who could add a person could add them as an owner.
 *
 * The system roles ship with org.members.manage and org.roles.manage always
 * together, so the gap is not reachable with seeded data — it opens the
 * moment an organization defines a custom role with only the first. This
 * builds exactly that role and proves the door is shut.
 *
 * Runs against the synthetic Alpha tenant, never Built For Her. An earlier
 * version used BFH and left three probe invitations behind in a tenant that
 * is becoming a real customer — because `.delete()` under RLS reports no
 * error when the policy matches no rows, so a cleanup that silently did
 * nothing looked like it had worked. Memberships are deliberately not
 * hard-deletable (removal is permanent history), so probes are retired
 * through the supported status change instead.
 */

const ALPHA_ORG = "00000000-0000-4000-8000-000000000101";
const OWNER = "alpha.owner@novakore.test";
const SUBJECT = "alpha.learner@novakore.test";

/**
 * Retire a probe membership through the product's own path.
 *
 * Asserted rather than fire-and-forget: a cleanup whose failure is invisible
 * is how the fixtures leaked into a real tenant in the first place.
 */
async function retire(owner: Awaited<ReturnType<typeof signedIn>>, id: string) {
  const { error } = await owner.rpc("set_membership_status", {
    p_membership_id: id,
    p_status: "removed",
  });
  expect(error, `probe membership ${id} must be retired`).toBeNull();
}

let createdRoleId: string | null = null;
let createdGrantId: string | null = null;

afterAll(async () => {
  // The role is a permanent fixture; the GRANT is what each run must undo,
  // or the subject keeps a permission the next test assumes they lack.
  if (!createdGrantId) return;
  const owner = await signedIn(OWNER);
  await owner
    .from("organization_member_roles")
    .delete()
    .eq("id", createdGrantId);

  // Verified, not assumed. `.delete()` under RLS returns no error when the
  // policy matches no rows, so a cleanup that quietly does nothing looks
  // exactly like one that worked — which is how this file leaked fixtures
  // in the first place.
  const { count } = await owner
    .from("organization_member_roles")
    .select("id", { count: "exact", head: true })
    .eq("id", createdGrantId);
  expect(count ?? 0, "the temporary grant must actually be revoked").toBe(0);
});

describe("invite_member — role assignment cannot be escalated", () => {
  test("a member-manager without org.roles.manage is refused a role on invite", async () => {
    const owner = await signedIn(OWNER);

    // ONE role, reused across runs, under a fixed key.
    //
    // The first version minted a fresh role each run and deleted it in
    // afterAll — except organization_roles has no DELETE policy at all
    // (roles are archived, never dropped), so the delete silently matched
    // nothing and 21 orphans accumulated in the tenant before anyone looked.
    // A stable fixture cannot accumulate, whatever RLS permits.
    const key = "test_inviter_fixture";
    const { data: existing } = await owner
      .from("organization_roles")
      .select("id")
      .eq("organization_id", ALPHA_ORG)
      .eq("key", key)
      .maybeSingle();

    if (existing) {
      createdRoleId = existing.id;
    } else {
      const { data: role, error: roleError } = await owner
        .from("organization_roles")
        .insert({
          organization_id: ALPHA_ORG,
          key,
          name: "Test Inviter (fixture)",
          description: "Reused fixture for the invite escalation test.",
        })
        .select("id")
        .single();
      expect(
        roleError,
        "owner should be able to define a custom role",
      ).toBeNull();
      createdRoleId = role!.id;
    }

    // Idempotent: the permission may already be there from an earlier run.
    await owner.from("organization_role_permissions").upsert(
      {
        organization_id: ALPHA_ORG,
        role_id: createdRoleId,
        permission_code: "org.members.manage",
      },
      { onConflict: "role_id,permission_code" },
    );

    // Give it to someone who holds nothing else.
    const subjectUserId = await userIdFor(SUBJECT);
    const { data: membership } = await owner
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", ALPHA_ORG)
      .eq("user_id", subjectUserId)
      .single();

    const { data: grant, error: grantError } = await owner
      .from("organization_member_roles")
      .insert({
        organization_id: ALPHA_ORG,
        membership_id: membership!.id,
        role_id: createdRoleId,
        academy_id: null,
      })
      .select("id")
      .single();
    expect(grantError).toBeNull();
    createdGrantId = grant!.id;

    // The role this principal must not be able to hand out.
    const { data: ownerRole } = await owner
      .from("organization_roles")
      .select("id")
      .eq("organization_id", ALPHA_ORG)
      .eq("key", "organization_owner")
      .single();

    const subject = await signedIn(SUBJECT);

    // First prove this principal CAN invite. Without this the refusal below
    // would be indistinguishable from "cannot invite at all", and the test
    // would pass for the wrong reason — the classic way an authorization
    // test asserts nothing.
    const plainEmail = `escalation-probe-plain-${Date.now().toString(36)}@novakore.test`;
    const plain = await subject.rpc("invite_member", {
      p_organization_id: ALPHA_ORG,
      p_email: plainEmail,
    });
    try {
      expect(
        plain.error,
        "the custom role really does carry org.members.manage",
      ).toBeNull();
    } finally {
      if (plain.data) await retire(owner, plain.data);
    }

    // Same principal, same organization, same call — plus a role. Now refused.
    const escalated = await subject.rpc("invite_member", {
      p_organization_id: ALPHA_ORG,
      p_email: `escalation-probe-role-${Date.now().toString(36)}@novakore.test`,
      p_role_id: ownerRole!.id,
    });

    expect(
      escalated.error,
      "inviting WITH a role must be refused without org.roles.manage",
    ).not.toBeNull();
    expect(escalated.error?.code).toBe("42501");

    // And nothing was created on the way to the refusal.
    const { count } = await owner
      .from("organization_memberships")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ALPHA_ORG)
      .ilike("invited_email", "escalation-probe-role-%");
    expect(count ?? 0, "a refused invite must leave no membership").toBe(0);
  });

  test("an owner holding both permissions can invite at an access level", async () => {
    const owner = await signedIn(OWNER);
    const { data: learnerRole } = await owner
      .from("organization_roles")
      .select("id")
      .eq("organization_id", ALPHA_ORG)
      .eq("key", "learner")
      .single();

    const email = `invite-with-role-${Date.now().toString(36)}@novakore.test`;
    const { data: membershipId, error } = await owner.rpc("invite_member", {
      p_organization_id: ALPHA_ORG,
      p_email: email,
      p_role_id: learnerRole!.id,
    });

    try {
      expect(error, "an owner may invite at a role").toBeNull();
      expect(membershipId).toBeTruthy();

      // The point of the feature: the role is attached immediately, not left
      // for a second step someone has to remember.
      const { data: roles } = await owner
        .from("organization_member_roles")
        .select("role_id")
        .eq("membership_id", membershipId!);
      expect(roles?.map((r) => r.role_id)).toEqual([learnerRole!.id]);
    } finally {
      if (membershipId) await retire(owner, membershipId);
    }
  });
});

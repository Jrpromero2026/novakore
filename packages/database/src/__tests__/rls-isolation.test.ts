import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { bareClient, signedIn, type Client as SharedClient } from "./_session";
import type { Database } from "../types/database";

/**
 * NovaKore tenant-isolation suite — the Phase 1A release gate.
 *
 * Runs against a REAL Supabase instance (novakore-dev or the local stack)
 * using real sign-ins and PostgREST, so every assertion exercises actual
 * RLS policies, grants, and SECURITY DEFINER functions. Nothing here is
 * mocked. Requires the seed from supabase/seed.sql.
 *
 * When the test environment is absent the suite SKIPS LOUDLY — a skipped
 * run does NOT satisfy the release gate.
 */

const URL_ENV = "NOVAKORE_TEST_SUPABASE_URL";
const KEY_ENV = "NOVAKORE_TEST_SUPABASE_ANON_KEY";
const url = process.env[URL_ENV];
const anonKey = process.env[KEY_ENV];
const configured = Boolean(url && anonKey);

if (!configured) {
  // eslint-disable-next-line no-console
  console.warn(
    `\n[RLS SUITE SKIPPED] ${URL_ENV} / ${KEY_ENV} are not set. ` +
      "The Phase 1A isolation gate is NOT satisfied by a skipped run. " +
      "See docs/development/supabase.md#rls-test-strategy.\n",
  );
}

// Seeded fixtures (supabase/seed.sql) — deterministic ids.
const ORG_A = "00000000-0000-4000-8000-000000000101"; // Alpha Learning Collective
const ORG_B = "00000000-0000-4000-8000-000000000102"; // Built For Her (Dev Tenant)
const ORG_GAMMA = "00000000-0000-4000-8000-000000000103"; // fallback-branding fixture (alpha.owner also owns it)
const ACADEMY_A = "00000000-0000-4000-8000-000000000201";

// Sessions come from the suite-wide pool (vitest.globalSetup.ts).
type Client = SharedClient;

describe.skipIf(!configured)(
  "tenant isolation (RLS + definer functions)",
  () => {
    let alphaOwner: Client;
    let alphaAdmin: Client;
    let alphaAuthor: Client; // multi-org: author in A, learner in B
    let alphaReviewer: Client;
    let alphaLearner: Client;
    let bfhOwner: Client;
    let anon: Client;

    beforeAll(async () => {
      [
        alphaOwner,
        alphaAdmin,
        alphaAuthor,
        alphaReviewer,
        alphaLearner,
        bfhOwner,
      ] = await Promise.all([
        signedIn("alpha.owner@novakore.test"),
        signedIn("alpha.admin@novakore.test"),
        signedIn("alpha.author@novakore.test"),
        signedIn("alpha.reviewer@novakore.test"),
        signedIn("alpha.learner@novakore.test"),
        signedIn("bfh.owner@novakore.test"),
      ]);
      anon = bareClient();
    });

    afterAll(async () => {
      // No sign-out: sessions are shared suite-wide (see _session.ts).
    });

    // Positive control first: if this fails, every "empty result" below is meaningless.
    test("control: members see their own organization's data", async () => {
      const { data: orgs, error } = await alphaOwner
        .from("organizations")
        .select("id, slug");
      expect(error).toBeNull();
      expect(orgs?.map((o) => o.id).sort()).toEqual([ORG_A, ORG_GAMMA]);

      const { data: bOrgs } = await bfhOwner.from("organizations").select("id");
      expect(bOrgs?.map((o) => o.id)).toEqual([ORG_B]);

      const { data: terms } = await bfhOwner
        .from("organization_terminology")
        .select("term_key");
      expect(terms?.length).toBeGreaterThanOrEqual(7);
    });

    test("#1 a member of org A cannot read org B", async () => {
      const { data, error } = await alphaOwner
        .from("organizations")
        .select("*")
        .eq("id", ORG_B);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    test("#2 a member of org A cannot update org B", async () => {
      const { data } = await alphaOwner
        .from("organizations")
        .update({ name: "Hijacked" })
        .eq("id", ORG_B)
        .select();
      expect(data).toEqual([]); // RLS hides the row: zero rows affected

      const { data: check } = await bfhOwner
        .from("organizations")
        .select("name")
        .eq("id", ORG_B);
      expect(check?.[0]?.name).toBe("Built For Her (Dev Tenant)");
    });

    test("#3 a member of org A cannot access org B memberships", async () => {
      const { data } = await alphaOwner
        .from("organization_memberships")
        .select("*")
        .eq("organization_id", ORG_B);
      expect(data).toEqual([]);
    });

    test("#4 a member of org A cannot access org B roles", async () => {
      const { data } = await alphaOwner
        .from("organization_roles")
        .select("*")
        .eq("organization_id", ORG_B);
      expect(data).toEqual([]);
    });

    test("#5 a member of org A cannot access org B branding", async () => {
      const { data } = await alphaOwner
        .from("organization_branding")
        .select("*")
        .eq("organization_id", ORG_B);
      expect(data).toEqual([]);
    });

    test("#6 a member of org A cannot access org B terminology", async () => {
      const { data } = await alphaOwner
        .from("organization_terminology")
        .select("*")
        .eq("organization_id", ORG_B);
      expect(data).toEqual([]);
    });

    test("#7 a member of org A cannot access org B academies", async () => {
      const { data } = await alphaOwner
        .from("academies")
        .select("*")
        .eq("organization_id", ORG_B);
      expect(data).toEqual([]);
    });

    test("#8 a learner cannot perform organization administration", async () => {
      // cannot rename the org
      const { data: orgUpdate } = await alphaLearner
        .from("organizations")
        .update({ name: "Learner Takeover" })
        .eq("id", ORG_A)
        .select();
      expect(orgUpdate).toEqual([]);

      // cannot edit branding
      const { data: branding } = await alphaLearner
        .from("organization_branding")
        .update({ accent_light: "#000000" })
        .eq("organization_id", ORG_A)
        .select();
      expect(branding).toEqual([]);

      // cannot invite members (definer function checks permissions internally)
      const { error: inviteError } = await alphaLearner.rpc("invite_member", {
        p_organization_id: ORG_A,
        p_email: "learner.invitee@novakore.test",
      });
      expect(inviteError?.message).toMatch(/permission denied/i);
    });

    test("#9 an author cannot publish or administer permissions", async () => {
      // the seeded author bundle contains no publish and no admin permissions
      const { data: authorPerms, error } = await alphaAuthor
        .from("organization_roles")
        .select("key, organization_role_permissions(permission_code)")
        .eq("organization_id", ORG_A)
        .eq("key", "author")
        .single();
      expect(error).toBeNull();
      const codes = authorPerms!.organization_role_permissions.map(
        (p) => p.permission_code,
      );
      expect(codes).not.toContain("content.publish");
      expect(codes).not.toContain("org.roles.manage");
      expect(codes).not.toContain("org.members.manage");

      // and cannot grant permissions to roles
      const { data: learnerRole } = await alphaAuthor
        .from("organization_roles")
        .select("id")
        .eq("organization_id", ORG_A)
        .eq("key", "learner")
        .single();
      const { error: grantError } = await alphaAuthor
        .from("organization_role_permissions")
        .insert({
          organization_id: ORG_A,
          role_id: learnerRole!.id,
          permission_code: "org.manage",
        });
      expect(grantError).not.toBeNull(); // RLS with-check rejects
    });

    test("#10 a reviewer cannot modify organization security settings", async () => {
      const { data: settings } = await alphaReviewer
        .from("organization_settings")
        .update({ default_locale: "fr" })
        .eq("organization_id", ORG_A)
        .select();
      expect(settings).toEqual([]);

      const { data: roleUpdate } = await alphaReviewer
        .from("organization_roles")
        .update({ name: "Renamed" })
        .eq("organization_id", ORG_A)
        .eq("is_system", false)
        .select();
      expect(roleUpdate).toEqual([]);
    });

    test("#11 a suspended member loses tenant access", async () => {
      const suspended = await signedIn("alpha.suspended@novakore.test");
      const { data: orgs } = await suspended.from("organizations").select("*");
      expect(orgs).toEqual([]);
      const { data: academies } = await suspended.from("academies").select("*");
      expect(academies).toEqual([]);
    });

    test("#12 a removed member loses tenant access", async () => {
      const removed = await signedIn("alpha.removed@novakore.test");
      const { data: orgs } = await removed.from("organizations").select("*");
      expect(orgs).toEqual([]);
      const { data: academies } = await removed.from("academies").select("*");
      expect(academies).toEqual([]);
    });

    test("#13 a multi-org user holds only the selected organization's permissions", async () => {
      // alpha.author belongs to both orgs (author in A, learner in B)
      const { data: memberships } = await alphaAuthor
        .from("organization_memberships")
        .select("organization_id")
        .order("organization_id");
      expect(memberships?.map((m) => m.organization_id)).toEqual([
        ORG_A,
        ORG_B,
      ]);

      // as a member they can SEE org B academies…
      const { data: bAcademies } = await alphaAuthor
        .from("academies")
        .select("slug")
        .eq("organization_id", ORG_B);
      expect(bAcademies?.map((a) => a.slug)).toEqual(["coaching"]);

      // …but author-in-A grants nothing in B: no role-permission grants there
      const { data: bRole } = await alphaAuthor
        .from("organization_roles")
        .select("id")
        .eq("organization_id", ORG_B)
        .eq("key", "learner")
        .single();
      const { error: bGrant } = await alphaAuthor
        .from("organization_role_permissions")
        .insert({
          organization_id: ORG_B,
          role_id: bRole!.id,
          permission_code: "enrollment.manage",
        });
      expect(bGrant).not.toBeNull();
    });

    test("#14 client-supplied organization ids cannot bypass membership checks", async () => {
      // alpha.admin has org.members.manage in A — supplying B's id must fail
      const { error: crossInvite } = await alphaAdmin.rpc("invite_member", {
        p_organization_id: ORG_B,
        p_email: "cross-tenant@novakore.test",
      });
      expect(crossInvite?.message).toMatch(/permission denied/i);

      // direct insert with a foreign organization_id is rejected by RLS
      const { error: crossInsert } = await alphaAdmin.from("academies").insert({
        organization_id: ORG_B,
        name: "Injected Academy",
        slug: "injected",
      });
      expect(crossInsert).not.toBeNull();

      // and the same operation succeeds inside their own org (positive control)
      const inviteEmail = `qa-invite-${Date.now()}@novakore.test`;
      const { data: membershipId, error: okInvite } = await alphaAdmin.rpc(
        "invite_member",
        {
          p_organization_id: ORG_A,
          p_email: inviteEmail,
        },
      );
      expect(okInvite).toBeNull();
      expect(membershipId).toBeTruthy();
      // cleanup: revoke the open invitation
      const { error: cleanup } = await alphaAdmin.rpc("set_membership_status", {
        p_membership_id: membershipId!,
        p_status: "removed",
      });
      expect(cleanup).toBeNull();
    });

    test("#15 ordinary tenant users cannot alter platform permission definitions", async () => {
      const { error: updateError } = await alphaOwner
        .from("permissions")
        .update({ description: "tampered" })
        .eq("code", "org.manage");
      expect(updateError).not.toBeNull(); // no UPDATE grant at all

      const { error: insertError } = await alphaOwner
        .from("permissions")
        .insert({
          code: "evil.permission",
          description: "tampered",
          category: "evil",
        });
      expect(insertError).not.toBeNull();
    });

    test("#16 audit logs cannot be edited or deleted by tenant users", async () => {
      // owner holds audit.view: reading works
      const { data: rows, error: readError } = await alphaOwner
        .from("audit_logs")
        .select("id")
        .eq("organization_id", ORG_A)
        .limit(1);
      expect(readError).toBeNull();
      expect(rows?.length).toBe(1);

      const auditId = rows![0]!.id;
      const { error: updateError } = await alphaOwner
        .from("audit_logs")
        .update({ action: "history.rewritten" })
        .eq("id", auditId);
      expect(updateError).not.toBeNull(); // UPDATE grant revoked

      const { error: deleteError } = await alphaOwner
        .from("audit_logs")
        .delete()
        .eq("id", auditId);
      expect(deleteError).not.toBeNull(); // DELETE grant revoked

      const { error: insertError } = await alphaOwner
        .from("audit_logs")
        .insert({
          organization_id: ORG_A,
          action: "forged.entry",
          target_type: "organization",
        });
      expect(insertError).not.toBeNull(); // INSERT grant revoked (definer-only writes)

      // learner (no audit.view) cannot read the audit log at all
      const { data: learnerRows } = await alphaLearner
        .from("audit_logs")
        .select("id")
        .eq("organization_id", ORG_A);
      expect(learnerRows).toEqual([]);
    });

    test("#17 internal functions are not invocable by normal clients", async () => {
      // app.create_system_roles lives outside the API schema — not callable
      const internal = await alphaOwner.rpc(
        // @ts-expect-error — intentionally probing a non-exposed function
        "create_system_roles",
        { p_organization_id: ORG_A },
      );
      expect(internal.error).not.toBeNull();

      // provision_organization is exposed but platform-admin-gated internally
      const { error: provisionError } = await alphaOwner.rpc(
        "provision_organization",
        {
          p_name: "Rogue Org",
          p_slug: "rogue-org",
          p_owner_email: "rogue@novakore.test",
        },
      );
      expect(provisionError?.message).toMatch(/platform administrators only/i);

      // change_organization_slug is equally platform-admin-gated
      const { error: slugError } = await alphaOwner.rpc(
        "change_organization_slug",
        {
          p_organization_id: ORG_A,
          p_new_slug: "sneaky-rename",
        },
      );
      expect(slugError?.message).toMatch(/platform administrators only/i);
    });

    test("#18 anonymous users cannot access tenant data", async () => {
      const { data, error } = await anon.from("organizations").select("*");
      expect(data ?? []).toEqual([]);
      expect(error).not.toBeNull(); // all grants revoked from anon

      const { data: members, error: mErr } = await anon
        .from("organization_memberships")
        .select("*");
      expect(members ?? []).toEqual([]);
      expect(mErr).not.toBeNull();

      const { error: rpcError } = await anon.rpc("invite_member", {
        p_organization_id: ORG_A,
        p_email: "anon@novakore.test",
      });
      expect(rpcError).not.toBeNull();
    });

    test("platform administrators can see organizations (platform boundary)", async () => {
      const platformAdmin = await signedIn("platform.admin@novakore.test");
      const { data: orgs, error } = await platformAdmin
        .from("organizations")
        .select("id")
        .order("id");
      expect(error).toBeNull();
      expect(orgs?.map((o) => o.id)).toEqual([ORG_A, ORG_B, ORG_GAMMA]);

      // but platform admins are not org members: memberships stay invisible
      const { data: memberships } = await platformAdmin
        .from("organization_memberships")
        .select("*");
      expect(memberships).toEqual([]);
    });

    test("academy-scoped academy.manage can edit its academy but cannot create academies", async () => {
      const academyAdmin = await signedIn("alpha.academy@novakore.test");

      // positive: scoped update on the assigned academy succeeds
      const { data: updated, error: updateError } = await academyAdmin
        .from("academies")
        .update({ description: "Core onboarding and foundational programs." })
        .eq("id", ACADEMY_A)
        .select("id");
      expect(updateError).toBeNull();
      expect(updated?.length).toBe(1);

      // negative: creating academies requires the org-wide permission
      const { error: insertError } = await academyAdmin
        .from("academies")
        .insert({
          organization_id: ORG_A,
          name: "Unauthorized Academy",
          slug: "unauthorized",
        });
      expect(insertError).not.toBeNull();
    });

    test("organization slugs are immutable to tenants and reserved slugs are blocked", async () => {
      // owner CAN update the org name (positive)…
      const { data: renamed, error: renameError } = await alphaOwner
        .from("organizations")
        .update({ name: "Alpha Learning Collective" })
        .eq("id", ORG_A)
        .select("id");
      expect(renameError).toBeNull();
      expect(renamed?.length).toBe(1);

      // …but slug changes are rejected (column-level grant excludes slug)
      const { error: slugError } = await alphaOwner
        .from("organizations")
        .update({ slug: "new-slug" })
        .eq("id", ORG_A);
      expect(slugError).not.toBeNull();

      // reserved slugs are blocked for academies even for permitted creators
      const { error: reservedError } = await alphaOwner
        .from("academies")
        .insert({
          organization_id: ORG_A,
          name: "Admin Academy",
          slug: "admin",
        });
      expect(reservedError?.message).toMatch(/reserved/i);
    });
  },
);

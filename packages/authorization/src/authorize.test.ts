import { describe, expect, test } from "vitest";
import { can, effectiveOrgPermissions, type ActorGrants } from "./authorize";

const ACADEMY = "00000000-0000-4000-8000-0000000000aa";
const OTHER_ACADEMY = "00000000-0000-4000-8000-0000000000bb";

const activeWith = (grants: ActorGrants["grants"]): ActorGrants => ({
  membershipStatus: "active",
  grants,
});

describe("can() — deny-by-default permission resolution", () => {
  test("denies everything without grants", () => {
    expect(can(activeWith([]), "org.manage")).toBe(false);
    expect(can(activeWith([]), "progress.view.own")).toBe(false);
  });

  test("org-wide grants qualify everywhere in the org", () => {
    const actor = activeWith([
      { permissions: ["academy.manage"], academyId: null },
    ]);
    expect(can(actor, "academy.manage")).toBe(true);
    expect(can(actor, "academy.manage", { academyId: ACADEMY })).toBe(true);
    expect(can(actor, "org.manage")).toBe(false); // only what was granted
  });

  test("academy-scoped grants qualify only for their academy", () => {
    const actor = activeWith([
      { permissions: ["academy.manage"], academyId: ACADEMY },
    ]);
    expect(can(actor, "academy.manage", { academyId: ACADEMY })).toBe(true);
    expect(can(actor, "academy.manage", { academyId: OTHER_ACADEMY })).toBe(
      false,
    );
    // no academy context => scoped grant does not confer org-wide power
    expect(can(actor, "academy.manage")).toBe(false);
  });

  test("suspended, removed, and invited memberships hold zero permissions", () => {
    const grants = [{ permissions: ["org.manage"], academyId: null }] as const;
    for (const status of ["suspended", "removed", "invited"] as const) {
      const actor: ActorGrants = {
        membershipStatus: status,
        grants: [...grants],
      };
      expect(can(actor, "org.manage")).toBe(false);
      expect(effectiveOrgPermissions(actor).size).toBe(0);
    }
  });

  test("role-name shortcuts do not exist: only permission codes decide", () => {
    // an "owner-looking" actor with an empty bundle can do nothing
    const impostor = activeWith([{ permissions: [], academyId: null }]);
    expect(can(impostor, "org.members.manage")).toBe(false);

    // seeded matrix semantics: author authors but never publishes/administers
    const author = activeWith([
      {
        permissions: [
          "content.view_draft",
          "content.author",
          "paths.manage",
          "assessment.author",
          "enrollment.self",
          "progress.view.own",
          "ai.author.use",
        ],
        academyId: null,
      },
    ]);
    expect(can(author, "content.author")).toBe(true);
    expect(can(author, "content.publish")).toBe(false);
    expect(can(author, "org.roles.manage")).toBe(false);

    // reviewer publishes but cannot touch security settings
    const reviewer = activeWith([
      {
        permissions: [
          "content.view_draft",
          "content.publish",
          "assessment.grade",
          "enrollment.self",
          "progress.view.own",
        ],
        academyId: null,
      },
    ]);
    expect(can(reviewer, "content.publish")).toBe(true);
    expect(can(reviewer, "org.manage")).toBe(false);
    expect(can(reviewer, "org.roles.manage")).toBe(false);
  });

  test("multiple grants union; effectiveOrgPermissions excludes scoped grants", () => {
    const actor = activeWith([
      {
        permissions: ["enrollment.self", "progress.view.own"],
        academyId: null,
      },
      { permissions: ["assessment.grade"], academyId: ACADEMY },
    ]);
    expect(can(actor, "enrollment.self")).toBe(true);
    expect(can(actor, "assessment.grade", { academyId: ACADEMY })).toBe(true);
    expect(can(actor, "assessment.grade")).toBe(false);

    const orgWide = effectiveOrgPermissions(actor);
    expect(orgWide.has("enrollment.self")).toBe(true);
    expect(orgWide.has("assessment.grade")).toBe(false);
  });
});

describe("branding permissions (Phase 1B)", () => {
  const managerOnly = activeWith([
    { permissions: ["org.branding.manage"], academyId: null },
  ]);
  const publisher = activeWith([
    {
      permissions: ["org.branding.manage", "org.branding.publish"],
      academyId: null,
    },
  ]);

  test("manage allows editing but never publishing", () => {
    expect(can(managerOnly, "org.branding.manage")).toBe(true);
    expect(can(managerOnly, "org.branding.publish")).toBe(false);
  });

  test("publish is a distinct grant", () => {
    expect(can(publisher, "org.branding.publish")).toBe(true);
  });

  test("learner-shaped and academy-scoped grants confer no branding power", () => {
    const learner = activeWith([
      {
        permissions: ["enrollment.self", "progress.view.own"],
        academyId: null,
      },
    ]);
    expect(can(learner, "org.branding.manage")).toBe(false);
    expect(can(learner, "org.branding.publish")).toBe(false);

    // branding is org-level: an academy-scoped grant must not qualify
    const scoped = activeWith([
      { permissions: ["org.branding.manage"], academyId: ACADEMY },
    ]);
    expect(can(scoped, "org.branding.manage")).toBe(false);
  });
});

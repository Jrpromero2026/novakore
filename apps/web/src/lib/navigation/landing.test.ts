import { describe, expect, test } from "vitest";
import { landingPathFor } from "./landing";

const ORG = "builtforher";

describe("landingPathFor", () => {
  test("a learner goes to the Academy, not the admin workspace", () => {
    // The permissions the shipped learner role actually carries. Neither
    // opens an admin destination, so /admin would show one navigation item
    // and an empty dashboard.
    expect(landingPathFor(ORG, ["enrollment.self", "progress.view.own"])).toBe(
      `/${ORG}/learn`,
    );
  });

  test("a member with no permissions at all goes to the Academy", () => {
    expect(landingPathFor(ORG, [])).toBe(`/${ORG}/learn`);
  });

  test("an owner goes to the admin workspace", () => {
    expect(landingPathFor(ORG, ["org.manage", "content.view_draft"])).toBe(
      `/${ORG}/admin`,
    );
  });

  test("an observer goes to the admin workspace", () => {
    // Holds analytics.view, which opens Intelligence. The rule is about
    // whether anything is reachable, not about seniority — someone who only
    // reads reports still belongs in the workspace that has them.
    expect(
      landingPathFor(ORG, ["analytics.view", "progress.view.others"]),
    ).toBe(`/${ORG}/admin`);
  });

  test("a single authoring permission is enough", () => {
    // The boundary case: exactly one permission that opens exactly one
    // destination still means the admin workspace has something in it.
    expect(landingPathFor(ORG, ["content.view_draft"])).toBe(`/${ORG}/admin`);
  });

  test("the slug is carried through verbatim", () => {
    expect(landingPathFor("g3-performance", [])).toBe("/g3-performance/learn");
  });
});

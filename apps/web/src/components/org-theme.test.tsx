import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { OrgThemeStyle, orgThemeDataAttributes } from "./org-theme";

describe("tenant theme application (CSS-injection boundary)", () => {
  test("valid hex accents are emitted as custom properties", () => {
    const { container } = render(
      <OrgThemeStyle
        theme={{
          accent_light: "#6d28d9",
          accent_dark: "#a78bfa",
          font_family: "system",
          radius_scale: "medium",
        }}
      />,
    );
    const css = container.querySelector("style")?.textContent ?? "";
    expect(css).toContain("--accent-light-override:#6d28d9");
    expect(css).toContain("--accent-dark-override:#a78bfa");
  });

  test("malicious values are replaced by platform defaults — never emitted", () => {
    const attack = "#fff};body{background:url(https://evil.example/x)}";
    const { container } = render(
      <OrgThemeStyle
        theme={{
          accent_light: attack,
          accent_dark: "red;}</style><script>alert(1)</script>",
          font_family: "system",
          radius_scale: "medium",
        }}
      />,
    );
    const css = container.querySelector("style")?.textContent ?? "";
    expect(css).not.toContain("evil.example");
    expect(css).not.toContain("script");
    expect(css).toContain("--accent-light-override:#4f46e5"); // platform default
    expect(css).toContain("--accent-dark-override:#818cf8");
  });

  test("unknown font/radius values fall back to safe defaults", () => {
    const attrs = orgThemeDataAttributes({
      accent_light: "#000000",
      accent_dark: "#ffffff",
      font_family: "papyrus'><img src=x>",
      radius_scale: "9999px",
    });
    expect(attrs["data-font"]).toBe("geist");
    expect(attrs["data-radius"]).toBe("medium");
  });
});

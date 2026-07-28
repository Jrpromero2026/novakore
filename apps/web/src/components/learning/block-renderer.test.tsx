import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { tenantThemeSchema } from "@novakore/domain";
import type { ContentBlock } from "@novakore/domain";
import { BlockList, renderInline } from "./block-renderer";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("block renderer (escape-first, no HTML execution)", () => {
  test("renders the safe inline subset without HTML", () => {
    render(
      <p>
        {renderInline(
          "Plain **bold** and *italic* with a [link](https://example.com/x)",
        )}
      </p>,
    );
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("italic").tagName).toBe("EM");
    const link = screen.getByRole("link", { name: "link" });
    expect(link).toHaveAttribute("href", "https://example.com/x");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  test("HTML in stored text renders as inert text — never as markup", () => {
    const attack: ContentBlock = {
      id: id(1),
      type: "rich_text",
      schemaVersion: 1,
      position: "a0",
      data: { text: "<script>alert(1)</script><img src=x onerror=alert(2)>" },
    };
    const { container } = render(<BlockList blocks={[attack]} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(
      screen.getByText(/<script>alert\(1\)<\/script>/),
    ).toBeInTheDocument();
  });

  test("javascript: links never become anchors", () => {
    render(<p>{renderInline("[click me](javascript:alert(1))")}</p>);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(/javascript:alert\(1\)/)).toBeInTheDocument();
  });

  test("video renders as an external card, not an iframe", () => {
    const video: ContentBlock = {
      id: id(2),
      type: "video",
      schemaVersion: 1,
      position: "a0",
      data: {
        url: "https://videos.example.com/intro",
        title: "Intro Video",
        durationMinutes: 5,
      },
    };
    const { container } = render(<BlockList blocks={[video]} />);
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByRole("link", { name: /intro video/i })).toHaveAttribute(
      "href",
      "https://videos.example.com/intro",
    );
  });

  test("blocks render in position order with headings preserving hierarchy", () => {
    const blocks: ContentBlock[] = [
      {
        id: id(3),
        type: "heading",
        schemaVersion: 1,
        position: "a1",
        data: { text: "Second", level: 3 },
      },
      {
        id: id(4),
        type: "heading",
        schemaVersion: 1,
        position: "a0",
        data: { text: "First", level: 2 },
      },
    ];
    render(<BlockList blocks={blocks} />);
    const headings = screen.getAllByRole("heading");
    expect(headings[0]).toHaveTextContent("First");
    expect(headings[0]!.tagName).toBe("H2");
    expect(headings[1]).toHaveTextContent("Second");
    expect(headings[1]!.tagName).toBe("H3");
  });

  test("tenant terminology never alters canonical block schemas", () => {
    // parsing a theme (presentation layer) has no effect on block validation
    const theme = tenantThemeSchema.parse({
      schemaVersion: 1,
      colors: { accentLight: "#be185d", accentDark: "#f472b6" },
    });
    expect(theme).toBeTruthy();
    const checklist: ContentBlock = {
      id: id(5),
      type: "checklist",
      schemaVersion: 1,
      position: "a0",
      data: { items: [{ id: id(6), text: "Sessions stay canonical lessons" }] },
    };
    render(<BlockList blocks={[checklist]} />);
    expect(
      screen.getByText(/sessions stay canonical lessons/i),
    ).toBeInTheDocument();
  });
});

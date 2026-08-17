import { describe, expect, test } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  pageHref,
  pageMeta,
  parsePage,
  rangeFor,
} from "./pagination";

describe("parsePage", () => {
  test("absent, malformed, or out-of-range values fall back to page 1", () => {
    for (const raw of [undefined, "", "abc", "0", "-3", "1.5", "NaN"]) {
      expect(parsePage(raw), `for ${JSON.stringify(raw)}`).toBe(1);
    }
  });

  test("reads a real page number, including from a repeated param", () => {
    expect(parsePage("4")).toBe(4);
    expect(parsePage(["3", "9"])).toBe(3);
  });
});

describe("rangeFor", () => {
  test("page 1 starts at zero and spans one page size", () => {
    expect(rangeFor(1)).toEqual({ from: 0, to: DEFAULT_PAGE_SIZE - 1 });
  });

  test("later pages are contiguous with no gaps or overlaps", () => {
    const a = rangeFor(1, 10);
    const b = rangeFor(2, 10);
    const c = rangeFor(3, 10);
    expect(a).toEqual({ from: 0, to: 9 });
    expect(b).toEqual({ from: 10, to: 19 });
    expect(c).toEqual({ from: 20, to: 29 });
    expect(b.from).toBe(a.to + 1);
    expect(c.from).toBe(b.to + 1);
  });
});

describe("pageMeta", () => {
  test("an empty collection reports zero rather than a phantom first row", () => {
    const meta = pageMeta(1, 0, 10);
    expect(meta).toMatchObject({
      total: 0,
      pageCount: 1,
      showingFrom: 0,
      showingTo: 0,
      hasPrev: false,
      hasNext: false,
    });
  });

  test("a partial final page reports the true last row, not the page bound", () => {
    const meta = pageMeta(3, 22, 10);
    expect(meta).toMatchObject({
      page: 3,
      showingFrom: 21,
      showingTo: 22,
      hasNext: false,
      hasPrev: true,
    });
  });

  test("an over-range page clamps to the last real page", () => {
    const meta = pageMeta(99, 22, 10);
    expect(meta.page).toBe(3);
    expect(meta.from).toBe(20);
    expect(meta.hasNext).toBe(false);
  });

  test("every row is reachable — the pages tile the collection exactly", () => {
    const total = 83;
    const size = 25;
    const covered = new Set<number>();
    const { pageCount } = pageMeta(1, total, size);
    for (let page = 1; page <= pageCount; page += 1) {
      const meta = pageMeta(page, total, size);
      for (let row = meta.showingFrom; row <= meta.showingTo; row += 1) {
        covered.add(row);
      }
    }
    // 1..83 with no holes and nothing beyond the end.
    expect(covered.size).toBe(total);
    expect(Math.min(...covered)).toBe(1);
    expect(Math.max(...covered)).toBe(total);
  });
});

describe("pageHref", () => {
  const base = "/acme/admin/credentials";

  test("page 1 is the canonical bare URL", () => {
    expect(pageHref(base, { page: "3" }, "page", 1)).toBe(base);
  });

  test("other filters and a sibling list's page survive", () => {
    const href = pageHref(
      base,
      { status: "issued", q: "strong", issued: "2" },
      "issued",
      3,
    );
    expect(href.startsWith(`${base}?`)).toBe(true);
    const query = new URLSearchParams(href.split("?")[1]);
    expect(query.get("status")).toBe("issued");
    expect(query.get("q")).toBe("strong");
    expect(query.get("issued")).toBe("3");
  });

  test("undefined values are dropped and repeated params preserved", () => {
    const href = pageHref(
      base,
      { ghost: undefined, tag: ["a", "b"] },
      "page",
      2,
    );
    const query = new URLSearchParams(href.split("?")[1]);
    expect(query.has("ghost")).toBe(false);
    expect(query.getAll("tag")).toEqual(["a", "b"]);
    expect(query.get("page")).toBe("2");
  });
});

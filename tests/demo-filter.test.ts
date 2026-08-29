import { describe, expect, it } from "vitest";
import { excludeDemo } from "../src/lib/demo-filter.js";

describe("excludeDemo", () => {
  it("excludes demo: true by default", () => {
    const items = [
      { id: "a", demo: true },
      { id: "b" },
      { id: "c", demo: false },
    ];
    expect(excludeDemo(items, false).map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("includes demo when includeDemo is true", () => {
    const items = [{ id: "a", demo: true }, { id: "b" }];
    expect(excludeDemo(items, true).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("treats demo undefined as non-demo", () => {
    const items = [{ id: "only" }];
    expect(excludeDemo(items, false)).toHaveLength(1);
  });
});

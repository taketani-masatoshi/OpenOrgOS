import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const backlogPath = join(root, "docs", "framework-backlog.md");

describe("framework backlog (SKEL-100)", () => {
  it("framework-backlog.md exists with DoD D1-D10", () => {
    expect(existsSync(backlogPath)).toBe(true);
    const text = readFileSync(backlogPath, "utf-8");
    for (let i = 1; i <= 10; i++) {
      expect(text).toContain(`D${i}`);
    }
    expect(text).toContain("SKEL-100-A1");
    expect(text).toMatch(/SKEL-100-A1.*\[x\]/);
    expect(text).toContain("骨格 v2 100%");
    expect(text).toMatch(/SKEL-100-C2.*\[x\]/);
  });

  it("framework-executive-notes.md exists", () => {
    expect(existsSync(join(root, "docs", "framework-executive-notes.md"))).toBe(true);
  });
});

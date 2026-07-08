import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const backlogPath = join(root, "docs", "framework-backlog.md");

describe("framework backlog (SKEL-100 + OS-100)", () => {
  it("framework-backlog.md exists with DoD and OS-100 phases", () => {
    expect(existsSync(backlogPath)).toBe(true);
    const text = readFileSync(backlogPath, "utf-8");
    expect(text).toContain("OS-100");
    expect(text).toMatch(/OS-100-E1.*\[x\]/);
    expect(text).toMatch(/OS-100-H2.*\[x\]/);
    expect(text).toContain("Phase E");
  });

  it("framework-backlog Phase I Phase 2 complete", () => {
    const text = readFileSync(backlogPath, "utf-8");
    expect(text).toMatch(/OS-100-I1.*\[x\]/);
    expect(text).toMatch(/OS-100-I5.*\[x\]/);
    expect(text).toContain("Phase I");
  });

  it("framework-backlog Phase J Phase 3 complete", () => {
    const text = readFileSync(backlogPath, "utf-8");
    expect(text).toMatch(/OS-100-J1.*\[x\]/);
    expect(text).toMatch(/OS-100-J5.*\[x\]/);
    expect(text).toContain("Phase J");
  });

  it("framework-executive-notes.md exists", () => {
    expect(existsSync(join(root, "docs", "framework-executive-notes.md"))).toBe(true);
  });
});

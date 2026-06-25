import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getCliSkills, loadSkillRegistry } from "../src/lib/skill-registry.js";
import { loadModuleReadiness } from "../src/lib/module-readiness.js";

const root = join(import.meta.dirname, "..");

describe("OS-100 framework", () => {
  it("canonical spec + v0.6 history exist", () => {
    expect(existsSync(join(root, "docs", "spec.md"))).toBe(true);
    expect(existsSync(join(root, "docs", "spec", "history", "spec-v0.6.md"))).toBe(true);
  });

  it("framework-assessment §9 OS-100", () => {
    const text = readFileSync(join(root, "docs", "framework-assessment.md"), "utf-8");
    expect(text).toContain("## 9. 製品ルーブリック");
    expect(text).toContain("OS-1");
    expect(text).toContain("OS-10b");
    expect(text).toMatch(/99\/100/);
  });

  it("framework-backlog Phase E-H complete", () => {
    const text = readFileSync(join(root, "docs", "framework-backlog.md"), "utf-8");
    expect(text).toMatch(/OS-100-E1.*\[x\]/);
    expect(text).toMatch(/OS-100-H2.*\[x\]/);
    expect(text).toContain("Phase E");
    expect(text).toContain("Phase H");
  });

  it("production_ready modules >= 5", () => {
    const readiness = loadModuleReadiness();
    const count = [...readiness.values()].filter((m) => m.tier === "production_ready").length;
    expect(count).toBeGreaterThanOrEqual(5);
  });

  it("cli skills >= 12", () => {
    expect(getCliSkills().length).toBeGreaterThanOrEqual(12);
    expect(loadSkillRegistry().length).toBeGreaterThanOrEqual(17);
  });
});

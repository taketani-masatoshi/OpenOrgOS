import { describe, it, expect } from "vitest";
import { loadSkillRegistry, validateSkillRegistryFiles, getCliSkills } from "../src/lib/skill-registry.js";

describe("skill registry", () => {
  it("loads registry with cli and cursor-only skills", () => {
    const skills = loadSkillRegistry();
    expect(skills.length).toBeGreaterThanOrEqual(14);
    expect(getCliSkills().length).toBeGreaterThanOrEqual(7);
    expect(skills.some((s) => s.runtime === "cursor-only")).toBe(true);
  });

  it("registry files exist on disk", () => {
    expect(validateSkillRegistryFiles()).toEqual([]);
  });
});

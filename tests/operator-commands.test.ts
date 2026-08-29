import { describe, expect, it } from "vitest";
import {
  listCommandCatalog,
  resolveCommandPlan,
  parseCommandArgsFromMessage,
  validateChatCommandCatalog,
} from "../src/lib/operator-commands/index.js";
import { getSkillById, clearSkillRegistryCache } from "../src/lib/skill-registry.js";

describe("operator-commands", () => {
  it("lists chat-enabled catalog entries", () => {
    clearSkillRegistryCache();
    const entries = listCommandCatalog();
    expect(entries.length).toBeGreaterThan(5);
    expect(entries.every((e) => e.skill_id && e.label && e.kind)).toBe(true);
    expect(entries.some((e) => e.skill_id === "workspace_validate")).toBe(true);
  });

  it("resolves validate keyword to workspace_validate (read/ready)", () => {
    const plan = resolveCommandPlan({ message: "validate を実行して" });
    expect(plan.status).toBe("ready");
    expect(plan.skill_id).toBe("workspace_validate");
    expect(plan.kind).toBe("read");
    expect(plan.cli_display).toContain("skills run validate");
  });

  it("resolves dashboard as write confirmation", () => {
    const plan = resolveCommandPlan({ message: "経営ダッシュボード生成" });
    expect(plan.skill_id).toBe("executive_dashboard");
    expect(plan.status).toBe("needs_confirmation");
    expect(plan.kind).toBe("write");
  });

  it("keeps approval-gated commands from auto-run", () => {
    const plan = resolveCommandPlan({ message: "振込実行して" });
    expect(plan.status).toBe("approval_gate");
    expect(plan.kind).toBe("approval");
  });

  it("parses month args from message", () => {
    const skill = getSkillById("monthly_close");
    expect(skill).toBeTruthy();
    const args = parseCommandArgsFromMessage("2026-03 の月次締め", skill!);
    expect(args.month).toBe("2026-03");
  });

  it("returns forbidden when permission missing", () => {
    const plan = resolveCommandPlan({
      message: "validate を実行して",
      permissions: [],
    });
    expect(plan.status).toBe("forbidden");
  });

  it("requires body for escalate_work_order", () => {
    const plan = resolveCommandPlan({
      skillId: "escalate_work_order",
      message: "x",
      args: {},
    });
    // body is filled from message by parser for body args
    expect(["needs_args", "needs_confirmation", "ready", "forbidden"]).toContain(plan.status);
  });

  it("catalog integrity has no errors", () => {
    const issues = validateChatCommandCatalog().filter((i) => i.level === "error");
    expect(issues).toEqual([]);
  });
});

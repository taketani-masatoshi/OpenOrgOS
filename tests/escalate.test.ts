import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDocsDir } from "../src/lib/utils.js";
import {
  agentPromptRef,
  completeWorkOrder,
  formatAgentImplementationPrompt,
  listWorkOrders,
  nextWorkOrderIds,
  parseEscalationText,
  planWorkOrders,
  regenerateWorkOrderPrompts,
  runEscalation,
} from "../src/lib/escalate.js";
import { loadHandoff } from "../src/lib/routing.js";
import { handoffSchema } from "../schemas/routing.js";

describe("escalate parsing", () => {
  it("parses structured escalation text", () => {
    const input = parseEscalationText(`**件名:** Git 機密範囲
**背景:** executive 外化
**実装要件:** registry 更新
**優先度:** P1`);
    expect(input.subject).toBe("Git 機密範囲");
    expect(input.background).toContain("executive");
    expect(input.priority).toBe("P1");
  });
});

describe("escalate plan", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("plans compliance route for privacy keywords", () => {
    const plan = planWorkOrders({
      subject: "個情法 Git 管理",
      requirements: "classification-registry RES-EXEC",
      path: "data/classification-registry.yaml",
    });
    expect(plan.agents.length).toBeGreaterThan(0);
    expect(plan.matches.some((m) => m.eligible)).toBe(true);
  });

  it("generates sequential IMP ids", () => {
    const ids = nextWorkOrderIds(3);
    expect(ids).toHaveLength(3);
    expect(ids[0]).toMatch(/^IMP-\d{8}-/);
    expect(ids[1]).not.toBe(ids[0]);
  });
});

describe("escalate run", () => {
  const queueDir = join(getDocsDir(), "reports", "routing-queue");
  const created: string[] = [];

  beforeEach(() => {
    setTenantId("mal");
  });

  afterEach(() => {
    for (const id of created) {
      for (const ext of [".yaml", ".md"]) {
        const p = join(queueDir, `${id}${ext}`);
        if (existsSync(p)) rmSync(p);
      }
      const promptDir = join(queueDir, "prompts");
      if (existsSync(promptDir)) {
        for (const f of ["yaml", "md"]) {
          const glob = join(promptDir, `${id}_`);
          // remove matching prompts
        }
      }
    }
    // cleanup prompts
    const promptsDir = join(queueDir, "prompts");
    if (existsSync(promptsDir)) {
      for (const id of created) {
        for (const agent of ["compliance", "finance", "operations", "executive_steward"]) {
          const p = join(promptsDir, `${id}_${agent}.md`);
          if (existsSync(p)) rmSync(p);
        }
      }
    }
  });

  it("creates implement work order with agent prompt", () => {
    const result = runEscalation({
      fromAgent: "executive_steward",
      input: {
        subject: "契約期限 CLI 確認",
        requirements: "契約期限を確認したい",
        acceptance_criteria: ["npm run check"],
      },
    });

    expect(result.workOrders.length).toBeGreaterThan(0);
    const wo = result.workOrders.find((w) => !w.child_ids)!;
    expect(wo.task_type).toBe("implement");
    expect(wo.id).toMatch(/^IMP-/);
    expect(wo.mode).toBe("implement");
    created.push(wo.id);

    expect(existsSync(join(queueDir, `${wo.id}.yaml`))).toBe(true);
    expect(existsSync(join(queueDir, `${wo.id}.md`))).toBe(true);

    const prompt = formatAgentImplementationPrompt(wo);
    expect(prompt).toContain(agentPromptRef(wo.to_agent));
    expect(prompt).toContain("npm run steward -- escalate complete");
  });

  it("completes work order and loads extended schema", () => {
    const result = runEscalation({
      input: {
        subject: "月次締め skill",
        requirements: "月次締めレポート",
      },
    });
    const wo = result.workOrders.find((w) => !w.child_ids)!;
    created.push(wo.id);

    const completed = completeWorkOrder(wo.id, "done");
    expect(completed.status).toBe("completed");
    expect(completed.completion_notes).toBe("done");

    const loaded = loadHandoff(wo.id);
    expect(handoffSchema.parse(loaded).task_type).toBe("implement");
  });

  it("regenerates prompts from id", () => {
    const result = runEscalation({
      input: {
        subject: "許認可チェック",
        requirements: "許認可 期限 コンプライアンス",
      },
    });
    const wo = result.workOrders.find((w) => !w.child_ids)!;
    created.push(wo.id);

    const paths = regenerateWorkOrderPrompts(wo.id);
    expect(paths.length).toBe(1);
    expect(existsSync(paths[0]!)).toBe(true);
  });

  it("lists implement work orders", () => {
    const before = listWorkOrders("pending").length;
    const result = runEscalation({
      input: { subject: "inbox 処理", requirements: "inbox 未処理" },
    });
    for (const w of result.workOrders) created.push(w.id);
    expect(listWorkOrders("pending").length).toBeGreaterThanOrEqual(before + 1);
  });
});

describe("handoff schema backward compat", () => {
  it("defaults task_type to consult for legacy shape", () => {
    const legacy = handoffSchema.parse({
      id: "HO-20260101-abc",
      created_at: "2026-01-01T00:00:00Z",
      from_agent: "steward",
      to_agent: "finance",
      access: { allowed: true, reason: "ok" },
      context: {},
      status: "pending",
    });
    expect(legacy.task_type).toBe("consult");
    expect(legacy.deliverables).toEqual([]);
  });
});

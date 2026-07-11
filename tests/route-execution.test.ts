import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handoffSchema, type Handoff } from "../schemas/routing.js";
import {
  evaluateRouteExecution,
  executeRouteHandoff,
  type InvocationResolver,
} from "../src/lib/route-execution.js";
import type { SkillInvocationResolution } from "../src/lib/skill-invocation.js";

function handoff(overrides: Partial<Handoff> = {}): Handoff {
  return handoffSchema.parse({
    id: "HO-20260711-test",
    created_at: "2026-07-11T00:00:00.000Z",
    from_agent: "steward",
    to_agent: "secretary",
    skill: "test_skill",
    mode: "auto",
    access: { allowed: true, reason: "ok" },
    context: {},
    status: "pending",
    ...overrides,
  });
}

function readyResolution(handler: () => void | Promise<void>): SkillInvocationResolution {
  return {
    status: "ready",
    execution: "handler",
    skill: {
      id: "test_skill",
      file: "test.md",
      runtime: "cli",
      cli_command: "test",
      handler: "test_skill",
      agent_id: "secretary",
      description: "test",
      skillDir: "/tmp",
      skillDirRel: "steward/core/skills",
    },
    handler,
    argv: ["skills", "run", "test"],
  };
}

describe("standard route execution", () => {
  beforeEach(() => {
    process.env.ORGOS_AUDIT_LOG_DISABLED = "1";
    process.env.ORGOS_AUDIT_BRIDGE_DISABLED = "1";
  });

  afterEach(() => {
    delete process.env.ORGOS_AUDIT_LOG_DISABLED;
    delete process.env.ORGOS_AUDIT_BRIDGE_DISABLED;
  });

  it("keeps suggest non-executing and sends implement work to a Work Order", () => {
    const resolve = vi.fn(() => readyResolution(vi.fn())) as InvocationResolver;

    expect(evaluateRouteExecution(handoff(), "suggest", resolve).action).toBe("suggest");
    const implement = evaluateRouteExecution(handoff(), "implement", resolve);

    expect(implement.action).toBe("work_order");
    expect(implement.handoff.invocation?.status).toBe("work_order");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("sends agent runtime to a Work Order and records missing arguments", () => {
    const agentResolver: InvocationResolver = () => ({
      status: "agent",
      execution: "agent",
      skill: {
        id: "test_skill",
        file: "test.md",
        runtime: "agent",
        agent_id: "secretary",
        description: "test",
        skillDir: "/tmp",
        skillDirRel: "steward/core/skills",
      },
      reason: "test_skill uses agent runtime",
    });
    expect(evaluateRouteExecution(handoff(), "auto", agentResolver).action).toBe("work_order");

    const missingResolver: InvocationResolver = () => ({
      status: "deferred",
      execution: "handler",
      skill: {
        id: "test_skill",
        file: "test.md",
        runtime: "cli",
        cli_command: "test",
        handler: "test_skill",
        required_options: ["answers"],
        agent_id: "secretary",
        description: "test",
        skillDir: "/tmp",
        skillDirRel: "steward/core/skills",
      },
      argv: ["skills", "run", "test"],
      missingOptions: ["answers"],
      reason: "missing required options: answers",
    });
    const missing = evaluateRouteExecution(handoff(), "auto", missingResolver);
    expect(missing.action).toBe("deferred");
    expect(missing.handoff.invocation?.required_arguments).toEqual(["answers"]);
    expect(missing.handoff.invocation?.missing_arguments).toEqual(["answers"]);
  });

  it("never auto-executes Wire transmission or approval operations", async () => {
    const resolve = vi.fn(() => readyResolution(vi.fn())) as InvocationResolver;
    const wire = await executeRouteHandoff(
      handoff({ skill: "protocol_notice_approve" }),
      "auto",
      resolve
    );
    const approval = await executeRouteHandoff(
      handoff({ skill: "approval_approve" }),
      "auto",
      resolve
    );

    expect(wire.action).toBe("human_approval");
    expect(approval.action).toBe("human_approval");
    expect(wire.handoff.status).toBe("pending");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("transitions only after success and is idempotent after dispatch", async () => {
    const handler = vi.fn();
    const resolve: InvocationResolver = () => readyResolution(handler);

    const first = await executeRouteHandoff(handoff(), "auto", resolve);
    const second = await executeRouteHandoff(first.handoff, "auto", resolve);

    expect(first.handoff.status).toBe("dispatched");
    expect(first.handoff.invocation?.status).toBe("succeeded");
    expect(first.handoff.invocation?.attempts).toBe(1);
    expect(second.action).toBe("noop");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("records invocation start and result audit events", async () => {
    const dir = mkdtempSync(join(tmpdir(), "orgos-route-audit-"));
    const auditPath = join(dir, "audit.jsonl");
    delete process.env.ORGOS_AUDIT_LOG_DISABLED;
    process.env.ORGOS_AUDIT_LOG = auditPath;

    try {
      await executeRouteHandoff(handoff(), "auto", () => readyResolution(vi.fn()));
      const details = readFileSync(auditPath, "utf-8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { detail: string })
        .map((event) => event.detail);

      expect(details).toContain("invocation_started:1:test_skill");
      expect(details).toContain("invocation_succeeded:1:test_skill");
    } finally {
      delete process.env.ORGOS_AUDIT_LOG;
      process.env.ORGOS_AUDIT_LOG_DISABLED = "1";
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps state pending and stores failure details", async () => {
    const resolve: InvocationResolver = () =>
      readyResolution(() => {
        throw new Error("deterministic failure");
      });

    const result = await executeRouteHandoff(handoff(), "auto", resolve);

    expect(result.action).toBe("failed");
    expect(result.handoff.status).toBe("pending");
    expect(result.handoff.invocation?.status).toBe("failed");
    expect(result.handoff.invocation?.failure_reason).toBe("deterministic failure");
    expect(result.handoff.invocation?.attempts).toBe(1);
  });
});

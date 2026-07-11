import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  ackRelay,
  createAgentOrder,
  isFieldAgent,
  listCooRelayInbox,
  listStewardInbox,
  missionsDir,
  submitAgentReport,
} from "../src/lib/agent-reporting.js";
import { runAgentPulse } from "../src/lib/agent-pulse.js";
import { completeWorkOrder, runEscalation } from "../src/lib/escalate.js";
import { buildTodayContext } from "../src/lib/steward-chat/today-context.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("agent reporting chain", () => {
  beforeEach(() => {
    setTenantId("mal");
    const dir = missionsDir();
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  afterEach(() => {
    const dir = missionsDir();
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it("treats core agents and extensions as field agents (not coo/steward/advisor)", () => {
    expect(isFieldAgent("finance")).toBe(true);
    expect(isFieldAgent("engineering")).toBe(true);
    expect(isFieldAgent("coo")).toBe(false);
    expect(isFieldAgent("executive_steward")).toBe(false);
    expect(isFieldAgent("platform_guide")).toBe(false);
  });

  it("rejects implement orders to platform_guide advisor", () => {
    expect(() =>
      createAgentOrder({
        toAgent: "platform_guide",
        subject: "platform 実装",
        fromActor: "executive_steward",
      })
    ).toThrow(/not a field agent/);
  });

  it("creates order → report → COO forward → Steward ack", () => {
    const order = createAgentOrder({
      toAgent: "finance",
      subject: "月次予実レビュー",
      fromActor: "executive_steward",
    });
    expect(order.relay.coo.status).toBe("pending");
    expect(listCooRelayInbox().some((m) => m.id === order.id)).toBe(true);

    const reported = submitAgentReport({
      agentId: "finance",
      missionId: order.id,
      summary: "予実差異なし",
      autoForward: false,
    });
    expect(reported.status).toBe("completed");
    expect(reported.report?.summary).toContain("予実");

    const forwarded = ackRelay({ missionId: order.id, role: "coo", forward: true });
    expect(forwarded.relay.coo.status).toBe("forwarded");
    expect(listStewardInbox().some((m) => m.id === order.id)).toBe(true);

    const done = ackRelay({ missionId: order.id, role: "steward", notes: "確認済" });
    expect(done.relay.steward.status).toBe("ack");
    expect(listStewardInbox().some((m) => m.id === order.id)).toBe(false);
  });

  it("auto-forwards pulse reports to Steward inbox", () => {
    const path = runAgentPulse("compliance", { suffix: "chain-test" });
    expect(existsSync(path)).toBe(true);
    const inbox = listStewardInbox().filter((m) => m.field_agent === "compliance");
    expect(inbox.length).toBeGreaterThan(0);
    expect(inbox[0]!.type).toBe("pulse_report");
    expect(inbox[0]!.relay.coo.status).toBe("forwarded");
  });

  it("links work order completion into reporting chain", () => {
    const result = runEscalation({
      fromAgent: "executive_steward",
      input: {
        subject: "報告チェーンテスト",
        requirements: "classification-registry 確認",
        path: "data/classification-registry.yaml",
        tenant: "mal",
      },
    });
    expect(result.workOrders.length).toBeGreaterThan(0);
    const child = result.workOrders.find((w) => w.to_agent !== "executive_steward");
    expect(child).toBeDefined();

    completeWorkOrder(child!.id, "実装完了");
    const stewardItems = listStewardInbox().filter((m) => m.order?.linked_work_order_id === child!.id);
    expect(stewardItems.length).toBeGreaterThan(0);
  });

  it("surfaces relay counts in Today context", () => {
    createAgentOrder({ toAgent: "operations", subject: "inbox 路由確認" });
    submitAgentReport({
      agentId: "operations",
      summary: "滞留 2 件",
      autoForward: true,
    });
    const ctx = buildTodayContext();
    expect(ctx.agent_steward_inbox_count).toBeGreaterThan(0);
    expect(ctx.agent_steward_inbox[0]?.field_agent).toBe("operations");
  });
});

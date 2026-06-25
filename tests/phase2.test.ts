import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { pushQueueEvent, loadQueueEvents, queueEventsPath } from "../src/lib/queue-db.js";
import { buildDispatchManifest, formatDispatchPlan } from "../src/lib/agent-dispatch.js";
import { ingestWebhook, formatWebhookConfig } from "../src/lib/webhook.js";
import { runEscalation } from "../src/lib/escalate.js";
import { mergeWorkOrderResults, registerWorkOrderResult } from "../src/lib/work-order-merge.js";
import { loadHandoff } from "../src/lib/routing.js";
import { getDocsDir } from "../src/lib/utils.js";

describe("Phase 2 queue", () => {
  beforeEach(() => {
    setTenantId("demo");
    const p = queueEventsPath();
    if (existsSync(p)) rmSync(p);
  });

  it("pushes and loads queue events", () => {
    const e = pushQueueEvent({ type: "work_order_created", ref: "IMP-test" });
    expect(loadQueueEvents().length).toBe(1);
    expect(e.id).toMatch(/^Q-/);
  });

  it("ingests webhook payload", () => {
    const r = ingestWebhook({ event: "work_order_complete", ref: "IMP-1", payload: { ok: true } });
    expect(r.ok).toBe(true);
    expect(loadQueueEvents({ type: "webhook_received" }).length).toBe(1);
  });

  it("shows webhook config", () => {
    expect(formatWebhookConfig()).toContain("Webhook Registry");
  });
});

describe("Phase 2 dispatch + merge", () => {
  const queueDir = join(getDocsDir(), "reports", "routing-queue");
  const created: string[] = [];

  beforeEach(() => {
    setTenantId("mal");
    const p = queueEventsPath();
    if (existsSync(p)) rmSync(p);
  });

  afterEach(() => {
    for (const id of created) {
      for (const ext of [".yaml", ".md"]) {
        const p = join(queueDir, `${id}${ext}`);
        if (existsSync(p)) rmSync(p);
      }
    }
  });

  it("builds dispatch manifest from work order", () => {
    const result = runEscalation({
      input: { subject: "test dispatch", requirements: "契約期限確認" },
    });
    const wo = result.workOrders.find((w) => !w.child_ids)!;
    created.push(wo.id);
    const manifest = buildDispatchManifest(wo.id);
    expect(manifest.tasks.length).toBeGreaterThan(0);
    expect(formatDispatchPlan(manifest)).toContain("Dispatch Plan");
  });

  it("merges completed work order results", () => {
    const result = runEscalation({
      input: { subject: "merge test", requirements: "月次締め" },
    });
    const wo = result.workOrders.find((w) => !w.child_ids)!;
    created.push(wo.id);
    registerWorkOrderResult(wo.id, "Finance module updated", "done");
    expect(loadHandoff(wo.id).status).toBe("completed");
    const { path, content } = mergeWorkOrderResults({ id: wo.id });
    expect(existsSync(path)).toBe(true);
    expect(content).toContain("統合サマリ");
  });
});

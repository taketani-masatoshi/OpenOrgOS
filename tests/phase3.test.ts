import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { pushQueueEvent, queueEventsPath } from "../src/lib/queue-db.js";
import { startWebhookServer } from "../src/lib/webhook-server.js";
import { loadWebhookRegistry } from "../src/lib/webhook.js";
import { loadCloudAgentConfig, resolveDispatchRuntime, formatCloudConfig } from "../src/lib/cloud-agent.js";
import { runQueueDrainInternal } from "../src/lib/queue-processor.js";
import { planPullRequest, formatPrPlan } from "../src/lib/git-pr.js";
import { runEscalation } from "../src/lib/escalate.js";
import { registerWorkOrderResult } from "../src/lib/work-order-merge.js";
import { runMergePrCreate } from "../src/commands/merge-pr.js";
import { getDocsDir } from "../src/lib/utils.js";

describe("Phase 3 webhook server", () => {
  it("responds to GET /health", async () => {
    const registry = loadWebhookRegistry();
    const host = registry.inbound?.host ?? "127.0.0.1";
    const port = registry.inbound?.port ?? 9473;
    const { close } = await startWebhookServer({ host, port, drain: false });
    try {
      const res = await fetch(`http://${host}:${port}/health`);
      expect(res.ok).toBe(true);
      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(true);
    } finally {
      close();
    }
  });
});

describe("Phase 3 cloud config", () => {
  it("loads cloud agent config with defaults", () => {
    const cfg = loadCloudAgentConfig();
    expect(cfg.version).toBe("1");
    expect(cfg.runtime).toBeDefined();
    expect(formatCloudConfig()).toContain("Cloud Agent Config");
  });

  it("resolves dispatch runtime", () => {
    expect(resolveDispatchRuntime("manifest")).toBe("manifest");
    expect(resolveDispatchRuntime("local")).toBe("local");
  });
});

describe("Phase 3 queue processor", () => {
  beforeEach(() => {
    setTenantId("demo");
    const p = queueEventsPath();
    if (existsSync(p)) rmSync(p);
  });

  it("drains pending events without throwing", () => {
    pushQueueEvent({ type: "webhook_received", ref: "test", payload: { event: "ping" } });
    const n = runQueueDrainInternal({});
    expect(n).toBe(1);
  });

  it("dry-run drain skips updates", () => {
    pushQueueEvent({ type: "webhook_received", ref: "dry", payload: {} });
    const n = runQueueDrainInternal({ dryRun: true });
    expect(n).toBe(0);
  });
});

describe("Phase 3 merge pr", () => {
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
    }
  });

  it("plans PR from completed work order (no git)", () => {
    const result = runEscalation({
      input: { subject: "phase3 pr plan", requirements: "月次締め" },
    });
    const wo = result.workOrders.find((w) => !w.child_ids)!;
    created.push(wo.id);
    registerWorkOrderResult(wo.id, "Phase 3 test summary", "done");
    const manifest = planPullRequest(wo.id);
    expect(manifest.branch).toMatch(/^steward\//);
    expect(manifest.status).toBe("planned");
    expect(formatPrPlan(manifest)).toContain("PR Plan");
  });

  it("merge pr create dry-run does not invoke git", () => {
    const result = runEscalation({
      input: { subject: "phase3 pr dry-run", requirements: "契約期限" },
    });
    const wo = result.workOrders.find((w) => !w.child_ids)!;
    created.push(wo.id);
    registerWorkOrderResult(wo.id, "Dry run only", "done");
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
    try {
      runMergePrCreate({ id: wo.id, dryRun: true });
    } finally {
      console.log = origLog;
    }
    expect(logs.join("\n")).toContain("dry-run");
    expect(logs.join("\n")).not.toContain("✓ branch");
  });
});

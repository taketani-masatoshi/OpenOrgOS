import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildOrchestrationStatusPayload } from "../src/lib/orchestration/orchestrate-actions.js";
import { setTenantId } from "../src/lib/tenant.js";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { handoffSchema } from "../schemas/routing.js";
import { routingQueueDir, writeHandoffFiles } from "../src/lib/routing.js";

describe("orchestration run board payload", () => {
  const created: string[] = [];

  beforeEach(() => {
    setTenantId("mal");
  });

  afterEach(() => {
    for (const id of created) {
      for (const ext of [".yaml", ".md"]) {
        const path = join(routingQueueDir(), `${id}${ext}`);
        if (existsSync(path)) rmSync(path);
      }
    }
  });

  it("buildOrchestrationStatusPayload exposes Run Board JSON contract", () => {
    const parent = handoffSchema.parse({
      id: "IMP-RUNBOARD-P",
      created_at: new Date().toISOString(),
      from_agent: "executive_steward",
      to_agent: "executive_steward",
      task_type: "implement",
      access: { allowed: true, reason: "run board test" },
      context: { text: "run board" },
      status: "pending",
      child_ids: ["IMP-RUNBOARD-A"],
    });
    writeHandoffFiles(parent, undefined, { audit: false });
    created.push(parent.id);

    const child = handoffSchema.parse({
      id: "IMP-RUNBOARD-A",
      created_at: new Date().toISOString(),
      from_agent: "executive_steward",
      to_agent: "finance",
      task_type: "implement",
      access: { allowed: true, reason: "run board test" },
      context: { text: "run board" },
      status: "pending",
      parent_id: parent.id,
      depends_on: [],
      agent_prompt_path: "prompts/IMP-RUNBOARD-A_finance.md",
    });
    writeHandoffFiles(child, undefined, { audit: false });
    mkdirSync(join(routingQueueDir(), "prompts"), { recursive: true });
    writeFileSync(join(routingQueueDir(), child.agent_prompt_path!), "# run board", "utf-8");
    created.push(child.id);

    const payload = buildOrchestrationStatusPayload(parent.id);
    expect(payload.rootId).toBe(parent.id);
    expect(payload.aia).toMatchObject({
      tier: expect.any(String),
      max_concurrent: expect.any(Number),
      running: expect.any(Number),
      queued: expect.any(Number),
    });
    expect(payload.nodes.some((node) => node.id === child.id)).toBe(true);
    expect(payload.retryableCount).toBe(0);
    expect(payload.cancellableCount).toBeGreaterThan(0);
  });
});

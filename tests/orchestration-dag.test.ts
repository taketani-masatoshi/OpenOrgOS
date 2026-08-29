import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { handoffSchema } from "../schemas/routing.js";
import { setTenantId } from "../src/lib/tenant.js";
import { routingQueueDir, writeHandoffFiles } from "../src/lib/routing.js";
import {
  buildPlanGraph,
  computeWaves,
  readyWorkOrders,
  syncDependencyStatuses,
  syncParentPlanStatus,
} from "../src/lib/orchestration/plan-graph.js";
import { transitionWorkOrder, WORK_ORDER_CANCEL_BLOCK_REASON } from "../src/lib/orchestration/work-order-state.js";
import { buildDispatchManifest } from "../src/lib/agent-dispatch.js";
import { retryFailedWorkOrders, applyDependsToWorkOrders, buildOrchestrationStatusPayload } from "../src/lib/orchestration/orchestrate-actions.js";

describe("orchestration DAG", () => {
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
      const prompt = join(routingQueueDir(), "prompts", `${id}_finance.md`);
      if (existsSync(prompt)) rmSync(prompt);
      const promptOps = join(routingQueueDir(), "prompts", `${id}_operations.md`);
      if (existsSync(promptOps)) rmSync(promptOps);
    }
  });

  function writeWo(
    id: string,
    opts: {
      to_agent?: "finance" | "operations" | "executive_steward";
      parent_id?: string;
      child_ids?: string[];
      depends_on?: string[];
      status?: string;
      dispatch?: { attempts?: number; max_attempts?: number };
    } = {},
  ) {
    const handoff = handoffSchema.parse({
      id,
      created_at: new Date().toISOString(),
      from_agent: "executive_steward",
      to_agent: opts.to_agent ?? "finance",
      task_type: "implement",
      access: { allowed: true, reason: "test" },
      context: { text: "test" },
      status: opts.status ?? "pending",
      parent_id: opts.parent_id,
      child_ids: opts.child_ids,
      depends_on: opts.depends_on ?? [],
      dispatch: opts.dispatch,
      agent_prompt_path: `prompts/${id}_${opts.to_agent ?? "finance"}.md`,
    });
    writeHandoffFiles(handoff, undefined, { audit: false });
    mkdirSync(join(routingQueueDir(), "prompts"), { recursive: true });
    writeFileSync(join(routingQueueDir(), handoff.agent_prompt_path!), "# prompt", "utf-8");
    created.push(id);
    return handoff;
  }

  it("computes waves from depends_on", () => {
    const parent = writeWo("IMP-DAG-PARENT", {
      to_agent: "executive_steward",
      child_ids: ["IMP-DAG-A", "IMP-DAG-B"],
    });
    writeWo("IMP-DAG-A", { parent_id: parent.id, depends_on: [] });
    writeWo("IMP-DAG-B", { parent_id: parent.id, depends_on: ["IMP-DAG-A"] });

    const graph = buildPlanGraph(parent.id);
    expect(graph.waves.length).toBe(2);
    expect(graph.waves[0]).toContain("IMP-DAG-A");
    expect(graph.waves[1]).toContain("IMP-DAG-B");
  });

  it("detects dependency cycles", () => {
    const parent = writeWo("IMP-DAG-CYC-P", {
      to_agent: "executive_steward",
      child_ids: ["IMP-DAG-CYC-A", "IMP-DAG-CYC-B"],
    });
    writeWo("IMP-DAG-CYC-A", { parent_id: parent.id, depends_on: ["IMP-DAG-CYC-B"] });
    writeWo("IMP-DAG-CYC-B", { parent_id: parent.id, depends_on: ["IMP-DAG-CYC-A"] });

    expect(() => buildPlanGraph(parent.id)).toThrow(/Cycle detected/);
  });

  it("excludes nodes with incomplete dependencies from ready set", () => {
    const parent = writeWo("IMP-DAG-RDY-P", {
      to_agent: "executive_steward",
      child_ids: ["IMP-DAG-RDY-A", "IMP-DAG-RDY-B"],
    });
    writeWo("IMP-DAG-RDY-A", { parent_id: parent.id });
    writeWo("IMP-DAG-RDY-B", { parent_id: parent.id, depends_on: ["IMP-DAG-RDY-A"] });

    const graph = buildPlanGraph(parent.id);
    syncDependencyStatuses(graph);
    const ready = readyWorkOrders(graph);
    expect(ready.map((n) => n.id)).toEqual(["IMP-DAG-RDY-A"]);
  });

  it("buildDispatchManifest only includes ready work orders", () => {
    const parent = writeWo("IMP-DAG-MAN-P", {
      to_agent: "executive_steward",
      child_ids: ["IMP-DAG-MAN-A", "IMP-DAG-MAN-B"],
    });
    writeWo("IMP-DAG-MAN-A", { parent_id: parent.id });
    writeWo("IMP-DAG-MAN-B", { parent_id: parent.id, depends_on: ["IMP-DAG-MAN-A"] });

    const manifest = buildDispatchManifest(parent.id);
    expect(manifest.tasks.map((t) => t.work_order_id)).toEqual(["IMP-DAG-MAN-A"]);
    expect(manifest.trace_id).toMatch(/^TRC-/);
  });

  it("blocks downstream nodes when upstream fails", () => {
    const parent = writeWo("IMP-DAG-FAIL-P", {
      to_agent: "executive_steward",
      child_ids: ["IMP-DAG-FAIL-A", "IMP-DAG-FAIL-B"],
    });
    writeWo("IMP-DAG-FAIL-A", { parent_id: parent.id, status: "failed" });
    writeWo("IMP-DAG-FAIL-B", { parent_id: parent.id, depends_on: ["IMP-DAG-FAIL-A"] });

    buildPlanGraph(parent.id);
    syncDependencyStatuses(buildPlanGraph(parent.id));
    const refreshed = buildPlanGraph(parent.id);
    const nodeB = refreshed.nodes.get("IMP-DAG-FAIL-B");
    expect(nodeB?.status).toBe("blocked");
  });

  it("retryFailedWorkOrders resets eligible failed nodes to pending", () => {
    const parent = writeWo("IMP-DAG-RET-P", {
      to_agent: "executive_steward",
      child_ids: ["IMP-DAG-RET-A"],
    });
    writeWo("IMP-DAG-RET-A", {
      parent_id: parent.id,
      status: "failed",
      dispatch: { attempts: 1, max_attempts: 2 },
    });

    const retried = retryFailedWorkOrders(parent.id);
    expect(retried).toEqual(["IMP-DAG-RET-A"]);
  });

  it("unblocks downstream when upstream dependency completes", () => {
    const parent = writeWo("IMP-DAG-UNB-P", {
      to_agent: "executive_steward",
      child_ids: ["IMP-DAG-UNB-A", "IMP-DAG-UNB-B"],
    });
    writeWo("IMP-DAG-UNB-A", { parent_id: parent.id, status: "failed" });
    writeWo("IMP-DAG-UNB-B", {
      parent_id: parent.id,
      depends_on: ["IMP-DAG-UNB-A"],
    });

    syncDependencyStatuses(buildPlanGraph(parent.id));
    expect(buildPlanGraph(parent.id).nodes.get("IMP-DAG-UNB-B")?.status).toBe("blocked");

    transitionWorkOrder("IMP-DAG-UNB-A", "completed", { skipQueueEvent: true });
    syncDependencyStatuses(buildPlanGraph(parent.id));
    expect(buildPlanGraph(parent.id).nodes.get("IMP-DAG-UNB-B")?.status).toBe("pending");
  });

  it("does not auto-unblock nodes cancelled by orchestrate cancel", () => {
    const parent = writeWo("IMP-DAG-CAN-P", {
      to_agent: "executive_steward",
      child_ids: ["IMP-DAG-CAN-A", "IMP-DAG-CAN-B"],
    });
    writeWo("IMP-DAG-CAN-A", { parent_id: parent.id, status: "completed" });
    const blocked = writeWo("IMP-DAG-CAN-B", {
      parent_id: parent.id,
      depends_on: ["IMP-DAG-CAN-A"],
      status: "blocked",
      dispatch: { last_error: WORK_ORDER_CANCEL_BLOCK_REASON },
    });

    syncDependencyStatuses(buildPlanGraph(parent.id));
    expect(buildPlanGraph(parent.id).nodes.get(blocked.id)?.status).toBe("blocked");
  });

  it("syncParentPlanStatus completes parent when all children done", () => {
    const parent = writeWo("IMP-DAG-PAR-P", {
      to_agent: "executive_steward",
      child_ids: ["IMP-DAG-PAR-A", "IMP-DAG-PAR-B"],
    });
    writeWo("IMP-DAG-PAR-A", { parent_id: parent.id, status: "completed" });
    writeWo("IMP-DAG-PAR-B", { parent_id: parent.id, status: "completed" });

    const graph = buildPlanGraph(parent.id);
    syncParentPlanStatus(graph);
    expect(graph.nodes.get(parent.id)?.status).toBe("completed");
  });

  it("syncParentPlanStatus reopens parent when a child is reopened", () => {
    const parent = writeWo("IMP-DAG-PAR-R", {
      to_agent: "executive_steward",
      status: "completed",
      child_ids: ["IMP-DAG-PAR-R-A", "IMP-DAG-PAR-R-B"],
    });
    writeWo("IMP-DAG-PAR-R-A", { parent_id: parent.id, status: "completed" });
    writeWo("IMP-DAG-PAR-R-B", { parent_id: parent.id, status: "pending" });

    const graph = buildPlanGraph(parent.id);
    syncParentPlanStatus(graph);
    expect(graph.nodes.get(parent.id)?.status).toBe("pending");
  });

  it("applyDependsToWorkOrders persists depends_on edges", () => {
    const parent = writeWo("IMP-DAG-DEP-P", {
      to_agent: "executive_steward",
      child_ids: ["IMP-DAG-DEP-A", "IMP-DAG-DEP-B"],
    });
    const childA = writeWo("IMP-DAG-DEP-A", { parent_id: parent.id });
    const childB = writeWo("IMP-DAG-DEP-B", { parent_id: parent.id });

    applyDependsToWorkOrders(parent.id, new Map([[childB.id, [childA.id]]]));

    const graph = buildPlanGraph(parent.id);
    expect(graph.nodes.get(childB.id)?.depends_on).toEqual([childA.id]);
    expect(graph.waves.length).toBe(2);
  });

  it("buildOrchestrationStatusPayload includes AIA runtime envelope", () => {
    const parent = writeWo("IMP-DAG-JSON-P", {
      to_agent: "executive_steward",
      child_ids: ["IMP-DAG-JSON-A"],
    });
    writeWo("IMP-DAG-JSON-A", { parent_id: parent.id, status: "pending" });

    const payload = buildOrchestrationStatusPayload(parent.id);
    expect(payload.rootId).toBe(parent.id);
    expect(payload.aia).toMatchObject({
      tier: expect.any(String),
      max_concurrent: expect.any(Number),
      running: expect.any(Number),
      queued: expect.any(Number),
    });
    expect(payload.nodes.some((node) => node.id === "IMP-DAG-JSON-A")).toBe(true);
  });

  it("computeWaves handles empty depends_on as wave 0 siblings", () => {
    const nodes = new Map(
      [
        handoffSchema.parse({
          id: "IMP-W0-A",
          created_at: new Date().toISOString(),
          from_agent: "executive_steward",
          to_agent: "finance",
          task_type: "implement",
          access: { allowed: true, reason: "test" },
          context: {},
          status: "pending",
          depends_on: [],
        }),
        handoffSchema.parse({
          id: "IMP-W0-B",
          created_at: new Date().toISOString(),
          from_agent: "executive_steward",
          to_agent: "operations",
          task_type: "implement",
          access: { allowed: true, reason: "test" },
          context: {},
          status: "pending",
          depends_on: [],
        }),
      ].map((h) => [h.id, h]),
    );
    const waves = computeWaves(nodes);
    expect(waves[0]?.sort()).toEqual(["IMP-W0-A", "IMP-W0-B"]);
  });
});

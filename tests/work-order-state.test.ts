import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { handoffSchema } from "../schemas/routing.js";
import { setTenantId } from "../src/lib/tenant.js";
import { routingQueueDir, writeHandoffFiles, loadHandoff } from "../src/lib/routing.js";
import {
  assertTransitionAllowed,
  completeWorkOrderViaState,
  transitionWorkOrder,
} from "../src/lib/orchestration/work-order-state.js";
import { completeWorkOrder } from "../src/lib/escalate.js";
import { queueEventsPath } from "../src/lib/queue-db.js";

describe("work-order-state", () => {
  const created: string[] = [];

  beforeEach(() => {
    setTenantId("mal");
    const p = queueEventsPath();
    if (existsSync(p)) rmSync(p);
  });

  afterEach(() => {
    for (const id of created) {
      for (const ext of [".yaml", ".md"]) {
        const path = join(routingQueueDir(), `${id}${ext}`);
        if (existsSync(path)) rmSync(path);
      }
    }
  });

  function seedHandoff(id: string, status: "pending" | "completed" = "pending") {
    const handoff = handoffSchema.parse({
      id,
      created_at: new Date().toISOString(),
      from_agent: "executive_steward",
      to_agent: "finance",
      task_type: "implement",
      access: { allowed: true, reason: "test" },
      context: { text: "test" },
      status,
      agent_prompt_path: `prompts/${id}_finance.md`,
    });
    writeHandoffFiles(handoff, undefined, { audit: false });
    created.push(id);
    return handoff;
  }

  it("allows valid transitions", () => {
    expect(() => assertTransitionAllowed("pending", "dispatched")).not.toThrow();
    expect(() => assertTransitionAllowed("running", "completed")).not.toThrow();
    expect(() => assertTransitionAllowed("failed", "pending")).not.toThrow();
  });

  it("allows blocked to pending for upstream recovery", () => {
    expect(() => assertTransitionAllowed("blocked", "pending")).not.toThrow();
  });

  it("rejects invalid transitions", () => {
    expect(() => assertTransitionAllowed("completed", "pending")).toThrow(/Invalid work order transition/);
  });

  it("transitions pending to dispatched and records dispatch metadata", () => {
    seedHandoff("IMP-STATE-001");
    const updated = transitionWorkOrder("IMP-STATE-001", "dispatched", {
      traceId: "TRC-test-001",
      runId: "RUN-IMP-STATE-001",
    });
    expect(updated.status).toBe("dispatched");
    expect(updated.dispatch?.trace_id).toBe("TRC-test-001");
    expect(updated.dispatch?.last_run_id).toBe("RUN-IMP-STATE-001");
  });

  it("supports manual complete from pending (backward compat)", () => {
    seedHandoff("IMP-STATE-002");
    const updated = completeWorkOrder("IMP-STATE-002", "manual done");
    expect(updated.status).toBe("completed");
    expect(updated.completion_notes).toBe("manual done");
  });

  it("emits dispatch_requested and work_order_running from the state machine", () => {
    seedHandoff("IMP-STATE-RUN");
    transitionWorkOrder("IMP-STATE-RUN", "dispatched", {
      traceId: "TRC-run",
      runId: "RUN-IMP-STATE-RUN",
      eventPayload: { manifest_id: "DISP-TEST", attempt: 1 },
    });
    transitionWorkOrder("IMP-STATE-RUN", "running", {
      traceId: "TRC-run",
      runId: "RUN-IMP-STATE-RUN",
      incrementAttempt: true,
    });

    const raw = existsSync(queueEventsPath()) ? readFileSync(queueEventsPath(), "utf-8") : "";
    const events = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { type: string; ref: string; payload?: Record<string, unknown> })
      .filter((event) => event.ref === "IMP-STATE-RUN");

    expect(events.map((event) => event.type)).toEqual(["dispatch_requested", "work_order_running"]);
    expect(events[0]?.payload).toMatchObject({ manifest_id: "DISP-TEST", attempt: 1, trace_id: "TRC-run" });
  });
});

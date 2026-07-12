import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { setTenantId } from "../src/lib/tenant.js";
import { getDocsDir } from "../src/lib/utils.js";
import {
  pushQueueEvent,
  appendQueueStatusEvent,
  updateQueueEvent,
  loadQueueEvents,
  reduceQueueEvents,
  queueEventsPath,
} from "../src/lib/queue-db.js";
import { queueStatusRecordSchema } from "../schemas/queue.js";
import { resetRuntimeContext, setRuntimeContext } from "../src/lib/runtime-context.js";

function cleanup(): void {
  const path = queueEventsPath();
  if (existsSync(path)) rmSync(path);
}

describe("queue event replay (append-only status)", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    resetRuntimeContext();
    setRuntimeContext({
      idGenerator: {
        randomSuffix: () => "abcd1234",
        uniqueId: (prefix) => `${prefix}-FIXED`,
      },
      clock: {
        now: () => new Date("2026-07-12T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-07-12T00:00:00.000Z"),
        nowIso: () => "2026-07-12T00:00:00.000Z",
      },
    });
  });

  afterEach(() => {
    cleanup();
    resetRuntimeContext();
  });

  it("appendQueueStatusEvent appends status lines without rewriting created event", () => {
    const created = pushQueueEvent({ type: "work_order_created", ref: "IMP-1" });
    const updated = appendQueueStatusEvent(created.id, { status: "done" });
    expect(updated?.status).toBe("done");

    const lines = readFileSync(queueEventsPath(), "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).id).toBe(created.id);
    expect(queueStatusRecordSchema.parse(JSON.parse(lines[1]!)).target_id).toBe(created.id);

    expect(loadQueueEvents({ status: "done" })).toHaveLength(1);
    expect(loadQueueEvents({ status: "pending" })).toHaveLength(0);
  });

  it("updateQueueEvent delegates to append-only status path", () => {
    const created = pushQueueEvent({ type: "dispatch_requested", ref: "HO-1" });
    updateQueueEvent(created.id, { status: "failed", error: "boom" });
    const event = loadQueueEvents().find((e) => e.id === created.id);
    expect(event?.status).toBe("failed");
    expect(event?.error).toBe("boom");
    expect(readFileSync(queueEventsPath(), "utf-8").trim().split("\n")).toHaveLength(2);
  });

  it("reduceQueueEvents replays status transitions deterministically", () => {
    const created = pushQueueEvent({ type: "webhook_received", ref: "WH-1" });
    appendQueueStatusEvent(created.id, { status: "processing" });
    appendQueueStatusEvent(created.id, { status: "done" });
    const raw = readFileSync(queueEventsPath(), "utf-8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .flatMap((line) => {
        if (line.record_type === "queue_status") {
          return [{ kind: "status" as const, data: queueStatusRecordSchema.parse(line) }];
        }
        return [{ kind: "event" as const, data: line }];
      });
    const replayed = reduceQueueEvents(raw);
    expect(replayed).toHaveLength(1);
    expect(replayed[0]?.status).toBe("done");
  });
});

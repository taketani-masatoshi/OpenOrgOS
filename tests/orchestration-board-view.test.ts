import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Handoff } from "../schemas/routing.js";
import { handoffSchema } from "../schemas/routing.js";
import { setTenantId } from "../src/lib/tenant.js";
import { routingQueueDir, writeHandoffFiles } from "../src/lib/routing.js";
import {
  buildOrchestrationBoardList,
  resolveWorkOrderTitle,
  statusToBoardColumn,
} from "../src/lib/orchestration/board-view.js";
import {
  isClosedWorkOrder,
  WORK_ORDER_CANCEL_BLOCK_REASON,
} from "../src/lib/orchestration/work-order-state.js";

describe("orchestration board-view", () => {
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
    created.length = 0;
  });

  function seed(id: string, status: Handoff["status"], extra: Partial<Handoff> = {}) {
    const handoff = handoffSchema.parse({
      id,
      created_at: new Date().toISOString(),
      from_agent: "executive_steward",
      to_agent: "finance",
      task_type: "implement",
      access: { allowed: true, reason: "test" },
      context: { text: "test", subject: id },
      subject: id,
      status,
      agent_prompt_path: `prompts/${id}_finance.md`,
      ...extra,
    });
    writeHandoffFiles(handoff, undefined, { audit: false });
    created.push(id);
    return handoff;
  }

  it("maps statuses to kanban columns", () => {
    expect(statusToBoardColumn("pending")).toBe("todo");
    expect(statusToBoardColumn("waiting")).toBe("waiting");
    expect(statusToBoardColumn("dispatched")).toBe("active");
    expect(statusToBoardColumn("running")).toBe("active");
    expect(statusToBoardColumn("failed")).toBe("attention");
    expect(statusToBoardColumn("blocked")).toBe("attention");
    expect(statusToBoardColumn("completed")).toBe("done");
  });

  it("prefers subject then context text then id for titles", () => {
    const withSubject = {
      id: "IMP-1",
      subject: "月次予実レビュー",
      context: { text: "ignored" },
    } as Pick<Handoff, "id" | "subject" | "context">;
    expect(resolveWorkOrderTitle(withSubject)).toBe("月次予実レビュー");

    const withText = {
      id: "IMP-2",
      context: { text: "Finance に確認依頼\n2行目" },
    } as Pick<Handoff, "id" | "subject" | "context">;
    expect(resolveWorkOrderTitle(withText)).toBe("Finance に確認依頼");

    const idOnly = { id: "IMP-3" } as Pick<Handoff, "id" | "subject" | "context">;
    expect(resolveWorkOrderTitle(idOnly)).toBe("IMP-3");
  });

  it("treats completed and cancel-blocked work as closed", () => {
    expect(isClosedWorkOrder(seed("IMP-CLOSED-1", "completed"))).toBe(true);
    expect(
      isClosedWorkOrder(
        seed("IMP-CLOSED-2", "blocked", {
          dispatch: { last_error: WORK_ORDER_CANCEL_BLOCK_REASON },
        }),
      ),
    ).toBe(true);
    expect(isClosedWorkOrder(seed("IMP-CLOSED-3", "failed"))).toBe(false);
  });

  it("defaults board list to incomplete cards only", () => {
    seed("IMP-BOARD-OPEN", "pending");
    seed("IMP-BOARD-DONE", "completed");

    const board = buildOrchestrationBoardList({ view: "incomplete" });
    const openPlan = board.plans.find((p) => p.id === "IMP-BOARD-OPEN");
    const donePlan = board.plans.find((p) => p.id === "IMP-BOARD-DONE");

    expect(openPlan?.cards.every((c) => !c.closed)).toBe(true);
    expect(donePlan).toBeUndefined();
  });

  it("returns completed cards when view=completed", () => {
    seed("IMP-BOARD-C1", "completed", {
      dispatch: { finished_at: new Date().toISOString() },
    });

    const board = buildOrchestrationBoardList({
      includeCompleted: true,
      view: "completed",
    });
    const plan = board.plans.find((p) => p.id === "IMP-BOARD-C1");
    expect(plan?.cards.every((c) => c.closed)).toBe(true);
  });
});

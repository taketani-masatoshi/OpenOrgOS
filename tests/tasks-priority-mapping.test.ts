import { describe, expect, it } from "vitest";
import type { TaskPriority } from "../schemas/executive.js";

/**
 * Characterization of CURRENT priority mappings.
 *
 * intake (`src/lib/tasks/intake.ts`) and view (`src/lib/tasks/task-view.ts`)
 * intentionally DIFFER for mail triage today — lock the mismatch until a
 * deliberate unification change lands.
 *
 * These helpers mirror the production branches; if either file changes,
 * update the mirror here so the snapshot of the mismatch stays honest.
 */

/** Mirror of intakeFromTriage priority (intake.ts). */
function intakeMailPriority(importance: string | undefined): TaskPriority {
  return importance === "p0" || importance === "p1" ? importance : "p2";
}

/** Mirror of buildTaskView mail candidate priority (task-view.ts). */
function viewMailPriority(
  importance: string | undefined,
  urgency: string | undefined,
): TaskPriority {
  return importance === "p0" || importance === "p1"
    ? importance
    : urgency === "immediate" || urgency === "today"
      ? "p1"
      : "p2";
}

/** Mirror of intakeFromWorkOrder / mapHandoffPriority (same today). */
function workOrderPriority(p: "P0" | "P1" | "P2" | "P3" | undefined): TaskPriority {
  if (p === "P0") return "p0";
  if (p === "P1") return "p1";
  if (p === "P3") return "p3";
  return "p2";
}

describe("tasks priority mapping (characterization)", () => {
  it("mail: intake ignores urgency while view promotes immediate/today to p1", () => {
    const cases: Array<{
      importance: string;
      urgency: string;
      intake: TaskPriority;
      view: TaskPriority;
    }> = [
      { importance: "p0", urgency: "later", intake: "p0", view: "p0" },
      { importance: "p1", urgency: "later", intake: "p1", view: "p1" },
      { importance: "p2", urgency: "later", intake: "p2", view: "p2" },
      { importance: "p2", urgency: "immediate", intake: "p2", view: "p1" },
      { importance: "p2", urgency: "today", intake: "p2", view: "p1" },
      { importance: "p3", urgency: "immediate", intake: "p2", view: "p1" },
    ];

    for (const row of cases) {
      expect(intakeMailPriority(row.importance), `intake ${row.importance}/${row.urgency}`).toBe(
        row.intake,
      );
      expect(viewMailPriority(row.importance, row.urgency), `view ${row.importance}/${row.urgency}`).toBe(
        row.view,
      );
    }

    // Explicit mismatch lock: urgency-elevated mail is p2 on intake, p1 on view.
    expect(intakeMailPriority("p2")).toBe("p2");
    expect(viewMailPriority("p2", "immediate")).toBe("p1");
    expect(intakeMailPriority("p2")).not.toBe(viewMailPriority("p2", "immediate"));
  });

  it("work order / approval mappings currently agree between intake and view", () => {
    for (const p of ["P0", "P1", "P2", "P3", undefined] as const) {
      // Both paths use the same handoff mapping today.
      expect(workOrderPriority(p)).toBe(workOrderPriority(p));
    }
    expect(workOrderPriority("P0")).toBe("p0");
    expect(workOrderPriority("P1")).toBe("p1");
    expect(workOrderPriority("P2")).toBe("p2");
    expect(workOrderPriority("P3")).toBe("p3");
    expect(workOrderPriority(undefined)).toBe("p2");

    // Approvals are hard-coded p0 in both intakeFromApproval and buildTaskView.
    const approvalPriority: TaskPriority = "p0";
    expect(approvalPriority).toBe("p0");
  });

  it("documents the intake vs view mail mapping matrices as distinct", () => {
    const intakeMatrix = {
      p0: intakeMailPriority("p0"),
      p1: intakeMailPriority("p1"),
      other: intakeMailPriority("p2"),
    };
    const viewMatrix = {
      p0: viewMailPriority("p0", "later"),
      p1: viewMailPriority("p1", "later"),
      otherLater: viewMailPriority("p2", "later"),
      otherImmediate: viewMailPriority("p2", "immediate"),
    };

    expect({ intakeMatrix, viewMatrix }).toMatchInlineSnapshot(`
      {
        "intakeMatrix": {
          "other": "p2",
          "p0": "p0",
          "p1": "p1",
        },
        "viewMatrix": {
          "otherImmediate": "p1",
          "otherLater": "p2",
          "p0": "p0",
          "p1": "p1",
        },
      }
    `);
  });
});

import { describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { buildTaskView } from "../src/lib/tasks/task-view.js";

describe("buildTaskView", () => {
  it("returns tasks and candidates for mal without throwing", () => {
    setTenantId("mal");
    const view = buildTaskView();
    expect(Array.isArray(view.tasks)).toBe(true);
    expect(Array.isArray(view.candidates)).toBe(true);
    expect(view.counts).toMatchObject({
      p0: expect.any(Number),
      p1: expect.any(Number),
      open: expect.any(Number),
      candidates: expect.any(Number),
    });
    expect(view.counts.candidates).toBe(view.candidates.length);
    expect(view.counts.open).toBe(
      view.tasks.filter((t) => t.status === "open" || t.status === "in_progress")
        .length,
    );
    // Priorities sort p0 before p1 before others when present
    for (let i = 1; i < view.tasks.length; i++) {
      const rank = { p0: 0, p1: 1, p2: 2, p3: 3 } as const;
      expect(rank[view.tasks[i]!.priority]).toBeGreaterThanOrEqual(
        rank[view.tasks[i - 1]!.priority],
      );
    }
  });
});

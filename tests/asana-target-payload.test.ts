import { describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { buildAsanaTargetPayload } from "../src/lib/integrations/asana-adapter.js";
import { listHandoffs } from "../src/lib/routing.js";
import { loadExecutiveTasks } from "../src/lib/data.js";

/**
 * Asana is a shared surface, so the payload must stay L1: an identifier, a
 * title, a state and a due date. Anything richer would leak company detail to
 * everyone with project access.
 */
describe("asana target payload", () => {
  setTenantId("demo");

  it("describes a work order without carrying its body text", () => {
    const handoff = listHandoffs()[0];
    if (!handoff) return;

    const payload = buildAsanaTargetPayload("work_order", handoff.id);
    expect(payload.name).toContain(handoff.id);
    expect(payload.notes).toContain(`Status: ${handoff.status}`);
    expect(payload.notes).toContain("Source of truth: OrgOS");
    if (handoff.background) {
      expect(payload.notes).not.toContain(handoff.background);
    }
    if (handoff.requirements) {
      expect(payload.notes).not.toContain(handoff.requirements);
    }
  });

  it("describes an executive task by id, status and priority only", () => {
    const task = loadExecutiveTasks().tasks[0];
    if (!task) return;

    const payload = buildAsanaTargetPayload("executive_task", task.id);
    expect(payload.name).toContain(task.id);
    expect(payload.notes).toContain(`Status: ${task.status}`);
    expect(payload.notes).toContain("Source of truth: OrgOS");
  });

  it("fails loudly for an unknown executive task", () => {
    expect(() => buildAsanaTargetPayload("executive_task", "TASK-DOES-NOT-EXIST")).toThrow();
  });
});

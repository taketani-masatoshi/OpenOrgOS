import { describe, expect, it } from "vitest";
import { executiveTaskSchema, tasksFileSchema } from "../schemas/executive.js";
import { parseP0RegisterMarkdown } from "../src/lib/tasks/intake.js";

describe("executiveTaskSchema backward compatibility", () => {
  it("parses legacy tasks without origin/links", () => {
    const file = tasksFileSchema.parse({
      tasks: [
        {
          id: "TASK-001",
          title: "Legacy task",
          priority: "p1",
          status: "open",
          source: "manual-note",
        },
      ],
    });
    expect(file.tasks[0]?.id).toBe("TASK-001");
    expect(file.tasks[0]?.links).toEqual({});
    expect(file.tasks[0]?.source).toBe("manual-note");
  });

  it("accepts extended fields", () => {
    const task = executiveTaskSchema.parse({
      id: "TASK-002",
      title: "Extended",
      origin: { kind: "mail", ref: "TRI-1" },
      links: { triage_id: "TRI-1" },
      property_id: "PROP-002",
      module_id: "hospitality",
      next_action: "Call insurer",
    });
    expect(task.links.triage_id).toBe("TRI-1");
    expect(task.property_id).toBe("PROP-002");
  });
});

describe("parseP0RegisterMarkdown", () => {
  it("reads checklist under P0 heading", () => {
    const drafts = parseP0RegisterMarkdown(`
# Remaining
## P0
- [ ] Buy insurance for PROP-002
- [x] Already done item
## P1
- [ ] File tax estimate
`);
    expect(drafts).toHaveLength(3);
    expect(drafts[0]).toMatchObject({
      title: "Buy insurance for PROP-002",
      priority: "p0",
      checked: false,
    });
    expect(drafts[1]?.checked).toBe(true);
    expect(drafts[2]).toMatchObject({
      title: "File tax estimate",
      priority: "p1",
    });
  });
});

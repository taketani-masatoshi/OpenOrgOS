import { describe, expect, it } from "vitest";
import type { OperatorRecord } from "../schemas/org/operator.js";
import { assigneeKind, assigneeLabel } from "../src/lib/executive-home/assignee-kind.js";

describe("assigneeKind", () => {
  const operators = [
    {
      operator_id: "OP-001",
      display_name: "CEO",
      role: "ceo",
      status: "active",
      seat_kind: "standard",
    },
    {
      operator_id: "OP-GUEST",
      display_name: "Tax Guest",
      role: "operator",
      status: "active",
      guest_expires_at: "2027-01-01",
      seat_kind: "standard",
    },
  ] as OperatorRecord[];

  it("classifies guest operators", () => {
    expect(
      assigneeKind({ assignee_operator_id: "OP-GUEST", to_agent: "finance" }, operators),
    ).toBe("guest");
  });

  it("classifies standing operators as employee", () => {
    expect(
      assigneeKind({ assignee_operator_id: "OP-001", to_agent: "finance" }, operators),
    ).toBe("employee");
  });

  it("classifies employee_id as employee", () => {
    expect(assigneeKind({ assignee_employee_id: "EMP-001", to_agent: "finance" })).toBe(
      "employee",
    );
  });

  it("classifies agent-only as ai", () => {
    expect(assigneeKind({ to_agent: "finance" })).toBe("ai");
  });

  it("classifies empty as unassigned", () => {
    expect(assigneeKind({})).toBe("unassigned");
  });

  it("labels assignees", () => {
    expect(
      assigneeLabel({ assignee_operator_id: "OP-001" }, operators),
    ).toBe("CEO");
    expect(assigneeLabel({ to_agent: "secretary" })).toBe("secretary");
  });
});

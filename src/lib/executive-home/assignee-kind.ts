/**
 * Derive Work Order assignee kind for Executive Home columns.
 * Path: src/lib/executive-home/assignee-kind.ts
 */
import type { Handoff } from "../../../schemas/routing.js";
import type { AssigneeKind } from "../../../schemas/executive-home.js";
import type { OperatorRecord } from "../../../schemas/org/operator.js";

export function assigneeKind(
  handoff: Pick<
    Handoff,
    "assignee_operator_id" | "assignee_employee_id" | "to_agent"
  >,
  operators: OperatorRecord[] = [],
): AssigneeKind {
  const opId = handoff.assignee_operator_id?.trim();
  if (opId) {
    const op = operators.find((o) => o.operator_id === opId);
    if (op?.guest_expires_at?.trim()) return "guest";
    return "employee";
  }
  if (handoff.assignee_employee_id?.trim()) return "employee";
  if (handoff.to_agent?.trim()) return "ai";
  return "unassigned";
}

export function assigneeLabel(
  handoff: Pick<
    Handoff,
    "assignee_operator_id" | "assignee_employee_id" | "to_agent"
  >,
  operators: OperatorRecord[] = [],
): string | undefined {
  const opId = handoff.assignee_operator_id?.trim();
  if (opId) {
    const op = operators.find((o) => o.operator_id === opId);
    return op?.display_name?.trim() || opId;
  }
  if (handoff.assignee_employee_id?.trim()) {
    return handoff.assignee_employee_id.trim();
  }
  if (handoff.to_agent?.trim()) return handoff.to_agent.trim();
  return undefined;
}

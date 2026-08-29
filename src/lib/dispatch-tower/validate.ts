import type { Handoff } from "../../../schemas/routing.js";
import { listHandoffs } from "../routing.js";
import { validateHumanCapacityFile } from "./human-capacity.js";

export function validateTowerHandoffs(): string[] {
  const issues: string[] = [];
  issues.push(...validateHumanCapacityFile());

  for (const h of listHandoffs()) {
    if (h.task_type !== "implement") continue;
    if (h.work_kind === "fact_live" && h.due_date) {
      issues.push(`${h.id}: fact_live work order must not have due_date`);
    }
    if (h.work_kind === "judgment" && h.to_agent && h.to_agent !== "integration") {
      issues.push(`${h.id}: judgment must not assign to AIA agent ${h.to_agent}`);
    }
  }
  return issues;
}

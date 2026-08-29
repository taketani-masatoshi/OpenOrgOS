import {
  opsRecurringTaskSchema,
  opsRecurringFileSchema,
  type OpsRecurringTask,
} from "../../../../schemas/hospitality-ops.js";
import { resolveTenantPath } from "../../../../src/lib/tenant.js";
import { currentDate, daysBetween, readYamlFile, writeYamlFile } from "../../../../src/lib/utils.js";
import { defaultHospitalityPropertyId } from "./ops-lib.js";

export const OPS_RECURRING_REL = "data/operations/ops-recurring.yaml";

function emptyFile() {
  return opsRecurringFileSchema.parse({ version: 1, tasks: [] });
}

export function loadRecurringTasks() {
  const path = resolveTenantPath(OPS_RECURRING_REL);
  try {
    return readYamlFile(path, opsRecurringFileSchema);
  } catch {
    return emptyFile();
  }
}

export function saveRecurringTasks(file: ReturnType<typeof loadRecurringTasks>): void {
  writeYamlFile(resolveTenantPath(OPS_RECURRING_REL), opsRecurringFileSchema.parse(file));
}

function advanceDue(task: OpsRecurringTask, completedOn: string): string {
  const [y, m, d] = task.next_due.split("-").map(Number);
  const base = new Date(y, m - 1, d);
  if (task.cadence === "monthly") base.setMonth(base.getMonth() + 1);
  else if (task.cadence === "quarterly") base.setMonth(base.getMonth() + 3);
  else if (task.cadence === "yearly") base.setFullYear(base.getFullYear() + 1);
  else return task.next_due;
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}

export function recurringComplete(taskId: string, completedOn = currentDate()): OpsRecurringTask {
  const file = loadRecurringTasks();
  const task = file.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`recurring task not found: ${taskId}`);
  const updated = opsRecurringTaskSchema.parse({
    ...task,
    last_completed_on: completedOn,
    next_due: advanceDue(task, completedOn),
  });
  saveRecurringTasks({
    version: 1,
    tasks: file.tasks.map((t) => (t.id === taskId ? updated : t)),
  });
  return updated;
}

export function listRecurringDue(today = currentDate()): OpsRecurringTask[] {
  return loadRecurringTasks().tasks.filter((task) => {
    const lead = task.lead_days.length ? Math.max(...task.lead_days) : 14;
    const windowStart = new Date(`${today}T12:00:00Z`);
    windowStart.setUTCDate(windowStart.getUTCDate() + lead);
    const windowIso = windowStart.toISOString().slice(0, 10);
    return task.next_due <= windowIso || daysBetween(today, task.next_due) <= lead;
  });
}

export function seedDefaultRecurringTasks(propertyId = defaultHospitalityPropertyId()): void {
  const file = loadRecurringTasks();
  if (file.tasks.length > 0) return;
  const today = currentDate();
  saveRecurringTasks({
    version: 1,
    tasks: [
      opsRecurringTaskSchema.parse({
        id: "REC-FIRE-INSPECT",
        title: "消防用設備等点検",
        category: "compliance",
        property_id: propertyId,
        cadence: "yearly",
        next_due: `${today.slice(0, 4)}-12-31`,
        cli_hint: "operations hospitality recurring-list",
      }),
      opsRecurringTaskSchema.parse({
        id: "REC-INSURANCE-RENEW",
        title: "火災保険更新",
        category: "insurance",
        property_id: propertyId,
        cadence: "yearly",
        next_due: `${Number(today.slice(0, 4)) + 1}-03-31`,
        cli_hint: "operations hospitality recurring-list",
      }),
    ],
  });
}

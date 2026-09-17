/**
 * Executive tasks.yaml store — SSOT for open work decisions.
 * Path: src/lib/tasks/store.ts
 * ADR: docs/adr/0071-executive-tasks-ssot-secretary-workbench.md
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  executiveTaskSchema,
  tasksFileSchema,
  type ExecutiveTask,
  type TaskPriority,
  type TaskStatus,
  type TasksFile,
} from "../../../schemas/executive.js";
import { loadExecutiveTasks } from "../data.js";
import { getExecutiveDir, writeYamlFile } from "../utils.js";

export type ListTasksOpts = {
  priority?: TaskPriority;
  status?: TaskStatus | TaskStatus[];
  /** When true, include done / cancelled / archived. Default open+in_progress+deferred. */
  includeClosed?: boolean;
};

const OPENISH: TaskStatus[] = ["open", "in_progress", "deferred"];

function tasksPath(): string {
  return join(getExecutiveDir(), "tasks.yaml");
}

export function loadTasksFile(): TasksFile {
  if (!existsSync(tasksPath())) {
    return tasksFileSchema.parse({ tasks: [] });
  }
  return loadExecutiveTasks();
}

export function saveTasksFile(file: TasksFile): TasksFile {
  const parsed = tasksFileSchema.parse(file);
  writeYamlFile(tasksPath(), parsed);
  return parsed;
}

export function nextTaskId(existing?: ExecutiveTask[]): string {
  const tasks = existing ?? loadTasksFile().tasks;
  let max = 0;
  for (const t of tasks) {
    const m = /^TASK-(\d+)$/.exec(t.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `TASK-${String(max + 1).padStart(3, "0")}`;
}

export function listTasks(opts: ListTasksOpts = {}): ExecutiveTask[] {
  let tasks = loadTasksFile().tasks;
  if (opts.priority) {
    tasks = tasks.filter((t) => t.priority === opts.priority);
  }
  if (opts.status) {
    const statuses = Array.isArray(opts.status) ? opts.status : [opts.status];
    tasks = tasks.filter((t) => statuses.includes(t.status));
  } else if (!opts.includeClosed) {
    tasks = tasks.filter((t) => OPENISH.includes(t.status));
  }
  return tasks;
}

export function getTask(id: string): ExecutiveTask | undefined {
  return loadTasksFile().tasks.find((t) => t.id === id);
}

export function upsertTask(
  input: Partial<ExecutiveTask> & Pick<ExecutiveTask, "title"> & { id?: string },
): ExecutiveTask {
  const file = loadTasksFile();
  const now = new Date().toISOString();
  const id = input.id ?? nextTaskId(file.tasks);
  const idx = file.tasks.findIndex((t) => t.id === id);
  const prior = idx >= 0 ? file.tasks[idx]! : undefined;
  const merged = executiveTaskSchema.parse({
    ...prior,
    ...input,
    id,
    links: { ...(prior?.links ?? {}), ...(input.links ?? {}) },
    updated_at: now,
  });
  if (idx >= 0) {
    file.tasks[idx] = merged;
  } else {
    file.tasks.push(merged);
  }
  saveTasksFile(file);
  return merged;
}

export function closeTask(
  id: string,
  opts?: { notes?: string; status?: "done" | "cancelled" },
): ExecutiveTask {
  const file = loadTasksFile();
  const idx = file.tasks.findIndex((t) => t.id === id);
  if (idx < 0) throw new Error(`Executive task ${id} not found`);
  const prior = file.tasks[idx]!;
  const updated = executiveTaskSchema.parse({
    ...prior,
    status: opts?.status ?? "done",
    next_action: opts?.notes ?? prior.next_action,
    updated_at: new Date().toISOString(),
  });
  file.tasks[idx] = updated;
  saveTasksFile(file);
  return updated;
}

/** Migrate cancelled → archived. Returns count migrated. */
export function archiveCancelledTasks(opts?: { dryRun?: boolean }): number {
  const file = loadTasksFile();
  let count = 0;
  const tasks = file.tasks.map((t) => {
    if (t.status !== "cancelled") return t;
    count++;
    return executiveTaskSchema.parse({
      ...t,
      status: "archived",
      updated_at: new Date().toISOString(),
    });
  });
  if (count === 0 || opts?.dryRun) return count;
  saveTasksFile({ ...file, tasks });
  return count;
}

export function setTaskAsanaGid(id: string, asanaTaskGid: string): ExecutiveTask {
  const task = getTask(id);
  if (!task) throw new Error(`Executive task ${id} not found`);
  return upsertTask({
    ...task,
    links: { ...task.links, asana_task_gid: asanaTaskGid },
  });
}

/**
 * Read-only task view — merges tasks.yaml (SSOT) with candidate sources.
 * Path: src/lib/tasks/task-view.ts
 * ADR: docs/adr/0071-executive-tasks-ssot-secretary-workbench.md
 */
import type { ExecutiveTask, TaskPriority } from "../../../schemas/executive.js";
import { listTriageEntries } from "../correspondence/mail-triage-queue.js";
import { listWorkOrders } from "../escalate.js";
import { listOrgApprovals } from "../org/approval/reject.js";
import { listTasks } from "./store.js";
import {
  triageCandidatePriority,
  workOrderTaskPriority,
} from "./candidate-priority.js";

export type TaskCandidateKind = "mail" | "work_order" | "approval";

export type TaskCandidate = {
  kind: TaskCandidateKind;
  id: string;
  title: string;
  priority: TaskPriority;
  status: string;
  href: string;
  due?: string | null;
};

export type TaskView = {
  tasks: ExecutiveTask[];
  candidates: TaskCandidate[];
  counts: {
    p0: number;
    p1: number;
    open: number;
    candidates: number;
  };
};

const PRIORITY_RANK: Record<TaskPriority, number> = {
  p0: 0,
  p1: 1,
  p2: 2,
  p3: 3,
};

function sortTasks(tasks: ExecutiveTask[]): ExecutiveTask[] {
  return [...tasks].sort((a, b) => {
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    const ad = a.due ?? "9999-99-99";
    const bd = b.due ?? "9999-99-99";
    if (ad !== bd) return ad.localeCompare(bd);
    return a.id.localeCompare(b.id);
  });
}

export function buildTaskView(opts?: { includeClosed?: boolean }): TaskView {
  const tasks = sortTasks(listTasks({ includeClosed: opts?.includeClosed }));

  const linkedTriage = new Set(
    tasks.map((t) => t.links?.triage_id).filter((v): v is string => Boolean(v)),
  );
  const linkedWo = new Set(
    tasks
      .map((t) => t.links?.work_order_id)
      .filter((v): v is string => Boolean(v)),
  );
  const linkedApr = new Set(
    tasks
      .map((t) => t.links?.approval_id)
      .filter((v): v is string => Boolean(v)),
  );

  const candidates: TaskCandidate[] = [];

  try {
    for (const entry of listTriageEntries({ unprocessed: true, limit: 40 })) {
      if (!entry.id || linkedTriage.has(entry.id)) continue;
      if (entry.disposition === "spam") continue;
      const priority = triageCandidatePriority(entry.importance, entry.urgency);
      candidates.push({
        kind: "mail",
        id: entry.id,
        title: entry.subject || "(no subject)",
        priority,
        status: `${entry.importance}/${entry.urgency}`,
        href: `/secretary/workbench/?mail=${encodeURIComponent(entry.id)}`,
      });
    }
  } catch {
    /* triage optional */
  }

  try {
    for (const wo of listWorkOrders("pending")) {
      if (!wo.id || linkedWo.has(wo.id)) continue;
      const priority = workOrderTaskPriority(wo.priority);
      candidates.push({
        kind: "work_order",
        id: wo.id,
        title: wo.subject || wo.context.text?.slice(0, 80) || wo.id,
        priority,
        status: wo.status,
        href: `/runs/?id=${encodeURIComponent(wo.id)}`,
        due: wo.due_date,
      });
    }
  } catch {
    /* work orders optional */
  }

  try {
    for (const apr of listOrgApprovals({ status: "pending_approval" })) {
      if (!apr.approval_id || linkedApr.has(apr.approval_id)) continue;
      candidates.push({
        kind: "approval",
        id: apr.approval_id,
        title: apr.message || apr.subject_type || apr.approval_id,
        priority: "p0",
        status: apr.status,
        href: `/approvals/?id=${encodeURIComponent(apr.approval_id)}`,
      });
    }
  } catch {
    /* approvals optional */
  }

  candidates.sort((a, b) => {
    const pr =
      (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (pr !== 0) return pr;
    return (a.id ?? "").localeCompare(b.id ?? "");
  });

  const open = tasks.filter(
    (t) => t.status === "open" || t.status === "in_progress",
  );
  return {
    tasks,
    candidates,
    counts: {
      p0: open.filter((t) => t.priority === "p0").length,
      p1: open.filter((t) => t.priority === "p1").length,
      open: open.length,
      candidates: candidates.length,
    },
  };
}

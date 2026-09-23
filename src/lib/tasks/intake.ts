/**
 * Promote candidate sources into tasks.yaml (intake) and one-shot P0 MD import.
 * Path: src/lib/tasks/intake.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ExecutiveTask, TaskPriority } from "../../../schemas/executive.js";
import { findTriageEntry } from "../correspondence/mail-triage-queue.js";
import { listWorkOrders } from "../escalate.js";
import { listOrgApprovals } from "../org/approval/reject.js";
import { getDocsDir } from "../utils.js";
import { listTasks, upsertTask } from "./store.js";
import { triageIntakePriority, workOrderTaskPriority } from "./candidate-priority.js";

export function intakeFromTriage(triageId: string): ExecutiveTask {
  const entry = findTriageEntry(triageId);
  if (!entry) throw new Error(`Triage entry ${triageId} not found`);
  const existing = listTasks({ includeClosed: true }).find((t) => t.links?.triage_id === triageId);
  if (existing) return existing;

  const priority = triageIntakePriority(entry.importance);

  return upsertTask({
    title: entry.subject || `Mail ${triageId}`,
    priority,
    status: "open",
    category: "follow_up",
    origin: {
      kind: "mail",
      ref: triageId,
      captured_at: new Date().toISOString(),
    },
    links: { triage_id: triageId },
    next_action: "Triage and reply or escalate",
  });
}

export function intakeFromWorkOrder(workOrderId: string): ExecutiveTask {
  const wo = listWorkOrders("all").find((h) => h.id === workOrderId);
  if (!wo) throw new Error(`Work order ${workOrderId} not found`);
  const existing = listTasks({ includeClosed: true }).find(
    (t) => t.links?.work_order_id === workOrderId
  );
  if (existing) return existing;

  const priority = workOrderTaskPriority(wo.priority);

  return upsertTask({
    title: wo.subject || wo.context.text?.slice(0, 120) || workOrderId,
    priority,
    status: "open",
    category: "business",
    due: wo.due_date ?? null,
    origin: {
      kind: "work_order",
      ref: workOrderId,
      captured_at: new Date().toISOString(),
    },
    links: { work_order_id: workOrderId },
    next_action: wo.blocked_on ? `Unblock: ${wo.blocked_on}` : undefined,
    blocked_on: wo.blocked_on,
  });
}

export function intakeFromApproval(approvalId: string): ExecutiveTask {
  const apr = listOrgApprovals({ status: "pending_approval" }).find(
    (a) => a.approval_id === approvalId
  );
  if (!apr) throw new Error(`Pending approval ${approvalId} not found`);
  const existing = listTasks({ includeClosed: true }).find(
    (t) => t.links?.approval_id === approvalId
  );
  if (existing) return existing;

  return upsertTask({
    title: apr.message || apr.subject_type || approvalId,
    priority: "p0",
    status: "open",
    category: "business",
    origin: {
      kind: "approval",
      ref: approvalId,
      captured_at: new Date().toISOString(),
    },
    links: { approval_id: approvalId },
    next_action: "Review and approve or reject",
  });
}

export type P0ImportDraft = {
  title: string;
  priority: TaskPriority;
  checked: boolean;
  slug: string;
};

/** Parse markdown checklist lines (`- [ ]` / `- [x]`) into draft tasks. */
export function parseP0RegisterMarkdown(md: string): P0ImportDraft[] {
  const lines = md.split(/\r?\n/);
  const out: P0ImportDraft[] = [];
  let sectionPriority: TaskPriority = "p1";
  for (const line of lines) {
    const heading = /^#{1,3}\s+(.*)/.exec(line);
    if (heading) {
      const h = heading[1]!.toLowerCase();
      if (/\bp0\b|最優先|緊急/.test(h)) sectionPriority = "p0";
      else if (/\bp1\b|重要/.test(h)) sectionPriority = "p1";
      else if (/\bp2\b|\bp3\b/.test(h)) sectionPriority = "p2";
      continue;
    }
    const item = /^[-*]\s+\[([ xX])\]\s+(.+)$/.exec(line.trim());
    if (!item) continue;
    const title = item[2]!.trim().replace(/\*\*/g, "").replace(/\s+/g, " ");
    if (!title) continue;
    const slug = title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64);
    out.push({
      title,
      priority: sectionPriority,
      checked: item[1]!.toLowerCase() === "x",
      slug: slug || `item-${out.length + 1}`,
    });
  }
  return out;
}

export function resolveP0RegisterPath(file?: string): string {
  if (file) {
    if (existsSync(file)) return file;
    const fromDocs = join(getDocsDir(), file.replace(/^docs\//, ""));
    if (existsSync(fromDocs)) return fromDocs;
    throw new Error(`P0 register file not found: ${file}`);
  }
  const defaultPath = join(getDocsDir(), "company", "executive-remaining-tasks.md");
  if (!existsSync(defaultPath)) {
    throw new Error("docs/company/executive-remaining-tasks.md not found — pass --file");
  }
  return defaultPath;
}

export function importP0Register(opts: { file?: string; write?: boolean }): {
  drafts: P0ImportDraft[];
  written: ExecutiveTask[];
  skipped: number;
} {
  const path = resolveP0RegisterPath(opts.file);
  const md = readFileSync(path, "utf8");
  const drafts = parseP0RegisterMarkdown(md).filter((d) => !d.checked);
  const written: ExecutiveTask[] = [];
  let skipped = 0;
  if (!opts.write) {
    return { drafts, written, skipped };
  }
  for (const d of drafts) {
    const existing = listTasks({ includeClosed: true }).find(
      (t) => t.origin?.kind === "p0_register" && (t.origin.ref === d.slug || t.title === d.title)
    );
    if (existing) {
      skipped++;
      continue;
    }
    written.push(
      upsertTask({
        title: d.title,
        priority: d.priority,
        status: "open",
        category: "business",
        origin: {
          kind: "p0_register",
          ref: d.slug,
          captured_at: new Date().toISOString(),
        },
        next_action: "Complete remaining P0 item",
      })
    );
  }
  return { drafts, written, skipped };
}

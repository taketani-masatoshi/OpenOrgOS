import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadHandoff, loadHandoffChildren, routingQueueDir, writeHandoffFiles } from "./routing.js";
import { handoffSchema, type Handoff } from "../../schemas/routing.js";
import {
  loadWorkOrderResult,
  pushQueueEvent,
  writeWorkOrderResult,
} from "./queue-db.js";
import { appendAuditEvent } from "./audit-log.js";
import { currentDate, ensureDocsReportsDir, writeTrackedFile } from "./utils.js";
import { sendWebhook } from "./webhook.js";

export interface MergeOptions {
  id: string;
  output?: string;
  autoCompleteParent?: boolean;
}

export function collectWorkOrdersForMerge(id: string): { parent?: Handoff; children: Handoff[] } {
  const root = loadHandoff(id);
  if (root.child_ids?.length) {
    return { parent: root, children: loadHandoffChildren(root) };
  }
  if (root.parent_id) {
    const parent = loadHandoff(root.parent_id);
    return { parent, children: loadHandoffChildren(parent) };
  }
  return { parent: undefined, children: [root] };
}

export function mergeWorkOrderResults(options: MergeOptions): { path: string; content: string } {
  const { parent, children } = collectWorkOrdersForMerge(options.id);
  const subject = parent?.subject ?? children[0]?.subject ?? "Work Order Merge";
  const lines = [
    `# 実装委譲 統合サマリ · ${currentDate()}`,
    "",
    `**件名:** ${subject}`,
    `**Parent:** ${parent?.id ?? "—"}`,
    "",
    "## 子 Work Order 結果",
    "",
    "| ID | Agent | Status | Summary |",
    "|----|-------|--------|---------|",
  ];

  let allComplete = true;
  for (const child of children) {
    const result = loadWorkOrderResult(child.id);
    const summary = result?.summary ?? child.completion_notes ?? "（結果未登録）";
    if (child.status !== "completed") allComplete = false;
    lines.push(
      `| ${child.id} | ${child.to_agent} | ${child.status} | ${summary.replace(/\|/g, "/").slice(0, 60)} |`
    );
  }

  lines.push("", "## 統合結論", "");
  const summaries = children
    .map((c) => loadWorkOrderResult(c.id)?.summary ?? c.completion_notes)
    .filter(Boolean);
  if (summaries.length) {
    lines.push(...summaries.map((s) => `- ${s}`), "");
  } else {
    lines.push("- 全 Agent 完了後に `escalate complete --id` + `escalate merge` を再実行", "");
  }

  lines.push("## 次アクション", "", "1. 人間レビュー · validate", "2. git commit（段承認）", "");

  const content = lines.join("\n");
  const outDir = ensureDocsReportsDir("executive-notes");
  const filename = options.output ?? `${currentDate()}-merge-${(parent?.id ?? options.id).replace(/[^A-Z0-9-]/gi, "")}.md`;
  const path = join(outDir, filename);
  writeTrackedFile(path, content);

  pushQueueEvent({
    type: "merge_complete",
    ref: parent?.id ?? options.id,
    status: "done",
    payload: { output: path, all_complete: allComplete },
  });

  appendAuditEvent({
    event: "escalate",
    ref: parent?.id ?? options.id,
    detail: `merge:${children.length} children`,
  });

  void sendWebhook("merge_complete", {
    id: parent?.id ?? options.id,
    path,
    all_complete: allComplete,
  }).catch(() => {});

  if (options.autoCompleteParent && parent && allComplete) {
    const updated = handoffSchema.parse({ ...parent, status: "completed" });
    writeHandoffFiles(updated);
  }

  return { path, content };
}

export function registerWorkOrderResult(
  workOrderId: string,
  summary: string,
  notes?: string
): void {
  const wo = loadHandoff(workOrderId);
  writeWorkOrderResult(workOrderId, {
    agent: wo.to_agent,
    summary,
    notes,
  });
  const updated = handoffSchema.parse({
    ...wo,
    status: "completed",
    completion_notes: notes ?? summary.slice(0, 200),
  });
  writeHandoffFiles(updated);
  pushQueueEvent({
    type: "work_order_complete",
    ref: workOrderId,
    status: "done",
    payload: { summary: summary.slice(0, 500) },
  });
  void sendWebhook("work_order_complete", { id: workOrderId, agent: wo.to_agent, summary }).catch(
    () => {}
  );

  if (wo.parent_id) {
    const parent = loadHandoff(wo.parent_id);
    const siblings = (parent.child_ids ?? []).map((cid) => loadHandoff(cid));
    if (siblings.every((s) => s.status === "completed")) {
      mergeWorkOrderResults({ id: wo.parent_id, autoCompleteParent: true });
    }
  }
}

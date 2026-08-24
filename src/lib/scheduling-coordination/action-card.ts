import { writeFileSync } from "node:fs";
import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import type { CorrespondenceDraft } from "../../../schemas/correspondence/draft.js";
import { buildGmailComposeUrl } from "../mail-compose-url.js";
import { correspondenceDraftMdPath } from "../correspondence/paths.js";
import type { SchedulingDraftKind } from "./draft-text.js";
import { findUnanimousAcceptedSlot } from "./slots.js";

function resolveSlot(caseRow: SchedulingCase) {
  return (
    findUnanimousAcceptedSlot(caseRow.participants, caseRow.proposed_slots) ??
    caseRow.proposed_slots.find((s) => s.id === caseRow.pending_slot_id) ??
    caseRow.proposed_slots[0]
  );
}

function kindLabel(kind: SchedulingDraftKind): string {
  switch (kind) {
    case "clarify":
      return "会場案のご相談（候補日前）";
    case "proposal":
      return "候補日時の送付";
    case "reminder":
      return "未回答者へのリマインド";
    case "confirm":
      return "日程確定の連絡";
  }
}

export function buildSchedulingActionCardMarkdown(opts: {
  caseRow: SchedulingCase;
  draft: CorrespondenceDraft;
  kind: SchedulingDraftKind;
  approvalId?: string;
}): string {
  const { caseRow, draft, kind, approvalId } = opts;
  const slot = resolveSlot(caseRow);
  const gmailUrl = buildGmailComposeUrl({
    to: draft.to ?? "",
    cc: draft.cc,
    subject: draft.subject ?? caseRow.title,
    body: draft.body,
  });

  const lines = [
    `# 日程調整 — ${kindLabel(kind)}`,
    "",
    `> **自動送信禁止** — Steward Chat または承認画面から送信してください。`,
    "",
    "## 今日やること",
    "",
    "| # | やること | 状態 |",
    "|---|---------|------|",
  ];

  lines.push("| 1 | [Gmail で下書きを開く](#gmail) → 確認して送信 | ☐ |");

  lines.push(
    "",
    "## 案件サマリー",
    "",
    "| 項目 | 内容 |",
    "|------|------|",
    `| 案件 | ${caseRow.id} · ${caseRow.title} |`,
    `| 参加者 | ${caseRow.participants.map((p) => p.name).join("、")} |`,
    `| 下書き | ${draft.draft_id} |`
  );

  if (approvalId ?? draft.approval_id) {
    lines.push(`| 承認 | ${approvalId ?? draft.approval_id} |`);
  }

  if (slot) {
    lines.push(`| 日時 | ${slot.label ?? `${slot.start}–${slot.end}`} |`);
  }

  lines.push(
    "",
    "## Gmail",
    "",
    `[Gmail で下書きを開く](${gmailUrl})`,
    ""
  );

  lines.push(
    "## メール本文（コピー用）",
    "",
    `**宛先:** ${draft.to ?? "—"}`,
    draft.cc ? `**Cc:** ${draft.cc}` : "",
    `**件名:** ${draft.subject ?? "—"}`,
    "",
    "```",
    draft.body.trimEnd(),
    "```",
    ""
  );

  return lines.filter(Boolean).join("\n");
}

export function writeSchedulingActionCard(opts: {
  caseRow: SchedulingCase;
  draft: CorrespondenceDraft;
  kind: SchedulingDraftKind;
  approvalId?: string;
}): string {
  const md = buildSchedulingActionCardMarkdown(opts);
  const path = correspondenceDraftMdPath(opts.draft.draft_id);
  writeFileSync(path, md, "utf-8");
  return path;
}

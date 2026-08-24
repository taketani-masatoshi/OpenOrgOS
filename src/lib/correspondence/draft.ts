import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { currentDate, readYamlFile, writeYamlFile } from "../utils.js";
import {
  correspondenceDraftSchema,
  type CorrespondenceDraft,
  type CorrespondenceChannel,
} from "../../../schemas/correspondence/draft.js";
import { proposeOrgApproval } from "../org/approval/index.js";
import { CORRESPONDENCE_CLI } from "./cli-labels.js";
import { resolveDefaultCorrespondenceCc } from "./cc-defaults.js";
import {
  correspondenceDraftMdPath,
  correspondenceDraftYamlPath,
  getCorrespondenceDraftsDir,
} from "./paths.js";
import { sanitizeOutboundEmailBody } from "./body-sanitize.js";
import { recordSecretaryDraftEditIfBodyChanged } from "../scheduling-coordination/quality-signals.js";

function nextDraftId(): string {
  const dir = getCorrespondenceDraftsDir();
  mkdirSync(dir, { recursive: true });
  const date = currentDate().replace(/-/g, "");
  const prefix = `DRAFT-${date}-`;
  let max = 0;
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      const m = name.match(/^DRAFT-\d{8}-(\d{3})/);
      if (m && name.startsWith(prefix)) {
        max = Math.max(max, parseInt(m[1]!, 10));
      }
    }
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
  return slug || "message";
}

export interface CreateCorrespondenceDraftOptions {
  channel: CorrespondenceChannel;
  body: string;
  createdBy: string;
  to?: string;
  cc?: string;
  subject?: string;
  slackChannel?: string;
  contactRef?: string;
  attachmentRefs?: string[];
  notes?: string;
  slug?: string;
  proposeApproval?: boolean;
  /** Skip automatic oversight CC (CEO 等) */
  skipCcDefaults?: boolean;
}

export function saveCorrespondenceDraft(
  draft: CorrespondenceDraft,
): CorrespondenceDraft {
  const parsed = correspondenceDraftSchema.parse(draft);
  mkdirSync(getCorrespondenceDraftsDir(), { recursive: true });
  writeYamlFile(correspondenceDraftYamlPath(parsed.draft_id), parsed);
  writeFileSync(
    correspondenceDraftMdPath(parsed.draft_id),
    buildCorrespondenceDraftMarkdown(parsed),
    "utf-8",
  );
  return parsed;
}

export function loadCorrespondenceDraft(draftId: string): CorrespondenceDraft {
  const path = correspondenceDraftYamlPath(draftId);
  if (!existsSync(path)) {
    throw new Error(`Correspondence draft ${draftId} not found`);
  }
  return readYamlFile(path, correspondenceDraftSchema);
}

export function listCorrespondenceDrafts(opts?: {
  status?: CorrespondenceDraft["status"];
  channel?: CorrespondenceChannel;
}): CorrespondenceDraft[] {
  const dir = getCorrespondenceDraftsDir();
  if (!existsSync(dir)) return [];
  const drafts: CorrespondenceDraft[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".yaml")) continue;
    const draft = readYamlFile(
      joinYamlPath(dir, name),
      correspondenceDraftSchema,
    );
    if (opts?.status && draft.status !== opts.status) continue;
    if (opts?.channel && draft.channel !== opts.channel) continue;
    drafts.push(draft);
  }
  return drafts.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function joinYamlPath(dir: string, name: string): string {
  return `${dir}/${name}`;
}

export function createCorrespondenceDraft(
  opts: CreateCorrespondenceDraftOptions,
): { draft: CorrespondenceDraft; approvalId?: string } {
  if (opts.channel === "email" && (!opts.to || !opts.subject)) {
    throw new Error("email channel requires --to and --subject");
  }
  if (opts.channel === "slack" && !opts.slackChannel) {
    throw new Error("slack channel requires --slack-channel");
  }

  const slug =
    opts.slug ?? slugify(opts.subject ?? opts.slackChannel ?? "message");
  const draftId = `${nextDraftId()}${slug ? `-${slug}` : ""}`;

  let cc = opts.cc;
  if (opts.channel === "email") {
    const ccResolved = resolveDefaultCorrespondenceCc({
      to: opts.to,
      explicitCc: opts.cc,
      skipDefaults: opts.skipCcDefaults,
    });
    cc = ccResolved.cc;
  }

  let draft: CorrespondenceDraft = {
    draft_id: draftId,
    channel: opts.channel,
    status: "draft",
    created_at: new Date().toISOString(),
    created_by: opts.createdBy,
    to: opts.to,
    cc,
    subject: opts.subject,
    body: sanitizeOutboundEmailBody(opts.body),
    slack_channel: opts.slackChannel,
    contact_ref: opts.contactRef,
    attachment_refs: opts.attachmentRefs ?? [],
    notes: opts.notes,
  };

  let approvalId: string | undefined;
  if (opts.proposeApproval !== false) {
    const subjectType =
      opts.channel === "email"
        ? "correspondence.email"
        : "correspondence.slack";
    const approval = proposeOrgApproval({
      scope: "internal",
      subjectType,
      subjectRef: draftId,
      proposedBy: opts.createdBy,
      message: opts.subject ?? opts.body.slice(0, 120),
    });
    approvalId = approval.approval_id;
    draft = {
      ...draft,
      status: "pending_approval",
      approval_id: approvalId,
    };
  }

  saveCorrespondenceDraft(draft);
  return { draft, approvalId };
}

import { writeVenueBookingHandoff } from "../scheduling-coordination/venue-handoff.js";

function schedulingCaseIdFromDraftNotes(notes?: string): string | undefined {
  return notes?.match(/\bscheduling-case:(SCH-\d{4}-\d{3})\b/)?.[1];
}

export function markCorrespondenceDraftApproved(
  draftId: string,
): CorrespondenceDraft {
  const draft = loadCorrespondenceDraft(draftId);
  if (draft.status !== "pending_approval") {
    throw new Error(
      `Draft ${draftId} status is ${draft.status}, expected pending_approval`,
    );
  }
  const caseId = schedulingCaseIdFromDraftNotes(draft.notes);
  if (caseId) {
    recordSecretaryDraftEditIfBodyChanged(caseId, draft);
  }
  return saveCorrespondenceDraft({ ...draft, status: "approved" });
}

export function markCorrespondenceDraftSent(
  draftId: string,
  opts: { sentBy: string; companyEventId?: string },
): CorrespondenceDraft {
  const draft = loadCorrespondenceDraft(draftId);
  return saveCorrespondenceDraft({
    ...draft,
    status: "sent",
    sent_at: new Date().toISOString(),
    sent_by: opts.sentBy,
    company_event_id: opts.companyEventId,
  });
}

function buildCorrespondenceDraftMarkdown(draft: CorrespondenceDraft): string {
  const lines = [
    `# 対外連絡下書き — ${draft.draft_id}`,
    "",
    `> **自動送信禁止** — \`org approval approve\` 後に \`${CORRESPONDENCE_CLI.send}\` を実行`,
    "",
    "| 項目 | 値 |",
    "|------|-----|",
    `| channel | ${draft.channel} |`,
    `| status | ${draft.status} |`,
    `| approval_id | ${draft.approval_id ?? "—"} |`,
    `| created_by | ${draft.created_by} |`,
  ];
  if (draft.channel === "email") {
    lines.push(`| to | ${draft.to ?? "—"} |`);
    lines.push(`| cc | ${draft.cc ?? "—"} |`);
    lines.push(`| subject | ${draft.subject ?? "—"} |`);
  } else {
    lines.push(`| slack_channel | ${draft.slack_channel ?? "—"} |`);
  }
  if (draft.attachment_refs.length > 0) {
    lines.push(`| attachments | ${draft.attachment_refs.join("<br>")} |`);
  }
  lines.push("", "## 本文", "", "```", draft.body.trimEnd(), "```", "");
  if (draft.notes) {
    lines.push("## 内部メモ", "", draft.notes, "");
  }
  return lines.join("\n");
}

export function readCorrespondenceDraftBodyFromFile(path: string): string {
  return readFileSync(path, "utf-8");
}

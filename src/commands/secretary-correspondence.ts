import { readFileSync } from "node:fs";
import {
  createCorrespondenceDraft,
  listCorrespondenceDrafts,
  loadCorrespondenceDraft,
} from "../lib/correspondence/draft.js";
import { sendApprovedCorrespondence } from "../lib/correspondence/send-gate.js";
import { listExecutiveMail } from "../lib/correspondence/mail-list.js";
import {
  ensureMailConfigExample,
  loadMailConfig,
  resolveMailConfig,
} from "../lib/correspondence/mail-config.js";
import { auditCliMutation, requireCliDataWrite } from "../lib/console-auth/cli-operator.js";
import { getCliOperatorContext } from "../lib/console-auth/cli-operator.js";

export interface CorrespondenceDraftCliOptions {
  channel?: string;
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
  bodyFile?: string;
  slackChannel?: string;
  contactRef?: string;
  notes?: string;
  operator?: string;
  noApproval?: boolean;
  json?: boolean;
}

export function runCorrespondenceDraft(opts: CorrespondenceDraftCliOptions): void {
  if (!opts.body && !opts.bodyFile) {
    console.error("Provide --body or --body-file");
    process.exit(1);
  }
  requireCliDataWrite({ command: "secretary correspondence draft", permission: "escalate:plan" });

  const channel = (opts.channel ?? "email") as "email" | "slack";
  let body = opts.body ?? "";
  if (opts.bodyFile) {
    body = readFileSync(opts.bodyFile, "utf-8");
  }

  const operator =
    opts.operator ?? getCliOperatorContext()?.record.operator_id ?? "secretary";

  const { draft, approvalId } = createCorrespondenceDraft({
    channel,
    body,
    createdBy: operator,
    to: opts.to,
    cc: opts.cc,
    subject: opts.subject,
    slackChannel: opts.slackChannel,
    contactRef: opts.contactRef,
    notes: opts.notes,
    proposeApproval: !opts.noApproval,
  });

  auditCliMutation("secretary correspondence draft", draft.draft_id);

  if (opts.json) {
    console.log(JSON.stringify({ draft, approvalId }, null, 2));
    return;
  }

  console.log(`✓ draft ${draft.draft_id} · ${draft.channel} · ${draft.status}`);
  if (approvalId) {
    console.log(`  approval: ${approvalId} (pending_approval)`);
    console.log(`  next: org approval approve --id ${approvalId} --approver "<name>"`);
  }
  console.log(`  path: docs/executive/correspondence-drafts/${draft.draft_id}.yaml`);
}

export interface CorrespondenceListCliOptions {
  status?: string;
  channel?: string;
  json?: boolean;
}

export function runCorrespondenceList(opts: CorrespondenceListCliOptions): void {
  const drafts = listCorrespondenceDrafts({
    status: opts.status as ReturnType<typeof listCorrespondenceDrafts>[number]["status"] | undefined,
    channel: opts.channel as "email" | "slack" | undefined,
  });
  if (opts.json) {
    console.log(JSON.stringify(drafts, null, 2));
    return;
  }
  if (!drafts.length) {
    console.log("(no correspondence drafts)");
    return;
  }
  console.log("| draft_id | channel | status | approval | subject/channel |");
  console.log("|---|---|---|---|---|");
  for (const d of drafts) {
    const label = d.channel === "email" ? (d.subject ?? "—") : (d.slack_channel ?? "—");
    console.log(
      `| ${d.draft_id} | ${d.channel} | ${d.status} | ${d.approval_id ?? "—"} | ${label} |`
    );
  }
}

export interface CorrespondenceShowCliOptions {
  id: string;
  json?: boolean;
}

export function runCorrespondenceShow(opts: CorrespondenceShowCliOptions): void {
  const draft = loadCorrespondenceDraft(opts.id);
  if (opts.json) {
    console.log(JSON.stringify(draft, null, 2));
    return;
  }
  console.log(JSON.stringify(draft, null, 2));
}

export interface CorrespondenceSendCliOptions {
  id: string;
  operator?: string;
  dryRun?: boolean;
  json?: boolean;
}

export async function runCorrespondenceSend(opts: CorrespondenceSendCliOptions): Promise<void> {
  if (!opts.dryRun) {
    requireCliDataWrite({ command: "secretary correspondence send", permission: "chat:approve" });
  }

  const operator =
    opts.operator ?? getCliOperatorContext()?.record.operator_id ?? "secretary";

  try {
    const result = await sendApprovedCorrespondence({
      draftId: opts.id,
      operatorId: operator,
      dryRun: opts.dryRun,
    });

    if (!opts.dryRun) {
      auditCliMutation("secretary correspondence send", opts.id);
    }

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const mode = result.sendResult.mode ?? (result.sendResult.sent ? "slack" : "unknown");
    console.log(`✓ sent ${result.draft.draft_id} · ${result.draft.channel} · mode=${mode}`);
    if (result.companyEventId) {
      console.log(`  company event: ${result.companyEventId}`);
    }
    if ("artifactPath" in result.sendResult && result.sendResult.artifactPath) {
      console.log(`  artifact: ${result.sendResult.artifactPath}`);
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

export interface SecretaryMailListCliOptions {
  direction?: string;
  limit?: number;
  json?: boolean;
}

export function runSecretaryMailList(opts: SecretaryMailListCliOptions): void {
  const entries = listExecutiveMail({
    direction: (opts.direction as "sent" | "received" | "all") ?? "all",
    limit: opts.limit ?? 50,
  });
  if (opts.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }
  if (!entries.length) {
    console.log("(no mail entries)");
    return;
  }
  console.log("| direction | subject | to/from | date | source |");
  console.log("|---|---|---|---|---|");
  for (const e of entries) {
    console.log(
      `| ${e.direction} | ${e.subject.slice(0, 40)} | ${e.to ?? e.from ?? "—"} | ${e.date.slice(0, 10)} | ${e.source} |`
    );
  }
}

export function runSecretaryMailConfig(opts: { json?: boolean }): void {
  ensureMailConfigExample();
  const fileConfig = loadMailConfig();
  const resolved = resolveMailConfig();
  const out = {
    config_path: "records/executive/mail-config.yaml",
    example_path: "records/executive/mail-config.yaml.example",
    file_configured: Boolean(fileConfig),
    resolved_provider: resolved.provider,
    from: resolved.from,
    inbox_sync: resolved.inbox?.sync ?? "stub",
    env: {
      ORGOS_SMTP_HOST: Boolean(process.env.ORGOS_SMTP_HOST),
      ORGOS_SMTP_USER: Boolean(process.env.ORGOS_SMTP_USER),
      ORGOS_SLACK_WEBHOOK_URL: Boolean(process.env.ORGOS_SLACK_WEBHOOK_URL),
    },
  };
  if (opts.json) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  console.log(JSON.stringify(out, null, 2));
}

/** Skill runner: correspondence-send */
export async function runCorrespondenceSendSkill(opts: {
  id?: string;
  dryRun?: boolean;
}): Promise<void> {
  if (!opts.id) {
    console.error("Provide --id DRAFT-...");
    process.exit(1);
  }
  await runCorrespondenceSend({ id: opts.id, dryRun: opts.dryRun });
}

/** Skill runner: slack-notify (alias for slack channel send) */
export async function runSlackNotifySkill(opts: {
  id?: string;
  dryRun?: boolean;
}): Promise<void> {
  if (!opts.id) {
    console.error("Provide --id DRAFT-...");
    process.exit(1);
  }
  const draft = loadCorrespondenceDraft(opts.id);
  if (draft.channel !== "slack") {
    console.error(`Draft ${opts.id} is not slack channel`);
    process.exit(1);
  }
  await runCorrespondenceSend({ id: opts.id, dryRun: opts.dryRun });
}

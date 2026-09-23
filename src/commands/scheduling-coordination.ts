import type { SchedulingCase } from "../../schemas/executive/scheduling-cases.js";
import {
  auditCliMutation,
  getCliOperatorContext,
  requireCliDataWrite,
  requireCliSchedulingApproval,
} from "../lib/console-auth/cli-operator.js";
import { confirmSchedulingCaseFromCeo } from "../lib/scheduling-coordination/ceo-confirm.js";
import { nextActionLabel } from "../lib/scheduling-coordination/next-action.js";
import {
  listSchedulingDraftPreviewTargets,
  resolveSchedulingRecipients,
} from "../lib/scheduling-coordination/recipients.js";
import {
  buildSchedulingDraftText,
  draftKindForNextAction,
  formatSchedulingCaseSummary,
  type SchedulingDraftKind,
} from "../lib/scheduling-coordination/draft-text.js";
import { processAllScheduleMails } from "../lib/scheduling-coordination/process-mail.js";
import { linkMailToCase } from "../lib/scheduling-coordination/mail-intake.js";
import { runScheduleCoordinationAutoProcess } from "../lib/scheduling-coordination/auto-process.js";
import { runSchedulingReminderPoll } from "../lib/scheduling-coordination/reminder-poller.js";
import { findSchedulingCase, listSchedulingCases } from "../lib/scheduling-coordination/store.js";
import { ensureSchedulingCorrespondenceDrafts } from "../lib/scheduling-coordination/correspondence-drafts.js";
import {
  assertSchedulingCaseConfirmable,
  cancelSchedulingCase,
  closeSchedulingCase,
  markSchedulingCaseSlotConfirmed,
  openSchedulingCase,
  parseSchedulingParticipantArg,
  proposeSchedulingCaseSlots,
  recordSchedulingParticipantResponse,
  rescheduleSchedulingCase,
} from "../lib/scheduling-coordination/case-mutations.js";
import {
  formatSchedulingEmptyList,
  formatSchedulingListLine,
  formatSchedulingNewResult,
  formatSchedulingProposeResult,
  formatSchedulingRespondResult,
} from "./scheduling-coordination-render.js";

export type { SchedulingParticipantInput } from "../lib/scheduling-coordination/case-mutations.js";
import {
  formatSchedulingEmptyList,
  formatSchedulingListLine,
  formatSchedulingNewResult,
  formatSchedulingProposeResult,
  formatSchedulingRespondResult,
} from "./scheduling-coordination-render.js";

function requireSchedulingCase(id: string): SchedulingCase {
  const caseRow = findSchedulingCase(id);
  if (!caseRow) {
    console.error(`Case ${id} not found`);
    process.exit(1);
  }
  return caseRow;
}

export function runSchedulingList(opts: { status?: string; json?: boolean; active?: boolean }): void {
  const cases = listSchedulingCases({
    activeOnly: opts.active !== false,
    status: opts.status as SchedulingCase["status"] | undefined,
  });

  if (opts.json) {
    console.log(JSON.stringify(cases, null, 2));
    return;
  }

  if (!cases.length) {
    console.log(formatSchedulingEmptyList());
    return;
  }

  for (const c of cases) {
    console.log(formatSchedulingListLine(c));
  }
}

export function runSchedulingShow(opts: { id: string; json?: boolean }): void {
  const caseRow = requireSchedulingCase(opts.id);
  if (opts.json) {
    console.log(JSON.stringify(caseRow, null, 2));
    return;
  }
  console.log(formatSchedulingCaseSummary(caseRow));
  console.log("\nSlots:");
  for (const s of caseRow.proposed_slots) {
    console.log(`  ${s.id}: ${s.label ?? s.start}`);
  }
  console.log("\nMail thread:", caseRow.mail_thread_ids.join(", ") || "—");
}

export function runSchedulingNew(opts: {
  title: string;
  participant: string[];
  duration?: number;
  from?: string;
  to?: string;
  meetingFormat?: "online" | "in_person" | "unspecified";
  location?: string;
  json?: boolean;
}): void {
  requireCliDataWrite({ command: "executive scheduling new", permission: "scheduling:write" });
  const caseRow = openSchedulingCase({
    title: opts.title,
    participants: opts.participant.map(parseSchedulingParticipantArg),
    durationMinutes: opts.duration,
    searchFrom: opts.from,
    searchTo: opts.to,
    meetingFormat: opts.meetingFormat,
    location: opts.location,
  });
  auditCliMutation("executive scheduling new", caseRow.id);

  if (opts.json) {
    console.log(JSON.stringify(caseRow, null, 2));
    return;
  }
  console.log(formatSchedulingNewResult(caseRow));
}

export function runSchedulingPropose(opts: {
  id: string;
  from?: string;
  to?: string;
  count?: number;
  json?: boolean;
}): void {
  requireCliDataWrite({ command: "executive scheduling propose", permission: "scheduling:write" });
  requireSchedulingCase(opts.id);
  const updated = proposeSchedulingCaseSlots({
    id: opts.id,
    from: opts.from,
    to: opts.to,
    count: opts.count,
  });
  auditCliMutation("executive scheduling propose", updated.id);

  if (opts.json) {
    console.log(JSON.stringify(updated, null, 2));
    return;
  }
  console.log(formatSchedulingProposeResult(updated));
}

export function runSchedulingRespond(opts: {
  id: string;
  email?: string;
  participant?: string;
  response: "accept" | "decline" | "counter" | "pending" | "unknown";
  slotId?: string;
  mailId?: string;
  note?: string;
  json?: boolean;
}): void {
  requireCliDataWrite({ command: "executive scheduling respond", permission: "scheduling:write" });
  requireSchedulingCase(opts.id);
  const updated = recordSchedulingParticipantResponse({
    id: opts.id,
    email: opts.email,
    participantId: opts.participant,
    response: opts.response,
    slotId: opts.slotId,
    mailId: opts.mailId,
    note: opts.note,
  });
  auditCliMutation("executive scheduling respond", updated.id);

  if (opts.json) {
    console.log(JSON.stringify(updated, null, 2));
    return;
  }
  console.log(formatSchedulingRespondResult(updated));
}

export function runSchedulingLinkMail(opts: { id: string; mailId: string; json?: boolean }): void {
  requireCliDataWrite({ command: "executive scheduling link-mail", permission: "scheduling:write" });
  const updated = linkMailToCase(opts.id, opts.mailId);
  auditCliMutation("executive scheduling link-mail", `${opts.id}+${opts.mailId}`);
  if (opts.json) {
    console.log(JSON.stringify(updated, null, 2));
    return;
  }
  console.log(`✓ linked ${opts.mailId} → ${updated.id}`);
}

export async function runSchedulingProcess(opts: {
  mailId?: string;
  all?: boolean;
  json?: boolean;
}): Promise<void> {
  const results = await processAllScheduleMails({
    mailIds: opts.mailId ? [opts.mailId] : opts.all ? undefined : undefined,
  });

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (!results.length) {
    console.log("(no schedule mails to process)");
    return;
  }

  for (const r of results) {
    console.log(`${r.mail_id}: ${r.action}${r.case_id ? ` → ${r.case_id}` : ""}${r.reason ? ` (${r.reason})` : ""}`);
  }
}

export async function runSchedulingConfirm(opts: {
  id: string;
  slotId: string;
  writeCalendar?: boolean;
  pushCalendar?: boolean;
  json?: boolean;
}): Promise<void> {
  requireCliSchedulingApproval("executive scheduling confirm");
  const caseRow = requireSchedulingCase(opts.id);
  assertSchedulingCaseConfirmable(caseRow, opts.slotId);

  if (opts.writeCalendar) {
    const cliOperator = getCliOperatorContext();
    const closed = await confirmSchedulingCaseFromCeo(opts.id, opts.slotId, {
      pushCalendar: opts.pushCalendar !== false,
      ceoAuthorize: cliOperator
        ? {
            approverName:
              cliOperator.record.approver_name ??
              cliOperator.record.display_name,
            operatorId: cliOperator.record.operator_id,
          }
        : undefined,
    });
    auditCliMutation("executive scheduling confirm", `${opts.id}+${closed.linked_event_id ?? opts.slotId}`);
    if (opts.json) {
      console.log(JSON.stringify(closed, null, 2));
      return;
    }
    console.log(
      `✓ confirmed ${opts.id} · ${closed.linked_event_id ?? "calendar"}${opts.pushCalendar !== false ? " · pushed" : ""}`
    );
    return;
  }

  const updated = markSchedulingCaseSlotConfirmed(opts.id, opts.slotId);
  auditCliMutation("executive scheduling confirm", opts.id);
  if (opts.json) {
    console.log(JSON.stringify(updated, null, 2));
    return;
  }
  console.log(`✓ confirmed ${opts.id} · slot ${opts.slotId}`);
}

export function runSchedulingDraft(opts: {
  id: string;
  kind?: SchedulingDraftKind;
  writeDraft?: boolean;
  participant?: string;
  json?: boolean;
}): void {
  const caseRow = requireSchedulingCase(opts.id);

  const kind = opts.kind ?? draftKindForNextAction(caseRow);
  if (!kind) {
    console.error(`No draft kind for next_action=${caseRow.next_action}`);
    process.exit(1);
  }

  const targets = listSchedulingDraftPreviewTargets(caseRow, kind, opts.participant);

  if (opts.writeDraft) {
    requireCliDataWrite({ command: "executive scheduling draft", permission: "scheduling:write" });
    const operator = getCliOperatorContext()?.record.operator_id ?? "secretary";
    const before = new Set(caseRow.correspondence.map((record) => record.draft_id));
    const updated = ensureSchedulingCorrespondenceDrafts(caseRow.id, kind, operator);
    if (updated.status === "needs_review" && updated.exception_reason?.startsWith("schedule_contact_unresolved")) {
      throw new Error(
        `Unresolved scheduling contact blocks send: ${updated.exception_reason.split(":")[1]}`
      );
    }
    const created = updated.correspondence.filter((record) => !before.has(record.draft_id));
    for (const record of created) {
      auditCliMutation("executive scheduling draft", record.draft_id);
    }
    if (opts.json) {
      console.log(JSON.stringify({ drafts: created }, null, 2));
      return;
    }
    for (const record of created) {
      console.log(`✓ draft ${record.draft_id} · participant ${record.participant_id}`);
    }
    return;
  }

  for (const target of targets) {
    const targetId = opts.participant ?? target?.id;
    const { subject, body } = buildSchedulingDraftText(caseRow, kind, target);
    const recipients = resolveSchedulingRecipients(caseRow, kind, targetId);

    if (opts.json) {
      console.log(JSON.stringify({ subject, body, to: recipients.to, cc: recipients.cc }, null, 2));
      return;
    }
    console.log(`Subject: ${subject}\n\n${body}`);
    if (recipients.to) console.log(`\nTo: ${recipients.to}`);
    if (recipients.cc) console.log(`Cc: ${recipients.cc}`);
    return;
  }
}

export function runSchedulingClose(opts: { id: string; json?: boolean }): void {
  requireCliDataWrite({ command: "executive scheduling close", permission: "scheduling:write" });
  requireSchedulingCase(opts.id);
  const updated = closeSchedulingCase(opts.id);
  auditCliMutation("executive scheduling close", opts.id);
  if (opts.json) {
    console.log(JSON.stringify(updated, null, 2));
    return;
  }
  console.log(`✓ closed ${opts.id}`);
}

export function runSchedulingCancel(opts: { id: string; reason?: string; json?: boolean }): void {
  requireCliDataWrite({ command: "executive scheduling cancel", permission: "scheduling:write" });
  const updated = cancelSchedulingCase(opts.id, opts.reason);
  auditCliMutation("executive scheduling cancel", opts.id);
  if (opts.json) console.log(JSON.stringify(updated, null, 2));
}

export function runSchedulingReschedule(opts: { id: string; json?: boolean }): void {
  requireCliDataWrite({ command: "executive scheduling reschedule", permission: "scheduling:write" });
  const updated = rescheduleSchedulingCase(opts.id);
  auditCliMutation("executive scheduling reschedule", updated.id);
  if (opts.json) console.log(JSON.stringify(updated, null, 2));
}

export async function runSchedulingAutoProcess(opts: { json?: boolean }): Promise<void> {
  const result = await runScheduleCoordinationAutoProcess();
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(
    `# Schedule auto-process\n\nprocessed: ${result.processed} · updated: ${result.updated} · unlinked: ${result.unlinked}`
  );
  for (const r of result.results) {
    console.log(`  ${r.mail_id}: ${r.action}${r.case_id ? ` → ${r.case_id}` : ""}`);
  }
}

export async function runSchedulingReminderPollCommand(opts: {
  json?: boolean;
  at?: string;
}): Promise<void> {
  const now = opts.at ? new Date(opts.at) : new Date();
  const result = runSchedulingReminderPoll(now);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(
    `# Schedule reminder poll\n\nscanned: ${result.scanned} · due: ${result.due} · drafted: ${result.drafted}`
  );
  for (const caseId of result.case_ids) {
    console.log(`  ${caseId}: reminder drafts created`);
  }
}

export function runScheduleCoordinationSkill(opts: { json?: boolean }): void {
  const active = listSchedulingCases({ activeOnly: true });
  const needing = active.filter((c) => c.next_action !== "none");
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          active: active.length,
          needing_action: needing.length,
          cases: needing.map((c) => ({
            id: c.id,
            title: c.title,
            status: c.status,
            next_action: c.next_action,
          })),
        },
        null,
        2
      )
    );
    return;
  }
  console.log(`日程調整案件: 進行中 ${active.length} 件 · 要アクション ${needing.length} 件`);
  for (const c of needing.slice(0, 10)) {
    console.log(`  ${c.id} · ${c.title} · ${nextActionLabel(c.next_action)}`);
  }
}

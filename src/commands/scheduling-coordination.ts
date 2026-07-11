import type {
  SchedulingCase,
  SchedulingParticipant,
} from "../../schemas/executive/scheduling-cases.js";
import {
  auditCliMutation,
  requireCliDataWrite,
  requireCliSchedulingApproval,
} from "../lib/console-auth/cli-operator.js";
import { getCliOperatorContext } from "../lib/console-auth/cli-operator.js";
import { confirmSchedulingCaseFromCeo } from "../lib/scheduling-coordination/ceo-confirm.js";
import { applyNextAction, nextActionLabel } from "../lib/scheduling-coordination/next-action.js";
import { proposeExecutiveSlots } from "../lib/scheduling-coordination/slots.js";
import {
  listReminderTargets,
  resolveSchedulingRecipients,
} from "../lib/scheduling-coordination/recipients.js";
import {
  buildSchedulingDraftText,
  draftKindForNextAction,
  formatSchedulingCaseSummary,
  type SchedulingDraftKind,
} from "../lib/scheduling-coordination/draft-text.js";
import {
  linkMailToCase,
  processAllScheduleMails,
} from "../lib/scheduling-coordination/process-mail.js";
import { runScheduleCoordinationAutoProcess } from "../lib/scheduling-coordination/auto-process.js";
import { runSchedulingReminderPoll } from "../lib/scheduling-coordination/reminder-poller.js";
import {
  advanceSchedulingWorkflow,
} from "../lib/scheduling-coordination/workflow.js";
import {
  findSchedulingCase,
  insertSchedulingCase,
  listSchedulingCases,
  loadSchedulingCases,
  nextParticipantId,
  nextSchedulingCaseId,
  updateSchedulingCase,
} from "../lib/scheduling-coordination/store.js";
import { currentDate } from "../lib/utils.js";
import {
  ensureSchedulingCorrespondenceDrafts,
  recordSchedulingLifecycleEvent,
} from "../lib/scheduling-coordination/lifecycle.js";

export interface SchedulingParticipantInput {
  name: string;
  email?: string;
  role?: "internal" | "external";
  contactRef?: string;
}

function parseParticipantArg(raw: string): SchedulingParticipantInput {
  const parts = raw.split("|").map((p) => p.trim());
  return {
    name: parts[0] ?? raw,
    email: parts[1] || undefined,
    role: (parts[2] as "internal" | "external") || "external",
    contactRef: parts[3] || undefined,
  };
}

function buildParticipants(inputs: SchedulingParticipantInput[]): SchedulingParticipant[] {
  const participants: SchedulingParticipant[] = [];
  for (const input of inputs) {
    participants.push({
      id: nextParticipantId(participants),
      name: input.name,
      email: input.email,
      contact_ref: input.contactRef,
      role: input.role ?? "external",
      response: "pending",
    });
  }
  return participants;
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
    console.log("(no scheduling cases)");
    return;
  }

  for (const c of cases) {
    console.log(
      `${c.id} · ${c.title} · ${c.status} · next=${nextActionLabel(c.next_action)} · participants=${c.participants.length}`
    );
  }
}

export function runSchedulingShow(opts: { id: string; json?: boolean }): void {
  const caseRow = findSchedulingCase(opts.id);
  if (!caseRow) {
    console.error(`Case ${opts.id} not found`);
    process.exit(1);
  }
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
  const file = loadSchedulingCases();
  const now = new Date().toISOString();
  const participants = buildParticipants(opts.participant.map(parseParticipantArg));
  const caseRow = applyNextAction({
    id: nextSchedulingCaseId(file.cases),
    title: opts.title,
    status: "open",
    created_at: now,
    updated_at: now,
    participants,
    proposed_slots: [],
    duration_minutes: opts.duration ?? 60,
    search_from: opts.from,
    search_to: opts.to,
    meeting_format: opts.meetingFormat,
    location: opts.location,
    mail_thread_ids: [],
    next_action: "propose_slots",
  });
  insertSchedulingCase(caseRow);
  recordSchedulingLifecycleEvent(caseRow.id, "created", "cli");
  auditCliMutation("executive scheduling new", caseRow.id);

  if (opts.json) {
    console.log(JSON.stringify(caseRow, null, 2));
    return;
  }
  console.log(`✓ ${caseRow.id} · ${caseRow.title}`);
  console.log(`  next: ${nextActionLabel(caseRow.next_action)}`);
  console.log(`  run: orgos executive scheduling propose --id ${caseRow.id}`);
}

export function runSchedulingPropose(opts: {
  id: string;
  from?: string;
  to?: string;
  count?: number;
  json?: boolean;
}): void {
  requireCliDataWrite({ command: "executive scheduling propose", permission: "scheduling:write" });
  const caseRow = findSchedulingCase(opts.id);
  if (!caseRow) {
    console.error(`Case ${opts.id} not found`);
    process.exit(1);
  }

  const slots = proposeExecutiveSlots({
    from: opts.from ?? caseRow.search_from ?? currentDate(),
    to: opts.to ?? caseRow.search_to,
    count: opts.count ?? 3,
    durationMinutes: caseRow.duration_minutes,
    existingSlots: caseRow.proposed_slots,
  });

  let updated = updateSchedulingCase(caseRow.id, caseRow.revision, () =>
    applyNextAction({
      ...caseRow,
      proposed_slots: slots,
      status: slots.length ? "proposing" : caseRow.status,
      updated_at: new Date().toISOString(),
    })
  );
  if (updated.next_action === "send_proposal") {
    updated = ensureSchedulingCorrespondenceDrafts(updated.id, "proposal");
  }
  if (updated.next_action === "ceo_confirm") {
    updated = advanceSchedulingWorkflow(updated.id);
  }
  auditCliMutation("executive scheduling propose", updated.id);

  if (opts.json) {
    console.log(JSON.stringify(updated, null, 2));
    return;
  }
  console.log(`✓ ${updated.id} · ${slots.length} slots`);
  for (const s of slots) {
    console.log(`  ${s.id}: ${s.label}`);
  }
  console.log(`  next: ${nextActionLabel(updated.next_action)}`);
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
  const caseRow = findSchedulingCase(opts.id);
  if (!caseRow) {
    console.error(`Case ${opts.id} not found`);
    process.exit(1);
  }

  const participants = caseRow.participants.map((p) => {
    const matchEmail = opts.email && p.email?.toLowerCase() === opts.email.toLowerCase();
    const matchId = opts.participant && p.id === opts.participant;
    if (!matchEmail && !matchId) return p;
    return {
      ...p,
      response: opts.response,
      accepted_slot_id: opts.slotId ?? p.accepted_slot_id,
      response_note: opts.note ?? p.response_note,
      responded_at: new Date().toISOString(),
      responded_mail_id: opts.mailId ?? p.responded_mail_id,
    };
  });

  let status = caseRow.status;
  if (status === "open" || status === "proposing") status = "awaiting_responses";

  let updated = updateSchedulingCase(caseRow.id, caseRow.revision, () =>
    applyNextAction({
      ...caseRow,
      participants,
      status,
      updated_at: new Date().toISOString(),
    })
  );
  if (updated.next_action === "ceo_confirm") {
    updated = advanceSchedulingWorkflow(updated.id);
  }
  auditCliMutation("executive scheduling respond", updated.id);

  if (opts.json) {
    console.log(JSON.stringify(updated, null, 2));
    return;
  }
  console.log(`✓ ${updated.id} · next=${nextActionLabel(updated.next_action)}`);
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

export function assertSchedulingCaseConfirmable(
  caseRow: SchedulingCase,
  slotId: string
): void {
  if (!caseRow.proposed_slots.some((slot) => slot.id === slotId)) {
    throw new Error(`Slot ${slotId} does not belong to case ${caseRow.id}`);
  }
  const unanswered = caseRow.participants.filter(
    (participant) => participant.response === "pending"
  );
  if (unanswered.length > 0) {
    throw new Error(
      `Cannot confirm ${caseRow.id}: ${unanswered.length} participant(s) have not answered`
    );
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
  const caseRow = findSchedulingCase(opts.id);
  if (!caseRow) {
    console.error(`Case ${opts.id} not found`);
    process.exit(1);
  }
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

  const updated = updateSchedulingCase(caseRow.id, caseRow.revision, () =>
    applyNextAction({
      ...caseRow,
      status: "confirmed",
      pending_slot_id: opts.slotId,
      updated_at: new Date().toISOString(),
    })
  );
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
  const caseRow = findSchedulingCase(opts.id);
  if (!caseRow) {
    console.error(`Case ${opts.id} not found`);
    process.exit(1);
  }

  const kind = opts.kind ?? draftKindForNextAction(caseRow);
  if (!kind) {
    console.error(`No draft kind for next_action=${caseRow.next_action}`);
    process.exit(1);
  }

  const targets =
    kind !== "reminder"
      ? caseRow.participants.filter(
          (participant) =>
            participant.role === "external" &&
            (!opts.participant || participant.id === opts.participant)
        )
      : opts.participant
        ? caseRow.participants.filter(
            (p) =>
              p.id === opts.participant &&
              caseRow.reminder_targets.includes(p.id) &&
              !caseRow.reminder_history.some(
                (r) =>
                  r.proposal_revision === caseRow.proposal_revision &&
                  r.participant_id === p.id
              )
          )
        : listReminderTargets(caseRow);

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
  const caseRow = findSchedulingCase(opts.id);
  if (!caseRow) {
    console.error(`Case ${opts.id} not found`);
    process.exit(1);
  }
  const updated = updateSchedulingCase(caseRow.id, caseRow.revision, () =>
    applyNextAction({
      ...caseRow,
      status: "closed",
      next_action: "none",
      updated_at: new Date().toISOString(),
    })
  );
  auditCliMutation("executive scheduling close", opts.id);
  if (opts.json) {
    console.log(JSON.stringify(updated, null, 2));
    return;
  }
  console.log(`✓ closed ${opts.id}`);
}

export function runSchedulingCancel(opts: { id: string; reason?: string; json?: boolean }): void {
  requireCliDataWrite({ command: "executive scheduling cancel", permission: "scheduling:write" });
  const caseRow = findSchedulingCase(opts.id);
  if (!caseRow) throw new Error(`Case ${opts.id} not found`);
  updateSchedulingCase(caseRow.id, caseRow.revision, () => ({
    ...caseRow,
    status: "cancelled",
    next_action: "none",
    exception_reason: opts.reason,
    updated_at: new Date().toISOString(),
  }));
  const updated = recordSchedulingLifecycleEvent(caseRow.id, "cancelled", "cli");
  auditCliMutation("executive scheduling cancel", caseRow.id);
  if (opts.json) console.log(JSON.stringify(updated, null, 2));
}

export function runSchedulingReschedule(opts: { id: string; json?: boolean }): void {
  requireCliDataWrite({ command: "executive scheduling reschedule", permission: "scheduling:write" });
  const caseRow = findSchedulingCase(opts.id);
  if (!caseRow) throw new Error(`Case ${opts.id} not found`);
  const participants = caseRow.participants.map((participant) => ({
    ...participant,
    response: "pending" as const,
    accepted_slot_id: undefined,
    response_note: undefined,
    responded_at: undefined,
    responded_mail_id: undefined,
  }));
  const updated = updateSchedulingCase(caseRow.id, caseRow.revision, () =>
    applyNextAction({
      ...caseRow,
      status: "proposing",
      participants,
      proposed_slots: [],
      proposal_revision: caseRow.proposal_revision + 1,
      pending_slot_id: undefined,
      calendar_sync: "not_requested",
      calendar_sync_error: undefined,
      calendar_synced_at: undefined,
      reminder_due_at: undefined,
      reminder_targets: [],
      ceo_question_id: undefined,
      exception_reason: undefined,
      updated_at: new Date().toISOString(),
    })
  );
  recordSchedulingLifecycleEvent(updated.id, "rescheduled", "cli");
  auditCliMutation("executive scheduling reschedule", updated.id);
  if (opts.json) console.log(JSON.stringify(findSchedulingCase(updated.id), null, 2));
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

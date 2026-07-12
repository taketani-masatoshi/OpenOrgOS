import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MailTriageEntry } from "../../../schemas/correspondence/mail-triage.js";
import type { SchedulingProposedSlot } from "../../../schemas/executive/scheduling-cases.js";
import { findTriageEntry, upsertTriageEntry } from "../correspondence/mail-triage-queue.js";
import { getMailReceivedDir } from "../correspondence/paths.js";
import { processScheduleMailEntry, type ProcessScheduleMailResult } from "./process-mail.js";
import { findSchedulingCase } from "./store.js";

function formatSlotAcceptLine(slot: SchedulingProposedSlot): string {
  if (slot.label) return `${slot.label} で問題ありません。`;
  const day = slot.start.slice(0, 10);
  const time = slot.start.includes("T") ? slot.start.slice(11, 16) : "";
  return time ? `${day} ${time} で問題ありません。` : `${day} で問題ありません。`;
}

function buildAcceptReplyEml(opts: {
  fromName: string;
  fromEmail: string;
  subject: string;
  slot: SchedulingProposedSlot;
  messageId: string;
}): string {
  const body = [
    "ご連絡ありがとうございます。",
    formatSlotAcceptLine(opts.slot),
    "",
    opts.fromName,
  ].join("\n");
  return [
    `From: ${opts.fromName} <${opts.fromEmail}>`,
    "To: secretary@orgos.local",
    `Subject: Re: ${opts.subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${opts.messageId}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ].join("\n");
}

export function injectScheduleAcceptReplyMail(opts: {
  caseId: string;
  participantName: string;
  participantEmail: string;
  mailId?: string;
  slotId?: string;
  subject?: string;
}): MailTriageEntry {
  const caseRow = findSchedulingCase(opts.caseId);
  if (!caseRow) throw new Error(`Scheduling case ${opts.caseId} not found`);

  const slot =
    caseRow.proposed_slots.find((s) => s.id === (opts.slotId ?? "SLOT-001")) ??
    caseRow.proposed_slots[0];
  if (!slot) throw new Error(`No proposed slots on ${opts.caseId}`);

  const mailId = opts.mailId ?? `MSG-REH-${Date.now()}-${opts.participantEmail.replace(/[^a-z0-9]/gi, "-")}`;
  const emlName = `${mailId}.eml`;
  mkdirSync(getMailReceivedDir(), { recursive: true });
  writeFileSync(
    join(getMailReceivedDir(), emlName),
    buildAcceptReplyEml({
      fromName: opts.participantName,
      fromEmail: opts.participantEmail,
      subject: opts.subject ?? `【日程調整】${caseRow.title}`,
      slot,
      messageId: `${mailId}@rehearsal.local`,
    }),
    "utf-8"
  );

  return upsertTriageEntry({
    id: mailId,
    received_at: new Date().toISOString(),
    from: `${opts.participantName} <${opts.participantEmail}>`,
    sender_email: opts.participantEmail,
    sender_known: true,
    subject: opts.subject ?? `Re: 【日程調整】${caseRow.title}`,
    importance: "p2",
    urgency: "none",
    disposition: "ham",
    routing: "secretary",
    handoff_status: "pending",
    eml_ref: `records/executive/mail-received/${emlName}`,
    rule_hits: ["schedule"],
    scheduling_case_id: opts.caseId,
    mail_thread_ids: caseRow.mail_thread_ids.length ? caseRow.mail_thread_ids : [`THREAD-${opts.caseId}`],
  });
}

/** Inject accept-reply EML and process via process-mail (production path). */
export async function injectAndProcessScheduleAcceptReply(opts: {
  caseId: string;
  participantName: string;
  participantEmail: string;
  mailId?: string;
  slotId?: string;
}): Promise<ProcessScheduleMailResult> {
  const entry = injectScheduleAcceptReplyMail(opts);
  const result = await processScheduleMailEntry(entry);
  if (result.action !== "updated" && result.action !== "linked") {
    throw new Error(
      `process-mail failed for ${entry.id}: action=${result.action} reason=${result.reason ?? "—"}`
    );
  }
  const triage = findTriageEntry(entry.id);
  if (!triage?.schedule_reply_parsed) {
    throw new Error(`Triage ${entry.id} missing schedule_reply_parsed after process-mail`);
  }
  return result;
}

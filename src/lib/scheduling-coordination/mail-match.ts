import type { MailTriageEntry } from "../../../schemas/correspondence/mail-triage.js";
import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import { findMailInterpretation } from "../correspondence/mail-interpretation.js";
import { isOwnMailAddress, resolveSenderByEmail } from "../secretary/contact-registry.js";
import { extractEmailAddress } from "../correspondence/mail-address.js";
import { findSchedulingCase, listSchedulingCases } from "./store.js";

export function normalizeScheduleMailSubject(subject: string): string {
  return subject
    .replace(/^(re:\s*)+/i, "")
    .replace(/^【日程調整】/, "")
    .replace(/^【日程確定】/, "")
    .trim()
    .toLowerCase();
}

/** Every message id that ties this mail to a thread we already know about. */
export function entryThreadIds(entry: MailTriageEntry): string[] {
  return [
    entry.id,
    entry.source_message_id,
    entry.in_reply_to,
    ...(entry.mail_thread_ids ?? []),
    ...(entry.references ?? []),
  ].filter(Boolean) as string[];
}

/** A copy of mail we sent ourselves — its subject is one we generated. */
export function isOwnOutboundCopy(entry: MailTriageEntry): boolean {
  const sender = (entry.sender_email ?? extractEmailAddress(entry.from) ?? "").trim();
  if (!sender) return false;
  try {
    return isOwnMailAddress(sender) || resolveSenderByEmail(sender).match?.scope === "self";
  } catch {
    return false;
  }
}

export function isScheduleIntent(entry: MailTriageEntry): boolean {
  const interp = findMailInterpretation(entry.id);
  if (interp?.intent === "schedule") return true;
  const text = `${entry.subject} ${entry.rule_hits.join(" ")}`.toLowerCase();
  return /日程|スケジュール|schedule|候補|調整/.test(text);
}

export function findCaseForMailEntry(entry: MailTriageEntry): SchedulingCase | undefined {
  if (entry.scheduling_case_id) {
    return findSchedulingCase(entry.scheduling_case_id);
  }

  const cases = listSchedulingCases({ activeOnly: true });
  const threadIds = entryThreadIds(entry);
  const matches = cases.filter((caseRow) =>
    caseRow.mail_thread_ids.some((id) => threadIds.includes(id))
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return undefined;

  // Subject matching is only safe for our own outbound copies: an inbound
  // subject can be forwarded or reused, but we wrote this one.
  if (isOwnOutboundCopy(entry)) {
    const subject = normalizeScheduleMailSubject(entry.subject);
    const bySubject = cases.filter((caseRow) => normalizeScheduleMailSubject(caseRow.title) === subject);
    if (bySubject.length === 1) return bySubject[0];
  }

  return undefined;
}

export function hasAmbiguousCaseMatch(entry: MailTriageEntry): boolean {
  if (entry.scheduling_case_id) return false;
  const ids = new Set(
    [entry.id, entry.source_message_id, ...(entry.mail_thread_ids ?? [])].filter(Boolean) as string[]
  );
  return (
    listSchedulingCases({ activeOnly: true }).filter((c) =>
      c.mail_thread_ids.some((id) => ids.has(id))
    ).length > 1
  );
}

export function matchingCaseIds(entry: MailTriageEntry): string[] {
  const ids = new Set(
    [entry.id, entry.source_message_id, ...(entry.mail_thread_ids ?? [])].filter(Boolean) as string[]
  );
  return listSchedulingCases({ activeOnly: true })
    .filter((row) => row.mail_thread_ids.some((id) => ids.has(id)))
    .map((row) => row.id);
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { simpleParser } from "mailparser";
import type { MailTriageEntry } from "../../../schemas/correspondence/mail-triage.js";
import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import type { CeoInlineQuestion } from "../../../schemas/correspondence/ceo-inline-question.js";
import { findTriageEntry, listTriageEntries } from "../correspondence/mail-triage-queue.js";
import { getMailReceivedDir } from "../correspondence/paths.js";
import { applyNextAction } from "./next-action.js";
import { findSchedulingCase, updateSchedulingCase } from "./store.js";
import { recordSchedulingLifecycleEvent } from "./lifecycle-events.js";
import {
  findCaseForMailEntry,
  hasAmbiguousCaseMatch,
  isScheduleIntent,
  matchingCaseIds,
} from "./mail-match.js";
import {
  askUnlinkedScheduleChoice,
  createSafeScheduleIntake,
  linkMailToCase,
} from "./mail-intake.js";
import type { ProcessScheduleMailResult } from "./mail-reply.js";
import { applyScheduleReplyToCase } from "./mail-reply.js";

async function readMailBody(entry: MailTriageEntry): Promise<string> {
  const filename = entry.eml_ref.split("/").pop();
  if (!filename) return "";
  const emlPath = join(getMailReceivedDir(), filename);
  try {
    const raw = readFileSync(emlPath, "utf-8");
    const parsed = await simpleParser(raw);
    return parsed.text ?? entry.subject;
  } catch {
    return entry.subject;
  }
}

export async function applyScheduleIntakeAnswer(
  question: CeoInlineQuestion
): Promise<SchedulingCase | undefined> {
  const choice = question.answers?.schedule_intake_choice?.trim();
  if (!choice) return undefined;
  const caseMatch = question.mail_id.match(
    /^schedule-intake-case:(SCH-\d{4}-\d{3}):(.+)$/
  );
  if (caseMatch) {
    const caseRow = findSchedulingCase(caseMatch[1]!);
    if (!caseRow) return undefined;
    const cancel = choice === "中止" || choice.toLowerCase() === "cancel";
    const updated = updateSchedulingCase(caseRow.id, caseRow.revision, (row) =>
      applyNextAction({
        ...row,
        status: cancel ? "cancelled" : "open",
        exception_reason: undefined,
        updated_at: new Date().toISOString(),
      })
    );
    if (cancel) recordSchedulingLifecycleEvent(updated.id, "cancelled", question.answered_by);
    return findSchedulingCase(updated.id) ?? updated;
  }

  const mailId = question.mail_id.match(/^schedule-intake:(.+)$/)?.[1];
  if (!mailId) return undefined;
  const entry = findTriageEntry(mailId);
  if (!entry || choice === "保留") return undefined;
  if (/^SCH-\d{4}-\d{3}$/.test(choice)) {
    linkMailToCase(choice, mailId);
    await processScheduleMailEntry(findTriageEntry(mailId)!);
    return findSchedulingCase(choice);
  }
  if (choice === "新規起票") return createSafeScheduleIntake(entry);
  return undefined;
}

/**
 * Orchestrates schedule-mail handling:
 * gate → match/intake → read body → applyScheduleReplyToCase.
 */
export async function processScheduleMailEntry(
  entry: MailTriageEntry
): Promise<ProcessScheduleMailResult> {
  if (entry.schedule_reply_parsed) {
    return { mail_id: entry.id, action: "skipped", reason: "already processed" };
  }
  if (entry.disposition === "spam" || entry.routing !== "secretary") {
    return { mail_id: entry.id, action: "skipped", reason: "not secretary routing" };
  }

  if (!isScheduleIntent(entry)) {
    return { mail_id: entry.id, action: "skipped", reason: "not schedule intent" };
  }

  const caseRow = findCaseForMailEntry(entry);
  if (!caseRow) {
    const matches = matchingCaseIds(entry);
    if (matches.length > 1) {
      askUnlinkedScheduleChoice(entry, matches);
    } else {
      const created = createSafeScheduleIntake(entry);
      if (created) {
        return {
          mail_id: entry.id,
          case_id: created.id,
          action: "linked",
          reason: "safe intake created; awaiting confirmation",
        };
      }
    }
    return {
      mail_id: entry.id,
      action: "unlinked",
      reason: hasAmbiguousCaseMatch(entry) ? "ambiguous case match; needs review" : "no matching case",
    };
  }
  if (caseRow.processed_mail_ids.includes(entry.id)) {
    return {
      mail_id: entry.id,
      case_id: caseRow.id,
      action: "skipped",
      reason: "already processed",
    };
  }
  if (
    caseRow.status === "needs_review" &&
    caseRow.mail_thread_ids.includes(entry.id)
  ) {
    return {
      mail_id: entry.id,
      case_id: caseRow.id,
      action: "skipped",
      reason: "awaiting manual review",
    };
  }

  const body = await readMailBody(entry);
  return applyScheduleReplyToCase({ entry, caseRow, body });
}

export async function processAllScheduleMails(opts?: {
  mailIds?: string[];
}): Promise<ProcessScheduleMailResult[]> {
  const results: ProcessScheduleMailResult[] = [];
  const ids = opts?.mailIds;

  if (ids?.length) {
    for (const id of ids) {
      const entry = findTriageEntry(id);
      if (entry) {
        results.push(await processScheduleMailEntry(entry));
      }
    }
    return results;
  }

  const entries = listTriageEntries({ limit: 200 }).filter(
    (e) =>
      e.routing === "secretary" &&
      e.disposition !== "spam" &&
      !e.schedule_reply_parsed &&
      (isScheduleIntent(e) || e.scheduling_case_id)
  );

  for (const entry of entries) {
    results.push(await processScheduleMailEntry(entry));
  }
  return results;
}

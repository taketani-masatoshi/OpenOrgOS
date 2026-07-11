import { listSchedulingCases } from "./store.js";
import { processAllScheduleMails, type ProcessScheduleMailResult } from "./process-mail.js";
import { advanceSchedulingWorkflow, refreshSchedulingReminder } from "./workflow.js";
import { findMailInterpretation } from "../correspondence/mail-interpretation.js";
import { listTriageEntries } from "../correspondence/mail-triage-queue.js";
import {
  ensureSchedulingCorrespondenceDrafts,
  reconcileSchedulingCorrespondence,
} from "./lifecycle.js";

export interface ScheduleAutoProcessResult {
  processed: number;
  updated: number;
  unlinked: number;
  results: ProcessScheduleMailResult[];
}

function isScheduleCandidate(mailId: string): boolean {
  const interp = findMailInterpretation(mailId);
  return interp?.intent === "schedule";
}

/** Phase 3 — mail sync / triage 後に日程調整案件へ反映 */
export async function runScheduleCoordinationAutoProcess(opts?: {
  mailIds?: string[];
}): Promise<ScheduleAutoProcessResult> {
  let mailIds = opts?.mailIds;

  if (!mailIds?.length) {
    mailIds = listTriageEntries({ limit: 100 })
      .filter(
        (e) =>
          e.routing === "secretary" &&
          e.disposition !== "spam" &&
          !e.schedule_reply_parsed &&
          (e.scheduling_case_id || isScheduleCandidate(e.id))
      )
      .map((e) => e.id);
  }

  const results = await processAllScheduleMails({ mailIds });
  const updated = results.filter((r) => r.action === "updated" || r.action === "linked").length;
  const unlinked = results.filter((r) => r.action === "unlinked").length;

  for (const c of listSchedulingCases({ activeOnly: true })) {
    reconcileSchedulingCorrespondence(c.id);
    const refreshed = refreshSchedulingReminder(c.id);
    if (refreshed.next_action === "send_reminder") {
      ensureSchedulingCorrespondenceDrafts(refreshed.id, "reminder");
    }
    advanceSchedulingWorkflow(c.id);
  }

  return {
    processed: results.length,
    updated,
    unlinked,
    results,
  };
}

export function listSchedulingCasesForToday(limit = 8) {
  return listSchedulingCases({ activeOnly: true, limit }).filter((c) => c.next_action !== "none");
}

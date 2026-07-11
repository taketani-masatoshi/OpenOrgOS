import { resolveMailConfig } from "../correspondence/mail-config.js";
import { ensureSchedulingCorrespondenceDrafts } from "./lifecycle.js";
import { listSchedulingCases } from "./store.js";
import { refreshSchedulingReminder } from "./workflow.js";

export interface SchedulingReminderPollResult {
  scanned: number;
  due: number;
  drafted: number;
  case_ids: string[];
}

/** Mail sync とは独立に、期限到来の reminder 対象を走査する */
export function runSchedulingReminderPoll(now = new Date()): SchedulingReminderPollResult {
  const config = resolveMailConfig();
  if (config.receive.scheduling_reminder_poll === false) {
    return { scanned: 0, due: 0, drafted: 0, case_ids: [] };
  }

  const active = listSchedulingCases({ activeOnly: true });
  const caseIds: string[] = [];
  let due = 0;
  let drafted = 0;

  for (const row of active) {
    if (row.status !== "awaiting_responses") continue;
    const refreshed = refreshSchedulingReminder(row.id, now);
    if (refreshed.next_action !== "send_reminder" || refreshed.reminder_targets.length === 0) {
      continue;
    }
    due += 1;
    ensureSchedulingCorrespondenceDrafts(refreshed.id, "reminder");
    caseIds.push(refreshed.id);
    drafted += 1;
  }

  return {
    scanned: active.length,
    due,
    drafted,
    case_ids: caseIds,
  };
}

export interface SchedulingReminderPollerHandle {
  start(): void;
  stop(): void;
  pollOnce(): Promise<SchedulingReminderPollResult>;
}

export function createSchedulingReminderPoller(): SchedulingReminderPollerHandle {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;

  async function pollOnce(): Promise<SchedulingReminderPollResult> {
    if (running) return { scanned: 0, due: 0, drafted: 0, case_ids: [] };
    running = true;
    try {
      return runSchedulingReminderPoll();
    } finally {
      running = false;
    }
  }

  return {
    start() {
      const config = resolveMailConfig();
      if (config.receive.scheduling_reminder_poll === false) return;
      const intervalMs =
        (config.receive.scheduling_reminder_poll_interval_sec ??
          config.receive.poll_interval_sec) * 1000;
      if (timer) return;
      void pollOnce();
      timer = setInterval(() => void pollOnce(), intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
    pollOnce,
  };
}

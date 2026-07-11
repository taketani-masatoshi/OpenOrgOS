import { syncMailReceive } from "./mail-receive-sync.js";
import { loadMailConfig, shouldAutoWireScan } from "./mail-config.js";
import { triageUnprocessedMail } from "./mail-triage.js";
import { notifyMailTriageHighPriority } from "./mail-handoff.js";

export interface MailReceivePollerHandle {
  start(): void;
  stop(): void;
  pollOnce(): Promise<void>;
}

export function createMailReceivePoller(): MailReceivePollerHandle {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;

  async function pollOnce(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const result = await syncMailReceive();
      const config = loadMailConfig();
      if (
        result.fetched > 0 &&
        config?.receive?.auto_triage !== false
      ) {
        const triage = await triageUnprocessedMail();
        if (config?.receive?.notify_high_priority !== false && triage.highPriorityIds.length) {
          await notifyMailTriageHighPriority(triage.highPriorityIds);
        }
      }
      if (shouldAutoWireScan(config)) {
        const { scanMailReceivedForWire } = await import("../protocol/email-wire-ingest.js");
        await scanMailReceivedForWire({ sinceDays: 1 });
      }
    } finally {
      running = false;
    }
  }

  return {
    start() {
      const config = loadMailConfig();
      const intervalMs = (config?.receive?.poll_interval_sec ?? 300) * 1000;
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

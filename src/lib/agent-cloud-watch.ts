import { loadQueueEvents } from "./queue-db.js";
import { loadCloudAgentConfig, isCloudDispatchReady, formatCloudConfig } from "./cloud-agent.js";
import { runDispatch, buildDispatchManifest } from "./agent-dispatch.js";
import { runQueueDrainInternal } from "./queue-processor.js";
import { loadHandoff } from "./routing.js";

export interface CloudWatchOptions {
  intervalMs?: number;
  once?: boolean;
  parallel?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runCloudWatch(options: CloudWatchOptions = {}): Promise<number> {
  const cfg = loadCloudAgentConfig();
  const interval = options.intervalMs ?? cfg.watch?.interval_ms ?? 30_000;
  let cycles = 0;

  do {
    cycles++;
    const drained = runQueueDrainInternal({});
    if (drained > 0) {
      console.log(`→ queue drain: ${drained} event(s)`);
    }

    const pending = loadQueueEvents({ status: "pending", type: "dispatch_requested" });
    for (const event of pending) {
      const woId = event.ref;
      try {
        const wo = loadHandoff(woId);
        if (wo.status === "completed") continue;
        console.log(`→ cloud dispatch ${woId}`);
        if (isCloudDispatchReady()) {
          await runDispatch(woId, { parallel: options.parallel ?? 3, runtime: "cloud" } as never);
        } else {
          buildDispatchManifest(woId);
          console.log(`  manifest only (cloud not configured)`);
        }
      } catch (err) {
        console.log(`  ✗ ${err instanceof Error ? err.message : err}`);
      }
    }

    if (options.once) break;
    await sleep(interval);
  } while (true);

  return cycles;
}

export { formatCloudConfig };

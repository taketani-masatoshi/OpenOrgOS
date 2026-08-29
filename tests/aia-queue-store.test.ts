import { afterEach, describe, expect, it } from "vitest";
import {
  createAiaScheduler,
  detachAiaSchedulerSingletonForTests,
  resetAiaSchedulerForTests,
} from "../src/lib/aia/scheduler.js";
import { loadAiaQueueFile } from "../src/lib/aia/queue-store.js";
import { aiaRuntimeFileSchema } from "../schemas/aia-runtime.js";

describe("aia queue persistence", () => {
  afterEach(() => {
    resetAiaSchedulerForTests();
  });

  it("persists queued runs to data/org/aia-queue.yaml", () => {
    const scheduler = createAiaScheduler(
      aiaRuntimeFileSchema.parse({
        schema: "orgos.aia.runtime.v1",
        tier: "soft",
        max_concurrent_aia: 1,
      }),
      { hydrate: false },
    );
    scheduler.tryAdmit({ run_id: "RUN-test-1", agent_id: "finance" });
    scheduler.tryAdmit({ run_id: "RUN-test-2", agent_id: "finance" });
    const file = loadAiaQueueFile();
    expect(file.queue_order).toContain("RUN-test-2");
    expect(file.runs.some((r) => r.run_id === "RUN-test-2" && r.state === "queued")).toBe(true);
  });

  it("hydrates queued runs after scheduler restart", () => {
    const config = aiaRuntimeFileSchema.parse({
      schema: "orgos.aia.runtime.v1",
      tier: "soft",
      max_concurrent_aia: 1,
    });
    const first = createAiaScheduler(config, { hydrate: false });
    first.tryAdmit({ run_id: "RUN-restart-1", agent_id: "finance" });
    first.tryAdmit({ run_id: "RUN-restart-2", agent_id: "finance" });
    detachAiaSchedulerSingletonForTests();

    const restarted = createAiaScheduler(config, { hydrate: true });
    expect(restarted.metrics().aia_queued).toBeGreaterThanOrEqual(1);
    const promoted = restarted.tryAdmit({
      run_id: "RUN-restart-1",
      agent_id: "finance",
    });
    expect(promoted.admitted).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAiaScheduler, gcAiaRunWorkspace } from "../src/lib/aia/scheduler.js";
import { aiaRuntimeFileSchema } from "../schemas/aia-runtime.js";

describe("aia scheduler", () => {
  beforeEach(() => {
    delete process.env.ORGOS_LLM_MOCK;
  });

  afterEach(() => {
    gcAiaRunWorkspace("RUN-test-1");
    gcAiaRunWorkspace("RUN-test-2");
  });

  it("clamps parallel hint to tenant max", () => {
    const scheduler = createAiaScheduler(
      aiaRuntimeFileSchema.parse({
        schema: "orgos.aia.runtime.v1",
        tier: "soft",
        max_concurrent_aia: 2,
      }),
      { hydrate: false },
    );
    expect(scheduler.clampParallelHint(5)).toBe(2);
  });

  it("admits runs up to max_concurrent_aia", () => {
    const scheduler = createAiaScheduler(
      aiaRuntimeFileSchema.parse({
        schema: "orgos.aia.runtime.v1",
        tier: "soft",
        max_concurrent_aia: 1,
      }),
      { hydrate: false },
    );
    const first = scheduler.tryAdmit({
      run_id: "RUN-test-1",
      agent_id: "finance",
    });
    expect(first.admitted).toBe(true);
    const second = scheduler.tryAdmit({
      run_id: "RUN-test-2",
      agent_id: "finance",
    });
    expect(second.admitted).toBe(false);
    expect(second.queued).toBe(true);
    expect(scheduler.metrics().aia_queued).toBe(1);
    if (!first.admitted) throw new Error("expected first admission");
    scheduler.release(first.run.run_id, true);
    const third = scheduler.tryAdmit({
      run_id: "RUN-test-2",
      agent_id: "finance",
    });
    expect(third.admitted).toBe(true);
  });
});

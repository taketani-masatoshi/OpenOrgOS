import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createAiaScheduler,
  gcAiaRunWorkspace,
  loadAiaRuntimeConfig,
  resolveConcurrentJobsLimit,
} from "../src/lib/aia/scheduler.js";
import { aiaRuntimeFileSchema } from "../schemas/aia-runtime.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("aia scheduler", () => {
  beforeEach(() => {
    delete process.env.ORGOS_LLM_MOCK;
    setTenantId("mal");
  });

  afterEach(() => {
    gcAiaRunWorkspace("RUN-test-1");
    gcAiaRunWorkspace("RUN-test-2");
    gcAiaRunWorkspace("RUN-test-3");
    gcAiaRunWorkspace("RUN-cj-mod-1");
    gcAiaRunWorkspace("RUN-cj-mod-2");
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

  it("queue → promote → release: release drains queue into running", () => {
    const scheduler = createAiaScheduler(
      aiaRuntimeFileSchema.parse({
        schema: "orgos.aia.runtime.v1",
        tier: "soft",
        max_concurrent_aia: 1,
        llm_backpressure: false,
      }),
      { hydrate: false },
    );

    const first = scheduler.tryAdmit({
      run_id: "RUN-test-1",
      agent_id: "finance",
    });
    expect(first.admitted).toBe(true);

    const queued = scheduler.tryAdmit({
      run_id: "RUN-test-2",
      agent_id: "operations",
    });
    expect(queued.admitted).toBe(false);
    expect(queued.queued).toBe(true);
    expect(scheduler.metrics().aia_queued).toBe(1);
    expect(scheduler.runningCount).toBe(1);

    scheduler.release("RUN-test-1", true);
    // release() drainQueue promotes RUN-test-2 without a second tryAdmit
    expect(scheduler.runningCount).toBe(1);
    expect(scheduler.metrics().aia_queued).toBe(0);

    scheduler.release("RUN-test-2", true);
    expect(scheduler.runningCount).toBe(0);
  });

  it("enforces module concurrent_jobs cap", () => {
    const scheduler = createAiaScheduler(
      aiaRuntimeFileSchema.parse({
        schema: "orgos.aia.runtime.v1",
        tier: "soft",
        max_concurrent_aia: 10,
        llm_backpressure: false,
      }),
      { hydrate: false },
    );

    const first = scheduler.tryAdmit({
      run_id: "RUN-cj-mod-1",
      agent_id: "jp_bank_corporate",
      module_id: "jp_bank_corporate",
    });
    expect(first.admitted).toBe(true);

    const second = scheduler.tryAdmit({
      run_id: "RUN-cj-mod-2",
      agent_id: "jp_bank_corporate",
      module_id: "jp_bank_corporate",
    });
    expect(second.admitted).toBe(false);
    expect(second.queued).toBe(true);
    expect(second.reason).toContain("concurrent_jobs limit (1)");
  });

  it("resolveConcurrentJobsLimit uses module manifest when agent binds a module", () => {
    expect(resolveConcurrentJobsLimit("jp_bank_corporate")).toBe(1);
    expect(resolveConcurrentJobsLimit("rental")).toBe(2);
    // Core agent without module binding falls back to tenant max_concurrent_aia
    expect(resolveConcurrentJobsLimit("finance")).toBe(
      loadAiaRuntimeConfig().max_concurrent_aia,
    );
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
  checkConcurrentJobsManifest,
  listConcurrentJobsManifestRows,
} from "../src/lib/aia/concurrent-jobs-manifest.js";
import { createAiaScheduler, gcAiaRunWorkspace } from "../src/lib/aia/scheduler.js";
import { aiaRuntimeFileSchema } from "../schemas/aia-runtime.js";
import { loadEnabledModules } from "../src/lib/modules.js";

describe("aia concurrent_jobs manifest", () => {
  afterEach(() => {
    gcAiaRunWorkspace("RUN-cj-1");
    gcAiaRunWorkspace("RUN-cj-2");
  });

  it("validates enabled tenant modules without issues", () => {
    const issues = checkConcurrentJobsManifest();
    expect(issues).toEqual([]);
  });

  it("lists explicit concurrent_jobs for mal enabled modules", () => {
    const enabled = new Set(loadEnabledModules().map((m) => m.id));
    const rows = listConcurrentJobsManifestRows().filter((r) => enabled.has(r.module_id));
    expect(rows.length).toBeGreaterThanOrEqual(6);
    for (const row of rows) {
      expect(row.effective).toBeGreaterThan(0);
      expect(row.explicit).toBeDefined();
    }
    const rental = rows.find((r) => r.module_id === "rental");
    expect(rental?.explicit).toBe(2);
    expect(rental?.effective).toBe(2);
    const jpBank = rows.find((r) => r.module_id === "jp_bank_corporate");
    expect(jpBank?.explicit).toBe(1);
    expect(jpBank?.effective).toBe(1);
  });

  it("queues second run when module concurrent_jobs limit is reached", () => {
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
      run_id: "RUN-cj-1",
      agent_id: "jp_bank_corporate",
      module_id: "jp_bank_corporate",
    });
    expect(first.admitted).toBe(true);
    const second = scheduler.tryAdmit({
      run_id: "RUN-cj-2",
      agent_id: "jp_bank_corporate",
      module_id: "jp_bank_corporate",
    });
    expect(second.admitted).toBe(false);
    expect(second.queued).toBe(true);
    expect(second.reason).toContain("concurrent_jobs limit (1)");
  });
});

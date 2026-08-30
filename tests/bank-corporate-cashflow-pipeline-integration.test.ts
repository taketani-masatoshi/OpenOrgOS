import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupJpBankCorporateTenant,
  seedJpBankCorporateTenant,
} from "./helpers/jp-bank-corporate-fixture.js";
import { runJpBankCorporatePipelineCashflow } from "../src/lib/jp-bank-corporate/pipeline.js";
import { getCashflowTodaySummary } from "../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/lib.js";
import { resolveTenantPath } from "../src/lib/tenant.js";
import { getWorkspaceRoot } from "../src/lib/orgos-paths.js";
import {
  reconciliationEventFileSchema,
  cashflowScheduleSchema,
} from "../schemas/jp-bank-corporate.js";
import YAML from "yaml";
import {
  computeImpact,
  loadDependencyGraph,
} from "../src/lib/dependency-graph.js";

describe("jp_bank_corporate dummy tenant pipeline", () => {
  const tenantId = `test-jp-bank-pipeline-${process.pid}`;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T12:00:00.000Z"));
    seedJpBankCorporateTenant(tenantId);
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanupJpBankCorporateTenant(tenantId);
  });

  it("runs exact reconciliation, generates artifacts, and exposes fresh Today metadata", () => {
    const result = runJpBankCorporatePipelineCashflow();
    expect(result.ran).toBe(true);
    expect(result.output_paths).toHaveLength(3);
    for (const path of result.output_paths) {
      expect(existsSync(join(getWorkspaceRoot(), path))).toBe(true);
    }

    const events = reconciliationEventFileSchema.parse(
      YAML.parse(
        readFileSync(
          resolveTenantPath("data/finance/reconciliation-events.yaml"),
          "utf-8"
        )
      )
    );
    expect(events.events).toHaveLength(2);
    expect(
      events.events.every(
        (event) =>
          event.type === "reconciliation.applied" &&
          event.match_mode === "exact_auto"
      )
    ).toBe(true);

    const jsonPath = result.output_paths.find((path) => path.endsWith(".json"))!;
    const schedule = cashflowScheduleSchema.parse(
      JSON.parse(readFileSync(join(getWorkspaceRoot(), jsonPath), "utf-8"))
    );
    expect(schedule.horizon_start).toBe("2026-07-13");
    expect(schedule.input_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(schedule.detail_rows?.some((row) => row.line_id === "AR-FIX-001")).toBe(
      true
    );
    expect(
      schedule.detail_rows?.find((row) => row.line_id === "AR-FIX-001")
        ?.planned_amount
    ).toBe(600);

    const today = getCashflowTodaySummary();
    expect(today.stale).toBe(false);
    expect(today.detail_schedule_path).toMatch(/weekly-detail\.csv$/);

    const impact = computeImpact(
      loadDependencyGraph(),
      "data/finance/reconciliation-events.yaml"
    );
    expect(impact.impacts).toEqual([
      expect.objectContaining({
        nodeId: "cashflow-schedule",
        action: "regenerate",
      }),
    ]);
  });
});

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ExecutiveHome } from "../schemas/executive-home.js";
import {
  overlayLiveCash,
  serveExecutiveHome,
  writeConsoleHomeSnapshot,
} from "../src/lib/executive-home/console-snapshot.js";
import { setupTempAnalyticsTenant } from "./helpers/temp-analytics-tenant.ts";

function stubHome(cash: number): ExecutiveHome {
  return {
    ok: true,
    tenant: "analytics-fixture",
    report_date: "2026-09-01",
    company_name: "Fixture Co",
    attention: [],
    attention_count: 0,
    gaps: [],
    gap_summary: { green: 1, amber: 0, red: 0, unknown: 0, target_missing: 0 },
    work: { employee: [], guest: [], ai: [], unassigned: [] },
    work_open_count: 0,
    finance_runway_months: 8,
    finance_cash_balance: cash,
  };
}

describe("console page snapshots", () => {
  let restore: (() => void) | undefined;

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it("serves the saved home and overlays confirmed cash", () => {
    const tenant = setupTempAnalyticsTenant();
    restore = tenant.restore;
    mkdirSync(join(tenant.dir, "tenants", tenant.tenantId, "data", "finance"), {
      recursive: true,
    });
    writeFileSync(
      join(tenant.dir, "tenants", tenant.tenantId, "data", "finance", "cash-balance.yaml"),
      ["as_of: 2026-09-06", "status: confirmed", "currency: JPY", "total: 999000", "accounts: []", ""].join(
        "\n",
      ),
      "utf8",
    );

    writeConsoleHomeSnapshot({
      ...stubHome(100),
      variance: {
        fiscal_year: "FY2026",
        plan_total: 1234567,
        actual_total: 8901234,
        delta_total: -1234567,
        href: "/?wallet=1",
      },
    });
    const served = serveExecutiveHome();
    expect(served.served_from).toBe("snapshot");
    expect(served.finance_cash_balance).toBe(999000);
    expect(served.finance_runway_months).toBe(8);
    expect(served.company_name).toBe("Fixture Co");
    expect(served.variance?.plan_total).toBe(1234567);
    expect(served.generated_at).toMatch(/^\d{4}-/);
  });

  it("keeps snapshot cash when the ledger is not confirmed", () => {
    const tenant = setupTempAnalyticsTenant();
    restore = tenant.restore;
    const home = stubHome(250000);
    expect(overlayLiveCash(home).finance_cash_balance).toBe(250000);
  });
});

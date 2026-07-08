import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { clearOperatorsRegistryCacheForTests } from "../src/lib/org/operators.js";
import { runFinancesAdd } from "../src/commands/finances.js";
import { runExecutiveTasksArchive } from "../src/commands/executive.js";
import { runDashboard } from "../src/commands/dashboard.js";
import { runReportMonthly } from "../src/commands/report.js";
import { runAlerts } from "../src/commands/alerts.js";

describe("cli data write auth", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    clearOperatorsRegistryCacheForTests();
    delete process.env.ORGOS_ENV;
    delete process.env.ORGOS_TENANT;
    delete process.env.STEWARD_OPERATOR_AUTH;
    delete process.env.ORGOS_OPERATOR_KEY;
  });

  afterEach(() => {
    process.env = { ...env };
    clearOperatorsRegistryCacheForTests();
  });

  it("requires operator for finances add when auth enabled", () => {
    process.env.STEWARD_OPERATOR_AUTH = "1";
    expect(() =>
      runFinancesAdd({ month: "2099-01", file: "/dev/null" })
    ).toThrow();
  });

  it("allows executive tasks archive dry-run without operator key", () => {
    process.env.STEWARD_OPERATOR_AUTH = "1";
    expect(() => runExecutiveTasksArchive({ dryRun: true })).not.toThrow();
  });

  it("requires operator for dashboard writes when auth enabled", () => {
    process.env.STEWARD_OPERATOR_AUTH = "1";
    expect(() => runDashboard({ markdown: true })).toThrow();
  });

  it("requires operator for report monthly when auth enabled", () => {
    process.env.STEWARD_OPERATOR_AUTH = "1";
    expect(() => runReportMonthly({ month: "2099-01" })).toThrow();
  });

  it("allows alerts read-only without operator key", () => {
    process.env.STEWARD_OPERATOR_AUTH = "1";
    expect(() => runAlerts({ days: 90, markdown: true })).not.toThrow();
  });

  it("requires operator for alerts file output when auth enabled", () => {
    process.env.STEWARD_OPERATOR_AUTH = "1";
    expect(() => runAlerts({ days: 90, output: "test-alerts.md" })).toThrow();
  });
});

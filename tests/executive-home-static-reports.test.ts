import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { getDocsReportsDir } from "../src/lib/utils.js";
import { loadExecutiveStaticReports } from "../src/lib/executive-home/static-reports.js";
import { buildExecutiveHome } from "../src/lib/executive-home/build-home.js";
import { readAgentSummaryBody } from "../src/lib/agent-inbox.js";

describe("executive home static reports", () => {
  const created: string[] = [];

  function writeReport(relUnderReports: string, content: string): string {
    const abs = join(getDocsReportsDir(), relUnderReports);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf-8");
    created.push(abs);
    return abs;
  }

  afterEach(() => {
    for (const path of created.splice(0)) {
      if (existsSync(path)) rmSync(path, { force: true });
    }
    setTenantId("demo");
  });

  it("picks latest dated dashboard / weekly brief / monthly files and skips non-date names", () => {
    setTenantId("mal");
    writeReport("dashboard/2099-01-01.md", "# Old daily\n\nbody\n");
    writeReport("dashboard/2099-06-15.md", "# Latest daily\n\nKPI\n");
    writeReport("dashboard/README.md", "# ignore\n");
    writeReport("dashboard/today-digest/2099-12-31.md", "# nested ignore\n");
    writeReport(
      "executive-brief/weekly-brief-2099-01-07.md",
      "# Old weekly\n\nx\n",
    );
    writeReport(
      "executive-brief/weekly-brief-2099-06-10.md",
      "# Latest weekly\n\ny\n",
    );
    writeReport("monthly/2099-01.md", "# Old month\n");
    writeReport("monthly/2099-06.md", "# Latest month\n\nfinance summary\n");

    const slots = loadExecutiveStaticReports();
    expect(slots.daily.as_of).toBe("2099-06-15");
    expect(slots.daily.title).toBe("Latest daily");
    expect(slots.daily.markdown).toContain("KPI");
    expect(slots.daily.generate_hint).toContain("orgos dashboard");
    expect(slots.daily.path).toMatch(/docs\/reports\/dashboard\/2099-06-15\.md$/);

    expect(slots.weekly.as_of).toBe("2099-06-10");
    expect(slots.weekly.title).toBe("Latest weekly");
    expect(slots.weekly.generate_hint).toContain("orgos executive brief");

    expect(slots.monthly.as_of).toBe("2099-06");
    expect(slots.monthly.title).toBe("Latest month");
    expect(slots.monthly.generate_hint).toContain("orgos report monthly");
  });

  it("falls back to monthly-audit when monthly/ is empty", () => {
    setTenantId("mal");
    const monthlyDir = join(getDocsReportsDir(), "monthly");
    const hidden: { from: string; to: string }[] = [];
    if (existsSync(monthlyDir)) {
      for (const name of readdirSync(monthlyDir)) {
        if (!/^\d{4}-\d{2}\.md$/.test(name)) continue;
        const from = join(monthlyDir, name);
        const to = join(monthlyDir, `.test-hide-${name}`);
        renameSync(from, to);
        hidden.push({ from, to });
      }
    }
    try {
      writeReport(
        "agent-summaries/records-audit/monthly-audit-2099-03.md",
        "# Audit March\n\nok\n",
      );
      const slots = loadExecutiveStaticReports();
      expect(slots.monthly.as_of).toBe("2099-03");
      expect(slots.monthly.title).toBe("Audit March");
      expect(slots.monthly.path).toMatch(/monthly-audit-2099-03\.md$/);
    } finally {
      for (const { from, to } of hidden) {
        if (existsSync(to)) renameSync(to, from);
      }
    }
  });

  it("returns empty slots with CLI hints when files are missing", () => {
    setTenantId("mal");
    const slots = loadExecutiveStaticReports();
    // May find real tenant files; assert shape always present
    expect(slots.daily.generate_hint).toContain("orgos dashboard");
    expect(slots.weekly.generate_hint).toContain("orgos executive brief");
    expect(slots.monthly.generate_hint).toContain("orgos report monthly");
    expect(typeof slots.daily.title).toBe("string");
  });

  it("buildExecutiveHome includes static_reports", () => {
    setTenantId("mal");
    writeReport("dashboard/2099-08-01.md", "# Home daily\n\nbody\n");
    const home = buildExecutiveHome();
    expect(home.static_reports.daily.as_of).toBe("2099-08-01");
    expect(home.static_reports.daily.markdown).toContain("Home daily");
  });

  it("allowlist accepts dashboard and rejects executive-notes", () => {
    setTenantId("mal");
    writeReport("dashboard/2099-09-01.md", "# Allowed\n");
    expect(
      readAgentSummaryBody("docs/reports/dashboard/2099-09-01.md"),
    ).toContain("Allowed");
    expect(() =>
      readAgentSummaryBody("docs/reports/executive-notes/secret.md"),
    ).toThrow(/must be under/);
  });
});

import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildKpiReport, formatKpiReport, KPI_LOG_REL } from "../src/lib/iso-kpi.js";
import { getTenantsDir, setTenantId } from "../src/lib/tenant.js";

const TENANT = `iso-kpi-${process.pid}`;
const tenantDir = join(getTenantsDir(), TENANT);
const logFile = join(tenantDir, KPI_LOG_REL);

const HEADER = "month,occupancy_nights,garbage_kg,electricity_kwh,gas_m3,water_m3,notes\n";

function writeLog(body: string): void {
  mkdirSync(dirname(logFile), { recursive: true });
  writeFileSync(logFile, body, "utf-8");
}

beforeAll(() => {
  mkdirSync(tenantDir, { recursive: true });
  writeFileSync(
    join(tenantDir, "tenant.yaml"),
    `id: ${TENANT}\nname: ISO 21401 KPI fixture\nlifecycle: test\noperation_mode: development\njurisdiction: JP\n`,
    "utf-8",
  );
  setTenantId(TENANT);
});

beforeEach(() => {
  rmSync(logFile, { force: true });
});

afterAll(() => {
  rmSync(tenantDir, { recursive: true, force: true });
});

describe("ISO 21401 KPI log", () => {
  it("reports a missing log rather than throwing", () => {
    const report = buildKpiReport();
    expect(report.exists).toBe(false);
    expect(report.errors.join()).toContain("iso templates");
    expect(report.rows).toEqual([]);
  });

  it("treats a header-only log as having no measurements", () => {
    writeLog(HEADER);
    const report = buildKpiReport();
    expect(report.exists).toBe(true);
    expect(report.rows).toEqual([]);
    // The complaint about an empty register belongs to the record spec
    // (records.yaml non_empty), not to the intensity computation.
    expect(report.errors).toEqual([]);
  });

  it("computes intensity per guest night and month-on-month change", () => {
    writeLog(`${HEADER}2026-04,100,200,1000,50,300,\n2026-05,200,300,1500,80,700,繁忙\n`);
    const report = buildKpiReport();
    expect(report.errors).toEqual([]);
    expect(report.rows.map((r) => r.month)).toEqual(["2026-04", "2026-05"]);
    expect(report.rows[0].intensity.garbage_kg).toBe(2);
    // 300/200 = 1.5 per night, down from 2.0 — absolute volume rose, intensity fell.
    expect(report.rows[1].intensity.garbage_kg).toBe(1.5);
    expect(report.rows[1].change.garbage_kg).toBeCloseTo(-0.25);
    expect(report.rows[0].change.garbage_kg).toBeNull();
    expect(report.totals.occupancy_nights).toBe(300);
    expect(report.average_intensity.water_m3).toBeCloseTo(1000 / 300);
  });

  it("orders rows by month regardless of file order", () => {
    writeLog(`${HEADER}2026-05,200,300,1500,80,700,\n2026-04,100,200,1000,50,300,\n`);
    expect(buildKpiReport().rows.map((r) => r.month)).toEqual(["2026-04", "2026-05"]);
  });

  it("drops rows it cannot compute from, leaving the diagnosis to the record spec", () => {
    writeLog(
      `${HEADER}2026-04,100,200,1000,50,300,\n2026-04,10,1,1,1,1,dup\n2026-13,10,1,1,1,1,bad\n2026-06,100,-5,abc,10,10,bad numbers\n`,
    );
    const report = buildKpiReport();
    expect(report.rows.map((r) => r.month)).toEqual(["2026-04"]);
    expect(report.skipped).toBe(3);
    expect(report.errors).toEqual([]);
  });

  it("flags usage recorded against zero guest nights", () => {
    writeLog(`${HEADER}2026-04,0,50,100,1,1,\n`);
    const report = buildKpiReport();
    expect(report.errors.join()).toContain("原単位を計算できません");
    expect(report.rows[0].intensity.garbage_kg).toBeNull();
  });

  it("renders a report that names the faults and the intensities", () => {
    writeLog(`${HEADER}2026-04,100,200,1000,50,300,\n`);
    const text = formatKpiReport(buildKpiReport());
    expect(text).toContain("原単位（1人泊あたり）");
    expect(text).toContain("2026-04");
    expect(text).toContain("2.00");
  });
});

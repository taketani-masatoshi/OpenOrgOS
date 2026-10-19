// @catalog-coverage: full
// @catalog-ids: hospitality

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetRuntimeContext, setRuntimeContext } from "../src/lib/runtime-context.js";
import { getTenantsDir } from "../src/lib/tenant.js";
import {
  checkInStay,
  checkOutStay,
  computeLodgingTax,
  computeStayMetrics,
  importOtaFile,
  importOtaRows,
  loadStays,
  loadTaxLedger,
  LodgingTaxMissingRateError,
  lodgingTaxDueOn,
  lodgingTaxPerPersonPerNight,
  markTaxFiled,
  markTaxPaid,
  nextStayId,
  parseOtaCsv,
  parseOtaIcal,
  saveTaxLedger,
  taxStatus,
  upsertStay,
  writeTaxPack,
} from "../steward/modules/hospitality/cli/ops-lib.js";
import { listHospitalityOpsDue } from "../steward/modules/hospitality/cli/ops-due.js";
import {
  cleanupHospitalityTenant,
  seedHospitalityTenant,
} from "./helpers/hospitality-fixture.js";

const FIXED_ISO = "2026-08-24T00:00:00.000Z";
const FIXED_DATE = "2026-08-24";

function useFixedClock(): void {
  const fixed = new Date(FIXED_ISO);
  setRuntimeContext({
    clock: {
      now: () => fixed,
      nowMs: () => fixed.getTime(),
      nowIso: () => FIXED_ISO,
    },
  });
}

describe("hospitality ops pure functions", () => {
  it("lodgingTaxPerPersonPerNight uses Tokyo brackets", () => {
    expect(lodgingTaxPerPersonPerNight(9999, null)).toBe(0);
    expect(lodgingTaxPerPersonPerNight(10000, null)).toBe(100);
    expect(lodgingTaxPerPersonPerNight(14999, null)).toBe(100);
    expect(lodgingTaxPerPersonPerNight(15000, null)).toBe(200);
    expect(lodgingTaxPerPersonPerNight(30000, null)).toBe(200);
  });

  it("lodgingTaxDueOn follows Tokyo rules", () => {
    expect(lodgingTaxDueOn("2026-07")).toBe("2026-08-31");
    expect(lodgingTaxDueOn("2026-11")).toBe("2026-12-31");
    expect(lodgingTaxDueOn("2026-12")).toBe("2027-01-04");
    expect(lodgingTaxDueOn("2026-01")).toBe("2026-02-28");
  });

  it("parseOtaCsv handles headers and channels", () => {
    const csv = [
      "check_in,check_out,party_size,channel,rate_per_night_jpy,ota_ref",
      "2026-09-01,2026-09-03,2,airbnb,45000,AB-1",
      "2026-09-05,2026-09-07,1,booking.com,30000,BK-2",
    ].join("\r\n");
    const rows = parseOtaCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      check_in: "2026-09-01",
      check_out: "2026-09-03",
      party_size: 2,
      channel: "airbnb",
      rate_per_night_jpy: 45000,
      ota_ref: "AB-1",
    });
    expect(rows[1].channel).toBe("booking");
    expect(rows[1].rate_per_night_jpy).toBe(30000);
  });

  it("parseOtaCsv defaults party_size and skips blank lines", () => {
    const csv = "check_in,check_out,party_size\n2026-09-01,2026-09-03,abc\n\n";
    const rows = parseOtaCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].party_size).toBe(1);
    expect(rows[0].rate_per_night_jpy).toBeUndefined();
  });

  it("parseOtaIcal extracts events", () => {
    const ical = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260801",
      "DTEND;VALUE=DATE:20260804",
      "UID:ical-test-001",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260810",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    const rows = parseOtaIcal(ical);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      check_in: "2026-08-01",
      check_out: "2026-08-04",
      ota_ref: "ical-test-001",
      party_size: 1,
      channel: "other",
    });
  });

  it("parseOtaCsv rejects a generic CSV without check_in / check_out columns", () => {
    expect(() => parseOtaCsv("arrival,departure\n2026-09-01,2026-09-03\n")).toThrow(/check_in/);
  });
});

describe("Airbnb exports", () => {
  const AIRBNB_HEADER =
    '"Confirmation code","Status","Guest name","Contact","# of adults","# of children","# of infants","Start date","End date","# of nights","Booked","Listing","Earnings"';

  function airbnbCsv(...rows: string[]): string {
    return [AIRBNB_HEADER, ...rows].join("\n");
  }

  it("parses the reservations CSV without carrying guest PII", () => {
    const rows = parseOtaCsv(
      airbnbCsv(
        '"HMAAA1","Confirmed","Guest A","+81 00","2","1","1","11/3/2026","11/05/2026","2","10/01/2026","Kamezawa","¥36,000"',
        '"HMAAA2","Past guest","Guest B","+81 00","1","0","0","08/01/2026","08/02/2026","1","07/01/2026","Kamezawa","¥9,000"'
      )
    );
    expect(rows).toEqual([
      {
        check_in: "2026-11-03",
        check_out: "2026-11-05",
        party_size: 3,
        ota_ref: "HMAAA1",
        channel: "airbnb",
        status: "booked",
      },
      {
        check_in: "2026-08-01",
        check_out: "2026-08-02",
        party_size: 1,
        ota_ref: "HMAAA2",
        channel: "airbnb",
        status: "checked_out",
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain("Guest");
  });

  it("maps cancellations and unconfirmed requests", () => {
    const rows = parseOtaCsv(
      airbnbCsv(
        '"HMBBB1","Canceled by guest","x","x","2","0","0","11/10/2026","11/12/2026","2","","",""',
        '"HMBBB2","Pending","x","x","2","0","0","11/20/2026","11/22/2026","2","","",""'
      )
    );
    expect(rows.map((r) => r.status)).toEqual(["cancelled", "unconfirmed"]);
  });

  it("refuses unknown statuses and unreadable dates", () => {
    expect(() =>
      parseOtaCsv(airbnbCsv('"HMC1","Mystery","x","x","1","0","0","11/10/2026","11/12/2026","2","","",""'))
    ).toThrow(/不明なステータス/);
    expect(() =>
      parseOtaCsv(airbnbCsv('"HMC2","Confirmed","x","x","1","0","0","2026.11.10","11/12/2026","2","","",""'))
    ).toThrow(/2 行目/);
  });

  it("iCal skips host blocks and detects the Airbnb channel", () => {
    const ical = [
      "BEGIN:VCALENDAR",
      "PRODID:-//Airbnb Inc//Hosting Calendar 1.0//EN",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20261103",
      "DTEND;VALUE=DATE:20261105",
      "SUMMARY:Reserved",
      "UID:aaa@airbnb.com",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20261120",
      "DTEND;VALUE=DATE:20261130",
      "SUMMARY:Airbnb (Not available)",
      "UID:bbb@airbnb.com",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    const rows = parseOtaIcal(ical);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ check_in: "2026-11-03", channel: "airbnb", ota_ref: "aaa@airbnb.com" });
    expect(parseOtaIcal(ical, "booking")).toHaveLength(2);
  });
});

describe("hospitality ops writes (ephemeral tenant)", () => {
  const tenantId = `test-hospitality-ops-${process.pid}`;

  beforeEach(() => {
    seedHospitalityTenant(tenantId);
    useFixedClock();
  });

  afterEach(() => {
    resetRuntimeContext();
    cleanupHospitalityTenant(tenantId);
  });

  it("upsertStay derives nights and merges by id", () => {
    const first = upsertStay({
      id: "STAY-2026-001",
      property_id: "PROP-002",
      check_in: "2026-08-01",
      check_out: "2026-08-03",
      party_size: 5,
      rate_per_night_jpy: 50000,
    });
    expect(first.nights).toBe(2);
    const createdAt = first.created_at;
    const second = upsertStay({
      id: "STAY-2026-001",
      property_id: "PROP-002",
      check_in: "2026-08-01",
      check_out: "2026-08-03",
      party_size: 5,
      rate_per_night_jpy: 50000,
      notes: "updated",
    });
    expect(second.created_at).toBe(createdAt);
    expect(second.notes).toBe("updated");
    expect(nextStayId()).toBe("STAY-2026-002");
  });

  it("check-in and check-out transition statuses", () => {
    upsertStay({
      id: "STAY-2026-010",
      property_id: "PROP-002",
      check_in: "2026-08-20",
      check_out: "2026-08-22",
    });
    expect(checkInStay("STAY-2026-010").status).toBe("checked_in");
    expect(checkOutStay("STAY-2026-010").status).toBe("checked_out");
    expect(checkOutStay("STAY-2026-010").cleaning_status).toBe("pending");
    expect(() => checkInStay("STAY-404")).toThrow(/not found/);
  });

  it("computeStayMetrics excludes cancelled stays", () => {
    upsertStay({
      id: "STAY-2026-001",
      property_id: "PROP-002",
      check_in: "2026-08-01",
      check_out: "2026-08-03",
      party_size: 2,
      rate_per_night_jpy: 50000,
    });
    upsertStay({
      id: "STAY-2026-002",
      property_id: "PROP-002",
      check_in: "2026-08-10",
      check_out: "2026-08-12",
      party_size: 1,
      status: "cancelled",
    });
    const metrics = computeStayMetrics("2026-08", "PROP-002");
    expect(metrics.available_nights).toBe(31);
    expect(metrics.stay_count).toBe(1);
    expect(metrics.occupied_nights).toBe(2);
    expect(metrics.revenue_jpy).toBe(100000);
    expect(metrics.adr).toBe(50000);
    expect(Math.round(metrics.revpar)).toBe(Math.round(100000 / 31));
  });

  it("computeLodgingTax writes tax_jpy 1000 and is idempotent", () => {
    upsertStay({
      id: "STAY-2026-001",
      property_id: "PROP-002",
      check_in: "2026-08-01",
      check_out: "2026-08-03",
      party_size: 5,
      rate_per_night_jpy: 50000,
    });
    computeLodgingTax("2026-08");
    const ledger = loadTaxLedger();
    const assessment = ledger.assessments.find((a) => a.stay_id === "STAY-2026-001");
    expect(assessment?.tax_jpy).toBe(1000);
    expect(ledger.period_filings.find((f) => f.period === "2026-08")?.status).toBe("computed");
    computeLodgingTax("2026-08");
    expect(loadTaxLedger().assessments.filter((a) => a.stay_id === "STAY-2026-001")).toHaveLength(1);
  });

  it("tax pack filed and paid close the gap", () => {
    upsertStay({
      id: "STAY-2026-001",
      property_id: "PROP-002",
      check_in: "2026-08-01",
      check_out: "2026-08-03",
      party_size: 5,
      rate_per_night_jpy: 50000,
    });
    computeLodgingTax("2026-08");
    const packPath = writeTaxPack("2026-08");
    expect(packPath).toContain("tax-packs/2026-08.md");
    expect(loadTaxLedger().period_filings.find((f) => f.period === "2026-08")?.status).toBe(
      "pack_ready"
    );
    markTaxFiled("2026-08", "2026-08-30");
    markTaxPaid("2026-08", 1000, "2026-08-31");
    const row = taxStatus("2026-08")[0];
    expect(row.gap_jpy).toBe(0);
    expect(row.filing?.status).toBe("paid");
  });

  it("importOtaRows is idempotent", () => {
    const rows = [
      {
        check_in: "2026-09-01",
        check_out: "2026-09-03",
        party_size: 2,
        channel: "airbnb" as const,
        ota_ref: "OTA-1",
        rate_per_night_jpy: 40000,
      },
    ];
    const first = importOtaRows(rows, "PROP-002");
    expect(first.imported).toHaveLength(1);
    expect(first.skipped).toHaveLength(0);
    const second = importOtaRows(rows, "PROP-002");
    expect(second.imported).toHaveLength(0);
    expect(second.skipped).toHaveLength(1);
    expect(loadStays().stays).toHaveLength(1);
  });

  it("computeLodgingTax stops when a stay has no rate and leaves the ledger untouched", () => {
    upsertStay({
      id: "STAY-2026-001",
      property_id: "PROP-002",
      check_in: "2026-08-01",
      check_out: "2026-08-03",
      party_size: 2,
      rate_per_night_jpy: 50000,
    });
    upsertStay({
      id: "STAY-2026-002",
      property_id: "PROP-002",
      check_in: "2026-08-10",
      check_out: "2026-08-12",
      party_size: 2,
    });
    const before = loadTaxLedger();
    expect(() => computeLodgingTax("2026-08")).toThrow(LodgingTaxMissingRateError);
    expect(() => computeLodgingTax("2026-08")).toThrow(/STAY-2026-002/);
    expect(loadTaxLedger()).toEqual(before);
  });

  it("computeLodgingTax accepts an explicit zero rate", () => {
    upsertStay({
      id: "STAY-2026-001",
      property_id: "PROP-002",
      check_in: "2026-08-01",
      check_out: "2026-08-03",
      party_size: 1,
      rate_per_night_jpy: 0,
    });
    computeLodgingTax("2026-08");
    expect(loadTaxLedger().assessments.find((a) => a.stay_id === "STAY-2026-001")?.tax_jpy).toBe(0);
  });

  it("importOtaRows applies OTA statuses", () => {
    const base = { party_size: 2, channel: "airbnb" as const };
    const first = importOtaRows(
      [
        { ...base, check_in: "2026-09-01", check_out: "2026-09-03", ota_ref: "HM-1", status: "booked" },
        { ...base, check_in: "2026-07-01", check_out: "2026-07-02", ota_ref: "HM-2", status: "checked_out" },
        { ...base, check_in: "2026-09-10", check_out: "2026-09-11", ota_ref: "HM-3", status: "unconfirmed" },
        { ...base, check_in: "2026-09-20", check_out: "2026-09-21", ota_ref: "HM-4", status: "cancelled" },
      ],
      "PROP-002"
    );
    expect(first.imported.map((s) => [s.ota_ref, s.status, s.cleaning_status])).toEqual([
      ["HM-1", "booked", "pending"],
      ["HM-2", "checked_out", "na"],
    ]);
    expect(first.skipped).toEqual([
      { ref: "HM-3", reason: "unconfirmed" },
      { ref: "HM-4", reason: "cancelled" },
    ]);

    const second = importOtaRows(
      [{ ...base, check_in: "2026-09-01", check_out: "2026-09-03", ota_ref: "HM-1", status: "cancelled" }],
      "PROP-002"
    );
    expect(second.cancelled.map((s) => s.ota_ref)).toEqual(["HM-1"]);
    expect(loadStays().stays.find((s) => s.ota_ref === "HM-1")?.status).toBe("cancelled");
  });

  it("importOtaFile reads csv from temp file", () => {
    const dir = mkdtempSync(join(tmpdir(), "orgos-ota-"));
    try {
      const file = join(dir, "ota.csv");
      writeFileSync(
        file,
        "check_in,check_out,party_size,channel,ota_ref\n2026-09-10,2026-09-12,1,direct,CSV-1\n",
        "utf-8"
      );
      const result = importOtaFile(file, "csv", "PROP-002");
      expect(result.imported).toHaveLength(1);
      expect(result.imported[0].ota_ref).toBe("CSV-1");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("hospitality ops-due", () => {
  const tenantId = `test-hospitality-due-${process.pid}`;

  beforeEach(() => {
    seedHospitalityTenant(tenantId);
  });

  afterEach(() => {
    cleanupHospitalityTenant(tenantId);
  });

  it("returns empty when hospitality disabled", () => {
    writeFileSync(
      join(getTenantsDir(), tenantId, "modules.yaml"),
      "modules:\n  - id: hospitality\n    enabled: false\n",
      "utf-8"
    );
    expect(listHospitalityOpsDue("2026-08-24")).toEqual([]);
  });

  it("classifies tax filing severity", () => {
    const ledger = loadTaxLedger();
    ledger.period_filings.push({
      period: "2026-07",
      due_on: "2026-08-31",
      status: "open",
    });
    saveTaxLedger(ledger);
    const due = listHospitalityOpsDue("2026-08-24");
    const tax = due.find((d) => d.id === "tax-2026-07");
    expect(tax?.severity).toBe("p0");
    expect(tax?.kind).toBe("tax");
  });

  it("excludes filed tax periods", () => {
    const ledger = loadTaxLedger();
    ledger.period_filings.push({
      period: "2026-06",
      due_on: "2026-07-31",
      status: "filed",
    });
    saveTaxLedger(ledger);
    expect(listHospitalityOpsDue("2026-08-24").some((d) => d.id === "tax-2026-06")).toBe(false);
  });

  it("sorts p0 before p1", () => {
    upsertStay({
      id: "STAY-2026-020",
      property_id: "PROP-002",
      check_in: "2026-08-23",
      check_out: "2026-08-25",
    });
    const ledger = loadTaxLedger();
    ledger.period_filings.push({
      period: "2026-07",
      due_on: "2026-08-31",
      status: "open",
    });
    saveTaxLedger(ledger);
    const due = listHospitalityOpsDue("2026-08-24");
    const ranks = due.map((d) => d.severity);
    for (let i = 1; i < ranks.length; i++) {
      const order = { p0: 0, p1: 1, p2: 2 };
      expect(order[ranks[i]]).toBeGreaterThanOrEqual(order[ranks[i - 1]]);
    }
  });
});

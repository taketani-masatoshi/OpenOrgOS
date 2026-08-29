// @catalog-coverage: full
// @catalog-ids: hospitality

import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GUEST_REGISTER_REQUIRED_COLUMNS } from "../schemas/hospitality-guest-register.js";
import { parseCsv } from "../src/lib/csv.js";
import {
  validateGuestRegister,
  validateGuestRegisterIntegrity,
} from "../steward/modules/hospitality/cli/guest-register.js";
import { upsertStay } from "../steward/modules/hospitality/cli/ops-lib.js";
import {
  cleanupHospitalityTenant,
  seedGuestRegisterCsv,
  seedHospitalityTenant,
} from "./helpers/hospitality-fixture.js";

const LEGAL_HEADER = [...GUEST_REGISTER_REQUIRED_COLUMNS, "nationality", "passport_or_id_number", "stay_id"];

describe("csv parser", () => {
  it("parses quoted fields with embedded commas", () => {
    const parsed = parseCsv('a,b\n"hello, world",2\n');
    expect(parsed.header).toEqual(["a", "b"]);
    expect(parsed.rows[0]).toEqual(["hello, world", "2"]);
  });
});

describe("guest register validate", () => {
  const tenantId = `test-hospitality-register-${process.pid}`;
  let root = "";

  beforeEach(() => {
    root = seedHospitalityTenant(tenantId);
  });

  afterEach(() => {
    cleanupHospitalityTenant(tenantId);
  });

  it("passes compliant CSV", () => {
    seedGuestRegisterCsv(root, {
      year: "2026",
      month: "08",
      header: LEGAL_HEADER,
      rows: [
        [
          "テスト太郎",
          "東京都墨田区",
          "会社員",
          "2026-08-01",
          "2026-08-03",
          "JP",
          "",
          "STAY-2026-001",
        ],
      ],
    });
    upsertStay({
      id: "STAY-2026-001",
      property_id: "PROP-002",
      check_in: "2026-08-01",
      check_out: "2026-08-03",
    });
    const result = validateGuestRegister({ year: "2026", month: "08" });
    expect(result.issues.filter((i) => i.level === "error")).toHaveLength(0);
    expect(result.rowCount).toBe(1);
  });

  it("flags legacy 5-column CSV as missing required columns", () => {
    seedGuestRegisterCsv(root, {
      year: "2026",
      month: "08",
      header: ["stay_id", "check_in", "check_out", "party_size", "guest_count_recorded", "notes"],
      rows: [["STAY-2026-001", "2026-08-01", "2026-08-03", "5", "5", ""]],
    });
    const result = validateGuestRegister({ year: "2026", month: "08" });
    expect(result.issues.some((i) => i.code === "missing_column")).toBe(true);
  });

  it("flags empty required cells without leaking guest names in aggregate report codes", () => {
    seedGuestRegisterCsv(root, {
      year: "2026",
      month: "08",
      header: LEGAL_HEADER,
      rows: [["", "東京都", "会社員", "2026-08-01", "2026-08-03", "JP", "", ""]],
    });
    const result = validateGuestRegister({ year: "2026", month: "08" });
    const emptyIssue = result.issues.find((i) => i.code === "empty_required");
    expect(emptyIssue?.message).not.toContain("テスト");
    expect(emptyIssue?.message).toContain("guest_name");
  });

  it("warns on unknown stay_id", () => {
    seedGuestRegisterCsv(root, {
      year: "2026",
      month: "08",
      header: LEGAL_HEADER,
      rows: [
        ["テスト花子", "東京都", "自営", "2026-08-05", "2026-08-06", "JP", "", "STAY-9999"],
      ],
    });
    const result = validateGuestRegister({ year: "2026", month: "08" });
    expect(result.issues.some((i) => i.code === "unknown_stay")).toBe(true);
    for (const issue of result.issues) {
      expect(issue.message).not.toContain("テスト花子");
    }
  });

  it("warns when retention folder exceeds 5 years", () => {
    const oldDir = join(
      root,
      "docs",
      "properties",
      "PROP-002",
      "operations",
      "records",
      "2018"
    );
    mkdirSync(oldDir, { recursive: true });
    const result = validateGuestRegister({ year: "2026", month: "08" });
    expect(result.issues.some((i) => i.code === "retention_exceeded")).toBe(true);
  });

  it("validateGuestRegisterIntegrity returns issues for mal-style noncompliance shape", () => {
    seedGuestRegisterCsv(root, {
      year: "2026",
      month: "08",
      header: ["stay_id", "check_in", "check_out"],
      rows: [["STAY-1", "2026-08-01", "2026-08-02"]],
    });
    const result = validateGuestRegister({ year: "2026", month: "08" });
    const issues = validateGuestRegisterIntegrity();
    expect(issues.length).toBeGreaterThan(0);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

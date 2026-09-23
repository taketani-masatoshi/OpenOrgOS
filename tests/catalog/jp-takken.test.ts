// @catalog-ids: jp_takken
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TakkenLicense,
  TakkenOffice,
  TakkenSettings,
  TakkenTransaction,
} from "../../schemas/jp-takken.js";
import { describeModuleCliRegistrations, listModuleCliBundles } from "../../src/lib/module-cli.js";
import { loadModuleManifest } from "../../src/lib/modules.js";
import { getSkillById, validateSkillRegistryFiles } from "../../src/lib/skill-registry.js";
import { setTenantId } from "../../src/lib/tenant.js";
import {
  buildComplianceReport,
  computeFeeLimit,
  evaluateChangeNotification,
  evaluateContractDelivery,
  evaluateExplanationTiming,
  evaluateLicenseRenewal,
  evaluateLicensorScope,
  evaluateOfficeRecords,
  evaluateOfficeStaffing,
  evaluateCardExpiry,
  evaluateRetentionPolicy,
  evaluateSecurity,
  evaluateTransactionFee,
  exchangeBasisYen,
  expectedLicenseExpiry,
  type FeeQuery,
  renderComplianceMarkdown,
  renewalWindow,
  requiredDedicatedTakkenshi,
  requiredSecurityYen,
  runJpTakkenCheck,
  runJpTakkenFee,
  runJpTakkenLicense,
  runJpTakkenShow,
  runJpTakkenStaffing,
  runJpTakkenValidate,
  type TakkenCheckItem,
} from "../../steward/jurisdiction-packs/JP/modules/jp_takken/cli/lib.js";
import { describeCatalogModule } from "./catalog-module-harness.js";

const MODULE_ID = "jp_takken";
const AS_OF = "2026-09-24";

describeCatalogModule(MODULE_ID);

function captureJson<T>(run: () => void): T {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    run();
    return JSON.parse(String(spy.mock.calls[0]?.[0])) as T;
  } finally {
    spy.mockRestore();
  }
}

function statusOf(checks: readonly TakkenCheckItem[], id: string): string | undefined {
  return checks.find((check) => check.id === id)?.status;
}

function saleQuery(overrides: Partial<FeeQuery> = {}): FeeQuery {
  return {
    kind: "sale",
    role: "brokerage",
    basisYen: 0,
    taxStatus: "taxable",
    residential: false,
    lowCostVacantSpecial: false,
    ...overrides,
  };
}

function office(overrides: Partial<TakkenOffice> = {}): TakkenOffice {
  return {
    office_id: "OFF-T",
    name: "テスト事務所",
    kind: "main",
    prefecture: "東京都",
    staff_count: 5,
    takkenshi: [{ employee_id: "EMP-T1", dedicated: true, card_expires_on: "2030-01-01" }],
    ...overrides,
  };
}

function transaction(overrides: Partial<TakkenTransaction> = {}): TakkenTransaction {
  return {
    id: "TX-T",
    office_id: "OFF-T",
    kind: "sale",
    role: "brokerage",
    residential: false,
    low_cost_vacant_house: false,
    long_term_vacant: false,
    counterparty_is_licensed_dealer: false,
    one_month_consent_from: [],
    ...overrides,
  };
}

const LICENSE: TakkenLicense = {
  licensor_kind: "governor",
  licensor_prefecture: "東京都",
  license_number: "東京都知事(1)第000000号",
  issued_on: "2021-12-01",
  valid_from: "2021-12-01",
  expires_on: "2026-11-30",
};

describe("jp_takken fee limits (報酬告示)", () => {
  it.each([
    [1_999_999, 109_999],
    [2_000_000, 110_000],
    [2_000_001, 110_000],
    [3_999_999, 197_999],
    [4_000_000, 198_000],
    [4_000_001, 198_000],
    [30_000_000, 1_056_000],
  ])("sale brokerage price %i → taxable cap %i (floor to yen)", (price, cap) => {
    expect(computeFeeLimit(saleQuery({ basisYen: price })).per_client_cap_yen).toBe(cap);
  });

  it("matches the 3% + 60,000 yen shortcut above 4,000,000 yen", () => {
    for (const price of [4_000_100, 10_000_000, 55_555_500]) {
      const limit = computeFeeLimit(saleQuery({ basisYen: price }));
      expect(limit.standard_excl_tax_yen).toBe((price * 3) / 100 + 60_000);
    }
  });

  it("agency doubles the brokerage amount and exempt dealers use tax-excluded × 1.04", () => {
    expect(computeFeeLimit(saleQuery({ basisYen: 10_000_000, role: "agency" })).combined_cap_yen).toBe(792_000);
    expect(computeFeeLimit(saleQuery({ basisYen: 10_000_000, taxStatus: "exempt" })).per_client_cap_yen).toBe(374_400);
  });

  it.each([
    [7_999_999, true, 330_000],
    [8_000_000, true, 330_000],
    [8_000_001, false, 330_000],
    [4_000_000, true, 330_000],
  ])("low-cost vacant special at %i → applied %s, cap %i", (price, applied, cap) => {
    const limit = computeFeeLimit(saleQuery({ basisYen: price, lowCostVacantSpecial: true }));
    expect(limit.special_applied).toBe(applied);
    expect(limit.per_client_cap_yen).toBe(cap);
  });

  it("low-cost vacant agency is twice the 第七 amount; exempt uses 300,000 × 1.04", () => {
    expect(
      computeFeeLimit(saleQuery({ basisYen: 5_000_000, role: "agency", lowCostVacantSpecial: true })).per_client_cap_yen
    ).toBe(660_000);
    expect(
      computeFeeLimit(saleQuery({ basisYen: 5_000_000, taxStatus: "exempt", lowCostVacantSpecial: true }))
        .per_client_cap_yen
    ).toBe(312_000);
  });

  it("lease brokerage: 1 month combined, residential 0.5 month per party", () => {
    const residential = computeFeeLimit(saleQuery({ kind: "lease", basisYen: 100_000, residential: true }));
    expect(residential.combined_cap_yen).toBe(110_000);
    expect(residential.residential_one_party_cap_yen).toBe(55_000);
    const odd = computeFeeLimit(saleQuery({ kind: "lease", basisYen: 99_999, residential: true }));
    expect(odd.residential_one_party_cap_yen).toBe(54_999);
    const exempt = computeFeeLimit(saleQuery({ kind: "lease", basisYen: 100_000, taxStatus: "exempt" }));
    expect(exempt.combined_cap_yen).toBe(104_000);
    expect(exempt.residential_one_party_cap_yen).toBeNull();
  });

  it("low-cost vacant special never applies to leases; exchange uses the larger value", () => {
    const lease = computeFeeLimit(saleQuery({ kind: "lease", basisYen: 50_000, lowCostVacantSpecial: true }));
    expect(lease.special_applied).toBe(false);
    expect(exchangeBasisYen(3_000_000, 5_000_000)).toBe(5_000_000);
    expect(exchangeBasisYen(3_000_000)).toBe(3_000_000);
  });
});

describe("jp_takken licence rules", () => {
  it("5-year validity ends the day before the anniversary (民法143条)", () => {
    expect(expectedLicenseExpiry("2021-12-01")).toBe("2026-11-30");
    expect(expectedLicenseExpiry("2024-02-29")).toBe("2029-02-28");
  });

  it("renewal window is 90 to 30 days before expiry", () => {
    expect(renewalWindow("2026-11-30")).toEqual({ opens_on: "2026-09-01", closes_on: "2026-10-31" });
  });

  it.each([
    ["2026-08-31", "ok"],
    ["2026-09-01", "warn"],
    ["2026-10-31", "warn"],
    ["2026-11-01", "fail"],
    ["2026-12-01", "fail"],
  ])("pending renewal as of %s → %s", (asOf, status) => {
    expect(evaluateLicenseRenewal(LICENSE, asOf).status).toBe(status);
  });

  it.each([
    ["2026-08-31", "needs_review"],
    ["2026-09-01", "ok"],
    ["2026-10-31", "ok"],
    ["2026-11-01", "fail"],
  ])("renewal applied on %s → %s", (appliedOn, status) => {
    expect(evaluateLicenseRenewal({ ...LICENSE, renewal_applied_on: appliedOn }, "2026-12-15").status).toBe(status);
  });

  it.each([
    ["2026-07-01", "ok"],
    ["2026-07-02", "fail"],
  ])("change notified on %s (changed 2026-06-01) → %s", (notifiedOn, status) => {
    const change = { id: "C", item: "officer" as const, changed_on: "2026-06-01", notified_on: notifiedOn };
    expect(evaluateChangeNotification(change, "2026-08-01").status).toBe(status);
  });

  it("unnotified change warns until day 30 and fails after; `other` needs review", () => {
    const change = { id: "C", item: "trade_name" as const, changed_on: "2026-06-01" };
    expect(evaluateChangeNotification(change, "2026-07-01").status).toBe("warn");
    expect(evaluateChangeNotification(change, "2026-07-02").status).toBe("fail");
    expect(evaluateChangeNotification({ ...change, item: "other" }, "2026-06-02").status).toBe("needs_review");
  });

  it("licensor must match office prefectures (法3条1項)", () => {
    const tokyo = office();
    const kanagawa = office({ office_id: "OFF-K", kind: "branch", prefecture: "神奈川県" });
    expect(evaluateLicensorScope(LICENSE, [tokyo]).status).toBe("ok");
    expect(evaluateLicensorScope(LICENSE, [tokyo, kanagawa]).status).toBe("fail");
    expect(evaluateLicensorScope({ ...LICENSE, licensor_kind: "minister" }, [tokyo]).status).toBe("fail");
    expect(evaluateLicensorScope({ ...LICENSE, licensor_prefecture: "大阪府" }, [tokyo]).status).toBe("fail");
    expect(evaluateLicensorScope({ ...LICENSE, licensor_kind: "minister" }, [tokyo, kanagawa]).status).toBe("ok");
  });

  it("security amounts follow 施行令2条の4 and 7条", () => {
    const offices = [office(), office({ office_id: "B1", kind: "branch" }), office({ office_id: "B2", kind: "branch" })];
    expect(requiredSecurityYen("deposit", offices)).toBe(20_000_000);
    expect(requiredSecurityYen("guarantee_association", offices)).toBe(1_200_000);
    const security = { method: "guarantee_association" as const, completed_on: "2021-12-10" };
    expect(statusOf(evaluateSecurity({ ...security, amount_yen: 1_199_999 }, offices), "security-amount")).toBe("fail");
    expect(statusOf(evaluateSecurity({ ...security, amount_yen: 1_200_000 }, offices), "security-amount")).toBe("ok");
    expect(statusOf(evaluateSecurity(security, offices), "security-amount")).toBe("needs_review");
    expect(statusOf(evaluateSecurity(undefined, offices), "security-timing")).toBe("fail");
  });
});

describe("jp_takken staffing rules", () => {
  it.each([
    [1, 1],
    [5, 1],
    [6, 2],
    [10, 2],
    [11, 3],
  ])("staff %i → dedicated takkenshi required %i (1/5 以上)", (staff, required) => {
    expect(requiredDedicatedTakkenshi(staff)).toBe(required);
  });

  it("counts only dedicated takkenshi whose card is valid on the as-of date", () => {
    const expiringToday = office({
      takkenshi: [{ employee_id: "EMP-T1", dedicated: true, card_expires_on: "2026-09-24" }],
    });
    expect(evaluateOfficeStaffing(expiringToday, "2026-09-24").status).toBe("ok");
    expect(evaluateOfficeStaffing(expiringToday, "2026-09-25").status).toBe("fail");
    expect(evaluateOfficeStaffing(office({ staff_count: 6 }), AS_OF).status).toBe("fail");
  });

  it.each([
    ["2026-09-30", "warn"],
    ["2026-10-01", "fail"],
  ])("shortage since 2026-09-16 as of %s → %s (2週間)", (asOf, status) => {
    const short = office({ staff_count: 6, takkenshi_shortage_since: "2026-09-16" });
    expect(evaluateOfficeStaffing(short, asOf).status).toBe(status);
  });

  it("card expiry warns within 6 months and fails when a dedicated card lapses", () => {
    const card = { employee_id: "EMP-T1", dedicated: true, card_expires_on: "2027-03-24" };
    expect(evaluateCardExpiry(card, "OFF-T", "2026-09-23").status).toBe("ok");
    expect(evaluateCardExpiry(card, "OFF-T", "2026-09-24").status).toBe("warn");
    expect(evaluateCardExpiry(card, "OFF-T", "2027-03-25").status).toBe("fail");
    expect(evaluateCardExpiry({ ...card, dedicated: false }, "OFF-T", "2027-03-25").status).toBe("warn");
  });
});

describe("jp_takken transaction and office rules", () => {
  it.each([
    ["2026-08-31", "ok"],
    ["2026-09-01", "needs_review"],
    ["2026-09-02", "fail"],
  ])("35条 explained %s for contract 2026-09-01 → %s", (explainedOn, status) => {
    const tx = transaction({ contract_on: "2026-09-01", explained_35_on: explainedOn });
    expect(evaluateExplanationTiming(tx).status).toBe(status);
  });

  it("35条 without explanation fails once the contract exists", () => {
    expect(evaluateExplanationTiming(transaction({ contract_on: "2026-09-01" })).status).toBe("fail");
    expect(evaluateExplanationTiming(transaction()).status).toBe("warn");
  });

  it("37条 delivery: same day ok, later needs review, missing after contract fails", () => {
    const contracted = transaction({ contract_on: "2026-09-01" });
    expect(evaluateContractDelivery({ ...contracted, delivered_37_on: "2026-09-01" }, AS_OF).status).toBe("ok");
    expect(evaluateContractDelivery({ ...contracted, delivered_37_on: "2026-09-03" }, AS_OF).status).toBe("needs_review");
    expect(evaluateContractDelivery(contracted, "2026-09-01").status).toBe("warn");
    expect(evaluateContractDelivery(contracted, "2026-09-02").status).toBe("fail");
  });

  it("fee check detects over-cap sale and honours residential one-month consent", () => {
    const sale = transaction({ price_yen: 10_000_000 });
    expect(evaluateTransactionFee({ ...sale, fee_charged_yen: 396_000 }, "taxable").status).toBe("ok");
    expect(evaluateTransactionFee({ ...sale, fee_charged_yen: 396_001 }, "taxable").status).toBe("fail");
    const lease = transaction({ kind: "lease", residential: true, monthly_rent_yen: 80_000, fee_charged_yen: 88_000 });
    expect(evaluateTransactionFee(lease, "taxable").status).toBe("fail");
    expect(evaluateTransactionFee({ ...lease, one_month_consent_from: ["client"] }, "taxable").status).toBe("ok");
    expect(
      evaluateTransactionFee({ ...lease, one_month_consent_from: ["client"], fee_from_other_party_yen: 1 }, "taxable")
        .status
    ).toBe("fail");
  });

  it("low-cost vacant special needs prior agreement; unencoded specials need review", () => {
    const vacant = transaction({ price_yen: 4_000_000, low_cost_vacant_house: true, fee_charged_yen: 330_000 });
    expect(evaluateTransactionFee(vacant, "taxable").status).toBe("needs_review");
    expect(evaluateTransactionFee({ ...vacant, special_fee_agreed_on: "2026-06-01" }, "taxable").status).toBe("ok");
    expect(evaluateTransactionFee({ ...vacant, fee_charged_yen: 330_001, special_fee_agreed_on: "2026-06-01" }, "taxable").status).toBe("fail");
    const longTerm = transaction({ kind: "lease", monthly_rent_yen: 50_000, long_term_vacant: true, fee_charged_yen: 110_000 });
    expect(evaluateTransactionFee(longTerm, "taxable").status).toBe("needs_review");
    expect(evaluateTransactionFee(transaction({ price_yen: 1_000_000 }), "taxable").status).toBe("warn");
  });

  it("office records: false fails, missing needs review; retention follows 施行規則", () => {
    const records = evaluateOfficeRecords(office({ sign_posted: true, fee_table_posted: false }));
    expect(statusOf(records, "office-OFF-T-sign")).toBe("ok");
    expect(statusOf(records, "office-OFF-T-fee-table")).toBe("fail");
    expect(statusOf(records, "office-OFF-T-ledger")).toBe("needs_review");
    const settings: TakkenSettings = {
      tax_status: "taxable",
      self_seller_new_housing: true,
      ledger_retention_years: 5,
      employee_register_retention_years: 10,
    };
    const retention = evaluateRetentionPolicy(settings);
    expect(statusOf(retention, "retention-ledger")).toBe("fail");
    expect(statusOf(retention, "retention-employee-register")).toBe("ok");
  });
});

describe("jp_takken module on demo seed", () => {
  beforeEach(() => {
    setTenantId("demo");
  });

  it("has manifest matching registered CLI subcommands and valid skills", () => {
    const manifest = loadModuleManifest(MODULE_ID);
    expect(manifest?.id).toBe(MODULE_ID);
    expect(manifest?.security?.limits?.concurrent_jobs).toBe(1);
    expect(listModuleCliBundles().map((bundle) => bundle.moduleId)).toContain(MODULE_ID);
    const registration = describeModuleCliRegistrations().get(MODULE_ID);
    expect(registration?.rootPath).toEqual(["operations", "takken"]);
    expect([...(registration?.subcommands ?? [])].sort()).toEqual([...(manifest?.cli_commands ?? [])].sort());
    expect(validateSkillRegistryFiles()).toEqual([]);
    expect(getSkillById("jp_takken_compliance_check")?.cli_command).toBe("operations takken check");
    expect(getSkillById("jp_takken_fee_calc")?.cli_command).toBe("operations takken fee");
  });

  it("show loads seed data", () => {
    const summary = captureJson<{ jurisdiction: string; transactions: number; offices: unknown[] }>(() =>
      runJpTakkenShow({ json: true })
    );
    expect(summary.jurisdiction).toBe("JP");
    expect(summary.transactions).toBe(7);
    expect(summary.offices).toHaveLength(2);
  });

  it("validate passes seed data", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpTakkenValidate();
    expect(spy).toHaveBeenCalledWith("✓ jp_takken — takken data OK");
    spy.mockRestore();
  });

  it("license detects the late change notification and the open renewal window", () => {
    const report = captureJson<{ status: string; checks: TakkenCheckItem[] }>(() =>
      runJpTakkenLicense({ asOf: AS_OF, json: true })
    );
    expect(report.status).toBe("fail");
    expect(statusOf(report.checks, "req-jp")).toBe("ok");
    expect(statusOf(report.checks, "license-renewal")).toBe("warn");
    expect(statusOf(report.checks, "change-CHG-001")).toBe("ok");
    expect(statusOf(report.checks, "change-CHG-002")).toBe("fail");
    expect(statusOf(report.checks, "change-CHG-003")).toBe("warn");
    expect(statusOf(report.checks, "security-amount")).toBe("ok");
  });

  it("staffing flags the branch shortage window and the lapsed dedicated card", () => {
    const inWindow = captureJson<{ checks: TakkenCheckItem[] }>(() =>
      runJpTakkenStaffing({ asOf: AS_OF, json: true })
    );
    expect(statusOf(inWindow.checks, "staffing-OFF-MAIN")).toBe("ok");
    expect(statusOf(inWindow.checks, "staffing-OFF-BR1")).toBe("warn");
    expect(statusOf(inWindow.checks, "card-OFF-BR1-EMP-012")).toBe("fail");
    const afterWindow = captureJson<{ checks: TakkenCheckItem[] }>(() =>
      runJpTakkenStaffing({ asOf: "2026-10-01", json: true })
    );
    expect(statusOf(afterWindow.checks, "staffing-OFF-BR1")).toBe("fail");
  });

  it("fee prints the sale brokerage cap", () => {
    const limit = captureJson<{ per_client_cap_yen: number; checks: TakkenCheckItem[] }>(() =>
      runJpTakkenFee({ kind: "sale", price: "30000000", json: true })
    );
    expect(limit.per_client_cap_yen).toBe(1_056_000);
    expect(statusOf(limit.checks, "req-jp")).toBe("ok");
  });

  it("check detects seeded 35条 / 37条 / fee issues per transaction", () => {
    const report = captureJson<{ status: string; checks: TakkenCheckItem[] }>(() =>
      runJpTakkenCheck({ asOf: AS_OF, json: true })
    );
    expect(report.status).toBe("fail");
    expect(statusOf(report.checks, "TX-001:fee-within-limit")).toBe("ok");
    expect(statusOf(report.checks, "TX-001:deal-link")).toBe("ok");
    expect(statusOf(report.checks, "TX-003:fee-within-limit")).toBe("ok");
    expect(statusOf(report.checks, "TX-004:fee-within-limit")).toBe("fail");
    expect(statusOf(report.checks, "TX-004:37-delivery")).toBe("fail");
    expect(statusOf(report.checks, "TX-004:35-before-contract")).toBe("needs_review");
    expect(statusOf(report.checks, "TX-005:35-before-contract")).toBe("fail");
    expect(statusOf(report.checks, "TX-005:35-by-takkenshi")).toBe("fail");
    expect(statusOf(report.checks, "TX-005:fee-within-limit")).toBe("fail");
    expect(statusOf(report.checks, "TX-006:fee-within-limit")).toBe("needs_review");
    expect(statusOf(report.checks, "TX-006:deal-link")).toBe("needs_review");
    expect(statusOf(report.checks, "office-OFF-BR1-fee-table")).toBe("fail");
  });

  it("renders a markdown report without writing by default", () => {
    const markdown = renderComplianceMarkdown(buildComplianceReport(AS_OF));
    expect(markdown).toContain("宅建業 コンプライアンス点検");
    expect(markdown).toContain("適法性を保証しない");
  });
});

describe("jp_takken non-JP tenant", () => {
  beforeEach(() => {
    setTenantId("hk-demo");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("license, staffing, check, and fee fail the jurisdiction rule on hk-demo", () => {
    const reports = [
      captureJson<{ status: string; checks: TakkenCheckItem[] }>(() => runJpTakkenLicense({ asOf: AS_OF, json: true })),
      captureJson<{ status: string; checks: TakkenCheckItem[] }>(() => runJpTakkenStaffing({ asOf: AS_OF, json: true })),
      captureJson<{ status: string; checks: TakkenCheckItem[] }>(() => runJpTakkenCheck({ asOf: AS_OF, json: true })),
    ];
    for (const report of reports) {
      expect(report.status).toBe("fail");
      expect(statusOf(report.checks, "req-jp")).toBe("fail");
    }
    const fee = captureJson<{ checks: TakkenCheckItem[] }>(() =>
      runJpTakkenFee({ kind: "lease", price: "100000", json: true })
    );
    expect(statusOf(fee.checks, "req-jp")).toBe("fail");
  });

  it("validate exits with a jurisdiction issue on hk-demo", () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((message: unknown) => {
      errors.push(String(message));
    });
    vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
      throw new Error(`exit ${code}`);
    });
    expect(() => runJpTakkenValidate()).toThrow("exit 1");
    expect(errors.some((line) => line.includes("JP-only"))).toBe(true);
  });
});

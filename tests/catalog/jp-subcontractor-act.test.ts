// @catalog-ids: jp_subcontractor_act
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  subcontractTransactionSchema,
  type SubcontractCategory,
  type SubcontractTransaction,
} from "../../schemas/jp-subcontractor-act.js";
import { listModuleCliBundles } from "../../src/lib/module-cli.js";
import { loadModuleManifest } from "../../src/lib/modules.js";
import { validateSkillRegistryFiles } from "../../src/lib/skill-registry.js";
import { setTenantId } from "../../src/lib/tenant.js";
import {
  addYears,
  checkDisclosure,
  checkJudgementEvents,
  checkPaymentMethod,
  checkPaymentTerm,
  checkRecordRetention,
  computeInterest,
  computeLatePaymentInterest,
  computeReductionInterest,
  deemedPaymentDueDate,
  determineScope,
  latestLawfulDueDate,
  runSubcontractCheck,
  runSubcontractLateInterest,
  runSubcontractScope,
  runSubcontractShow,
  runSubcontractValidate,
  type CheckReport,
  type LateInterestReport,
  type PartySize,
  type ScopeEntry,
} from "../../steward/jurisdiction-packs/JP/modules/jp_subcontractor_act/cli/lib.js";
import { describeCatalogModule } from "./catalog-module-harness.js";

const MODULE_ID = "jp_subcontractor_act";
const AS_OF = "2026-09-24";

describeCatalogModule(MODULE_ID);

function corporation(capitalYen?: number, regularEmployees?: number): PartySize {
  return {
    entity_type: "corporation",
    capital_yen: capitalYen,
    regular_employees: regularEmployees,
  };
}

function transaction(overrides: Partial<SubcontractTransaction> = {}): SubcontractTransaction {
  return subcontractTransactionSchema.parse({
    id: "T-1",
    vendor_id: "V-1",
    category: "manufacturing",
    ordered_on: "2026-04-01",
    terms_disclosed_on: "2026-04-01",
    disclosure_method: "paper",
    received_on: "2026-04-20",
    payment_due_on: "2026-05-31",
    amount_yen: 100000,
    ...overrides,
  });
}

function captureJson<T>(run: () => void): T {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  run();
  const output = String(spy.mock.calls[0]?.[0]);
  spy.mockRestore();
  return JSON.parse(output) as T;
}

function scopeOf(
  principal: PartySize,
  supplier: PartySize,
  category: SubcontractCategory = "manufacturing"
) {
  return determineScope({ category, ordered_on: "2026-04-01", principal, supplier });
}

describe("jp_subcontractor_act scope thresholds (法第2条第8項・第9項)", () => {
  it("designated categories: 3億円 upper tier boundary", () => {
    expect(scopeOf(corporation(300_000_001), corporation(300_000_000)).status).toBe("covered");
    expect(
      scopeOf(corporation(300_000_001, 10), corporation(300_000_001, 10), "manufacturing").status
    ).toBe("not_covered");
    expect(scopeOf(corporation(300_000_000), corporation(10_000_000)).article).toContain("第2号");
    expect(scopeOf(corporation(300_000_000, 10), corporation(10_000_001, 10)).status).toBe(
      "not_covered"
    );
  });

  it("capital at or below 1千万円 is not a principal under the capital basis", () => {
    expect(scopeOf(corporation(10_000_000, 10), corporation(1_000_000, 5)).status).toBe(
      "not_covered"
    );
    expect(scopeOf(corporation(10_000_001), corporation(10_000_000)).status).toBe("covered");
  });

  it("other information products / services use the 5千万円 tier", () => {
    const other: SubcontractCategory = "information_product_other";
    expect(scopeOf(corporation(50_000_001), corporation(50_000_000), other).article).toContain(
      "第3号"
    );
    expect(scopeOf(corporation(50_000_000), corporation(10_000_000), other).article).toContain(
      "第4号"
    );
    expect(scopeOf(corporation(50_000_000, 50), corporation(30_000_000, 50), other).status).toBe(
      "not_covered"
    );
  });

  it("employee basis applies only when the capital basis does not (300人 / 100人)", () => {
    const covered = scopeOf(corporation(120_000_000, 301), corporation(50_000_000, 300));
    expect(covered).toMatchObject({ status: "covered", basis: "employees" });
    expect(scopeOf(corporation(120_000_000, 300), corporation(50_000_000, 10)).status).toBe(
      "not_covered"
    );
    expect(scopeOf(corporation(120_000_000, 301), corporation(50_000_000, 301)).status).toBe(
      "not_covered"
    );
    const other: SubcontractCategory = "service_other";
    expect(scopeOf(corporation(40_000_000, 101), corporation(20_000_000, 100), other).basis).toBe(
      "employees"
    );
    expect(scopeOf(corporation(40_000_000, 100), corporation(20_000_000, 10), other).status).toBe(
      "not_covered"
    );
  });

  it("individual suppliers, exclusions, legacy orders and missing facts", () => {
    expect(scopeOf(corporation(120_000_000), { entity_type: "individual" }).status).toBe("covered");
    expect(
      scopeOf(corporation(120_000_000), corporation(1), "construction_subcontract").status
    ).toBe("not_covered");
    const legacy = determineScope({
      category: "manufacturing",
      ordered_on: "2025-12-31",
      principal: corporation(120_000_000),
      supplier: corporation(1_000_000),
    });
    expect(legacy.status).toBe("needs_review");
    expect(scopeOf(corporation(120_000_000, 350), corporation()).status).toBe("needs_review");
    expect(scopeOf({ entity_type: "individual", capital_yen: 0 }, corporation(1)).status).toBe(
      "not_covered"
    );
  });
});

describe("jp_subcontractor_act payment term and late interest (法第3条・第6条)", () => {
  it("60 days counted including the receipt date", () => {
    expect(latestLawfulDueDate("2026-04-20")).toBe("2026-06-18");
    expect(checkPaymentTerm(transaction({ payment_due_on: "2026-06-18" })).status).toBe("pass");
    expect(checkPaymentTerm(transaction({ payment_due_on: "2026-06-19" })).status).toBe("fail");
    expect(checkPaymentTerm(transaction({ payment_due_on: undefined })).status).toBe("fail");
  });

  it("deems the due date per 法第3条第2項", () => {
    expect(deemedPaymentDueDate("2026-04-20")).toBe("2026-04-20");
    expect(deemedPaymentDueDate("2026-04-20", "2026-07-01")).toBe("2026-06-18");
    expect(deemedPaymentDueDate("2026-04-20", "2026-05-31")).toBe("2026-05-31");
  });

  it("interest starts on the 61st day and counts both ends", () => {
    const base = { receivedOn: "2026-06-01", agreedDueOn: "2026-07-30", unpaidYen: 800_000 };
    expect(computeLatePaymentInterest({ ...base, settledOn: "2026-07-30" }).days).toBe(0);
    expect(computeLatePaymentInterest({ ...base, settledOn: "2026-07-31" }).days).toBe(1);
    const late = computeLatePaymentInterest({ ...base, settledOn: "2026-08-14" });
    expect(late).toMatchObject({ start_on: "2026-07-31", days: 15, interest_yen: 4_800 });
  });

  it("floors sub-yen interest", () => {
    expect(computeInterest(123_457, "2026-01-01", "2026-01-01").interest_yen).toBe(49);
  });

  it("reduction interest starts at the later of reduction date and day 61", () => {
    const early = computeReductionInterest({
      receivedOn: "2026-07-31",
      reducedOn: "2026-08-31",
      reducedYen: 30_000,
      refundedOn: "2026-10-28",
    });
    expect(early).toMatchObject({ start_on: "2026-09-29", days: 30, interest_yen: 360 });
    const late = computeReductionInterest({
      receivedOn: "2026-07-31",
      reducedOn: "2026-10-01",
      reducedYen: 30_000,
      refundedOn: "2026-10-01",
    });
    expect(late.start_on).toBe("2026-10-01");
  });
});

describe("jp_subcontractor_act obligation checks", () => {
  it("disclosure: missing fails, same day passes, later needs review", () => {
    expect(checkDisclosure(transaction({ terms_disclosed_on: undefined })).status).toBe("fail");
    expect(checkDisclosure(transaction()).status).toBe("pass");
    expect(checkDisclosure(transaction({ terms_disclosed_on: "2026-04-02" })).status).toBe(
      "needs_review"
    );
  });

  it("payment method: promissory notes banned, instruments compared with due date", () => {
    expect(checkPaymentMethod(transaction({ payment_method: "promissory_note" })).status).toBe(
      "fail"
    );
    const record = { payment_method: "electronic_record" as const };
    expect(
      checkPaymentMethod(transaction({ ...record, instrument_maturity_on: "2026-05-31" })).status
    ).toBe("pass");
    expect(
      checkPaymentMethod(transaction({ ...record, instrument_maturity_on: "2026-06-01" })).status
    ).toBe("fail");
    expect(checkPaymentMethod(transaction(record)).status).toBe("needs_review");
    expect(
      checkPaymentMethod(
        transaction({
          ...record,
          instrument_maturity_on: "2026-05-01",
          supplier_bears_instrument_fees: true,
        })
      ).status
    ).toBe("fail");
  });

  it("record retention: two years from completion", () => {
    expect(addYears("2028-02-29", 2)).toBe("2030-02-28");
    const done = { paid_on: "2026-05-29", records_completed_on: "2026-05-29" };
    expect(
      checkRecordRetention(transaction({ ...done, records_retained_until: "2028-05-29" })).status
    ).toBe("pass");
    expect(
      checkRecordRetention(transaction({ ...done, records_retained_until: "2028-05-28" })).status
    ).toBe("fail");
    expect(checkRecordRetention(transaction({ paid_on: "2026-05-29" })).status).toBe(
      "needs_review"
    );
  });

  it("judgement-based prohibitions never auto-pass", () => {
    expect(checkJudgementEvents(transaction())[0]?.status).toBe("not_assessed");
    const flagged = checkJudgementEvents(
      transaction({ events: [{ on: "2026-04-10", kind: "below_market_price" }] })
    );
    expect(flagged[0]).toMatchObject({ status: "needs_review", article: "法第5条第1項第5号" });
  });
});

describe("jp_subcontractor_act module on demo seed", () => {
  beforeEach(() => {
    setTenantId("demo");
  });

  it("has manifest, CLI subcommands matching cli_commands, and valid skills", () => {
    const manifest = loadModuleManifest(MODULE_ID);
    expect(manifest?.id).toBe(MODULE_ID);
    const bundle = listModuleCliBundles().find((b) => b.moduleId === MODULE_ID);
    expect(bundle).toBeDefined();
    const program = new Command();
    const operationsCmd = program.command("operations");
    bundle?.register({ program, operationsCmd });
    const subcontract = operationsCmd.commands.find((c) => c.name() === "subcontract");
    expect(subcontract?.commands.map((c) => c.name())).toEqual(manifest?.cli_commands);
    expect(validateSkillRegistryFiles()).toEqual([]);
  });

  it("show loads seed data", () => {
    const summary = captureJson<{
      jurisdiction: string;
      transactions: number;
      official_sources: number;
    }>(() => runSubcontractShow({ json: true }));
    expect(summary.jurisdiction).toBe("JP");
    expect(summary.transactions).toBeGreaterThan(0);
    expect(summary.official_sources).toBeGreaterThan(0);
  });

  it("validate passes seed data", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    runSubcontractValidate();
    expect(log).toHaveBeenCalledWith(`✓ ${MODULE_ID} — subcontract data OK`);
    log.mockRestore();
    warn.mockRestore();
  });

  it("scope classifies seed transactions", () => {
    const report = captureJson<{ transactions: ScopeEntry[] }>(() =>
      runSubcontractScope({ json: true })
    );
    const byId = new Map(report.transactions.map((entry) => [entry.transaction_id, entry]));
    expect(byId.get("SC-2026-001")).toMatchObject({ status: "covered", basis: "capital" });
    expect(byId.get("SC-2026-003")).toMatchObject({ status: "covered", basis: "employees" });
    expect(byId.get("SC-2026-006")?.status).toBe("not_covered");
    expect(byId.get("SC-2026-007")?.status).toBe("not_covered");
    expect(byId.get("SC-2025-101")?.status).toBe("needs_review");
    expect(byId.get("SC-2026-008")?.status).toBe("needs_review");
  });

  it("check detects violations in seed data", () => {
    const report = captureJson<CheckReport>(() => runSubcontractCheck({ asOf: AS_OF, json: true }));
    const status = (txId: string, itemId: string) =>
      report.transactions.find((t) => t.transaction_id === txId)?.items.find((i) => i.id === itemId)
        ?.status;
    expect(report.outcome).toBe("fail");
    expect(report.transactions.find((t) => t.transaction_id === "SC-2026-001")?.outcome).toBe(
      "no_issue_detected"
    );
    expect(status("SC-2026-002", "payment-term")).toBe("fail");
    expect(status("SC-2026-002", "late-payment")).toBe("fail");
    expect(status("SC-2026-003", "payment-method")).toBe("fail");
    expect(status("SC-2026-004", "amount-reduction")).toBe("fail");
    expect(status("SC-2026-004", "records")).toBe("fail");
    expect(status("SC-2026-004", "event-1-price_negotiation_declined")).toBe("needs_review");
    expect(status("SC-2026-005", "returns")).toBe("fail");
    expect(status("SC-2026-005", "paid-materials")).toBe("needs_review");
    expect(status("SC-2025-101", "legacy-order")).toBe("needs_review");
  });

  it("late-interest computes seed transactions", () => {
    const late = captureJson<LateInterestReport>(() =>
      runSubcontractLateInterest({ transaction: "SC-2026-002", asOf: AS_OF, json: true })
    );
    expect(late.late_payment).toMatchObject({ days: 15, interest_yen: 4_800 });
    const note = captureJson<LateInterestReport>(() =>
      runSubcontractLateInterest({ transaction: "SC-2026-003", asOf: AS_OF, json: true })
    );
    expect(note).toMatchObject({ settled_on: "2026-10-29", total_interest_yen: 11_160 });
    const reduction = captureJson<LateInterestReport>(() =>
      runSubcontractLateInterest({ transaction: "SC-2026-004", asOf: "2026-10-28", json: true })
    );
    expect(reduction.reductions[0]).toMatchObject({ days: 30, interest_yen: 360, refunded: false });
  });
});

describe("jp_subcontractor_act non-JP tenant", () => {
  beforeEach(() => {
    setTenantId("hk-demo");
  });

  it("check and scope fail the jurisdiction rule on hk-demo", () => {
    const report = captureJson<CheckReport>(() => runSubcontractCheck({ asOf: AS_OF, json: true }));
    expect(report.outcome).toBe("fail");
    expect(report.checks.some((c) => c.id === "req-jp" && c.status === "fail")).toBe(true);
    const scope = captureJson<{ checks: CheckReport["checks"]; transactions: unknown[] }>(() =>
      runSubcontractScope({ json: true })
    );
    expect(scope.checks[0]?.status).toBe("fail");
    expect(scope.transactions).toEqual([]);
    const late = captureJson<LateInterestReport>(() =>
      runSubcontractLateInterest({ transaction: "SC-2026-002", asOf: AS_OF, json: true })
    );
    expect(late.computed).toBe(false);
  });
});

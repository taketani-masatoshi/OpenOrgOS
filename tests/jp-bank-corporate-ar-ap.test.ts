// @catalog-coverage: full
// @catalog-ids: jp_bank_corporate
import { describe, expect, it, vi, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/utils.js";
import {
  loadArApLedger,
  loadCollectionTerms,
} from "../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/data-loaders.js";
import {
  runJpBankArApList,
  runJpBankArApSync,
  runJpBankArApValidate,
  runJpBankCalendarImport,
} from "../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/lib.js";
import {
  addCalendarDays,
  dueDateFromCollectionTerm,
  validateCollectionTermReferences,
} from "../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/collection-terms.js";
import { buildCalendarImport } from "../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/calendar-import.js";
import {
  buildInvoiceArApEntries,
  findGeneratedInvoiceMonths,
  mergeArApEntries,
} from "../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/ar-ap-sync.js";
import {
  resolveArApPlannedAmount,
  resolveArApRemainingAmount,
} from "../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/ar-ap-amounts.js";
import {
  arApEntrySchema,
  arApLedgerFileSchema,
  collectionTermsFileSchema,
} from "../schemas/jp-bank-corporate.js";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { loadProperties } from "../src/lib/data.js";
import { loadModulesFile } from "../src/lib/modules.js";

describe("jp_bank_corporate ar-ap", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("loads ar-ap ledger from tenant", () => {
    const ledger = loadArApLedger();
    expect(ledger?.data.entries.length).toBeGreaterThanOrEqual(3);
    const kinds = new Set(ledger?.data.entries.map((e) => e.kind));
    expect(kinds.has("ar")).toBe(true);
    expect(kinds.has("ap")).toBe(true);
  });

  it("loads collection terms", () => {
    const terms = loadCollectionTerms();
    expect(terms?.data.rules.length).toBeGreaterThan(0);
    expect(terms?.data.rules.some((r) => r.id === "term-ar-ota")).toBe(true);
  });

  it("validates ar-ap cross-references", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpBankArApValidate();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("ar-ap-ledger"));
    spy.mockRestore();
  });

  it("lists open AR entries", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpBankArApList({ kind: "ar" });
    expect(spy.mock.calls.some((c) => String(c[0]).includes("AR-2026"))).toBe(true);
    spy.mockRestore();
  });

  it("calendar import dry-run from payroll", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpBankCalendarImport({ from: "payroll" });
    expect(spy.mock.calls.some((c) => String(c[0]).includes("dry-run"))).toBe(true);
    spy.mockRestore();
  });

  it("ar-ap sync invoices dry-run skips months without artifacts", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpBankArApSync({ from: "invoices", fy: "FY2099", month: "2099-01" });
    expect(spy.mock.calls.some((c) => String(c[0]).includes("dry-run"))).toBe(true);
    spy.mockRestore();
  });

  it("syncs mal bancho July invoice artifact into AR entries", () => {
    const synced = buildInvoiceArApEntries({ fy: "FY2026", month: "2026-07" });
    expect(synced.entries).toHaveLength(1);
    expect(synced.entries[0]).toMatchObject({
      id: "AR-INV-BANCHO-2026-07",
      collection_term_id: "term-ar-rent",
      amount: 100000,
    });
  });

  it("resolves partial AR/AP amounts from paid_amount", () => {
    const entry = arApEntrySchema.parse({
      id: "AP-PARTIAL",
      kind: "ap",
      amount: 180000,
      paid_amount: 90000,
      booked_date: "2026-06-01",
      due_date: "2026-07-15",
      collected_or_paid_date: "2026-07-01",
      counterparty: "fixture",
      description: "fixture",
      status: "partial",
    });
    expect(resolveArApRemainingAmount(entry)).toBe(90000);
    expect(resolveArApPlannedAmount(entry)).toBe(90000);
  });

  it("computes collection-term due dates in calendar days", () => {
    expect(
      dueDateFromCollectionTerm("2026-01-15", {
        days_after_booking: 10,
        days_after_month_end: undefined,
      })
    ).toBe("2026-01-25");
    expect(
      dueDateFromCollectionTerm("2024-02-10", {
        days_after_booking: 0,
        days_after_month_end: 1,
      })
    ).toBe("2024-03-01");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("reports undefined collection terms", () => {
    const entry = arApEntrySchema.parse({
      id: "AR-TERM-CHECK",
      kind: "ar",
      amount: 1,
      booked_date: "2026-07-01",
      due_date: "2026-07-31",
      counterparty: "fixture",
      description: "fixture",
      collection_term_id: "missing-term",
    });
    expect(validateCollectionTermReferences([entry], [])).toEqual([
      "AR-TERM-CHECK: collection_term_id missing-term not found",
    ]);
  });

  it("imports real payroll, tax, yojitsu, and contract fixture values", () => {
    expect(buildCalendarImport({ from: "payroll", month: "2026-07" }).entries[0]).toMatchObject({
      amount: 320000,
      date: "2026-07-25",
    });
    expect(buildCalendarImport({ from: "tax", fy: "FY2026" }).entries[0]).toMatchObject({
      amount: 775000,
      date: "2027-03-31",
    });
    expect(
      buildCalendarImport({ from: "yojitsu", fy: "FY2026", month: "2026-03" }).entries[0]
    ).toMatchObject({ amount: 13000000, date: "2026-03-31" });
    expect(buildCalendarImport({ from: "contracts", month: "2026-07" }).entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "CTR-IMPORT-CTR-012-2026-07", amount: 85000 }),
      ])
    );
  });

  it("builds stable invoice entries and merges idempotently", () => {
    const root = mkdtempSync(join(tmpdir(), "orgos-invoice-sync-"));
    const output = join(root, "FY2026", "output");
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, "2026-07-invoice.eml"), "fixture");
    const discovered = findGeneratedInvoiceMonths(root, {
      fy: "FY2026",
      month: "2026-07",
    });
    expect(discovered).toEqual([{ fiscalYear: "FY2026", month: "2026-07" }]);
    const synced = buildInvoiceArApEntries(
      { fy: "FY2026", month: "2026-07" },
      {
        modules: loadModulesFile().modules,
        properties: loadProperties(),
        resolveInvoiceMonths: () => discovered,
      }
    );
    expect(synced.entries).toHaveLength(1);
    expect(synced.entries[0]).toMatchObject({
      id: "AR-INV-BANCHO-2026-07",
      invoice_id: "INV-BANCHO-2026-07",
      amount: 100000,
      category: "rent",
      chart_account_id: "4100",
      booked_date: "2026-07-31",
      due_date: "2026-08-31",
      due_date_source: "invoice-payment-due-date",
      origin_source: "invoice",
      collection_term_id: "term-ar-rent",
    });
    const empty = arApLedgerFileSchema.parse({ currency: "JPY", entries: [] });
    const once = mergeArApEntries(empty, synced.entries);
    const twice = mergeArApEntries(once.ledger, synced.entries);
    expect(once.added).toBe(1);
    expect(twice.added).toBe(0);
    expect(twice.ledger.entries).toHaveLength(1);
    rmSync(root, { recursive: true, force: true });
  });

  it("contains no production stub markers or former fixed import amounts", () => {
    const cliDir = join(
      process.cwd(),
      "steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli"
    );
    const source = ["lib.ts", "calendar-import.ts", "ar-ap-sync.ts"]
      .map((file) => readFileSync(join(cliDir, file), "utf-8"))
      .join("\n");
    expect(source).not.toMatch(/\bstub\b/i);
    expect(source).not.toContain("550000");
    expect(source).not.toContain("180000");
    expect(source).not.toContain("13000000");
  });

  it("seed examples parse with schema", () => {
    const seedDir = join(
      process.cwd(),
      "steward/jurisdiction-packs/JP/modules/jp_bank_corporate/seed"
    );
    const ledger = arApLedgerFileSchema.parse(
      YAML.parse(readFileSync(join(seedDir, "ar-ap-ledger.yaml.example"), "utf-8"))
    );
    expect(ledger.entries.length).toBeGreaterThan(0);
    const terms = collectionTermsFileSchema.parse(
      YAML.parse(readFileSync(join(seedDir, "collection-terms.yaml.example"), "utf-8"))
    );
    expect(terms.rules.length).toBeGreaterThan(0);
  });
});

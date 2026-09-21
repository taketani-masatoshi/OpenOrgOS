import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendJournalEntry, loadJournalEntries } from "../src/lib/finance/expense-claim-journal.js";
import { evaluateTaxAdjustment } from "../src/lib/finance/tax-adjustment.js";
import { buildCorporateTaxXmlDraft } from "../src/lib/finance/jp-corporate-tax-xml.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  resetFixtureJournalEntries,
  useFinanceFixtureTenant,
} from "./helpers/finance-fixture.js";

const FY = "FY2026";

function restore(path: string, original: string): void {
  writeFileSync(path, original);
}

describe("tax adjustment acceptance", () => {
  afterEach(() => {
    resetFixtureJournalEntries();
    const adjustments = join(getDataDir(), "finance", "tax-adjustments.yaml");
    if (existsSync(adjustments)) unlinkSync(adjustments);
  });

  it("adds depreciation and entertainment excess and an explicit subtraction", () => {
    useFinanceFixtureTenant();
    resetFixtureJournalEntries();
    const assetPath = join(getDataDir(), "finance", "fixed-assets.yaml");
    const profilePath = join(getDataDir(), "finance", "tax-profile.yaml");
    const assetOriginal = readFileSync(assetPath, "utf-8");
    const profileOriginal = readFileSync(profilePath, "utf-8");
    writeFileSync(assetPath, assetOriginal.replace("book_value: 4293618\n", "book_value: 4293618\n    tax_depreciation_yen: 60\n"));
    writeFileSync(
      profilePath,
      profileOriginal.replace(
        "corporate_tax:\n",
        "corporate_tax:\n  entertainment_account_code: \"5900\"\n  entertainment_cap_yen: 10\n",
      ),
    );
    writeFileSync(
      join(getDataDir(), "finance", "tax-adjustments.yaml"),
      `fiscal_year: ${FY}\nlines:\n  - id: ADJ-1\n    kind: subtract\n    amount_yen: 5\n    label: other\n`,
    );
    try {
      appendJournalEntry({
        entry_id: "JE-DEP-ASSET-001-2026-09",
        occurred_at: "2026-09-30T00:00:00.000Z",
        description: "dep",
        source: { kind: "depreciation", asset_id: "ASSET-001", period: "2026-09" },
        evidence_refs: ["test:dep"],
        lines: [
          { account_code: "5100", debit_yen: 100, credit_yen: 0, tax_category: "out_of_scope" },
          { account_code: "1290", debit_yen: 0, credit_yen: 100, tax_category: "out_of_scope" },
        ],
      });
      appendJournalEntry({
        entry_id: "JE-ENT",
        occurred_at: "2026-09-15T00:00:00.000Z",
        description: "entertainment",
        source: { kind: "manual", authorized_by: "OP-TEST" },
        evidence_refs: ["test:ent"],
        lines: [
          { account_code: "5900", debit_yen: 30, credit_yen: 0, tax_category: "out_of_scope" },
          { account_code: "1100", debit_yen: 0, credit_yen: 30, tax_category: "out_of_scope" },
        ],
      });
      const count = loadJournalEntries().entries.length;
      const sheet = evaluateTaxAdjustment(FY);
      expect(sheet.can_compute).toBe(true);
      expect(sheet.additions_yen).toBe(60);
      expect(sheet.subtractions_yen).toBe(5);
      expect(sheet.taxable_income_yen).toBe((sheet.starting_profit_yen ?? 0) + 55);
      expect(loadJournalEntries().entries.length).toBe(count);
      const again = evaluateTaxAdjustment(FY);
      expect(again.taxable_income_yen).toBe(sheet.taxable_income_yen);
      expect(loadJournalEntries().entries.length).toBe(count);

      const draft = buildCorporateTaxXmlDraft({ fiscalYear: FY, asOf: sheet.as_of });
      expect(draft.xml).toContain("<Line code=\"add_backs\" label=\"加算\">60</Line>");
      expect(draft.xml).not.toContain("加算（税理士確定）");
    } finally {
      restore(assetPath, assetOriginal);
      restore(profilePath, profileOriginal);
    }
  });

  it("reconstructs starting profit from the transfer and refuses a missing tax amount", () => {
    useFinanceFixtureTenant();
    resetFixtureJournalEntries();
    appendJournalEntry(
      {
        entry_id: "JE-CLOSE-FY2026-PL-TRANSFER",
        occurred_at: "2027-01-31T23:59:59.000Z",
        description: "transfer",
        source: { kind: "closing", period: "2027-01", adjustment_id: "pl-transfer" },
        evidence_refs: ["test:transfer"],
        lines: [
          { account_code: "4100", debit_yen: 80, credit_yen: 0, tax_category: "out_of_scope" },
          { account_code: "3200", debit_yen: 0, credit_yen: 80, tax_category: "out_of_scope" },
        ],
      },
      { allowAnnualPlTransfer: true },
    );
    appendJournalEntry({
      entry_id: "JE-DEP-ASSET-001-2026-10",
      occurred_at: "2026-10-31T00:00:00.000Z",
      description: "dep",
      source: { kind: "depreciation", asset_id: "ASSET-001", period: "2026-10" },
      evidence_refs: ["test:dep"],
      lines: [
        { account_code: "5100", debit_yen: 100, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "1290", debit_yen: 0, credit_yen: 100, tax_category: "out_of_scope" },
      ],
    });
    const sheet = evaluateTaxAdjustment(FY);
    expect(sheet.can_compute).toBe(false);
    expect(sheet.errors.some((error) => error.includes("tax_depreciation_yen"))).toBe(true);
    const draft = buildCorporateTaxXmlDraft({ fiscalYear: FY });
    expect(draft.xml).not.toContain('label="加算">0</Line>');
    expect(draft.xml).not.toContain("<Line code=\"taxable_income_estimate\">");
  });

  it("keeps the same starting profit after the transfer", () => {
    useFinanceFixtureTenant();
    resetFixtureJournalEntries();
    appendJournalEntry({
      entry_id: "JE-REV",
      occurred_at: "2026-09-12T00:00:00.000Z",
      description: "revenue",
      source: { kind: "manual", authorized_by: "OP-TEST" },
      evidence_refs: ["test:rev"],
      lines: [
        { account_code: "1100", debit_yen: 80, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "4100", debit_yen: 0, credit_yen: 80, tax_category: "non_taxable" },
      ],
    });
    const before = evaluateTaxAdjustment(FY);
    expect(before.can_compute).toBe(true);
    expect(before.starting_profit_yen).toBe(80);
    appendJournalEntry(
      {
        entry_id: "JE-CLOSE-FY2026-PL-TRANSFER",
        occurred_at: "2027-01-31T23:59:59.000Z",
        description: "transfer",
        source: { kind: "closing", period: "2027-01", adjustment_id: "pl-transfer" },
        evidence_refs: ["test:transfer"],
        lines: [
          { account_code: "4100", debit_yen: 80, credit_yen: 0, tax_category: "out_of_scope" },
          { account_code: "3200", debit_yen: 0, credit_yen: 80, tax_category: "out_of_scope" },
        ],
      },
      { allowAnnualPlTransfer: true },
    );
    const after = evaluateTaxAdjustment(FY);
    expect(after.can_compute).toBe(true);
    expect(after.starting_profit_yen).toBe(before.starting_profit_yen);
    expect(after.taxable_income_yen).toBe(before.taxable_income_yen);
  });

  it("refuses a missing entertainment cap, a colliding line, and an unbalanced trial balance", () => {
    useFinanceFixtureTenant();
    resetFixtureJournalEntries();
    const profilePath = join(getDataDir(), "finance", "tax-profile.yaml");
    const profileOriginal = readFileSync(profilePath, "utf-8");
    writeFileSync(
      profilePath,
      profileOriginal.replace(
        "corporate_tax:\n",
        "corporate_tax:\n  entertainment_account_code: \"5900\"\n",
      ),
    );
    try {
      appendJournalEntry({
        entry_id: "JE-ENT",
        occurred_at: "2026-09-15T00:00:00.000Z",
        description: "entertainment",
        source: { kind: "manual", authorized_by: "OP-TEST" },
        evidence_refs: ["test:ent"],
        lines: [
          { account_code: "5900", debit_yen: 30, credit_yen: 0, tax_category: "out_of_scope" },
          { account_code: "1100", debit_yen: 0, credit_yen: 30, tax_category: "out_of_scope" },
        ],
      });
      expect(evaluateTaxAdjustment(FY).errors).toContain("entertainment cap missing");
    } finally {
      restore(profilePath, profileOriginal);
    }

    writeFileSync(
      join(getDataDir(), "finance", "tax-adjustments.yaml"),
      `fiscal_year: ${FY}\nlines:\n  - id: depreciation_excess\n    kind: add\n    amount_yen: 1\n    label: collide\n`,
    );
    expect(evaluateTaxAdjustment(FY).can_compute).toBe(false);

    resetFixtureJournalEntries();
    appendJournalEntry({
      entry_id: "JE-BAD",
      occurred_at: "2026-09-15T00:00:00.000Z",
      description: "unknown",
      source: { kind: "manual", authorized_by: "OP-TEST" },
      evidence_refs: ["test:bad"],
      lines: [
        { account_code: "9999", debit_yen: 10, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "1100", debit_yen: 0, credit_yen: 10, tax_category: "out_of_scope" },
      ],
    });
    const unbalanced = evaluateTaxAdjustment(FY);
    expect(unbalanced.can_compute).toBe(false);
    expect(unbalanced.taxable_income_yen).toBeNull();
  });

  it("does not add when book depreciation and entertainment are within the tax figures", () => {
    useFinanceFixtureTenant();
    resetFixtureJournalEntries();
    const assetPath = join(getDataDir(), "finance", "fixed-assets.yaml");
    const profilePath = join(getDataDir(), "finance", "tax-profile.yaml");
    const assetOriginal = readFileSync(assetPath, "utf-8");
    const profileOriginal = readFileSync(profilePath, "utf-8");
    writeFileSync(assetPath, assetOriginal.replace("book_value: 4293618\n", "book_value: 4293618\n    tax_depreciation_yen: 100\n"));
    writeFileSync(
      profilePath,
      profileOriginal.replace(
        "corporate_tax:\n",
        "corporate_tax:\n  entertainment_account_code: \"5900\"\n  entertainment_cap_yen: 10\n",
      ),
    );
    try {
      appendJournalEntry({
        entry_id: "JE-DEP-ASSET-001-2026-09",
        occurred_at: "2026-09-30T00:00:00.000Z",
        description: "dep",
        source: { kind: "depreciation", asset_id: "ASSET-001", period: "2026-09" },
        evidence_refs: ["test:dep"],
        lines: [
          { account_code: "5100", debit_yen: 100, credit_yen: 0, tax_category: "out_of_scope" },
          { account_code: "1290", debit_yen: 0, credit_yen: 100, tax_category: "out_of_scope" },
        ],
      });
      appendJournalEntry({
        entry_id: "JE-ENT",
        occurred_at: "2026-09-15T00:00:00.000Z",
        description: "entertainment",
        source: { kind: "manual", authorized_by: "OP-TEST" },
        evidence_refs: ["test:ent"],
        lines: [
          { account_code: "5900", debit_yen: 5, credit_yen: 0, tax_category: "out_of_scope" },
          { account_code: "1100", debit_yen: 0, credit_yen: 5, tax_category: "out_of_scope" },
        ],
      });
      const sheet = evaluateTaxAdjustment(FY);
      expect(sheet.can_compute).toBe(true);
      expect(sheet.additions_yen).toBe(0);
    } finally {
      restore(assetPath, assetOriginal);
      restore(profilePath, profileOriginal);
    }
  });

  it("keeps a negative taxable income", () => {
    useFinanceFixtureTenant();
    resetFixtureJournalEntries();
    writeFileSync(
      join(getDataDir(), "finance", "tax-adjustments.yaml"),
      `fiscal_year: ${FY}\nlines:\n  - id: ADJ-LOSS\n    kind: subtract\n    amount_yen: 5\n    label: other\n`,
    );
    const sheet = evaluateTaxAdjustment(FY);
    expect(sheet.can_compute).toBe(true);
    expect(sheet.taxable_income_yen).toBe(-5);
  });
});

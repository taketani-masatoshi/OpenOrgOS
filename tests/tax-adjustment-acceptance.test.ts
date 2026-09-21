import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendJournalEntry,
  loadJournalEntries,
} from "../src/lib/finance/expense-claim-journal.js";
import { evaluateTaxAdjustment } from "../src/lib/finance/tax-adjustment.js";
import { buildCorporateTaxXmlDraft } from "../src/lib/finance/jp-corporate-tax-xml.js";
import { getDataDir } from "../src/lib/utils.js";
import { resetFixtureJournalEntries, useFinanceFixtureTenant } from "./helpers/finance-fixture.js";

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
    writeFileSync(
      assetPath,
      assetOriginal.replace(
        "book_value: 4293618\n",
        "book_value: 4293618\n    tax_depreciation_yen: 60\n"
      )
    );
    writeFileSync(
      profilePath,
      profileOriginal.replace(
        "corporate_tax:\n",
        'corporate_tax:\n  entertainment_account_code: "5900"\n  entertainment_cap_yen: 10\n'
      )
    );
    writeFileSync(
      join(getDataDir(), "finance", "tax-adjustments.yaml"),
      `fiscal_year: ${FY}\nlines:\n  - id: ADJ-1\n    kind: subtract\n    amount_yen: 5\n    label: other\n`
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
      expect(sheet.subtractions_yen).toBe(0);
      expect(sheet.taxable_income_yen).toBeNull();
      expect(sheet.corporate_tax_yen).toBeNull();
      expect(sheet.official_pending).toContain("unmapped_explicit_line");
      expect(sheet.lines.find((line) => line.asset_id)?.row).toBeUndefined();
      expect(sheet.lines.find((line) => line.id === "ADJ-1")?.row).toBeUndefined();
      expect(
        sheet.official_lines.find((line) => line.form === "別表四" && line.row === "6")?.amount_yen
      ).toBe(40);
      expect(
        sheet.official_lines.find((line) => line.form === "別表四" && line.row === "8")?.amount_yen
      ).toBe(20);
      expect(sheet.official_lines.some((line) => line.row === "11" || line.row === "52")).toBe(
        false
      );
      expect(loadJournalEntries().entries.length).toBe(count);
      const again = evaluateTaxAdjustment(FY);
      expect(again.taxable_income_yen).toBe(sheet.taxable_income_yen);
      expect(loadJournalEntries().entries.length).toBe(count);

      const draft = buildCorporateTaxXmlDraft({ fiscalYear: FY, asOf: sheet.as_of });
      expect(draft.xml).not.toContain('row="11"');
      expect(draft.xml).not.toContain('row="52"');
      expect(draft.xml).toContain('row="6"');
      expect(draft.xml).not.toContain("加算（税理士確定）");
      expect(draft.xml).not.toContain('id="betsu-4-like"');
      expect(draft.xml).not.toContain("taxable_income_estimate");
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
      { allowAnnualPlTransfer: true }
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
    expect(draft.xml).not.toContain('label="加算小計">0</Line>');
    expect(draft.xml).not.toContain("taxable_income_estimate");
    expect(draft.xml).not.toContain('row="52"');
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
      { allowAnnualPlTransfer: true }
    );
    const after = evaluateTaxAdjustment(FY);
    expect(after.can_compute).toBe(true);
    expect(after.starting_profit_yen).toBe(before.starting_profit_yen);
    expect(after.taxable_income_yen).toBe(before.taxable_income_yen);
  });

  it("refuses a missing entertainment cap, a colliding line, and an unknown account", () => {
    useFinanceFixtureTenant();
    resetFixtureJournalEntries();
    const profilePath = join(getDataDir(), "finance", "tax-profile.yaml");
    const profileOriginal = readFileSync(profilePath, "utf-8");
    writeFileSync(
      profilePath,
      profileOriginal.replace(
        "corporate_tax:\n",
        'corporate_tax:\n  entertainment_account_code: "5900"\n'
      )
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
      `fiscal_year: ${FY}\nlines:\n  - id: depreciation_excess\n    kind: add\n    amount_yen: 1\n    label: collide\n`
    );
    expect(evaluateTaxAdjustment(FY).can_compute).toBe(false);

    resetFixtureJournalEntries();
    expect(() =>
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
      })
    ).toThrow(/Unknown account code/);
  });

  it("does not add when book depreciation and entertainment are within the tax figures", () => {
    useFinanceFixtureTenant();
    resetFixtureJournalEntries();
    const assetPath = join(getDataDir(), "finance", "fixed-assets.yaml");
    const profilePath = join(getDataDir(), "finance", "tax-profile.yaml");
    const assetOriginal = readFileSync(assetPath, "utf-8");
    const profileOriginal = readFileSync(profilePath, "utf-8");
    writeFileSync(
      assetPath,
      assetOriginal.replace(
        "book_value: 4293618\n",
        "book_value: 4293618\n    tax_depreciation_yen: 100\n"
      )
    );
    writeFileSync(
      profilePath,
      profileOriginal.replace(
        "corporate_tax:\n",
        'corporate_tax:\n  entertainment_account_code: "5900"\n  entertainment_cap_yen: 10\n'
      )
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
      `fiscal_year: ${FY}\nlines:\n  - id: ADJ-LOSS\n    kind: subtract\n    amount_yen: 5\n    form_row: "14"\n    label: dividends\n`
    );
    const sheet = evaluateTaxAdjustment(FY);
    expect(sheet.can_compute).toBe(true);
    expect(sheet.taxable_income_yen).toBe(-5);
    expect(sheet.corporate_tax_yen).toBe(0);
    const draft = buildCorporateTaxXmlDraft({ fiscalYear: FY, asOf: sheet.as_of });
    expect(draft.xml).toContain("<CorporateTaxYen>0</CorporateTaxYen>");
    expect(draft.xml).not.toContain("taxable_income_estimate");
    expect(draft.xml).not.toContain("<EstimatedTaxYen>");
  });

  it("computes national corporate tax from taxable income, not the profile estimate", () => {
    useFinanceFixtureTenant();
    resetFixtureJournalEntries();
    const profilePath = join(getDataDir(), "finance", "tax-profile.yaml");
    const profileOriginal = readFileSync(profilePath, "utf-8");
    writeFileSync(
      profilePath,
      profileOriginal.replace(
        "capital_stock: 1000000\n",
        "capital_stock: 1000000\n  estimated_tax_fy2026: 999\n"
      )
    );
    try {
      appendJournalEntry({
        entry_id: "JE-REV-TAX",
        occurred_at: "2026-09-12T00:00:00.000Z",
        description: "revenue",
        source: { kind: "manual", authorized_by: "OP-TEST" },
        evidence_refs: ["test:rev-tax"],
        lines: [
          {
            account_code: "1100",
            debit_yen: 10_000_000,
            credit_yen: 0,
            tax_category: "out_of_scope",
          },
          {
            account_code: "4100",
            debit_yen: 0,
            credit_yen: 10_000_000,
            tax_category: "non_taxable",
          },
        ],
      });
      const sheet = evaluateTaxAdjustment(FY);
      expect(sheet.can_compute).toBe(true);
      expect(sheet.taxable_income_yen).toBe(10_000_000);
      expect(sheet.corporate_tax_yen).toBe(1_664_000);
      const amount = (form: string, row: string) =>
        sheet.official_lines.find((line) => line.form === form && line.row === row)?.amount_yen;
      expect(amount("別表四", "52")).toBe(10_000_000);
      expect(amount("別表一", "2")).toBe(1_664_000);
      expect(amount("別表一次葉", "74")).toBe(8_000_000);
      expect(amount("別表一次葉", "77")).toBe(1_200_000);
      expect(amount("別表一次葉", "76")).toBe(2_000_000);
      expect(amount("別表一次葉", "79")).toBe(464_000);
      const draft = buildCorporateTaxXmlDraft({ fiscalYear: FY, asOf: sheet.as_of });
      expect(draft.xml).toContain("<CorporateTaxYen>1664000</CorporateTaxYen>");
      expect(draft.xml).toContain(
        '<ProfileEstimateYen purpose="comparison-only">999</ProfileEstimateYen>'
      );
      expect(draft.xml).not.toContain("<EstimatedTaxYen>");
      expect(draft.xml).not.toContain("official_form_mapping");
      expect(draft.xml).not.toContain('id="betsu-4-like"');
    } finally {
      restore(profilePath, profileOriginal);
    }
  });

  it("reconciles numbered annex rows and withholds totals for an unmapped line", () => {
    useFinanceFixtureTenant();
    resetFixtureJournalEntries();
    writeFileSync(
      join(getDataDir(), "finance", "tax-adjustments.yaml"),
      `fiscal_year: ${FY}\nlines:\n  - id: ADJ-MAPPED\n    kind: add\n    amount_yen: 100\n    form_row: "7"\n    label: officers\n`
    );
    const mapped = evaluateTaxAdjustment(FY);
    const amount = (row: string) =>
      mapped.official_lines.find((line) => line.form === "別表四" && line.row === row)?.amount_yen;
    expect(amount("11")).toBe(100);
    expect(amount("23")).toBe((mapped.starting_profit_yen ?? 0) + 100);
    expect(amount("52")).toBe(amount("23"));
    expect(mapped.official_lines.some((line) => line.row === "27" || line.row === "24")).toBe(
      false
    );
    const row25 = mapped.official_lines.filter(
      (line) => line.form === "別表五（一）" && line.row === "25"
    );
    const row31 = mapped.official_lines.filter(
      (line) => line.form === "別表五（一）" && line.row === "31"
    );
    expect(row25.find((line) => line.col === "4")?.amount_yen).toBe(
      (row25.find((line) => line.col === "1")?.amount_yen ?? 0) -
        (row25.find((line) => line.col === "2")?.amount_yen ?? 0) +
        (row25.find((line) => line.col === "3")?.amount_yen ?? 0)
    );
    expect(row31.find((line) => line.col === "4")?.amount_yen).toBe(
      row25.find((line) => line.col === "4")?.amount_yen
    );

    writeFileSync(
      join(getDataDir(), "finance", "tax-adjustments.yaml"),
      `fiscal_year: ${FY}\nlines:\n  - id: ADJ-BARE\n    kind: subtract\n    amount_yen: 5\n    label: bare\n`
    );
    const bare = evaluateTaxAdjustment(FY);
    expect(bare.official_lines.some((line) => line.row === "11" || line.row === "52")).toBe(false);
    expect(bare.corporate_tax_yen).toBeNull();
  });

  it("omits schedule 5 when retained earnings include a capital movement", () => {
    useFinanceFixtureTenant();
    resetFixtureJournalEntries();
    appendJournalEntry({
      entry_id: "JE-CAP",
      occurred_at: "2026-09-20T00:00:00.000Z",
      description: "capital",
      source: { kind: "capital", period: "2026-09" },
      evidence_refs: ["test:cap"],
      lines: [
        { account_code: "1100", debit_yen: 100, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "3200", debit_yen: 0, credit_yen: 100, tax_category: "out_of_scope" },
      ],
    });
    const sheet = evaluateTaxAdjustment(FY);
    expect(sheet.can_compute).toBe(true);
    expect(sheet.retained_rollforward?.capital_yen).not.toBe(0);
    expect(sheet.official_lines.some((line) => line.form === "別表五（一）")).toBe(false);
    const draft = buildCorporateTaxXmlDraft({ fiscalYear: FY, asOf: sheet.as_of });
    expect(draft.xml).toContain("capital_unmapped");
    expect(draft.xml).not.toContain('row="25"');
  });

  it("truncates the national tax base and the tax", () => {
    useFinanceFixtureTenant();
    resetFixtureJournalEntries();
    appendJournalEntry({
      entry_id: "JE-REV-SMALL",
      occurred_at: "2026-09-12T00:00:00.000Z",
      description: "revenue",
      source: { kind: "manual", authorized_by: "OP-TEST" },
      evidence_refs: ["test:small"],
      lines: [
        { account_code: "1100", debit_yen: 1500, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "4100", debit_yen: 0, credit_yen: 1500, tax_category: "non_taxable" },
      ],
    });
    expect(evaluateTaxAdjustment(FY).corporate_tax_yen).toBe(100);
    resetFixtureJournalEntries();
    appendJournalEntry({
      entry_id: "JE-REV-TINY",
      occurred_at: "2026-09-12T00:00:00.000Z",
      description: "revenue",
      source: { kind: "manual", authorized_by: "OP-TEST" },
      evidence_refs: ["test:tiny"],
      lines: [
        { account_code: "1100", debit_yen: 999, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "4100", debit_yen: 0, credit_yen: 999, tax_category: "non_taxable" },
      ],
    });
    expect(evaluateTaxAdjustment(FY).corporate_tax_yen).toBe(0);
  });

  it("uses the full rate above 100 million yen of capital and withholds the reduced bracket", () => {
    useFinanceFixtureTenant();
    resetFixtureJournalEntries();
    const profilePath = join(getDataDir(), "finance", "tax-profile.yaml");
    const profileOriginal = readFileSync(profilePath, "utf-8");
    writeFileSync(
      profilePath,
      profileOriginal.replace("capital_stock: 1000000\n", "capital_stock: 100000001\n")
    );
    try {
      appendJournalEntry({
        entry_id: "JE-REV-LARGE",
        occurred_at: "2026-09-12T00:00:00.000Z",
        description: "revenue",
        source: { kind: "manual", authorized_by: "OP-TEST" },
        evidence_refs: ["test:large"],
        lines: [
          {
            account_code: "1100",
            debit_yen: 10_000_000,
            credit_yen: 0,
            tax_category: "out_of_scope",
          },
          {
            account_code: "4100",
            debit_yen: 0,
            credit_yen: 10_000_000,
            tax_category: "non_taxable",
          },
        ],
      });
      const sheet = evaluateTaxAdjustment(FY);
      expect(sheet.corporate_tax_yen).toBe(2_320_000);
      expect(sheet.official_lines.some((line) => line.row === "74")).toBe(false);
    } finally {
      restore(profilePath, profileOriginal);
    }
  });

  it("prorates the reduced bracket for a six-month period", () => {
    useFinanceFixtureTenant();
    resetFixtureJournalEntries();
    const profilePath = join(getDataDir(), "finance", "tax-profile.yaml");
    const profileOriginal = readFileSync(profilePath, "utf-8");
    writeFileSync(
      profilePath,
      profileOriginal.replace('period_from: "2026-02-01"\n', 'period_from: "2026-08-01"\n')
    );
    try {
      appendJournalEntry({
        entry_id: "JE-REV-SHORT",
        occurred_at: "2026-09-12T00:00:00.000Z",
        description: "revenue",
        source: { kind: "manual", authorized_by: "OP-TEST" },
        evidence_refs: ["test:short"],
        lines: [
          {
            account_code: "1100",
            debit_yen: 10_000_000,
            credit_yen: 0,
            tax_category: "out_of_scope",
          },
          {
            account_code: "4100",
            debit_yen: 0,
            credit_yen: 10_000_000,
            tax_category: "non_taxable",
          },
        ],
      });
      const sheet = evaluateTaxAdjustment(FY);
      expect(sheet.corporate_tax_yen).toBe(1_992_000);
      expect(sheet.official_lines.find((line) => line.row === "74")?.amount_yen).toBe(4_000_000);
    } finally {
      restore(profilePath, profileOriginal);
    }
  });

  it("does not compute a rate when the reduced rate is excluded", () => {
    useFinanceFixtureTenant();
    resetFixtureJournalEntries();
    const profilePath = join(getDataDir(), "finance", "tax-profile.yaml");
    const profileOriginal = readFileSync(profilePath, "utf-8");
    writeFileSync(
      profilePath,
      profileOriginal.replace(
        "capital_stock: 1000000\n",
        "capital_stock: 1000000\n  reduced_rate_excluded: true\n"
      )
    );
    try {
      appendJournalEntry({
        entry_id: "JE-REV-EXCLUDED",
        occurred_at: "2026-09-12T00:00:00.000Z",
        description: "revenue",
        source: { kind: "manual", authorized_by: "OP-TEST" },
        evidence_refs: ["test:excluded"],
        lines: [
          {
            account_code: "1100",
            debit_yen: 10_000_000,
            credit_yen: 0,
            tax_category: "out_of_scope",
          },
          {
            account_code: "4100",
            debit_yen: 0,
            credit_yen: 10_000_000,
            tax_category: "non_taxable",
          },
        ],
      });
      const sheet = evaluateTaxAdjustment(FY);
      expect(sheet.taxable_income_yen).toBe(10_000_000);
      expect(sheet.corporate_tax_yen).toBeNull();
      expect(sheet.official_lines.some((line) => line.row === "2" && line.form === "別表一")).toBe(
        false
      );
      expect(sheet.official_pending).toContain("reduced_rate_excluded");
    } finally {
      restore(profilePath, profileOriginal);
    }
  });
});
